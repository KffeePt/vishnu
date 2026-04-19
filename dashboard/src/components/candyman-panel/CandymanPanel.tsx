"use client";

import React, { useState, useEffect, useRef } from 'react';
import { StaffSecuritySettings } from './staff-security-settings';
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserAuth } from "@/context/auth-context";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Lock, Unlock, ShieldAlert, LogOut, Package, MessageSquare, Bomb, Menu, Home, ShoppingCart, DollarSign, User as UserIcon, Flame, Hammer, Plus, PackageOpen } from 'lucide-react';
import DecryptInventory from "@/components/candyman-panel/decrypt-inventory";
import ChatInterface from "@/components/candyman-panel/chat-interface";
import StarField from "@/components/ui/star-field";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { AuthForm } from '@/components/admin-panel/authentication-tab/auth-form';
import { AuthSession } from "@/types/candyland";
import { Sheet, SheetContent, SheetTrigger, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot,
    InputOTPSeparator
} from "@/components/ui/input-otp";
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip";
import Image from "next/image";
import { Fingerprint } from 'lucide-react';
import {
    generateRSAKeyPair,
    exportPublicKey,
    wrapPrivateKey,
    unwrapPrivateKey,
    type WrappedPrivateKey,
} from '@/lib/crypto-client';
import { useRouter } from 'next/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/config/firebase';
import { useSentinel } from '@/hooks/use-sentinel';
import { useSessionGuard } from '@/hooks/use-session-guard';
import { SessionStaleDialog } from '@/components/ui/session-stale-dialog';
import { SessionReauthDialog } from '@/components/ui/session-reauth-dialog';

// Re-export WrappedPrivateKey type for DecryptInventory
export type { WrappedPrivateKey };

export default function CandymanPanel() {
    const { user, getIDToken, logOut } = UserAuth();
    const router = useRouter();
    const { toast } = useToast();

    const [isLoading, setIsLoading] = useState(true);
    const [isPasswordSet, setIsPasswordSet] = useState(false);
    const [hasKeys, setHasKeys] = useState(false);
    const [approvalStatus, setApprovalStatus] = useState<'pending' | 'approved' | 'rejected' | null>(null);
    const [approvalTimeLeft, setApprovalTimeLeft] = useState<number | null>(null);
    const [setupCompletedAt, setSetupCompletedAt] = useState<string | null>(null);
    const [isUnlocked, setIsUnlocked] = useState(false);
    const [masterPassword, setMasterPassword] = useState('');
    const [activeTab, setActiveTab] = useState<'inventory' | 'sales' | 'finances' | 'chat'>('inventory');
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isSystemReady, setIsSystemReady] = useState(true);
    const [sessionToken, setSessionToken] = useState<string>('');
    const [showPasswordFallback, setShowPasswordFallback] = useState(false);
    const [username, setUsername] = useState('');
    const [usernameDraft, setUsernameDraft] = useState('');
    const [setupUsername, setSetupUsername] = useState('');
    const [canManageUsername, setCanManageUsername] = useState(false);
    const [isSavingUsername, setIsSavingUsername] = useState(false);

    // Ref for master password to avoid stale closures in sentinel hooks
    const masterPasswordRef = useRef<string>('');
    useEffect(() => {
        masterPasswordRef.current = masterPassword;
    }, [masterPassword]);

    // Use a ref to track status transitions for token refresh
    const approvalStatusRef = useRef<'pending' | 'approved' | 'rejected' | null>(null);

    const lockPanel = () => {
        setIsUnlocked(false);
        setMasterPassword('');
        setSessionToken('');
        setEncryptedPrivateKey(null);
        setSentinelPrivateKey(null);
        sessionStorage.removeItem('candyland_session');
        sessionStorage.removeItem('candyland_master');
        setShowPasswordFallback(false);
        setUsername('');
        setUsernameDraft('');
        setSetupUsername('');
        setCanManageUsername(false);
    };

    useSessionGuard({
        onLockSession: () => {
            lockPanel();
            // Do NOT call logOut() here. The SessionStaleDialog will require the user
            // to manually click "Sign Out and Reauthenticate".
        },
        panelName: 'Panel Staff'
    });

    // Encrypted private key fetched from server (for decrypt-inventory)
    const [encryptedPrivateKey, setEncryptedPrivateKey] = useState<WrappedPrivateKey | null>(null);

    // Sentinel State
    const [isSentinelSetupState, setIsSentinelSetupState] = useState<boolean | null>(null);
    const [sentinelEncryptedPriv, setSentinelEncryptedPriv] = useState<string | null>(null);
    const [sentinelPrivateKey, setSentinelPrivateKey] = useState<CryptoKey | null>(null);

    // Initialize the Sentinel hook
    const sentinelState = useSentinel({
        sentinelPrivateKey,
        onKeysReset: () => {
            toast({ title: "Alerta de Seguridad", description: "Tus llaves fueron restablecidas por un administrador.", variant: "destructive" });
            lockPanel();
        },
        onClaimsChanged: () => {
            toast({ title: "Actualización del Sistema", description: "Los permisos o roles han sido modificados." });
        },
        onInventoryUpdated: () => {
            toast({ title: "Actualización de Inventario", description: "Tu inventario asignado ha cambiado." });
        },
        onSessionRevoked: () => {
            toast({ title: "Sesión Revocada", description: "Has sido desconectado por el servidor.", variant: "destructive" });
            lockPanel();
            if (logOut) logOut();
        },
        onSentinelRotated: async () => {
            const currentMp = masterPasswordRef.current;
            if (!currentMp) {
                setSentinelPrivateKey(null);
                setIsSentinelSetupState(false);
                toast({ title: "Rotación de Libro de Códigos", description: "El libro de códigos del sistema fue rotado. Desbloquea tu bóveda de nuevo para crear tus nuevas llaves Sentinel automáticamente.", variant: "destructive" });
                return;
            }

            toast({ title: "Rotación Sentinel Detectada", description: "Regenerando secretamente tus llaves Sentinel en el fondo..." });

            try {
                const token = await getIDToken();
                if (!token) throw new Error("No token");

                const sentinelKeyPair = await generateRSAKeyPair();
                const sentinelPublicKeyBase64 = await exportPublicKey(sentinelKeyPair.publicKey);
                const sentinelWrapped = await wrapPrivateKey(sentinelKeyPair.privateKey, currentMp);

                const sentinelRes = await fetch('/api/rtdb/sentinel', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        action: 'setup',
                        password: currentMp,
                        publicKey: sentinelPublicKeyBase64,
                        encryptedPrivateKey: sentinelWrapped,
                    }),
                });

                if (sentinelRes.ok) {
                    setSentinelPrivateKey(sentinelKeyPair.privateKey);
                    setIsSentinelSetupState(true);
                    toast({ title: "Sentinel Asegurado", description: "Tus llaves Sentinel han sido rotadas automáticamente con éxito." });
                } else {
                    throw new Error("API failed");
                }
            } catch (err) {
                console.error("Auto Sentinel Regen Failed", err);
                setSentinelPrivateKey(null);
                setIsSentinelSetupState(false);
                toast({ title: "Error Sentinel", description: "Hubo un error al regenerar Sentinel de forma automática.", variant: "destructive" });
            }
        }
    });

    // Shared Auth State (NeedsDecryptionPassword removed due to AuthForm handling)

    // Staff Auth is handled internally by AuthForm and its sub-components

    // Data (Notes removed in favor of Chat)



    // Realtime init-state listener removed. We now fetch initialization state securely via /api/staff/master-password

    // Auto-passkey trigger is now handled exclusively by the AuthForm component

    // Fetch initial auth status on mount
    useEffect(() => {
        checkPasswordStatus();
    }, [user]);

    // Check for explicit 5-minute session cookie expiration
    useEffect(() => {
        if (!user) {
            const hasMasterPw = sessionStorage.getItem('candyland_master');
            if (hasMasterPw) {
                lockPanel();
                toast({
                    title: "Sesión expirada por seguridad",
                    description: "Han pasado más de 5 minutos desde tu último inicio de sesión. Por motivos de seguridad de la bóveda, debes volver a autenticarte.",
                    variant: "destructive",
                    duration: 10000
                });
                if (logOut) logOut();
            }
        }
    }, [user, toast, logOut]);

    // Live listener for auth status (Pre-unlock)
    // Switches between "First Time Setup" and "Unlock" screens automatically when admin resets user
    useEffect(() => {
        if (isUnlocked || !user) return;

        const docRef = doc(db, 'staff-data', user.uid);
        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            if (!snapshot.exists()) {
                setIsPasswordSet(false);
                setHasKeys(false);
                setApprovalStatus(null);
                setSetupCompletedAt(null);
                approvalStatusRef.current = null;
            } else {
                const data = snapshot.data();
                const hasPw = !!data.passwordHash;
                const hasKeys = !!data.publicKey && !!data.encryptedPrivateKey;
                const newStatus = data.status || null;

                // Force token refresh if they just got approved so they get the 'staff' custom claim!
                if (approvalStatusRef.current === 'pending' && newStatus === 'approved') {
                    console.log("Status changed to approved. Force refreshing token to acquire staff claims.");
                    user.getIdToken(true).then((token) => {
                        console.log("Token successfully refreshed.");
                    }).catch(console.error);
                }
                approvalStatusRef.current = newStatus;

                // Only update if changed to avoid unnecessary re-renders
                setIsPasswordSet(hasPw);
                setHasKeys(hasKeys);
                setApprovalStatus(newStatus); // null means approved for backward compat
                setSetupCompletedAt(data.setupCompletedAt || null);
            }
        });

        return () => unsubscribe();
    }, [isUnlocked, user]);

    // Countdown timer for pending approval
    useEffect(() => {
        if (approvalStatus !== 'pending' || !setupCompletedAt) {
            setApprovalTimeLeft(null);
            return;
        }

        const setupTimeMs = new Date(setupCompletedAt).getTime();
        const expiryTimeMs = setupTimeMs + 5 * 60 * 1000;

        const calculateTimeLeft = () => {
            const now = Date.now();
            if (now >= expiryTimeMs) return 0;
            return Math.ceil((expiryTimeMs - now) / 1000);
        };

        // Initialize immediately
        const initialLeft = calculateTimeLeft();
        setApprovalTimeLeft(initialLeft);

        if (initialLeft <= 0) return;

        const interval = setInterval(() => {
            const left = calculateTimeLeft();
            setApprovalTimeLeft(left);
            if (left <= 0) {
                clearInterval(interval);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [approvalStatus, setupCompletedAt]);

    const formatTimeLeft = (seconds: number | null) => {
        if (seconds === null) return '';
        if (seconds <= 0) return 'Expirado';
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    };

    const checkPasswordStatus = async () => {
        if (!user) return;
        try {
            const token = await getIDToken();

            const res = await fetch('/api/staff/master-password', {
                headers: { 'Authorization': `Bearer ${token}` },
                cache: 'no-store'
            });
            const data = await res.json();
            setIsPasswordSet(data.isSet);
            setHasKeys(data.hasKeys ?? false);

            // If the system is not initialized, we will be told here safely without triggering Firestore permission errors
            if (data.isSystemReady !== undefined) {
                setIsSystemReady(data.isSystemReady);
            }
        } catch (error) {
            console.error(error);
        } finally {
            setIsLoading(false);
        }
    };

    /**
     * Generates RSA keypair client-side, wraps the private key with the master password,
     * and stores the public key + wrapped private key on the server.
     * ALSO generates the Sentinel Protocol RSA keypair using the same master password.
     */
    const generateAndStoreKeys = async (
        password: string,
        token: string,
        options?: { username?: string }
    ): Promise<WrappedPrivateKey | null> => {
        try {
            // 1. Generate Staff Vault Keys
            const keyPair = await generateRSAKeyPair();
            const publicKeyBase64 = await exportPublicKey(keyPair.publicKey);
            const wrapped = await wrapPrivateKey(keyPair.privateKey, password);

            const res = await fetch('/api/staff/master-password', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    masterPassword: password,
                    publicKey: publicKeyBase64,
                    encryptedPrivateKey: wrapped,
                    ...(options?.username ? { username: options.username } : {}),
                }),
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({}));
                throw new Error(err.error || 'Failed to store keys on server');
            }

            // 2. Generate Sentinel Protocol Keys synchronously
            const sentinelKeyPair = await generateRSAKeyPair();
            const sentinelPublicKeyBase64 = await exportPublicKey(sentinelKeyPair.publicKey);
            const sentinelWrapped = await wrapPrivateKey(sentinelKeyPair.privateKey, password);

            const sentinelRes = await fetch('/api/rtdb/sentinel', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    action: 'setup',
                    password: password, // Same master password
                    publicKey: sentinelPublicKeyBase64,
                    encryptedPrivateKey: sentinelWrapped,
                }),
            });

            if (sentinelRes.ok) {
                setSentinelPrivateKey(sentinelKeyPair.privateKey);
                setIsSentinelSetupState(true);
            }

            setHasKeys(true);
            return wrapped;
        } catch (err) {
            console.error('Key generation failed:', err);
            return null;
        }
    };

    const handleSetupPassword = async (e: React.FormEvent) => {
        e.preventDefault();
        const trimmedSetupUsername = setupUsername.trim();
        if (masterPassword.length < 6) {
            toast({ title: "Error", description: "Password must be at least 6 characters", variant: "destructive" });
            return;
        }
        if (!/^[A-Za-z0-9._-]{3,32}$/.test(trimmedSetupUsername)) {
            toast({
                title: "Error",
                description: "Username must be 3-32 characters and only use letters, numbers, periods, underscores, or hyphens.",
                variant: "destructive"
            });
            return;
        }
        try {
            setIsLoading(true);
            const token = await getIDToken();
            if (!token) return;

            // Generate RSA keys and store everything in one POST
            const wrapped = await generateAndStoreKeys(masterPassword, token, { username: trimmedSetupUsername });
            if (wrapped) {
                setEncryptedPrivateKey(wrapped);
                setIsPasswordSet(true);
                setUsername(trimmedSetupUsername);
                setUsernameDraft(trimmedSetupUsername);
                setSetupUsername('');
                setMasterPassword(''); // Clear password field
                setIsUnlocked(false); // Force them to unlock normally via the unified AuthForm
                toast({ title: "Éxito", description: "Contraseña maestra y llaves de encriptación configuradas con éxito. Por favor desbloquea tu panel." });
            } else {
                toast({ title: "Error", description: "La generación de llaves falló. Por favor intenta de nuevo.", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Error", description: "No se pudo establecer la contraseña", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleRegenerateKeys = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            setIsLoading(true);
            const token = await getIDToken();
            if (!token) return;

            const wrapped = await generateAndStoreKeys(masterPassword, token);
            if (wrapped) {
                setEncryptedPrivateKey(wrapped);
                setHasKeys(true);
                setIsUnlocked(false);
                setMasterPassword(''); // clear password field after regen
                toast({ title: "Éxito", description: "Llaves de encriptación regeneradas con éxito. Por favor inicia sesión de nuevo." });
            } else {
                toast({ title: "Error", description: "La generación de llaves falló. Por favor intenta de nuevo.", variant: "destructive" });
            }
        } catch (error) {
            toast({ title: "Error", description: "No se pudo regenerar las llaves", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleStaffAuthenticated = async (session: AuthSession, returnedPassword?: string) => {
        // MUST STORE SESSION FIRST so `completeUnlock` and other fetch calls can use it
        sessionStorage.setItem('candyland_session', JSON.stringify({
            token: session.token,
            expiresAt: session.expiresAt
        }));

        if (returnedPassword) {
            setMasterPassword(returnedPassword);
            await completeUnlock(returnedPassword);
        } else {
            // If no password is returned, it means it's a new device or the passkey
            // hasn't wrapped the master password. We MUST show the fallback form
            // to allow the user to type it in and upgrade their session.
            setShowPasswordFallback(true);
        }
    };

    const completeUnlock = async (password: string) => {
        setIsLoading(true);
        try {
            const token = await getIDToken();
            if (!token) return;

            // Session has been created via handleStaffAuthenticated -> use-staff-authentication handling.
            // All API calls that require decryption will now read from the sessionToken (via LocalStorage which adds x-master-password-session header in use-candyland API wrappers, but these fetch calls are manual here).
            const sessionStr = sessionStorage.getItem('candyland_session');
            let sessionHeader = '';
            if (sessionStr) {
                const session = JSON.parse(sessionStr);
                if (session.token) {
                    sessionHeader = session.token;
                    setSessionToken(session.token);
                }
            }

            // ATTACH PASSWORD TO SESSION FIRST (For Passkey/TOTP users)
            if (sessionHeader) {
                const attachRes = await fetch('/api/staff/auth/attach-password', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Content-Type': 'application/json',
                        'x-master-password-session': sessionHeader
                    },
                    body: JSON.stringify({ masterPassword: password })
                });

                if (!attachRes.ok) {
                    toast({ title: "Error", description: "Error al verificar la contraseña de encriptación", variant: "destructive" });
                    return;
                }
            }

            const res = await fetch('/api/staff/data', {
                headers: {
                    'Authorization': `Bearer ${token}`,
                    ...(sessionHeader ? { 'x-master-password-session': sessionHeader } : {})
                }
            });

            if (res.status === 403) {
                toast({ title: "Error", description: "Contraseña de encriptación incorrecta", variant: "destructive" });
                return;
            }

            if (!res.ok) throw new Error('Failed to unlock data');

            const data = await res.json();
            setUsername(data.username || '');
            setUsernameDraft(data.username || '');
            setCanManageUsername(data.canManageUsername === true);

            // Also need the encrypted private key from /api/staff/master-password since /api/staff/data doesn't return it
            const authRes = await fetch('/api/staff/master-password', {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            if (authRes.ok) {
                const authData = await authRes.json();
                setEncryptedPrivateKey(authData.encryptedPrivateKey);
            }

            const sentinelRes = await fetch('/api/rtdb/sentinel', {
                headers: { 'Authorization': `Bearer ${token}` }
            });
            if (sentinelRes.ok) {
                const sData = await sentinelRes.json();
                if (sData.isSet && sData.encryptedPrivateKeyB64) {
                    try {
                        const privKey = await unwrapPrivateKey(sData.encryptedPrivateKeyB64, password);
                        setSentinelPrivateKey(privKey);
                        setIsSentinelSetupState(true);
                        setSentinelEncryptedPriv(sData.encryptedPrivateKeyB64);
                    } catch (unwrapErr) {
                        // OperationError = key was generated with a different password
                        // This is expected when sentinel keys are from a previous session
                        console.warn("[Sentinel] Key unwrap failed (password mismatch — regeneration required):", (unwrapErr as Error).name);
                        setIsSentinelSetupState(false);
                    }
                } else {
                    setIsSentinelSetupState(false);
                }
            }

            setIsUnlocked(true);
            setMasterPassword(password);
            toast({ title: "Panel Desbloqueado", description: "Tu bóveda está lista." });
        } catch (error) {
            console.error(error);
            toast({ title: "Error", description: "Error al desencriptar la bóveda", variant: "destructive" });
        } finally {
            setIsLoading(false);
        }
    };

    const handleSaveUsername = async () => {
        const trimmedUsername = usernameDraft.trim();
        if (!trimmedUsername) {
            toast({ title: "Error", description: "Username is required.", variant: "destructive" });
            return;
        }

        try {
            setIsSavingUsername(true);
            const token = await getIDToken();
            if (!token) return;

            const response = await fetch('/api/staff/data', {
                method: 'PUT',
                headers: {
                    'Authorization': `Bearer ${token}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ username: trimmedUsername })
            });

            const data = await response.json().catch(() => ({}));
            if (!response.ok) {
                throw new Error(data.error || 'Failed to save username');
            }

            setUsername(data.username || trimmedUsername);
            setUsernameDraft(data.username || trimmedUsername);
            toast({ title: "Username Saved", description: "Your Candyman username was updated." });
        } catch (error: any) {
            toast({ title: "Error", description: error.message || "Failed to save username", variant: "destructive" });
        } finally {
            setIsSavingUsername(false);
        }
    };



    // Monitor for key changes/resets from server
    useEffect(() => {
        if (!isUnlocked || !user) return;

        const docRef = doc(db, 'staff-data', user.uid);
        const unsubscribe = onSnapshot(docRef, (snapshot) => {
            if (!snapshot.exists()) {
                // Document deleted (full reset)
                setIsUnlocked(false);
                setIsPasswordSet(false);
                setHasKeys(false);
                toast({ title: "Sesión Expirada", description: "Tu configuración de seguridad fue restablecida." });
                return;
            }
            const data = snapshot.data();
            const serverPubKey = data?.publicKey ?? null;
            const serverEncKey = data?.encryptedPrivateKey ?? null;

            // Compare with what we loaded at unlock time
            if (encryptedPrivateKey && serverEncKey) {
                // Compare the actual encrypted string payload to avoid JSON.stringify key sorting mismatches
                const keyChanged = serverEncKey.encryptedData !== (encryptedPrivateKey as any).encryptedData;
                if (keyChanged) {
                    setIsUnlocked(false);
                    toast({ title: "Actualización de Seguridad", description: "Tus llaves de encriptación fueron actualizadas. Por favor desbloquea de nuevo." });
                }
            } else if (encryptedPrivateKey && !serverEncKey) {
                // Keys were deleted (admin reset)
                setIsUnlocked(false);
                setIsPasswordSet(false);
                setHasKeys(false);
                toast({ title: "Sesión Expirada", description: "Tus llaves de seguridad fueron restablecidas." });
            }
        });

        return () => unsubscribe();
    }, [isUnlocked, user, encryptedPrivateKey]); // Include encryptedPrivateKey to prevent stale closures during Sentinel setup

    if (isLoading) {
        return (
            <div className="w-full min-h-[60vh] flex flex-1 items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    if (!isSystemReady) {
        return (
            <div className="min-h-[80vh] flex flex-1 items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg border-destructive/20 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-full h-1 bg-destructive/50"></div>
                    <CardHeader className="text-center pb-2">
                        <div className="mx-auto bg-destructive/10 w-16 h-16 rounded-full flex items-center justify-center mb-4 border border-destructive/20">
                            <Lock className="h-8 w-8 text-destructive" />
                        </div>
                        <CardTitle className="text-2xl font-bold tracking-tight">Sistema Bloqueado</CardTitle>
                        <CardDescription className="text-base font-medium mt-2">
                            Base de Datos No Inicializada
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center pt-2">
                        <p className="text-muted-foreground mb-6">
                            El sistema principal no ha sido configurado por el administrador.
                            Debes esperar a que se establezca la boveda principal antes de poder generar tus llaves de Staff.
                        </p>
                        <Button className="w-full font-medium" onClick={() => window.location.href = '/'}>
                            ← Volver al Inicio
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isPasswordSet) {
        return (
            <div className="min-h-[80vh] flex flex-1 items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg border-primary/20">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                            <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle className="text-xl">Configuración Inicial de Seguridad</CardTitle>
                        <CardDescription>
                            Crea una contraseña maestra para generar tus llaves de encriptación personales.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <div className="mb-6 p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-md text-sm text-amber-800 dark:text-amber-200 flex gap-2 items-start">
                            <ShieldAlert className="h-5 w-5 shrink-0 mt-0.5" />
                            <div>
                                <span className="font-bold block mb-1">IMPORTANTE: ¡GUARDA ESTA CONTRASEÑA!</span>
                                Se usa para encriptar tu llave privada. Si la olvidas, perderás acceso a todo tu inventario asignado y datos para siempre.
                            </div>
                        </div>

                        <form onSubmit={handleSetupPassword} className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Crear Username</Label>
                                <Input
                                    value={setupUsername}
                                    onChange={e => setSetupUsername(e.target.value)}
                                    required
                                    placeholder="candyman.username"
                                    minLength={3}
                                    maxLength={32}
                                    autoCapitalize="none"
                                    autoCorrect="off"
                                />
                                <p className="text-xs text-muted-foreground">
                                    Este username se mostrará como "Welcome {'{username}'}" en tu dashboard.
                                </p>
                            </div>
                            <div className="grid gap-2">
                                <Label>Crear Contraseña Maestra</Label>
                                <Input
                                    type="password"
                                    value={masterPassword}
                                    onChange={e => setMasterPassword(e.target.value)}
                                    required
                                    placeholder="Introduce una contraseña segura..."
                                    minLength={6}
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Generar Llaves y Asegurar Cuenta
                            </Button>
                        </form>
                        <div className="flex justify-center mt-4">
                            <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                                ← Volver al Inicio
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </div >
        );
    }

    if (isPasswordSet && !hasKeys) {
        return (
            <div className="min-h-[80vh] flex flex-1 items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg border-amber-500/30">
                    <CardHeader className="text-center">
                        <ShieldAlert className="mx-auto h-10 w-10 text-amber-500 mb-2" />
                        <CardTitle>Configuración de Llaves Incompleta</CardTitle>
                        <CardDescription>
                            Tu contraseña maestra fue guardada, pero la generación de llaves de encriptación no se completó.
                            Vuelve a introducir tu contraseña para terminar la configuración.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={handleRegenerateKeys} className="space-y-4">
                            <div className="grid gap-2">
                                <Label>Contraseña Maestra</Label>
                                <Input
                                    type="password"
                                    value={masterPassword}
                                    onChange={e => setMasterPassword(e.target.value)}
                                    required
                                    placeholder="Introduce tu contraseña maestra..."
                                />
                            </div>
                            <Button type="submit" className="w-full" disabled={isLoading}>
                                {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                Regenerar Llaves de Encriptación
                            </Button>
                        </form>
                        <div className="flex justify-center mt-4">
                            <a href="/" className="text-sm text-muted-foreground hover:text-primary transition-colors flex items-center gap-1">
                                ← Volver al Inicio
                            </a>
                        </div>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isPasswordSet && hasKeys && approvalStatus === 'pending') {
        return (
            <div className="min-h-[80vh] flex flex-1 items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg border-primary/20">
                    <CardHeader className="text-center">
                        <div className="mx-auto bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mb-4">
                            <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <CardTitle className="text-xl">Esperando Aprobación</CardTitle>
                        <CardDescription>
                            Tus llaves de seguridad han sido generadas, pero tu cuenta requiere autorización del administrador antes de poder acceder al panel.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto my-6" />

                        {approvalTimeLeft !== null && (
                            <div className="mb-6 p-4 bg-muted/50 rounded-lg">
                                <p className="text-sm font-medium mb-1">Tiempo Restante para Aprobación</p>
                                <div className={`text-2xl font-bold ${approvalTimeLeft <= 60 ? 'text-destructive animate-pulse' : 'text-primary'}`}>
                                    {formatTimeLeft(approvalTimeLeft)}
                                </div>
                                <p className="text-xs text-muted-foreground mt-2">
                                    Si no eres aprobado a tiempo, tu solicitud expirará y deberás repetir el proceso.
                                </p>
                            </div>
                        )}

                        <p className="text-sm text-muted-foreground mb-4">
                            Por favor notifica a un administrador que tu cuenta está lista para su aprobación. Esta página se actualizará automáticamente cuando sea aprobada.
                        </p>
                        <Button variant="outline" className="w-full" onClick={() => window.location.href = '/'}>
                            ← Volver al Inicio
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (isPasswordSet && hasKeys && approvalStatus === 'rejected') {
        return (
            <div className="min-h-[80vh] flex flex-1 items-center justify-center p-4">
                <Card className="max-w-md w-full shadow-lg border-destructive/20">
                    <CardHeader className="text-center">
                        <ShieldAlert className="mx-auto h-10 w-10 text-destructive mb-2" />
                        <CardTitle className="text-xl">Registro Rechazado</CardTitle>
                        <CardDescription>
                            Tu solicitud para unirte al panel de personal fue rechazada por un administrador.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="text-center">
                        <Button variant="outline" className="w-full" onClick={() => window.location.href = '/'}>
                            ← Volver al Inicio
                        </Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    if (!isUnlocked) {
        return (
            <div className="container max-w-md mx-auto py-10 flex-1">

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Lock className="h-5 w-5" />
                            Desbloquear Panel
                        </CardTitle>
                        <CardDescription>
                            Auntentícate para desencriptar tus datos.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-6">
                        <AuthForm
                            mode="staff"
                            onAuthenticated={handleStaffAuthenticated}
                        />
                    </CardContent>
                </Card>
            </div>
        );
    }


    return (
        <div className="min-h-screen w-full relative">
            <StarField />

            {/* Sticky Navbar */}
            <nav className="fixed top-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-b h-14">
                <div className="flex items-center justify-between h-full px-4 max-w-7xl mx-auto">
                    {/* Left: Hamburger (mobile) + Title */}
                    <div className="flex items-center gap-3">
                        <div className="md:hidden flex">
                            <Sheet open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
                                <SheetTrigger asChild>
                                    <Button variant="ghost" size="icon">
                                        <Menu className="h-5 w-5" />
                                    </Button>
                                </SheetTrigger>
                                <SheetContent side="left" className="w-[280px] sm:w-[350px]">
                                    <SheetHeader className="mb-6">
                                        <SheetTitle>Portal Candyman</SheetTitle>
                                    </SheetHeader>
                                    <div className="flex flex-col gap-2">
                                        <Button
                                            variant={activeTab === 'inventory' ? 'secondary' : 'ghost'}
                                            className="justify-start w-full"
                                            onClick={() => { setActiveTab('inventory'); setMobileMenuOpen(false); }}
                                        >
                                            <Package className="mr-2 h-4 w-4" />
                                            Mi Inventario
                                        </Button>
                                        <Button
                                            variant={activeTab === 'sales' ? 'secondary' : 'ghost'}
                                            className="justify-start w-full"
                                            onClick={() => { setActiveTab('sales'); setMobileMenuOpen(false); }}
                                        >
                                            <ShoppingCart className="mr-2 h-4 w-4" />
                                            Ventas
                                        </Button>
                                        <Button
                                            variant={activeTab === 'finances' ? 'secondary' : 'ghost'}
                                            className="justify-start w-full"
                                            onClick={() => { setActiveTab('finances'); setMobileMenuOpen(false); }}
                                        >
                                            <DollarSign className="mr-2 h-4 w-4" />
                                            Finanzas
                                        </Button>

                                        <div className="my-4 border-t border-border/50"></div>

                                        <div className="w-full [&>button]:w-full [&>button]:justify-start">
                                            <StaffSecuritySettings
                                                usernameDraft={usernameDraft}
                                                canManageUsername={canManageUsername}
                                                isSavingUsername={isSavingUsername}
                                                onUsernameChange={setUsernameDraft}
                                                onSaveUsername={handleSaveUsername}
                                            />
                                        </div>

                                        <Button variant="outline" className="justify-start w-full" onClick={() => { lockPanel(); setMobileMenuOpen(false); }}>
                                            <Lock className="mr-2 h-4 w-4" />
                                            Bloquear Panel
                                        </Button>
                                    </div>
                                </SheetContent>
                            </Sheet>
                        </div>
                        <span className="font-semibold text-lg">Portal Candyman</span>
                    </div>

                    {/* Center: Sentinel Badge + Tab Switcher */}
                    <div className="flex items-center gap-2">
                        {sentinelState.isConnected ? (
                            <div className="flex px-2 sm:px-3 py-1 bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-900 rounded-full text-xs font-medium text-green-700 dark:text-green-400 items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse shrink-0"></span>
                                <span className="hidden sm:inline">Sentinel Activo (v{sentinelState.codebookVersion})</span>
                            </div>
                        ) : (
                            <div className="flex px-2 sm:px-3 py-1 bg-destructive/10 border border-destructive/20 rounded-full text-xs font-medium text-destructive items-center gap-2">
                                <span className="w-2 h-2 rounded-full bg-destructive shrink-0"></span>
                                <span className="hidden sm:inline">Desconectado</span>
                            </div>
                        )}

                        <div className="hidden md:flex items-center gap-1 ml-2">
                            <Button
                                variant={activeTab === 'inventory' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setActiveTab('inventory')}
                            >
                                <Package className="h-4 w-4 md:mr-2" />
                                <span className="hidden lg:inline">Inventario</span>
                            </Button>
                            <Button
                                variant={activeTab === 'sales' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setActiveTab('sales')}
                            >
                                <ShoppingCart className="h-4 w-4 md:mr-2" />
                                <span className="hidden lg:inline">Ventas</span>
                            </Button>
                            <Button
                                variant={activeTab === 'finances' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setActiveTab('finances')}
                            >
                                <DollarSign className="h-4 w-4 md:mr-2" />
                                <span className="hidden lg:inline">Finanzas</span>
                            </Button>
                            <Button
                                variant={activeTab === 'chat' ? 'secondary' : 'ghost'}
                                size="sm"
                                onClick={() => setActiveTab('chat')}
                            >
                                <MessageSquare className="h-4 w-4 md:mr-2" />
                                <span className="hidden lg:inline">Chat</span>
                            </Button>
                        </div>
                    </div>

                    {/* Right: Actions */}
                    <div className="flex items-center gap-1 sm:gap-2">
                        {user && (
                            <TooltipProvider>
                                <Tooltip>
                                    <TooltipTrigger asChild>
                                        <div className="flex items-center gap-2 cursor-pointer mr-1 sm:mr-2">
                                            {user.photoURL ? (
                                                <Image
                                                    src={user.photoURL}
                                                    alt={user.displayName || 'User profile picture'}
                                                    width={32}
                                                    height={32}
                                                    className="rounded-full h-8 w-8 object-cover"
                                                />
                                            ) : (
                                                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center">
                                                    <UserIcon className="h-5 w-5 text-muted-foreground" />
                                                </div>
                                            )}
                                        </div>
                                    </TooltipTrigger>
                                    <TooltipContent align="end">
                                        <p><strong>Nombre:</strong> {user.displayName || 'N/A'}</p>
                                        <p><strong>Email:</strong> {user.email || 'N/A'}</p>
                                        <p><strong>UID:</strong> {user.uid}</p>
                                        <p><strong>Rol:</strong> Candyman (Staff)</p>
                                    </TooltipContent>
                                </Tooltip>
                            </TooltipProvider>
                        )}
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                            onClick={lockPanel}
                            title="Bloquear Sesión"
                        >
                            <Lock className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Bloquear</span>
                        </Button>
                        <Button
                            variant="destructive"
                            size="icon"
                            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                            onClick={async () => {
                                await logOut();
                                window.location.reload();
                            }}
                            title="Cerrar Sesión"
                        >
                            <LogOut className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Salir</span>
                        </Button>
                        <Button
                            variant="outline"
                            size="icon"
                            className="h-8 w-8 sm:h-9 sm:w-auto sm:px-3"
                            onClick={() => router.push('/')}
                            title="Ir a Inicio"
                        >
                            <Home className="h-4 w-4 sm:mr-2" />
                            <span className="hidden sm:inline">Inicio</span>
                        </Button>
                    </div>
                </div >
            </nav >

            <div className="container mx-auto max-w-7xl px-4 sm:px-6 md:px-8 py-8 pt-20 md:pt-24 pb-20 md:pb-8 relative z-10">
                <div className="flex-1 min-w-0">
                    {canManageUsername && (
                        <div className="mb-6">
                            <h1 className="text-3xl font-bold tracking-tight">Welcome {username || 'Candyman'}</h1>
                        </div>
                    )}

                    {['inventory', 'sales', 'finances'].includes(activeTab) && (
                        <DecryptInventory
                            masterPassword={masterPassword}
                            sessionToken={sessionToken}
                            encryptedPrivateKey={encryptedPrivateKey}
                            isUnlocked={isUnlocked}
                            section={activeTab as 'inventory' | 'sales' | 'finances'}
                            salt={encryptedPrivateKey?.salt || ''}
                            iv={encryptedPrivateKey?.iv || ''}
                        />
                    )}

                    {activeTab === 'chat' && encryptedPrivateKey && (
                        <div className="h-full min-h-[400px]">
                            <ChatInterface
                                masterPassword={masterPassword}
                                encryptedPrivateKey={encryptedPrivateKey}
                            />
                        </div>
                    )}
                </div>
            </div>

            {/* Mobile Bottom Navigation Bar */}
            <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur border-t flex items-center justify-around h-16 shadow-[0_-4px_20px_-10px_rgba(0,0,0,0.1)] pb-safe">
                <Button
                    variant="ghost"
                    className={`flex-col h-full w-full rounded-none gap-1 py-1 ${activeTab === 'inventory' ? 'text-primary' : 'text-muted-foreground hover:text-primary/80'}`}
                    onClick={() => setActiveTab('inventory')}
                >
                    <Package className="h-5 w-5 shrink-0" />
                    <span className="text-[10px] font-medium leading-none">Inventario</span>
                </Button>
                <Button
                    variant="ghost"
                    className={`flex-col h-full w-full rounded-none gap-1 py-1 ${activeTab === 'sales' ? 'text-primary' : 'text-muted-foreground hover:text-primary/80'}`}
                    onClick={() => setActiveTab('sales')}
                >
                    <ShoppingCart className="h-5 w-5 shrink-0" />
                    <span className="text-[10px] font-medium leading-none">Ventas</span>
                </Button>
                <Button
                    variant="ghost"
                    className={`flex-col h-full w-full rounded-none gap-1 py-1 ${activeTab === 'finances' ? 'text-primary' : 'text-muted-foreground hover:text-primary/80'}`}
                    onClick={() => setActiveTab('finances')}
                >
                    <DollarSign className="h-5 w-5 shrink-0" />
                    <span className="text-[10px] font-medium leading-none">Finanzas</span>
                </Button>
                <Button
                    variant="ghost"
                    className={`flex-col h-full w-full rounded-none gap-1 py-1 ${activeTab === 'chat' ? 'text-primary' : 'text-muted-foreground hover:text-primary/80'}`}
                    onClick={() => setActiveTab('chat')}
                >
                    <MessageSquare className="h-5 w-5 shrink-0" />
                    <span className="text-[10px] font-medium leading-none">Chat</span>
                </Button>
            </div>

            {/* Staff Action FAB */}
            {
                isUnlocked && encryptedPrivateKey && (
                    <div className="fixed bottom-20 md:bottom-8 right-4 md:right-8 z-[60]">
                        <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                                <Button size="icon" className="h-14 w-14 rounded-full shadow-[0_0_20px_rgba(0,0,0,0.2)] bg-primary hover:bg-primary/90 hover:scale-105 transition-all outline-none ring-0">
                                    <Plus className="h-6 w-6 text-primary-foreground drop-shadow-md" />
                                </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-56 mb-2 mr-2">
                                <DropdownMenuLabel>Acciones de Personal</DropdownMenuLabel>
                                <DropdownMenuItem onClick={() => {
                                    if (activeTab === 'chat') setActiveTab('inventory');
                                    setTimeout(() => window.dispatchEvent(new CustomEvent('open-staff-crafting')), 50);
                                }}>
                                    <Hammer className="mr-2 h-4 w-4" />
                                    <span>Crafteo</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                    if (activeTab === 'chat') setActiveTab('inventory');
                                    setTimeout(() => window.dispatchEvent(new CustomEvent('open-staff-reports')), 50);
                                }}>
                                    <Flame className="mr-2 h-4 w-4 text-amber-500" />
                                    <span>Reportes</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => {
                                    if (activeTab === 'chat') setActiveTab('inventory');
                                    setTimeout(() => window.dispatchEvent(new CustomEvent('open-staff-sell')), 50);
                                }}>
                                    <PackageOpen className="mr-2 h-4 w-4 text-blue-500" />
                                    <span>Vender</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={() => setActiveTab('chat')}>
                                    <MessageSquare className="mr-2 h-4 w-4 text-primary" />
                                    <span>Chat</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                )
            }

            <SessionReauthDialog mode="staff" />
            <SessionStaleDialog />
        </div >
    );
}
