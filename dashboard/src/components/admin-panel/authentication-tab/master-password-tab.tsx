"use client";

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Lock, Key, CheckCircle, AlertCircle, Fingerprint, Plus, QrCode, ShieldCheck, ShieldX, Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { UserAuth } from '@/context/auth-context';

interface MasterPasswordStatus {
  isSet: boolean;
  setAt?: string;
  setBy?: string;
  isValid?: boolean;
}

const MasterPasswordTab: React.FC = () => {
  const { toast } = useToast();
  const { getIDToken } = UserAuth();
  const [status, setStatus] = useState<MasterPasswordStatus>({ isSet: false });
  const [isSettingPassword, setIsSettingPassword] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [loading, setLoading] = useState(true);
  const [collectionName, setCollectionName] = useState('');
  const [isEncrypting, setIsEncrypting] = useState(false);
  const [isEncrypted, setIsEncrypted] = useState(false);

  // Passkey management state
  const [isRegisteringPasskey, setIsRegisteringPasskey] = useState(false);
  const [passkeyName, setPasskeyName] = useState('');
  const [userPasskeys, setUserPasskeys] = useState([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);

  // TOTP management state
  const [isTotpEnabled, setIsTotpEnabled] = useState(false);
  const [totpLoading, setTotpLoading] = useState(false);
  const [isRemovingTotp, setIsRemovingTotp] = useState(false);

  useEffect(() => {
    const checkEncryptionStatus = async () => {
      if (!collectionName) return;

      try {
        const idToken = await getIDToken();
        if (!idToken) {
          return;
        }

        const response = await fetch(`/api/admin/firestore/collections/status?collectionName=${collectionName}`, {
          headers: {
            'Authorization': `Bearer ${idToken}`,
          },
        });

        if (response.ok) {
          const { isEncrypted } = await response.json();
          setIsEncrypted(isEncrypted);
        }
      } catch (error) {
        console.error('Error checking collection status:', error);
      }
    };

    checkEncryptionStatus();
  }, [collectionName, getIDToken]);

  // Fetch master password status on component mount
  useEffect(() => {
    fetchPasswordStatus();
    checkTotpStatus();
  }, []);

  const checkTotpStatus = async () => {
    setTotpLoading(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch('/api/admin/auth/totp/setup', {
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setIsTotpEnabled(data.enabled);
      }
    } catch (e) {
      console.error('Error checking TOTP status:', e);
    } finally {
      setTotpLoading(false);
    }
  };

  const handleRemoveTotp = async () => {
    setIsRemovingTotp(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) return;
      const res = await fetch('/api/admin/auth/totp/setup', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${idToken}` },
      });
      if (res.ok) {
        setIsTotpEnabled(false);
        toast({ title: 'Authenticator removed', description: 'Google Authenticator has been unlinked from your account.' });
      } else {
        const err = await res.json();
        toast({ title: err.error || 'Failed to remove authenticator', variant: 'destructive' });
      }
    } catch (e) {
      toast({ title: 'Failed to remove authenticator', variant: 'destructive' });
    } finally {
      setIsRemovingTotp(false);
    }
  };

  const fetchPasswordStatus = async () => {
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        setLoading(false);
        return;
      }
      const response = await fetch('/api/admin/auth/master-password', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        setStatus(data);
      } else {
        console.error('Failed to fetch password status');
      }
    } catch (error) {
      console.error('Error fetching password status:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPassword = async () => {
    if (password !== confirmPassword) {
      toast({ title: "Passwords do not match", variant: "destructive" });
      return;
    }

    if (password.length < 12) {
      toast({ title: "Password must be at least 12 characters long", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        setLoading(false);
        return;
      }
      const response = await fetch('/api/admin/auth/master-password', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          password,
          confirmPassword,
        }),
      });

      if (response.ok) {
        toast({ title: "Master password set successfully!" });
        setPassword('');
        setConfirmPassword('');
        setIsSettingPassword(false);
        fetchPasswordStatus();
      } else {
        const error = await response.json();
        toast({ title: error.error || 'Failed to set master password', variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to set master password", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (newPassword !== confirmNewPassword) {
      toast({ title: "New passwords do not match", variant: "destructive" });
      return;
    }

    if (newPassword.length < 12) {
      toast({ title: "New password must be at least 12 characters long", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        setLoading(false);
        return;
      }
      const response = await fetch('/api/admin/auth/master-password', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmNewPassword,
        }),
      });

      if (response.ok) {
        toast({ title: "Master password changed successfully!" });
        setCurrentPassword('');
        setNewPassword('');
        setConfirmNewPassword('');
        setIsChangingPassword(false);
        fetchPasswordStatus();
      } else {
        const error = await response.json();
        toast({ title: error.error || 'Failed to change master password', variant: "destructive" });
      }
    } catch (error) {
      toast({ title: "Failed to change master password", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  // Passkey registration handler
  const handleRegisterPasskey = async () => {
    if (!passkeyName.trim()) {
      toast({ title: "Please enter a name for your passkey", variant: "destructive" });
      return;
    }

    setPasskeyLoading(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        setPasskeyLoading(false);
        return;
      }

      // Get registration options from server
      const optionsResponse = await fetch('/api/admin/auth/webauthn/register', {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${idToken}`,
        },
      });

      if (!optionsResponse.ok) {
        const error = await optionsResponse.json();
        toast({ title: error.error || 'Failed to get registration options', variant: "destructive" });
        setPasskeyLoading(false);
        return;
      }

      const options = await optionsResponse.json();

      // Create credential using WebAuthn API
      const credential = await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: Uint8Array.from(atob(options.challenge), c => c.charCodeAt(0)),
          user: {
            ...options.user,
            id: Uint8Array.from(atob(options.user.id), c => c.charCodeAt(0)),
          },
        },
      }) as PublicKeyCredential;

      // Convert credential to expected format
      const credentialData = {
        id: credential.id,
        rawId: btoa(String.fromCharCode(...new Uint8Array(credential.rawId))),
        response: {
          attestationObject: btoa(String.fromCharCode(...new Uint8Array((credential.response as AuthenticatorAttestationResponse).attestationObject))),
          clientDataJSON: btoa(String.fromCharCode(...new Uint8Array(credential.response.clientDataJSON))),
          transports: (credential.response as AuthenticatorAttestationResponse).getTransports?.() || ['internal'],
        },
        type: credential.type,
      };

      // Register passkey with server
      const registerResponse = await fetch('/api/admin/auth/webauthn/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          name: passkeyName,
          credential: credentialData,
        }),
      });

      if (registerResponse.ok) {
        toast({ title: "Passkey registered successfully!" });
        setPasskeyName('');
        setIsRegisteringPasskey(false);
        // Could fetch user passkeys here to update the list
      } else {
        const error = await registerResponse.json();
        toast({ title: error.error || 'Failed to register passkey', variant: "destructive" });
      }
    } catch (error: any) {
      console.error('Passkey registration error:', error);
      toast({ title: error.name === 'NotAllowedError' ? 'Passkey registration cancelled' : 'Failed to register passkey', variant: "destructive" });
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleEncryptCollection = async () => {
    if (!collectionName.trim()) {
      toast({ title: "Please enter a collection name", variant: "destructive" });
      return;
    }

    setIsEncrypting(true);
    try {
      const idToken = await getIDToken();
      if (!idToken) {
        toast({ title: "Authentication required", variant: "destructive" });
        setIsEncrypting(false);
        return;
      }

      const endpoint = isEncrypted ? '/api/admin/data/decrypt' : '/api/admin/data/encrypt';
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          collectionName,
          password: currentPassword,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({ title: `Successfully ${isEncrypted ? 'decrypted' : 'encrypted'} ${data.encryptedCount || data.decryptedCount} documents in ${collectionName}.` });
        setCollectionName('');
        setIsEncrypted(!isEncrypted);
      } else {
        const error = await response.json();
        toast({ title: error.error || `Failed to ${isEncrypted ? 'decrypt' : 'encrypt'} collection ${collectionName}`, variant: "destructive" });
      }
    } catch (error) {
      toast({ title: `Failed to ${isEncrypted ? 'decrypt' : 'encrypt'} collection ${collectionName}`, variant: "destructive" });
    } finally {
      setIsEncrypting(false);
    }
  };

  // Check if WebAuthn is supported
  const isWebAuthnSupported = typeof window !== 'undefined' && window.navigator && window.navigator.credentials;

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Master Password Management</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Lock className="h-5 w-5" />
          Master Password Management
        </CardTitle>
        <CardDescription>
          Ultra-secure master password system for encrypting sensitive data. Only owners can set or change the password.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="flex items-center gap-2">
          {status.isSet ? (
            <>
              <CheckCircle className="h-5 w-5 text-green-500" />
              <span className="font-medium">Master password is set</span>
              {status.setAt && (
                <span className="text-sm text-muted-foreground">
                  (Set on {new Date(status.setAt).toLocaleDateString()})
                </span>
              )}
            </>
          ) : (
            <>
              <AlertCircle className="h-5 w-5 text-yellow-500" />
              <span className="font-medium">Master password is not set</span>
            </>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row gap-3">
          {!status.isSet ? (
            <Dialog open={isSettingPassword} onOpenChange={setIsSettingPassword}>
              <DialogTrigger asChild>
                <Button>
                  <Key className="h-4 w-4 mr-2" />
                  Set Master Password
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Set Master Password</DialogTitle>
                  <DialogDescription>
                    This will create the master password for encrypting all sensitive data. Only owners can perform this action.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="password">Master Password</Label>
                    <Input
                      id="password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter master password (min 12 characters)"
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
                    />
                  </div>
                  <Button
                    onClick={handleSetPassword}
                    disabled={loading}
                    className="w-full"
                  >
                    Set Master Password
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          ) : (
            <Dialog open={isChangingPassword} onOpenChange={setIsChangingPassword}>
              <DialogTrigger asChild>
                <Button variant="outline">
                  <Key className="h-4 w-4 mr-2" />
                  Change Master Password
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>Change Master Password</DialogTitle>
                  <DialogDescription>
                    Change the master password. This will require decrypting all data with the old password and encrypting with the new password.
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="currentPassword">Current Master Password</Label>
                    <Input
                      id="currentPassword"
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="Enter current password"
                    />
                  </div>
                  <div>
                    <Label htmlFor="newPassword">New Master Password</Label>
                    <Input
                      id="newPassword"
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Enter new password (min 12 characters)"
                    />
                  </div>
                  <div>
                    <Label htmlFor="confirmNewPassword">Confirm New Master Password</Label>
                    <Input
                      id="confirmNewPassword"
                      type="password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Confirm new password"
                    />
                  </div>
                  <Button
                    onClick={handleChangePassword}
                    disabled={loading}
                    className="w-full"
                  >
                    Change Master Password
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>

        {/* Information */}
        <Card className="border-yellow-200 bg-yellow-50/50">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-yellow-600 mt-0.5" />
              <div>
                <h4 className="font-semibold text-yellow-800">Security Notes</h4>
                <ul className="mt-2 text-sm text-yellow-700 space-y-1">
                  <li>• The master password is hashed and never stored in plain text.</li>
                  <li>• All sensitive data is encrypted using AES-256-GCM with PBKDF2 key derivation.</li>
                  <li>• Only owners can set or change the master password.</li>
                  <li>• Admins can use the password to decrypt data but cannot change it.</li>
                  <li>• All API calls require master password validation for data access.</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Passkey Authentication */}
        {isWebAuthnSupported && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Fingerprint className="h-5 w-5" />
                Passkey Authentication
              </CardTitle>
              <CardDescription>
                Modern passwordless authentication using biometric devices (fingerprint, face recognition) for faster, more secure access.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Passkey Support</p>
                  <p className="text-sm text-muted-foreground">
                    Register passkeys for passwordless authentication
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <Dialog open={isRegisteringPasskey} onOpenChange={setIsRegisteringPasskey}>
                  <DialogTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <Plus className="h-4 w-4" />
                      Register Passkey
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Register New Passkey</DialogTitle>
                      <DialogDescription>
                        Create a passkey for passwordless authentication. Use your device's biometric sensor or security key.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="passkeyName">Passkey Name</Label>
                        <Input
                          id="passkeyName"
                          value={passkeyName}
                          onChange={(e) => setPasskeyName(e.target.value)}
                          placeholder="e.g., Work Laptop, Phone Biometric"
                        />
                      </div>
                      <Button
                        onClick={handleRegisterPasskey}
                        disabled={passkeyLoading}
                        className="w-full gap-2"
                      >
                        <Fingerprint className="h-4 w-4" />
                        {passkeyLoading ? 'Registering...' : 'Register Passkey'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Google Authenticator (TOTP) */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <QrCode className="h-5 w-5" />
              Google Authenticator (TOTP)
            </CardTitle>
            <CardDescription>
              Use Google Authenticator or Authy as an alternative authentication method.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                {totpLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : isTotpEnabled ? (
                  <>
                    <ShieldCheck className="h-5 w-5 text-green-500" />
                    <span className="font-medium text-green-700">Authenticator Active</span>
                  </>
                ) : (
                  <>
                    <ShieldX className="h-5 w-5 text-muted-foreground" />
                    <span className="font-medium text-muted-foreground">Not configured</span>
                  </>
                )}
              </div>
              {isTotpEnabled && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleRemoveTotp}
                  disabled={isRemovingTotp}
                >
                  {isRemovingTotp && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  Remove Authenticator
                </Button>
              )}
            </div>
            {!isTotpEnabled && (
              <p className="text-sm text-muted-foreground">
                Set up Google Authenticator from the <strong>Authenticator</strong> tab on the authentication screen.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Manual Encryption */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5" />
              Manual Collection Encryption
            </CardTitle>
            <CardDescription>
              Manually encrypt a Firestore collection. This requires the master password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="collectionName">Collection Name</Label>
              <Input
                id="collectionName"
                value={collectionName}
                onChange={(e) => setCollectionName(e.target.value)}
                placeholder="Enter collection name to encrypt"
              />
            </div>
            <div>
              <Label htmlFor="masterPassword">Master Password</Label>
              <Input
                id="masterPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter master password"
              />
            </div>
            <Button
              onClick={handleEncryptCollection}
              disabled={isEncrypting}
              className="w-full"
            >
              {isEncrypting ? 'Encrypting...' : (isEncrypted ? 'Decrypt Data' : 'Encrypt Data')}
            </Button>
          </CardContent>
        </Card>
      </CardContent>
    </Card>
  );
};

export default MasterPasswordTab;
