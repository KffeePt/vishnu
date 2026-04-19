import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Key, Fingerprint, QrCode } from "lucide-react";
import { AuthMethod, AuthSession } from "@/types/candyland";
import { useAuthentication } from "@/hooks/use-authentication";
import { useStaffAuthentication } from "@/hooks/use-staff-authentication";
import { PasskeyManagementDialog } from "./passkey-management-dialog";
import { TotpAuthTab } from "./totp-auth-tab";

interface AuthFormProps {
  onAuthenticated: (session: AuthSession, masterPassword?: string) => void;
  mode?: 'admin' | 'staff';
}

export function AuthForm({ onAuthenticated, mode = 'admin' }: AuthFormProps) {
  if (mode === 'staff') {
    return <StaffAuthForm onAuthenticated={onAuthenticated} />;
  }
  return <AdminAuthForm onAuthenticated={onAuthenticated} />;
}

function AdminAuthForm({ onAuthenticated }: { onAuthenticated: (s: AuthSession, p?: string) => void }) {
  const auth = useAuthentication();
  return <AuthFormInner onAuthenticated={onAuthenticated} auth={auth} mode="admin" />;
}

function StaffAuthForm({ onAuthenticated }: { onAuthenticated: (s: AuthSession, p?: string) => void }) {
  const auth = useStaffAuthentication();
  return <AuthFormInner onAuthenticated={onAuthenticated} auth={auth} mode="staff" />;
}

function AuthFormInner({ onAuthenticated, auth, mode }: AuthFormProps & { auth: any }) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('passkey');
  const [masterPassword, setMasterPassword] = useState("");
  const [userEmail, setUserEmail] = useState("");

  // State for vault fallback
  const [requiresVaultUnlock, setRequiresVaultUnlock] = useState(false);
  const [pendingSessionToken, setPendingSessionToken] = useState<string | null>(null);
  const [fallbackPassword, setFallbackPassword] = useState("");

  const {
    authenticateMasterPassword,
    authenticateWithPasskey,
    isAuthenticating,
    isWebAuthnSupported,
    user,
    upgradeSession,
  } = auth;

  useEffect(() => {
    if (user?.email) {
      setUserEmail(user.email);
    }
  }, [user]);

  // Auto-trigger passkey on load for both admin and staff
  const [hasAttemptedAutoLogin, setHasAttemptedAutoLogin] = useState(false);
  useEffect(() => {
    if (authMethod === 'passkey' && auth.passkeys && auth.passkeys.length > 0 && !hasAttemptedAutoLogin) {
      const storageKey = `vishnu_passkey_auto_triggered_${mode}`;
      const hasAutoTriggered = sessionStorage.getItem(storageKey);
      if (!hasAutoTriggered && !isAuthenticating) {
        sessionStorage.setItem(storageKey, 'true');
        setHasAttemptedAutoLogin(true);
        handlePasskeyAuth(true); // pass true for auto trigger silently
      } else {
        setHasAttemptedAutoLogin(true);
      }
    }
  }, [mode, authMethod, auth.passkeys, isAuthenticating, hasAttemptedAutoLogin]);

  const refreshPasskeysRef = React.useRef(auth.refreshPasskeys);
  React.useEffect(() => { refreshPasskeysRef.current = auth.refreshPasskeys; }, [auth.refreshPasskeys]);

  useEffect(() => {
    if (authMethod === 'passkey' && refreshPasskeysRef.current) {
      refreshPasskeysRef.current().catch(console.error);
    }
  }, [authMethod]);

  const handlePasswordAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    const passwordCopy = masterPassword;
    await authenticateMasterPassword(masterPassword, (session: AuthSession) => onAuthenticated(session, passwordCopy));
    setMasterPassword("");
  };

  const handlePasskeyAuth = async (isAutoTrigger = false) => {
    await authenticateWithPasskey((session: AuthSession & { needsMasterPassword?: boolean }) => {
      if (session.needsMasterPassword) {
        setRequiresVaultUnlock(true);
        setPendingSessionToken(session.token);
      } else {
        onAuthenticated(session, session.unwrappedMasterPassword);
      }
    }, isAutoTrigger);
  };

  const handlePasskeyRegistrationSuccess = (session?: any, password?: string) => {
    if (session) {
      onAuthenticated(session, password);
    } else {
      handlePasskeyAuth(false);
    }
  };

  const handleTotpAuthSuccess = (session: AuthSession & { needsMasterPassword?: boolean }) => {
    if (session.needsMasterPassword) {
      setRequiresVaultUnlock(true);
      setPendingSessionToken(session.token);
    } else {
      onAuthenticated(session, session.unwrappedMasterPassword);
    }
  };

  const handleVaultUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingSessionToken || !fallbackPassword) return;

    // Attempt to upgrade the session
    const success = await upgradeSession(fallbackPassword, pendingSessionToken);

    if (success) {
      // Reconstruct a simple session object to pass back up since we know it's valid now
      const upgradedSession: AuthSession = {
        token: pendingSessionToken,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // Estimate, not critical for frontend
      };
      onAuthenticated(upgradedSession, fallbackPassword);
    }
  };

  // If we've authenticated but need the vault password, show ONLY the fallback UI
  if (requiresVaultUnlock) {
    return (
      <Card className="border-amber-200 dark:border-amber-900/50 bg-amber-50/50 dark:bg-amber-950/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-center text-amber-600 dark:text-amber-500">
            <Key className="w-5 h-5" />
            Vault Locked
          </CardTitle>
          <CardDescription className="text-center text-amber-700 dark:text-amber-400">
            Identity verified. However, we need your master password this one time to unlock your device and enable seamless logins in the future.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVaultUnlock} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fallbackPassword">Master Password</Label>
              <Input
                id="fallbackPassword"
                type="password"
                value={fallbackPassword}
                onChange={(e) => setFallbackPassword(e.target.value)}
                placeholder="Enter master password to unlock"
                autoComplete="current-password"
                autoFocus
              />
            </div>
            <Button type="submit" disabled={isAuthenticating} className="w-full">
              {isAuthenticating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Unlock Vault & Optimize Device
            </Button>
            <Button
              type="button"
              variant="ghost"
              className="w-full mt-2 text-sm text-muted-foreground"
              onClick={() => {
                setRequiresVaultUnlock(false);
                setPendingSessionToken(null);
                setFallbackPassword("");
              }}
            >
              Cancel
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  if (!isWebAuthnSupported) {
    return (
      <form onSubmit={handlePasswordAuth} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="userEmail">Email</Label>
          <Input id="userEmail" type="email" value={userEmail} readOnly autoComplete="username webauthn" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="masterPassword">Master Password</Label>
          <Input
            id="masterPassword"
            type="password"
            value={masterPassword}
            onChange={(e) => setMasterPassword(e.target.value)}
            placeholder="Enter master password"
            autoComplete="current-password webauthn"
          />
        </div>
        <Button type="submit" disabled={isAuthenticating} className="w-full">
          {isAuthenticating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          <Key className="mr-2 h-4 w-4" />
          Authenticate & Access Data
        </Button>
      </form>
    );
  }

  const passkeyPulseStyle = `
    @keyframes passkey-pulse {
      0%, 100% { transform: scale(1); box-shadow: 0 0 0 0 hsl(var(--primary) / 0.4); }
      50% { transform: scale(1.02); box-shadow: 0 0 20px 4px hsl(var(--primary) / 0.2); }
    }
    .passkey-btn {
      animation: passkey-pulse 2.5s infinite;
    }
  `;

  const getPasskeyBadgeClass = (passkey: any) => {
    if (passkey?.isCandyman) return 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white border-transparent';
    if (passkey?.isAdmin) return 'bg-gradient-to-r from-red-500 to-orange-500 text-white border-transparent';
    return 'bg-muted text-muted-foreground';
  };

  return (
    <Tabs value={authMethod} onValueChange={(value) => setAuthMethod(value as AuthMethod)} className="w-full">
      <style>{passkeyPulseStyle}</style>
      <TabsList className="w-full grid grid-cols-3 mb-6">
        <TabsTrigger value="password" className="flex items-center gap-1.5 sm:gap-2">
          <Key className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Password</span>
          <span className="sm:hidden text-xs">Pwd</span>
        </TabsTrigger>
        <TabsTrigger value="passkey" className="flex items-center gap-1.5 sm:gap-2">
          <Fingerprint className="w-4 h-4 shrink-0" />
          <span className="text-xs sm:text-sm">Passkey</span>
        </TabsTrigger>
        <TabsTrigger value="totp" className="flex items-center gap-1.5 sm:gap-2">
          <QrCode className="w-4 h-4 shrink-0" />
          <span className="hidden sm:inline">Authenticator</span>
          <span className="sm:hidden text-xs">Auth</span>
        </TabsTrigger>
      </TabsList>

      <TabsContent value="password" className="mt-4">
        <form onSubmit={handlePasswordAuth} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="userEmail">Email</Label>
            <Input id="userEmail" type="email" value={userEmail} readOnly autoComplete="username webauthn" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="masterPassword">Master Password</Label>
            <Input
              id="masterPassword"
              type="password"
              value={masterPassword}
              onChange={(e) => setMasterPassword(e.target.value)}
              placeholder="Enter master password"
              autoComplete="current-password webauthn"
            />
          </div>
          <Button type="submit" disabled={isAuthenticating} className="w-full">
            {isAuthenticating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            <Key className="mr-2 h-4 w-4" />
            Authenticate with Password
          </Button>
        </form>
      </TabsContent>

      <TabsContent value="passkey" className="space-y-4 mt-4">
        {(!auth.passkeys || auth.passkeys.length === 0) && (
          <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 flex flex-col items-center text-center gap-2 mb-6">
            <Fingerprint className="h-8 w-8 text-primary opacity-80" />
            <h4 className="font-medium text-primary">Inicios de sesión más rápidos</h4>
            <p className="text-sm text-muted-foreground">
              {mode === 'staff'
                ? 'Configura una llave de acceso (Face ID / Touch ID) en la configuración de seguridad después de desbloquear, para no tener que volver a escribir tu contraseña.'
                : 'Configura una llave de acceso para este dispositivo para evitar escribir tu contraseña maestra en el futuro.'}
            </p>
          </div>
        )}

        <div className="text-center space-y-2">
          <Fingerprint className="w-8 h-8 mx-auto text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Authenticate using your device's biometric sensor, Windows Hello, Touch ID, or a registered security key.
          </p>
        </div>

        <Button
          onClick={() => handlePasskeyAuth(false)}
          disabled={isAuthenticating}
          className="w-full py-6 text-base font-semibold passkey-btn"
          type="button"
        >
          {isAuthenticating ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : <Fingerprint className="mr-2 h-5 w-5" />}
          Authenticate with Passkey
        </Button>

        {auth.passkeys && auth.passkeys.length > 0 && (
          <div className="mt-6 mb-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 text-center">Your Registered Passkeys</p>
            <div className="flex flex-col gap-2">
              {auth.passkeys.map((pk: any) => (
                <div key={pk.id} className="flex items-center gap-2 p-2 px-3 border border-border/50 rounded-md text-sm bg-muted/30">
                  <Key className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="font-medium">{pk.name}</span>
                  <span className={`ml-auto rounded-full px-2 py-0.5 text-[10px] font-semibold ${getPasskeyBadgeClass(pk)}`}>
                    {pk.panelLabel || 'Legacy'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="relative my-6">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">Options</span>
          </div>
        </div>

        <PasskeyManagementDialog onAuthenticate={handlePasskeyRegistrationSuccess} mode={mode}>
          <Button variant="outline" className="w-full text-muted-foreground" type="button">
            Manage Passkeys
          </Button>
        </PasskeyManagementDialog>
      </TabsContent>

      <TabsContent value="totp" className="mt-4">
        <TotpAuthTab onAuthenticated={handleTotpAuthSuccess} mode={mode} />
      </TabsContent>
    </Tabs>
  );
}
