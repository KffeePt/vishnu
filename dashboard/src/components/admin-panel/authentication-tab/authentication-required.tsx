import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, HardDrive, ShieldAlert, Loader2 } from "lucide-react";
import { AuthSession } from "@/types/candyland";
import { AuthForm } from "./auth-form";
import { useAuthentication } from "@/hooks/use-authentication";
import { UserAuth } from "@/context/auth-context";
import { getAdminHeaders } from "@/lib/client-auth";
import { generateRSAKeyPair, exportPublicKey, wrapPrivateKey } from "@/lib/crypto-client";
import { doc, setDoc } from "firebase/firestore";
import { db } from "@/config/firebase";

interface AuthenticationRequiredProps {
  onAuthenticated: (session: AuthSession, masterPassword?: string) => void;
  effectiveRole?: { role: string } | null;
  isMasterPasswordSet?: boolean | null;
  persistent?: boolean;
  parentMasterPassword?: string;
  children?: React.ReactNode;
}

interface CollectionInitializationRequiredProps {
  onInitializeComplete: () => void;
}

interface VolumeSetupRequiredProps {
  onSetupComplete: () => void;
  onAuthenticated: (session: AuthSession, masterPassword?: string) => void;
}

export function CollectionInitializationRequired({ onInitializeComplete }: CollectionInitializationRequiredProps) {
  const { getIDToken } = UserAuth();
  const [isInitializing, setIsInitializing] = useState(false);
  const [initializationProgress, setInitializationProgress] = useState<string>('');

  const handleInitializeCollections = async () => {
    setIsInitializing(true);
    try {
      setInitializationProgress('Checking existing collections...');

      // Check current collections
      const token = await getIDToken();
      const collectionsResponse = await fetch('/api/admin/data/collection-configs', {
        headers: getAdminHeaders(token)
      });
      const collections = collectionsResponse.ok ? await collectionsResponse.json() : [];

      // Filter out system collections
      const userCollections = collections.filter((c: any) => c.id !== 'appConfig' && c.id !== 'users');
      const requiredCollections = ['udhhmbtc'];

      setInitializationProgress('Initializing required collection...');

      // Initialize required collections if they don't exist
      for (const collectionId of requiredCollections) {
        const existingConfig = userCollections.find((c: any) => c.id === collectionId);
        if (!existingConfig) {
          setInitializationProgress(`Creating ${collectionId} collection...`);

          // Create collection with basic structure
          const createResponse = await fetch('/api/admin/data/collection-configs', {
            method: 'POST',
            headers: getAdminHeaders(token),
            body: JSON.stringify({
              collectionName: collectionId,
              docIdSegments: [
                { type: 'user_uid', value: '', id: 1 },
                { type: 'literal', value: collectionId, id: 2 }
              ],
              fields: [
                { name: 'encryptedData', type: 'literal', value: '', id: 1 },
                { name: 'dataHash', type: 'literal', value: '', id: 2 }
              ]
            }),
          });

          if (!createResponse.ok) {
            throw new Error(`Failed to create ${collectionId} collection`);
          }
        }
      }

      setInitializationProgress('Initialization complete!');
      setTimeout(() => onInitializeComplete(), 1000);
    } catch (error) {
      console.error('Collection initialization error:', error);
      setInitializationProgress('Initialization failed. Please try again.');
    } finally {
      setTimeout(() => setIsInitializing(false), 2000);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-center">
            <Lock className="w-6 h-6" />
            Collection Initialization Required
          </CardTitle>
          <CardDescription className="text-center">
            Your Vishnu control center data needs to be initialized before you can start managing staff, client work, and operations.
            This process will create the necessary database structure.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">What will be initialized:</h4>
            <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
              <li>Unified encrypted data collection for staff, projects, and operations</li>
              <li>Proper document structure and field definitions</li>
            </ul>
          </div>

          {initializationProgress && (
            <div className="bg-gray-50 p-3 rounded-lg">
              <p className="text-sm text-gray-700">{initializationProgress}</p>
            </div>
          )}

          <Button
            onClick={handleInitializeCollections}
            disabled={isInitializing}
            className="w-full"
          >
            {isInitializing ? 'Initializing Collection...' : 'Initialize Collection'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export function VolumeSetupRequired({ onSetupComplete, onAuthenticated }: VolumeSetupRequiredProps) {
  const { user, getIDToken } = UserAuth();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSettingUp, setIsSettingUp] = useState(false);

  const handleSetupVolume = async () => {
    if (!password || !confirmPassword) {
      alert('Please fill all fields');
      return;
    }

    if (password !== confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    if (password.length < 12) {
      alert('Password must be at least 12 characters');
      return;
    }

    setIsSettingUp(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        alert('Authentication required');
        return;
      }

      const response = await fetch('/api/admin/auth/master-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({ password, confirmPassword }),
      });

      if (response.ok) {
        // Generate RSA keypair for admin envelope encryption
        try {
          const keyPair = await generateRSAKeyPair();
          const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
          const wrappedPrivKey = await wrapPrivateKey(keyPair.privateKey, password);

          // Store admin public key in Firestore public collection
          if (user) {
            await setDoc(doc(db, 'public', user.uid), {
              publicKey: publicKeyBase64,
              encryptedPrivateKey: wrappedPrivKey,
              createdAt: new Date().toISOString(),
            });
            console.log('Admin RSA keypair generated and public key stored.');
          }
        } catch (keyError) {
          console.error('Failed to generate admin RSA keys:', keyError);
          // Non-fatal: master password is set, keys can be regenerated via Fix DB
        }

        // Require manual login after successful setup
        try {
          // Clear any stale sessions to force actual authentication
          sessionStorage.removeItem('vishnu_admin_session');
          sessionStorage.removeItem('vishnu_admin_master');

          console.log("Setup complete. Requiring manual login.");
          onSetupComplete();
        } catch (loginError) {
          console.error("Error finalizing setup:", loginError);
          sessionStorage.removeItem('vishnu_admin_session');
          sessionStorage.removeItem('vishnu_admin_master');
          onSetupComplete();
        }
      } else {
        const error = await response.json();
        alert(error.error || 'Failed to set up volume');
      }
    } catch (error) {
      console.error('Error setting up volume:', error);
      alert('Failed to set up volume');
    } finally {
      setIsSettingUp(false);
    }
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-center">
            <HardDrive className="w-6 h-6" />
            First-Time Master Password Setup
          </CardTitle>
          <CardDescription className="text-center">
            Welcome! As the owner, you need to set up your Master Password for the first time.
            This password will be used to encrypt all sensitive sales and product data.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="bg-blue-50 p-4 rounded-lg">
            <h4 className="font-medium text-blue-900 mb-2">Important Setup Information</h4>
            <ul className="text-sm text-blue-800 list-disc list-inside space-y-1">
              <li>This is a <strong>one-time setup</strong> to initialize your encrypted vault.</li>
              <li>You cannot recover data if you lose this password.</li>
              <li>Required length: minimum 12 characters.</li>
            </ul>
          </div>

          <form onSubmit={(e) => { e.preventDefault(); handleSetupVolume(); }} className="space-y-4">
            <div>
              <Label htmlFor="password">Master Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter master password"
                autoComplete="new-password"
              />
            </div>

            <div>
              <Label htmlFor="confirmPassword">Confirm Master Password</Label>
              <Input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Confirm master password"
                autoComplete="new-password"
              />
            </div>

            <Button
              type="submit"
              disabled={isSettingUp}
              className="w-full"
            >
              {isSettingUp ? 'Initializing Vault...' : 'Initialize Master Password'}
            </Button>
          </form>

          <div className="flex justify-center mt-4">
            <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              ← Return to Home
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function AuthenticationRequired({
  onAuthenticated,
  effectiveRole,
  isMasterPasswordSet: isMasterPasswordSetProp,
  persistent = true,
  parentMasterPassword,
  children
}: AuthenticationRequiredProps): React.ReactElement | null {
  const { logoutSession, authenticateWithPasskey, isAuthenticating, getPasskeys } = useAuthentication();
  const { user, getIDToken, userClaims, logOut, googleSignIn } = UserAuth();

  // Local state for non-persistent mode
  const authenticatedRef = React.useRef(false);
  const [localAuthenticated, setLocalAuthenticated] = useState(false);
  const contentRef = React.useRef<HTMLDivElement>(null);

  // If parent already knows the status or we are non-persistent, skip the internal API check
  const [isChecking, setIsChecking] = useState(persistent ? (isMasterPasswordSetProp === undefined || isMasterPasswordSetProp === null) : false);
  const [needsSetup, setNeedsSetup] = useState(persistent ? (isMasterPasswordSetProp === false) : false);

  // Sync prop → state: if master password is deleted (DB nuke), update needsSetup
  // Also stop checking once we have a definitive answer (true or false)
  React.useEffect(() => {
    if (persistent && isMasterPasswordSetProp !== undefined && isMasterPasswordSetProp !== null) {
      setIsChecking(false);
      setNeedsSetup(isMasterPasswordSetProp === false);
    }
  }, [isMasterPasswordSetProp, persistent]);

  // Fallback timeout: If we're stuck in "Checking..." state for more than 5 seconds because the parent 
  // fails to pass down a definitive true/false for isMasterPasswordSet, force it to false so the user can see the form.
  React.useEffect(() => {
    if (!isChecking) return;

    const timer = setTimeout(() => {
      console.warn("Auth check timed out after 5s while waiting for isMasterPasswordSetProp");
      setIsChecking(false);
    }, 5000);

    return () => clearTimeout(timer);
  }, [isChecking]);

  const [autoAuthError, setAutoAuthError] = useState(false);
  const autoPasskeyAttemptedRef = React.useRef(false);
  const [hasPasskeys, setHasPasskeys] = useState<boolean | null>(null);

  const handleAuthSuccess = React.useCallback((session: AuthSession, password?: string) => {
    if (!persistent) {
      authenticatedRef.current = true;
      setLocalAuthenticated(true);
    }
    onAuthenticated(session, password);
  }, [persistent, onAuthenticated]);

  React.useEffect(() => {
    // Stop if we don't need to auth, or already checked, or already tried auto-auth
    if (isChecking || needsSetup || autoPasskeyAttemptedRef.current || localAuthenticated || authenticatedRef.current) return;

    // Only attempt on persistent master locks (tab/sub-tab locks skip this unless they don't have parent mp)
    if (!persistent && parentMasterPassword) {
      handleAuthSuccess({
        token: "internal_tab_unlock",
        expiresAt: new Date(Date.now() + 86400000)
      }, parentMasterPassword);
      return;
    }

    // Check if we already have a valid session in sessionStorage (for passkey zero-knowledge logins)
    if (!persistent) {
      const sessionStr = sessionStorage.getItem('vishnu_admin_session');
      if (sessionStr) {
        try {
          const session = JSON.parse(sessionStr);
          if (new Date() < new Date(session.expiresAt)) {
            handleAuthSuccess(session);
            return;
          }
        } catch (e) {
          console.error("Failed to parse session", e);
        }
      }
    }

    const attemptAutoAuth = async () => {
      autoPasskeyAttemptedRef.current = true;
      try {
        // Quick check if user has any passkeys before triggering the prompt
        const keys = await getPasskeys();
        setHasPasskeys(keys.length > 0);

        if (keys.length > 0) {
          // Trigger the passkey prompt automatically
          const success = await authenticateWithPasskey((session: AuthSession & { needsMasterPassword?: boolean }) => {
            if (session.needsMasterPassword) {
              // The AuthForm handles the vault unlock fallback if we pass needsMasterPassword
              // But since we are bypassing AuthForm's internal state initially, 
              // we just let it fall through to rendering AuthForm, which will show the 
              // normal options. To make it seamless, we could intercept here, but 
              // for simplicity, if it needs MP, we just show the normal form which 
              // the user can use to complete the login.
              setAutoAuthError(true);
            } else {
              handleAuthSuccess(session, session.unwrappedMasterPassword);
            }
          }, true);

          if (!success) {
            setAutoAuthError(true);
          }
        } else {
          setAutoAuthError(true);
        }
      } catch (err) {
        console.error("Auto passkey auth failed or cancelled:", err);
        setAutoAuthError(true);
      }
    };

    attemptAutoAuth();
  }, [isChecking, needsSetup, persistent, parentMasterPassword, authenticateWithPasskey, getPasskeys, localAuthenticated, handleAuthSuccess]);


  // If we are locally authenticated (non-persistent mode) and have children to show, render them!
  if ((localAuthenticated || authenticatedRef.current) && children) {
    return <>{children}</>;
  }

  // Master password not set — show appropriate UI based on role
  if (needsSetup) {
    const isOwner = effectiveRole?.role === 'owner' || userClaims?.owner === true;

    if (isOwner) {
      return <VolumeSetupRequired onSetupComplete={() => setNeedsSetup(false)} onAuthenticated={onAuthenticated} />;
    }

    // Non-owner: show a friendly "contact owner" message
    return (
      <div className="container mx-auto px-4 py-8 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 justify-center">
              <ShieldAlert className="w-6 h-6 text-amber-500" />
              Setup Required
            </CardTitle>
            <CardDescription className="text-center">
              The master password has not been configured yet.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4 rounded-lg text-center">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                Please contact the <strong>owner</strong> to complete the initial setup before you can access this panel.
              </p>
            </div>
            <div className="flex justify-center mt-4">
              <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                ← Return to Home
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-2xl">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 justify-center">
            {isAuthenticating && !autoAuthError ? <Loader2 className="w-6 h-6 animate-spin text-primary" /> : <Lock className="w-6 h-6" />}
            {isAuthenticating && !autoAuthError ? 'Authenticating with Passkey...' : (persistent ? 'Authentication Required' : 'Component Locked')}
          </CardTitle>
          <CardDescription className="text-center">
            {isAuthenticating && !autoAuthError
              ? 'Please follow your device prompts to verify identity.'
              : (persistent
                ? 'Choose your preferred authentication method to access encrypted sales data.'
                : 'Enter your master password to access this sensitive component.')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">

          {/* Hide the form completely if we are doing silent passkey auth or loading */}
          {(autoAuthError || (!hasPasskeys && hasPasskeys !== null)) && (
            <>
              <AuthForm onAuthenticated={handleAuthSuccess} />

              <div className="text-center">
                <p className="text-sm text-muted-foreground">
                  Need to set or manage authentication? Go to the admin panel settings.
                </p>
              </div>
            </>
          )}
          <Button
            variant="outline"
            className="w-full mt-4"
            disabled={isChecking}
            onClick={async () => {
              setIsChecking(true);
              try {
                await logoutSession();
                await logOut();
                await googleSignIn();
              } catch (e) {
                console.error("Failed to reauthenticate:", e);
              } finally {
                setIsChecking(false);
              }
            }}
          >
            {isChecking && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Sign Out &amp; Reauthenticate
          </Button>

          <div className="flex justify-center mt-4">
            <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
              ← Return to Home
            </a>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
