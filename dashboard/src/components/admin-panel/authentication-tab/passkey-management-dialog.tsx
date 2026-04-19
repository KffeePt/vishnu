import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Smartphone, Monitor, Shield, ShieldCheck, ShieldAlert, Fingerprint, Key, Laptop, Usb, RefreshCw, Loader2, QrCode } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useAuthentication } from "@/hooks/use-authentication";
import { useStaffAuthentication } from "@/hooks/use-staff-authentication";
import { startRegistration } from "@simplewebauthn/browser";

interface PasskeyManagementDialogProps {
  children: React.ReactNode;
  onAuthenticate: (session?: any, password?: string) => void;
  mode?: 'admin' | 'staff';
  hasActiveSession?: boolean;
}

type PasskeyType = 'platform' | 'cross-platform';


// Mock lists for auto-generating names
const ADJECTIVES = ['Happy', 'Swift', 'Silent', 'Mighty', 'Brave', 'Clever', 'Bright', 'Silver', 'Golden', 'Crystal'];
const NOUNS = ['Laptop', 'Desktop', 'Phone', 'Tablet', 'Key', 'Device', 'Station', 'Guardian', 'Sentry', 'Keeper'];

const generateDeviceName = () => {
  const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  return `${adj}-${noun}`;
};

interface RegisterSectionProps {
  labelId: string;
  deviceName: string;
  setDeviceName: (name: string) => void;
  isRegistering: boolean;
  onRegister: () => void;
}

const RegisterSection = React.memo(({ labelId, deviceName, setDeviceName, isRegistering, onRegister }: RegisterSectionProps) => (
  <div className="space-y-3">
    <div className="space-y-2">
      <Label htmlFor={labelId}>Device Name</Label>
      <div className="flex gap-2">
        <Input
          id={labelId}
          value={deviceName}
          onChange={(e) => setDeviceName(e.target.value)}
          placeholder="e.g., My Laptop, iPhone, YubiKey"
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDeviceName(generateDeviceName())}
          title="Generate random name"
          type="button"
        >
          <RefreshCw className="h-4 w-4" />
        </Button>
      </div>
    </div>

    <Button
      onClick={() => onRegister()}
      disabled={isRegistering}
      className="w-full h-auto py-3 gap-2"
    >
      {isRegistering ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          Registering...
        </>
      ) : (
        <>
          <Fingerprint className="w-4 h-4" />
          Register Passkey
        </>
      )}
    </Button>
    <p className="text-xs text-center text-muted-foreground">
      Your browser will clearify available options (Windows Hello, Touch ID, Security Key, etc.)
    </p>
  </div>
));
RegisterSection.displayName = 'RegisterSection';

export function PasskeyManagementDialog(props: PasskeyManagementDialogProps) {
  if (props.mode === 'staff') {
    return <StaffPasskeyManagementDialog {...props} />;
  }
  return <AdminPasskeyManagementDialog {...props} />;
}

function AdminPasskeyManagementDialog(props: PasskeyManagementDialogProps) {
  const auth = useAuthentication(false);
  return <PasskeyManagementDialogInner {...props} auth={auth} endpoint="/api/admin/auth/webauthn/register" />;
}

function StaffPasskeyManagementDialog(props: PasskeyManagementDialogProps) {
  const auth = useStaffAuthentication(false);
  return <PasskeyManagementDialogInner {...props} auth={auth} endpoint="/api/staff/auth/webauthn/register" />;
}

function PasskeyManagementDialogInner({ children, onAuthenticate, auth, endpoint, hasActiveSession }: PasskeyManagementDialogProps & { auth: any, endpoint: string }) {
  const { toast } = useToast();
  const { user, passkeys, registerPasskey, deletePasskey, refreshPasskeys } = auth;
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [debugLogs, setDebugLogs] = useState<string[]>([]);

  const addLog = (msg: string) => {
    setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
  };
  const [deviceName, setDeviceName] = useState(() => generateDeviceName());

  const [isLoadingPasskeys, setIsLoadingPasskeys] = useState(false);
  const [fetchError, setFetchError] = useState(false);
  const [tempMasterPassword, setTempMasterPassword] = useState("");
  const [hasSession, setHasSession] = useState(false);

  const refreshPasskeysRef = React.useRef(refreshPasskeys);
  React.useEffect(() => { refreshPasskeysRef.current = refreshPasskeys; }, [refreshPasskeys]);

  React.useEffect(() => {
    if (isDialogOpen) {
      setHasSession(hasActiveSession !== undefined ? hasActiveSession : !!sessionStorage.getItem('vishnu_admin_session'));
      setIsLoadingPasskeys(true);
      setFetchError(false);
      setDebugLogs([`Debug Console initialized. UA: ${navigator.userAgent.substring(0, 100)}`]);
      refreshPasskeysRef.current()
        .catch((err: any) => {
          console.error('Failed to fetch passkeys:', err);
          setFetchError(true);
        })
        .finally(() => setIsLoadingPasskeys(false));
    }
  }, [isDialogOpen, hasActiveSession]);

  const getDeviceIcon = (transports: string[]) => {
    if (transports.includes('hybrid')) return <Smartphone className="w-4 h-4" />;
    if (transports.includes('internal')) return <Monitor className="w-4 h-4" />;
    if (transports.includes('usb') || transports.includes('nfc') || transports.includes('ble')) return <Key className="w-4 h-4" />;
    return <ShieldCheck className="w-4 h-4" />;
  };

  const getDeviceLabel = (transports: string[]) => {
    if (transports.includes('hybrid')) return 'Phone / Google Account';
    if (transports.includes('internal')) return 'Platform (Windows Hello / Touch ID)';
    if (transports.includes('usb')) return 'Security Key (USB)';
    if (transports.includes('nfc')) return 'Security Key (NFC)';
    return 'Passkey';
  };

  const getPanelBadgeClass = (passkey: any) => {
    if (passkey?.isCandyman) return 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white border-transparent';
    if (passkey?.isAdmin) return 'bg-gradient-to-r from-red-500 to-orange-500 text-white border-transparent';
    return 'bg-muted text-muted-foreground';
  };

  const handleRegisterPasskey = async () => {
    // Auto-generate name if empty
    let finalDeviceName = deviceName.trim();
    if (!finalDeviceName) {
      finalDeviceName = generateDeviceName();
    }

    if (passkeys.length >= 3) {
      toast({ title: "Maximum of 3 passkeys allowed", variant: "destructive" });
      return;
    }

    setIsRegistering(true);
    // Do not clear the 'initialized' log
    setDebugLogs(prev => [...prev.slice(0, 1)]);
    addLog(`Starting passkey registration for "${finalDeviceName}"`);

    let activeSessionToken = undefined;
    let activeSessionObject: any = undefined;

    if (!hasSession) {
      if (!tempMasterPassword) {
        toast({ title: "Master password is required to register a passkey", variant: "destructive" });
        setIsRegistering(false);
        return;
      }

      addLog("Authenticating with master password to establish session for registration...");
      activeSessionObject = await auth.authenticateMasterPassword(tempMasterPassword);
      if (!activeSessionObject) {
        addLog("Master password authentication failed.");
        setIsRegistering(false);
        return;
      }
      activeSessionToken = activeSessionObject.token;
      addLog("Session established successfully.");
    }

    // 1. Check WebAuthn API availability
    if (typeof window.PublicKeyCredential === 'undefined') {
      addLog("FATAL: PublicKeyCredential API not available in this browser context (check HTTPS/iOS WKWebView restrictions)");
      setIsRegistering(false);
      return;
    }

    // 2. Check platform authenticator support
    try {
      const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      addLog(`Platform authenticator available: ${available}`);
    } catch (e: any) {
      addLog(`Platform check error: ${e.message}`);
    }

    addLog(`Browser hostname: ${window.location.hostname}`);

    try {
      addLog("Fetching ID token...");
      const idToken = await user?.getIdToken();
      if (!idToken) {
        addLog("ERROR: idToken evaluates to false");
        toast({ title: "Authentication required", variant: "destructive" });
        return;
      }
      addLog("ID token successfully fetched");

      addLog(`Calling GET ${endpoint}...`);
      // No type param needed anymore
      const optionsResponse = await fetch(endpoint, {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });

      if (!optionsResponse.ok) {
        let errorText = await optionsResponse.text();
        addLog(`ERROR: optionsResponse not OK (${optionsResponse.status}): ${errorText}`);
        toast({ title: 'Failed to get registration options', variant: "destructive" });
        return;
      }

      const options = await optionsResponse.json();
      addLog(`Server rpID expected: ${options.rp?.id || '(not set)'}`);
      addLog(`Options fetched. Calling startRegistration with: ${JSON.stringify({ ...options, challenge: '***' }).substring(0, 150)}...`);

      let regResp;
      try {
        regResp = await startRegistration({ optionsJSON: options });
        addLog("startRegistration completed successfully.");
      } catch (err: any) {
        addLog(`ERROR in startRegistration: [${err.name}] ${err.message}`);
        toast({
          title: err.name === 'NotAllowedError'
            ? 'Passkey registration cancelled (NotAllowedError)'
            : `Registration failed: ${err.name} - ${err.message}`,
          variant: "destructive",
        });
        return;
      }

      addLog("startRegistration done. Calling API to save passkey...");
      const success = await auth.registerPasskey(finalDeviceName, regResp, activeSessionToken);
      if (success) {
        setDeviceName("");
        setTempMasterPassword("");
        addLog("API save complete.");
        toast({ title: "Passkey registered!", description: `"${finalDeviceName}" has been added.` });

        // If they registered without a session, they intended to log in, so auto-unlock the vault
        if (!hasSession) {
          addLog("Triggering onAuthenticate to unlock vault...");
          onAuthenticate(activeSessionObject, tempMasterPassword);
          setIsDialogOpen(false);
        }
      } else {
        addLog("API save failed.");
        // The registerPasskey function already shows a toast on error
      }
    } catch (error: any) {
      addLog(`OUTER CATCH ERROR: [${error?.name || 'Error'}] ${error?.message || String(error)}`);
      console.error('Passkey registration error:', error);
      toast({ title: 'Failed to register passkey', variant: "destructive" });
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
      <DialogTrigger asChild>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Manage Passkeys</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Use your device's built-in authenticator (like Windows Hello, Touch ID, Face ID), a hardware security key, or scan a QR code with your phone.
            </p>
            <Badge variant="secondary">{passkeys.length}/3 passkeys</Badge>
          </div>

          {isLoadingPasskeys ? (
            <div className="flex flex-col items-center justify-center py-8 space-y-4">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Loading your passkeys...</p>
            </div>
          ) : fetchError ? (
            <div className="text-center py-8 space-y-4">
              <ShieldAlert className="w-12 h-12 mx-auto text-destructive" />
              <div className="space-y-1">
                <h3 className="font-medium text-destructive">Failed to load passkeys</h3>
                <p className="text-sm text-muted-foreground">
                  There was a problem communicating with the server.
                </p>
              </div>
              <Button variant="outline" onClick={() => refreshPasskeys()}>
                Try Again
              </Button>
            </div>
          ) : passkeys.length === 0 ? (
            <div className="text-center py-4 space-y-4">
              <Shield className="w-12 h-12 mx-auto text-muted-foreground" />
              <div className="space-y-1">
                <h3 className="font-medium">No passkeys registered</h3>
                <p className="text-sm text-muted-foreground">
                  {hasSession ? "No tienes ninguna llave registrada para el panel Admin." : "Enter your Master Password to register your first Admin panel passkey and unlock the vault."}
                </p>
              </div>
              <div className="space-y-4">
                {!hasSession && (
                  <div className="space-y-2">
                    <Label htmlFor="tempMasterPassword">Master Password</Label>
                    <Input
                      id="tempMasterPassword"
                      type="password"
                      value={tempMasterPassword}
                      onChange={(e) => setTempMasterPassword(e.target.value)}
                      placeholder="Enter your vault password"
                    />
                  </div>
                )}
                <RegisterSection
                  labelId="deviceName"
                  deviceName={deviceName}
                  setDeviceName={setDeviceName}
                  isRegistering={isRegistering}
                  onRegister={handleRegisterPasskey}
                />
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                {passkeys.map((passkey: any) => (
                  <div key={passkey.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      {getDeviceIcon(passkey.transports)}
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="font-medium">{passkey.name}</p>
                          <Badge className={getPanelBadgeClass(passkey)}>
                            {passkey.panelLabel || 'Legacy'}
                          </Badge>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {getDeviceLabel(passkey.transports)} · Created {passkey.createdAt.toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => deletePasskey(passkey.id)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>

              <Button
                onClick={() => {
                  setIsDialogOpen(false);
                  onAuthenticate();
                }}
                variant="default"
                className="w-full"
              >
                <Fingerprint className="mr-2 h-4 w-4" />
                Authenticate with Passkey
              </Button>

              {passkeys.length < 3 && (
                <div className="border-t pt-4">
                  <p className="text-sm font-medium mb-3">Add Another Passkey</p>

                  {!hasSession && (
                    <div className="space-y-2 mb-4">
                      <Label htmlFor="tempMasterPasswordAdd">Master Password</Label>
                      <Input
                        id="tempMasterPasswordAdd"
                        type="password"
                        value={tempMasterPassword}
                        onChange={(e) => setTempMasterPassword(e.target.value)}
                        placeholder="Enter your vault password to register"
                      />
                    </div>
                  )}

                  <RegisterSection
                    labelId="newDeviceName"
                    deviceName={deviceName}
                    setDeviceName={setDeviceName}
                    isRegistering={isRegistering}
                    onRegister={handleRegisterPasskey}
                  />
                </div>
              )}
            </div>
          )}
        </div>

      </DialogContent>
    </Dialog>
  );
}
