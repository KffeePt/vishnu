"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, QrCode, Copy, Check, Trash2 } from "lucide-react";
import { useAuthentication } from "@/hooks/use-authentication";
import { useStaffAuthentication } from "@/hooks/use-staff-authentication";
import { AuthSession } from "@/types/candyland";
import { useToast } from "@/hooks/use-toast";
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { InputOTP, InputOTPGroup, InputOTPSlot } from "@/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import QRCode from "qrcode";

interface TotpAuthTabProps {
    onAuthenticated: (session: AuthSession) => void;
    mode?: 'admin' | 'staff';
}

export function TotpAuthTab({ onAuthenticated, mode = 'admin' }: TotpAuthTabProps) {
    if (mode === 'staff') {
        return <StaffTotpAuthTab onAuthenticated={onAuthenticated} />;
    }
    return <AdminTotpAuthTab onAuthenticated={onAuthenticated} />;
}

function AdminTotpAuthTab({ onAuthenticated }: TotpAuthTabProps) {
    const auth = useAuthentication(false);
    return <TotpAuthTabInner onAuthenticated={onAuthenticated} auth={auth} />;
}

function StaffTotpAuthTab({ onAuthenticated }: TotpAuthTabProps) {
    const auth = useStaffAuthentication(false);
    return <TotpAuthTabInner onAuthenticated={onAuthenticated} auth={auth} />;
}

function TotpAuthTabInner({ onAuthenticated, auth }: { onAuthenticated: (s: AuthSession) => void, auth: any }) {
    const {
        setupTotp,
        verifyTotpSetup,
        authenticateWithTotp,
        deleteTotp,
        isTotpEnabled,
        pendingTotpSetup,
        checkTotpStatus,
        isAuthenticating,
    } = auth;
    const { toast } = useToast();

    const [phase, setPhase] = useState<'idle' | 'setup' | 'authenticate'>('idle');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
    const [secretBase32, setSecretBase32] = useState<string>('');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    // If there's a pending (unverified) setup, auto-resume with the saved QR/secret (e.g. after reload)
    useEffect(() => {
        const resumeSetup = async () => {
            if (pendingTotpSetup && phase === 'idle' && !isTotpEnabled) {
                try {
                    const dataUrl = await QRCode.toDataURL(pendingTotpSetup.qrCodeUri, { width: 200, margin: 2 });
                    setQrCodeDataUrl(dataUrl);
                    setSecretBase32(pendingTotpSetup.secret);
                    setPhase('setup');
                } catch (e) {
                    console.error("Failed to generate QR for pending setup", e);
                }
            }
        }
        resumeSetup();
    }, [pendingTotpSetup, phase, isTotpEnabled]);

    // Persistence Key
    const STORAGE_KEY = 'pending_totp_setup';

    // 1. Check for pending setup on mount
    useEffect(() => {
        const checkPending = async () => {
            // First check if already enabled on server
            // (The useAuthentication hook does this, but we depend on isTotpEnabled)
            // If already enabled, ignore pending setup
            if (isTotpEnabled) {
                setPhase('authenticate');
                localStorage.removeItem(STORAGE_KEY);
                return;
            }

            // Check local storage
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                try {
                    const { secret, qrUri, timestamp } = JSON.parse(stored);
                    // Check if expired (e.g. > 10 mins)
                    const now = Date.now();
                    if (now - timestamp < 10 * 60 * 1000) {
                        setSecretBase32(secret);
                        setQrCodeDataUrl(qrUri); // We stored the data URL directly
                        setPhase('setup');
                        toast({ title: "Resumed previous setup", description: "Your TOTP setup was restored." });
                    } else {
                        localStorage.removeItem(STORAGE_KEY);
                    }
                } catch (e) {
                    console.error("Failed to parse pending TOTP", e);
                    localStorage.removeItem(STORAGE_KEY);
                }
            } else {
                setPhase('idle');
            }
        };

        checkPending();
    }, [isTotpEnabled, toast]);

    // 2. Clear persistence when checking status confirms enabled
    useEffect(() => {
        if (isTotpEnabled) {
            setPhase('authenticate');
            localStorage.removeItem(STORAGE_KEY);
        }
    }, [isTotpEnabled]);

    const handleSetup = async () => {
        setIsLoading(true);
        try {
            const result = await setupTotp();
            if (!result) return;
            const dataUrl = await QRCode.toDataURL(result.qrCodeUri, { width: 200, margin: 2 });

            setQrCodeDataUrl(dataUrl);
            setSecretBase32(result.secret);
            setPhase('setup');

            // Save to localStorage
            localStorage.setItem(STORAGE_KEY, JSON.stringify({
                secret: result.secret,
                qrUri: dataUrl,
                timestamp: Date.now()
            }));

        } catch (err) {
            console.error('TOTP setup error:', err);
        } finally {
            setIsLoading(false);
        }
    };

    const handleVerifySetup = async (codeToVerify?: string) => {
        const c = codeToVerify || code;
        if (!c.trim()) {
            toast({ title: "Please enter the 6-digit code", variant: "destructive" });
            return;
        }
        setIsLoading(true);
        try {
            const ok = await verifyTotpSetup(c.trim());
            if (ok) {
                setCode('');
                setPhase('authenticate');
                localStorage.removeItem(STORAGE_KEY); // Clear persistence
                await checkTotpStatus();
            }
        } finally {
            setIsLoading(false);
        }
    };

    const handleCancelSetup = () => {
        setPhase('idle');
        setCode('');
        setSecretBase32('');
        setQrCodeDataUrl('');
        localStorage.removeItem(STORAGE_KEY);
    };

    const handleAuthenticate = async (codeToAuth?: string) => {
        const c = codeToAuth || code;
        if (!c.trim()) {
            toast({ title: "Please enter the 6-digit code", variant: "destructive" });
            return;
        }
        await authenticateWithTotp(c.trim(), (session: AuthSession) => {
            setCode('');
            onAuthenticated(session);
        });
    };

    const handleCopySecret = async () => {
        await navigator.clipboard.writeText(secretBase32);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleRemoveAuthenticator = async () => {
        setIsRemoving(true);
        try {
            const ok = await deleteTotp();
            if (ok) {
                setPhase('idle');
                setCode('');
                localStorage.removeItem(STORAGE_KEY);
            }
        } finally {
            setIsRemoving(false);
            setShowRemoveConfirm(false);
        }
    };

    // ─── Idle (not enrolled) ─────────────────────────────────────────────────────
    if (phase === 'idle') {
        return (
            <div className="text-center space-y-4 py-4">
                <QrCode className="w-10 h-10 mx-auto text-muted-foreground" />
                <div className="space-y-1">
                    <p className="font-medium">Google Authenticator / Authy</p>
                    <p className="text-sm text-muted-foreground">
                        Set up a time-based one-time password (TOTP) for fast, secure authentication.
                    </p>
                </div>
                <Button onClick={handleSetup} disabled={isLoading} className="w-full">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                    Set Up Authenticator
                </Button>
            </div>
        );
    }

    // ─── Setup (show QR code) ────────────────────────────────────────────────────
    if (phase === 'setup') {
        return (
            <div className="space-y-4">
                <div className="text-center space-y-2">
                    <p className="font-medium text-sm">Scan with Google Authenticator or Authy</p>
                    {qrCodeDataUrl && (
                        <div className="flex justify-center">
                            <img src={qrCodeDataUrl} alt="TOTP QR Code" className="rounded-lg border p-2" width={200} height={200} />
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">Or enter this key manually:</p>
                    <div className="flex items-center gap-2 justify-center">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">{secretBase32}</code>
                        <Button variant="ghost" size="sm" onClick={handleCopySecret}>
                            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>
                <div className="space-y-2 flex flex-col items-center">
                    <Label htmlFor="totpSetupCode">Enter the 6-digit code to confirm</Label>
                    <InputOTP
                        maxLength={6}
                        value={code}
                        onChange={(value) => {
                            setCode(value);
                            if (value.length === 6) {
                                handleVerifySetup(value);
                            }
                        }}
                        pattern={REGEXP_ONLY_DIGITS}
                    >
                        <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                        </InputOTPGroup>
                    </InputOTP>
                </div>
                <div className="flex gap-2">
                    <Button variant="outline" onClick={handleCancelSetup} className="flex-1">Cancel</Button>
                    <Button onClick={() => handleVerifySetup(code)} disabled={isLoading || code.length !== 6} className="flex-1">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Confirm Setup
                    </Button>
                </div>
            </div>
        );
    }

    // ─── Authenticate ────────────────────────────────────────────────────────────
    return (
        <>
            <div className="space-y-4">
                <div className="text-center space-y-1">
                    <ShieldCheck className="w-8 h-8 mx-auto text-green-500" />
                    <p className="text-sm font-medium">Authenticator Active</p>
                    <p className="text-xs text-muted-foreground">Enter the 6-digit code from your authenticator app.</p>
                </div>
                <div className="space-y-2 flex flex-col items-center">
                    <Label htmlFor="totpCode">Authenticator Code</Label>
                    <InputOTP
                        maxLength={6}
                        value={code}
                        onChange={(value) => {
                            setCode(value);
                            if (value.length === 6) {
                                handleAuthenticate(value);
                            }
                        }}
                        pattern={REGEXP_ONLY_DIGITS}
                        autoFocus
                    >
                        <InputOTPGroup>
                            <InputOTPSlot index={0} />
                            <InputOTPSlot index={1} />
                            <InputOTPSlot index={2} />
                            <InputOTPSlot index={3} />
                            <InputOTPSlot index={4} />
                            <InputOTPSlot index={5} />
                        </InputOTPGroup>
                    </InputOTP>
                </div>
                <Button onClick={() => handleAuthenticate(code)} disabled={isAuthenticating || code.length !== 6} className="w-full">
                    {isAuthenticating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                    Verify Code
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    className="w-full text-muted-foreground hover:text-destructive"
                    onClick={() => setShowRemoveConfirm(true)}
                >
                    <Trash2 className="mr-2 h-3 w-3" />
                    Remove Authenticator
                </Button>
            </div>

            <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Remove Google Authenticator?</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will unlink your authenticator app from your account. You will no longer be able to use it to sign in. You can set it up again at any time.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRemoving}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRemoveAuthenticator}
                            disabled={isRemoving}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Remove
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
