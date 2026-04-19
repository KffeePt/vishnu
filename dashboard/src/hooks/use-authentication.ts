import { useState, useEffect, useRef, useCallback } from 'react';
import { useToast } from '@/hooks/use-toast';
import { UserAuth } from '@/context/auth-context';
import { AuthSession, AuthMethod } from '@/types/candyland';
import { startAuthentication } from '@simplewebauthn/browser';
import { User } from 'firebase/auth';
import { useTabPresence } from './use-tab-presence';

interface Passkey {
  id: string;
  name: string;
  credentialID: string;
  isAdmin?: boolean;
  isCandyman?: boolean;
  panelLabel?: string;
  createdAt: Date;
  lastUsed: Date;
  transports: string[];
  backedUp: boolean;
}

export interface AuthenticationHook {
  authenticateMasterPassword: (
    password: string,
    onSuccess?: (session: AuthSession) => void
  ) => Promise<AuthSession | null>;
  authenticateWithPasskey: (
    onSuccess: (session: AuthSession) => void,
    isAutoTrigger?: boolean
  ) => Promise<boolean>;
  registerPasskey: (name: string, credential: any, explicitSessionToken?: string) => Promise<boolean>;
  getPasskeys: () => Promise<Passkey[]>;
  deletePasskey: (passkeyId: string) => Promise<void>;
  logoutSession: () => void;
  isAuthenticating: boolean;
  isWebAuthnSupported: boolean;
  user: User | null;
  passkeys: Passkey[];
  refreshPasskeys: () => Promise<void>;
  // TOTP methods
  setupTotp: () => Promise<{ qrCodeUri: string; secret: string } | null>;
  verifyTotpSetup: (code: string) => Promise<boolean>;
  authenticateWithTotp: (code: string, onSuccess: (session: AuthSession) => void) => Promise<void>;
  deleteTotp: () => Promise<boolean>;
  isTotpEnabled: boolean | null;
  pendingTotpSetup: { qrCodeUri: string; secret: string } | null;
  checkTotpStatus: () => Promise<void>;
  upgradeSession: (masterPassword: string, sessionToken: string) => Promise<boolean>;
}

// Module-level flags to prevent infinite polling across multiple hook instances
let globalPasskeysFetched = false;
let globalTotpFetched = false;

export function useAuthentication(autoFetch = true): AuthenticationHook {
  const { getIDToken, user } = UserAuth();
  const { toast } = useToast();
  const { acquirePasskeyLock, releasePasskeyLock } = useTabPresence();
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(false);
  const [isTotpEnabled, setIsTotpEnabled] = useState<boolean | null>(null);
  const [pendingTotpSetup, setPendingTotpSetup] = useState<{ qrCodeUri: string; secret: string } | null>(null);
  const [qrCodeUri, setQrCodeUri] = useState(''); // This seems redundant with pendingTotpSetup, but keeping as per instruction
  const [secret, setSecret] = useState(''); // This seems redundant with pendingTotpSetup, but keeping as per instruction

  // Guard against StrictMode double-fetch and rapid re-renders
  const hasFetchedRef = useRef(false);

  const refreshPasskeys = useCallback(async () => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return;

      const response = await fetch('/api/admin/auth/webauthn/manage', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (response.ok) {
        const data = await response.json();
        setPasskeys(data.passkeys.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          lastUsed: new Date(p.lastUsed),
        })));
      }
    } catch (error) {
      console.error('Error refreshing passkeys:', error);
    }
  }, [getIDToken]);

  const checkTotpStatus = useCallback(async () => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return;
      const response = await fetch('/api/admin/auth/totp/setup', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setIsTotpEnabled(data.enabled);
        if (data.pendingSetup) {
          setPendingTotpSetup({ qrCodeUri: data.qrCodeUri, secret: data.secret });
        } else {
          setPendingTotpSetup(null);
        }
      }
    } catch (error) {
      console.error('Error checking TOTP status:', error);
    }
  }, [getIDToken]);

  // Reset the fetch guard when the user actually changes (e.g. login/logout)
  useEffect(() => {
    hasFetchedRef.current = false;
    if (!user) {
      globalPasskeysFetched = false;
      globalTotpFetched = false;
    }
  }, [user?.uid]);

  useEffect(() => {
    if (user && autoFetch) {
      if (!hasFetchedRef.current) {
        hasFetchedRef.current = true;
        if (!globalPasskeysFetched) {
          globalPasskeysFetched = true;
          refreshPasskeys();
        }
        if (!globalTotpFetched) {
          globalTotpFetched = true;
          checkTotpStatus();
        }
      }
    } else if (!user) {
      setPasskeys([]);
      setIsTotpEnabled(false);
    }
  }, [user, autoFetch]);

  const registerPasskey = async (name: string, credential: any, explicitSessionToken?: string): Promise<boolean> => {
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        return false;
      }

    const sessionToken = explicitSessionToken || (sessionStorage.getItem('vishnu_admin_session') ? JSON.parse(sessionStorage.getItem('vishnu_admin_session')!).token : '');

      const response = await fetch('/api/admin/auth/webauthn/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
        },
        body: JSON.stringify({ name, credential }),
      });

      const data = await response.json();
      if (response.ok) {
        toast({ title: 'Passkey registered successfully!' });
        await refreshPasskeys();
        return true;
      } else {
        toast({ title: data.error || 'Failed to register passkey', variant: 'destructive' });
        return false;
      }
    } catch (error) {
      console.error('Passkey registration error:', error);
      toast({ title: 'Failed to register passkey', variant: 'destructive' });
      return false;
    }
  };

  const getPasskeys = async (): Promise<Passkey[]> => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return [];
      const response = await fetch('/api/admin/auth/webauthn/manage', {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        const freshPasskeys = data.passkeys.map((p: any) => ({
          ...p,
          createdAt: new Date(p.createdAt),
          lastUsed: new Date(p.lastUsed),
        }));
        setPasskeys(freshPasskeys);
        return freshPasskeys;
      }
      return [];
    } catch {
      return [];
    }
  };

  const deletePasskey = async (passkeyId: string) => {
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/admin/auth/webauthn/manage', {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ passkeyId }),
      });

      const data = await response.json();
      if (response.ok) {
        toast({ title: 'Passkey deleted successfully!' });
        await refreshPasskeys();
      } else {
        toast({ title: data.error || 'Failed to delete passkey', variant: 'destructive' });
      }
    } catch (error) {
      console.error('Passkey deletion error:', error);
      toast({ title: 'Failed to delete passkey', variant: 'destructive' });
    }
  };

  const authenticateMasterPassword = async (
    password: string,
    onSuccess?: (session: AuthSession) => void
  ): Promise<AuthSession | null> => {
    if (!password.trim()) {
      toast({ title: 'Please enter the master password', variant: 'destructive' });
      return null;
    }

    setIsAuthenticating(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        setIsAuthenticating(false);
        return null;
      }

      const response = await fetch('/api/admin/auth/validate-master-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ masterPassword: password.trim() }),
      });

      const data = await response.json();
      if (response.ok && data.valid) {
        await fetch('/api/auth/session-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        const session: AuthSession = {
          token: data.sessionToken,
          expiresAt: new Date(data.expiresAt),
          needsMasterPassword: data.needsMasterPassword,
          unwrappedMasterPassword: data.unwrappedMasterPassword
        };
        if (onSuccess) onSuccess(session);
        toast({ title: 'Master password validated successfully!' });
        return session;
      } else {
        toast({ title: data.error || 'Invalid master password', variant: 'destructive' });
        return null;
      }
    } catch (error) {
      console.error('Authentication error:', error);
      toast({ title: 'Authentication failed', variant: 'destructive' });
      return null;
    } finally {
      setIsAuthenticating(false);
    }
  };

  const authenticateWithPasskey = async (
    onSuccess: (session: AuthSession) => void,
    isAutoTrigger: boolean = false
  ): Promise<boolean> => {
    setIsAuthenticating(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        if (!isAutoTrigger) toast({ title: 'Authentication required', variant: 'destructive' });
        setIsAuthenticating(false);
        return false;
      }

      if (!user?.uid) {
        if (!isAutoTrigger) toast({ title: 'User ID not found', variant: 'destructive' });
        setIsAuthenticating(false);
        return false;
      }

      // Get authentication options from server
      const optionsResponse = await fetch(`/api/admin/auth/webauthn/authenticate?userId=${user.uid}`, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (!optionsResponse.ok) {
        if (!isAutoTrigger) {
          const error = await optionsResponse.json();
          toast({ title: error.error || 'Failed to get authentication options', variant: 'destructive' });
        }
        setIsAuthenticating(false);
        return false;
      }

      const options = await optionsResponse.json();

      // Use @simplewebauthn/browser — handles all encoding/decoding automatically
      let authResp;
      let lockAcquired = false;
      try {
        lockAcquired = await acquirePasskeyLock(!isAutoTrigger); // Steal lock on manual click
        if (!lockAcquired) {
          if (!isAutoTrigger) {
            toast({
              title: 'Autenticación en progreso',
              description: 'Otra pestaña está solicitando la llave. Completa el proceso allí.',
              variant: 'destructive'
            });
          }
          setIsAuthenticating(false);
          return false;
        }
        authResp = await startAuthentication({ optionsJSON: options });
      } catch (err: any) {
        if (!isAutoTrigger) {
          let title = 'Error al usar la llave de acceso';
          let desc = '';

          if (err.name === 'NotAllowedError') {
            title = 'Autenticación de llave cancelada';
            desc = 'This passkey may not be available on this device. Try another method or use the device where it was created.';
          } else if (err.name === 'InvalidStateError') {
            title = 'Llave de acceso inválida';
            desc = 'The passkey is not valid for this account or device.';
          } else if (err.message && (err.message.includes('not found') || err.message.includes('credential'))) {
            title = 'Llave no encontrada';
            desc = 'Credential not found. Are you using the correct device?';
          }

          toast({
            title,
            description: desc || undefined,
            variant: 'destructive',
          });
        }
        setIsAuthenticating(false);
        return false;
      } finally {
        if (lockAcquired) {
          await releasePasskeyLock().catch(e => console.error("Failed to release lock:", e));
        }
      }

      // Send to server for verification
      const authResponse = await fetch('/api/admin/auth/webauthn/authenticate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ credential: authResp }),
      });

      const authData = await authResponse.json();
      if (authResponse.ok && authData.valid) {
        await fetch('/api/auth/session-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        const session: AuthSession & { needsMasterPassword?: boolean } = {
          token: authData.sessionToken,
          expiresAt: new Date(authData.expiresAt),
          needsMasterPassword: authData.needsMasterPassword,
          unwrappedMasterPassword: authData.unwrappedMasterPassword,
        };
        onSuccess(session);
        if (!authData.needsMasterPassword) {
          if (!isAutoTrigger) toast({ title: 'Passkey authentication successful!' });
        } else {
          if (!isAutoTrigger) toast({ title: 'Passkey verified. Master password required for vault access.' });
        }
        return true;
      } else {
        let errorMsg = authData.error || 'Passkey authentication failed';
        let title = 'Authentication Failed';

        if (errorMsg.toLowerCase().includes('admin panel passkey')) {
          title = 'Admin Passkey Required';
        } else if (errorMsg.toLowerCase().includes('credential') || errorMsg.toLowerCase().includes('not registered')) {
          title = 'Passkey Not Available';
          errorMsg = 'This passkey cannot be verified. Are you using the device it was created on?';
        }

        if (!isAutoTrigger) toast({ title, description: errorMsg, variant: 'destructive' });
        return false;
      }
    } catch (error: any) {
      console.error('Passkey authentication error:', error);
      if (!isAutoTrigger) toast({ title: 'Failed to authenticate with passkey', variant: 'destructive' });
      return false;
    } finally {
      setIsAuthenticating(false);
    }
  };

  // ─── TOTP Methods ────────────────────────────────────────────────────────────

  const setupTotp = async (): Promise<{ qrCodeUri: string; secret: string } | null> => {
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        return null;
      }

      const response = await fetch('/api/admin/auth/totp/setup', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      const data = await response.json();
      if (response.ok) {
        setPendingTotpSetup({ qrCodeUri: data.qrCodeUri, secret: data.secret });
        return { qrCodeUri: data.qrCodeUri, secret: data.secret };
      } else {
        toast({ title: data.error || 'Failed to set up authenticator', variant: 'destructive' });
        return null;
      }
    } catch (error) {
      console.error('TOTP setup error:', error);
      toast({ title: 'Failed to set up authenticator', variant: 'destructive' });
      return null;
    }
  };

  const verifyTotpSetup = async (code: string): Promise<boolean> => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return false;

      const sessionToken = sessionStorage.getItem('vishnu_admin_session') ? JSON.parse(sessionStorage.getItem('vishnu_admin_session')!).token : '';

      const response = await fetch('/api/admin/auth/totp/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          ...(sessionToken ? { 'x-master-password-session': sessionToken } : {})
        },
        body: JSON.stringify({ code, mode: 'enroll' }),
      });

      const data = await response.json();
      if (response.ok && data.verified) {
        setIsTotpEnabled(true);
        setPendingTotpSetup(null);
        toast({ title: 'Authenticator set up successfully!' });
        return true;
      } else {
        toast({ title: data.error || 'Invalid code — please try again', variant: 'destructive' });
        return false;
      }
    } catch (error) {
      console.error('TOTP verify setup error:', error);
      toast({ title: 'Verification failed', variant: 'destructive' });
      return false;
    }
  };

  const authenticateWithTotp = async (
    code: string,
    onSuccess: (session: AuthSession) => void
  ) => {
    setIsAuthenticating(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        return;
      }

      const response = await fetch('/api/admin/auth/totp/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ code, mode: 'authenticate' }),
      });

      const data = await response.json();
      if (response.ok && data.valid) {
        await fetch('/api/auth/session-login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ idToken }),
        });

        const session: AuthSession & { needsMasterPassword?: boolean } = {
          token: data.sessionToken,
          expiresAt: new Date(data.expiresAt),
          needsMasterPassword: data.needsMasterPassword,
          unwrappedMasterPassword: data.unwrappedMasterPassword,
        };
        onSuccess(session);
        if (!data.needsMasterPassword) {
          toast({ title: 'Authenticator code verified!' });
        } else {
          toast({ title: 'Code verified. Master password required for vault access.' });
        }
      } else {
        toast({ title: data.error || 'Invalid code', variant: 'destructive' });
      }
    } catch (error) {
      console.error('TOTP authentication error:', error);
      toast({ title: 'Authentication failed', variant: 'destructive' });
    } finally {
      setIsAuthenticating(false);
    }
  };

  const deleteTotp = async (): Promise<boolean> => {
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: 'Authentication required', variant: 'destructive' });
        return false;
      }
      const response = await fetch('/api/admin/auth/totp/setup', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (response.ok) {
        setIsTotpEnabled(false);
        setPendingTotpSetup(null);
        toast({ title: 'Authenticator removed', description: 'Google Authenticator has been unlinked.' });
        return true;
      } else {
        const data = await response.json();
        toast({ title: data.error || 'Failed to remove authenticator', variant: 'destructive' });
        return false;
      }
    } catch (error) {
      console.error('TOTP delete error:', error);
      toast({ title: 'Failed to remove authenticator', variant: 'destructive' });
      return false;
    }
  };

  const upgradeSession = async (masterPassword: string, sessionToken: string): Promise<boolean> => {
    try {
      const idToken = await getIDToken();
      if (!idToken) return false;

      const response = await fetch('/api/admin/auth/upgrade-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
          'x-master-password-session': sessionToken
        },
        body: JSON.stringify({ masterPassword }),
      });

      if (response.ok) {
        toast({ title: 'Vault unlocked successfully!' });
        return true;
      } else {
        const error = await response.json();
        toast({ title: error.error || 'Invalid master password', variant: 'destructive' });
        return false;
      }
    } catch (error) {
      console.error('Session upgrade error:', error);
      toast({ title: 'Failed to unlock vault', variant: 'destructive' });
      return false;
    }
  };

  const logoutSession = async () => {
      const sessionToken = sessionStorage.getItem('vishnu_admin_session');
    await fetch('/api/auth/session-logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionToken }),
    });
        sessionStorage.removeItem('vishnu_admin_session');
        sessionStorage.removeItem('vishnu_admin_master');
  };

  const isWebAuthnSupported = typeof window !== 'undefined' &&
    !!window.navigator?.credentials;

  return {
    authenticateMasterPassword,
    authenticateWithPasskey,
    registerPasskey,
    getPasskeys,
    deletePasskey,
    logoutSession,
    isAuthenticating,
    isWebAuthnSupported,
    user,
    passkeys,
    refreshPasskeys,
    setupTotp,
    pendingTotpSetup,
    verifyTotpSetup,
    authenticateWithTotp,
    deleteTotp,
    isTotpEnabled,
    checkTotpStatus,
    upgradeSession,
  };
}
