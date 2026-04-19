import { useState, useEffect, useRef } from 'react';
import { UserAuth } from '@/context/auth-context';
import { AuthSession } from '@/types/candyland';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
export function useMasterPassword() {
  const { user, getIDToken } = UserAuth();
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [isMasterPasswordSet, setIsMasterPasswordSet] = useState<boolean | null>(null);

  // Ref to read authSession inside effects without adding it as a dependency.
  // This prevents the master-password check from re-running on every assign/unassign
  // operation that might indirectly update authSession.
  const authSessionRef = useRef<AuthSession | null>(null);

  const handleAuthenticated = (session: AuthSession, masterPassword?: string) => {
    // Keep master password in state for current session usage
    const sessionWithPassword = { ...session, masterPassword };
    setAuthSession(sessionWithPassword);
    authSessionRef.current = sessionWithPassword;

    // Store ONLY session token and expiry in localStorage to persist across page refreshes
    // Keep master password strictly in sessionStorage (cleared when tab closes)
    const safeSessionToStore = {
      token: session.token,
      expiresAt: session.expiresAt
    };
        sessionStorage.setItem('vishnu_admin_session', JSON.stringify(safeSessionToStore));

    if (masterPassword) {
        sessionStorage.setItem('vishnu_admin_master', masterPassword);
    }
  };

  // ---------------------------------------------------------------------------
  // Pre-Auth Listener: Watch for master password creation/deletion before login
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Only run this listener if we are NOT authenticated yet, but we DO have a user
    if (authSession || !user) return;

    console.log("Setting up pre-auth listener on udhhmbtc/auth");
    const docRef = doc(db, 'udhhmbtc', 'auth');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (!snapshot.exists()) {
        setIsMasterPasswordSet(false);
      } else {
        const data = snapshot.data();
        // Document exists and is explicitly marked valid
        setIsMasterPasswordSet(data.isValid === true);
      }
    }, (error) => {
      console.error("Pre-auth listener error:", error);
      // Fallback to true on permission denied during check to keep auth gate
      setIsMasterPasswordSet(true);
    });

    return () => unsubscribe();
  }, [user, authSession]); // Re-run if authSession changes (e.g. user logs in/out)

  // ---------------------------------------------------------------------------
  // Post-Auth Listener: Watch for DB wipe while actively logged in
  // ---------------------------------------------------------------------------
  useEffect(() => {
    // Only run this listener if we ARE authenticated
    if (!authSession || !user) return;

    console.log("Setting up post-auth listener on udhhmbtc/auth");
    const docRef = doc(db, 'udhhmbtc', 'auth');
    const unsubscribe = onSnapshot(docRef, (snapshot) => {
      if (!snapshot.exists()) {
        console.warn("Master password missing on server (DB Wipe). Invalidating local session.");
        setIsMasterPasswordSet(false);
        clearSession();
        // The admin-panel component will naturally fall back to the auth gate
      } else {
        const data = snapshot.data();
        if (data.isValid === false) {
          console.warn("Master password marked invalid on server. Invalidating local session.");
          setIsMasterPasswordSet(false);
          clearSession();
        } else {
          setIsMasterPasswordSet(true);
        }
      }
    }, (error) => {
      console.error("Post-auth listener error:", error);
    });

    return () => unsubscribe();
  }, [user, authSession]); // Re-run if authSession changes

  // Restore session from localStorage on component mount
  useEffect(() => {
        const storedSession = sessionStorage.getItem('vishnu_admin_session');
    if (storedSession) {
      try {
        const session: AuthSession = JSON.parse(storedSession);
        // Check if session is still valid
        if (new Date(session.expiresAt) > new Date()) {
        const storedMaster = sessionStorage.getItem('vishnu_admin_master');
          if (storedMaster) {
            session.masterPassword = storedMaster;
          }
          // Restore the session even without client-side MP.
          // For zero-prompt passkey/TOTP logins, the server session
          // already has the encrypted MP and API routes decrypt it
          // using the session token via x-master-password-session header.
          setAuthSession(session);
          authSessionRef.current = session;
        } else {
          // Session expired, clear it
            sessionStorage.removeItem('vishnu_admin_session');
            sessionStorage.removeItem('vishnu_admin_master');
        }
      } catch (error) {
        console.error('Error parsing stored session:', error);
            sessionStorage.removeItem('vishnu_admin_session');
            sessionStorage.removeItem('vishnu_admin_master');
      }
    }
  }, []);

  const clearSession = () => {
    setAuthSession(null);
    authSessionRef.current = null;
            sessionStorage.removeItem('vishnu_admin_session');
            sessionStorage.removeItem('vishnu_admin_master');
  };

  return {
    authSession,
    isMasterPasswordSet,
    setIsMasterPasswordSet,
    handleAuthenticated,
    clearSession,
  };
}
