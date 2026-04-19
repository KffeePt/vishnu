"use client";

import React, { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Loader2, ShieldCheck, QrCode, Copy, Check, Trash2 } from "lucide-react";
import { useStaffAuthentication } from "@/hooks/use-staff-authentication";
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

export function StaffTotpSetup() {
    const {
        setupTotp,
        verifyTotpSetup,
        deleteTotp,
        isTotpEnabled,
        pendingTotpSetup,
        checkTotpStatus,
    } = useStaffAuthentication();
    const { toast } = useToast();

    const [phase, setPhase] = useState<'idle' | 'setup' | 'active'>('idle');
    const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');
    const [secretBase32, setSecretBase32] = useState<string>('');
    const [code, setCode] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [copied, setCopied] = useState(false);
    const [showRemoveConfirm, setShowRemoveConfirm] = useState(false);
    const [isRemoving, setIsRemoving] = useState(false);

    // Persistence Key
    const STORAGE_KEY = 'staff_pending_totp_setup';

    // Resume pending setup
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


    // Check status on mount
    useEffect(() => {
        const checkPending = async () => {
            if (isTotpEnabled) {
                setPhase('active');
                localStorage.removeItem(STORAGE_KEY);
                return;
            }

            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                try {
                    const { secret, qrUri, timestamp } = JSON.parse(stored);
                    const now = Date.now();
                    if (now - timestamp < 10 * 60 * 1000) {
                        setSecretBase32(secret);
                        setQrCodeDataUrl(qrUri);
                        setPhase('setup');
                        toast({ title: "Configuración anterior reanudada", description: "Tu configuración TOTP fue restaurada." });
                    } else {
                        localStorage.removeItem(STORAGE_KEY);
                    }
                } catch (e) {
                    localStorage.removeItem(STORAGE_KEY);
                }
            } else {
                setPhase('idle');
            }
        };
        checkPending();
    }, [isTotpEnabled, toast]);

    const handleSetup = async () => {
        setIsLoading(true);
        try {
            const result = await setupTotp();
            if (!result) return;
            const dataUrl = await QRCode.toDataURL(result.qrCodeUri, { width: 200, margin: 2 });

            setQrCodeDataUrl(dataUrl);
            setSecretBase32(result.secret);
            setPhase('setup');

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
            toast({ title: "Por favor introduce el código de 6 dígitos", variant: "destructive" });
            return;
        }
        setIsLoading(true);
        try {
            const ok = await verifyTotpSetup(c.trim());
            if (ok) {
                setCode('');
                setPhase('active');
                localStorage.removeItem(STORAGE_KEY);
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

    if (phase === 'idle') {
        return (
            <div className="text-center space-y-4 py-4">
                <QrCode className="w-10 h-10 mx-auto text-muted-foreground" />
                <div className="space-y-1">
                    <p className="font-medium">Google Authenticator / Authy</p>
                    <p className="text-sm text-muted-foreground">
                        Configura una contraseña de un solo uso basada en tiempo (TOTP) para una autenticación rápida y segura.
                    </p>
                </div>
                <Button onClick={handleSetup} disabled={isLoading} className="w-full">
                    {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <QrCode className="mr-2 h-4 w-4" />}
                    Configurar Autenticador
                </Button>
            </div>
        );
    }

    if (phase === 'setup') {
        return (
            <div className="space-y-4">
                <div className="text-center space-y-2">
                    <p className="font-medium text-sm">Escanea con Google Authenticator</p>
                    {qrCodeDataUrl && (
                        <div className="flex justify-center">
                            <img src={qrCodeDataUrl} alt="TOTP QR Code" className="rounded-lg border p-2" width={200} height={200} />
                        </div>
                    )}
                    <p className="text-xs text-muted-foreground">O introduce esta llave manualmente:</p>
                    <div className="flex items-center gap-2 justify-center">
                        <code className="text-xs bg-muted px-2 py-1 rounded font-mono break-all">{secretBase32}</code>
                        <Button variant="ghost" size="sm" onClick={handleCopySecret}>
                            {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>
                <div className="space-y-2 flex flex-col items-center">
                    <Label>Confirmar con Código</Label>
                    <InputOTP
                        maxLength={6}
                        value={code}
                        onChange={(value) => {
                            setCode(value);
                            if (value.length === 6) handleVerifySetup(value);
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
                    <Button variant="outline" onClick={handleCancelSetup} className="flex-1">Cancelar</Button>
                    <Button onClick={() => handleVerifySetup(code)} disabled={isLoading || code.length !== 6} className="flex-1">
                        {isLoading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "Verificar"}
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <>
            <div className="space-y-4">
                <div className="text-center space-y-1">
                    <ShieldCheck className="w-8 h-8 mx-auto text-green-500" />
                    <p className="text-sm font-medium">Autenticador Activo</p>
                    <p className="text-xs text-muted-foreground">Tu cuenta está protegida con TOTP.</p>
                </div>
                <Button
                    variant="outline"
                    className="w-full text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={() => setShowRemoveConfirm(true)}
                >
                    <Trash2 className="mr-2 h-4 w-4" />
                    Eliminar Autenticador
                </Button>
            </div>

            <AlertDialog open={showRemoveConfirm} onOpenChange={setShowRemoveConfirm}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>¿Eliminar Autenticador?</AlertDialogTitle>
                        <AlertDialogDescription>
                            Esto hará que tu cuenta sea menos segura. Tendrás que configurarlo de nuevo si cambias de opinión.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isRemoving}>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRemoveAuthenticator}
                            disabled={isRemoving}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isRemoving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                            Eliminar
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </>
    );
}
