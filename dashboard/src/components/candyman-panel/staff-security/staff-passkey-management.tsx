"use client";

import React, { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Trash2, Smartphone, Monitor, Shield, Fingerprint, Key, RefreshCw, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useStaffAuthentication } from "@/hooks/use-staff-authentication";
import { startRegistration } from "@simplewebauthn/browser";

interface StaffPasskeyManagementProps {
    children?: React.ReactNode;
    hasActiveSession?: boolean;
    onAuthenticate?: (session?: any, password?: string) => void;
}

const ADJECTIVES = ['Happy', 'Swift', 'Silent', 'Mighty', 'Brave', 'Clever', 'Bright', 'Silver', 'Golden', 'Crystal'];
const NOUNS = ['Laptop', 'Desktop', 'Phone', 'Tablet', 'Key', 'Device', 'Station', 'Guardian', 'Sentry', 'Keeper'];

const generateDeviceName = () => {
    const adj = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
    const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
    return `${adj}-${noun}`;
};

export function StaffPasskeyManagement({ children, hasActiveSession = true, onAuthenticate }: StaffPasskeyManagementProps) {
    const { toast } = useToast();
    const auth = useStaffAuthentication();
    const { passkeys, registerPasskey, deletePasskey, user } = auth;

    const [hasSession, setHasSession] = useState(false);
    const [isDialogOpen, setIsDialogOpen] = useState(false);
    const [isRegistering, setIsRegistering] = useState(false);
    const [debugLogs, setDebugLogs] = useState<string[]>([]);
    const [tempMasterPassword, setTempMasterPassword] = useState("");
    const [deviceName, setDeviceName] = useState(() => generateDeviceName());

    React.useEffect(() => {
        if (hasActiveSession !== undefined) {
            setHasSession(hasActiveSession);
        } else {
            setHasSession(!!sessionStorage.getItem('candyland_session'));
        }
    }, [hasActiveSession]);

    React.useEffect(() => {
        if (isDialogOpen) {
            setDebugLogs([`Debug Console initialized. UA: ${navigator.userAgent.substring(0, 100)}`]);
        }
    }, [isDialogOpen]);

    const addLog = (msg: string) => {
        setDebugLogs(prev => [...prev, `${new Date().toLocaleTimeString()}: ${msg}`]);
    };

    const getDeviceIcon = (transports: string[]) => {
        if (transports.includes('hybrid')) return <Smartphone className="w-4 h-4" />;
        if (transports.includes('internal')) return <Monitor className="w-4 h-4" />;
        if (transports.includes('usb') || transports.includes('nfc') || transports.includes('ble')) return <Key className="w-4 h-4" />;
        return <Shield className="w-4 h-4" />;
    };

    const getDeviceLabel = (transports: string[]) => {
        if (transports.includes('hybrid')) return 'Telefono / Cuenta de Google';
        if (transports.includes('internal')) return 'Plataforma (Windows Hello / Touch ID)';
        if (transports.includes('usb')) return 'Llave de Seguridad (USB)';
        if (transports.includes('nfc')) return 'Llave de Seguridad (NFC)';
        return 'Llave de Acceso';
    };

    const getPanelBadgeClass = (passkey: any) => {
        if (passkey?.isCandyman) return 'bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white border-transparent';
        if (passkey?.isAdmin) return 'bg-gradient-to-r from-red-500 to-orange-500 text-white border-transparent';
        return 'bg-muted text-muted-foreground';
    };

    const handleRegisterPasskey = async () => {
        let finalDeviceName = deviceName.trim();
        if (!finalDeviceName) {
            finalDeviceName = generateDeviceName();
        }

        if ((passkeys?.length || 0) >= 3) {
            toast({ title: "Maximo de 3 llaves de acceso permitidas", variant: "destructive" });
            return;
        }

        setIsRegistering(true);
        setDebugLogs(prev => [...prev.slice(0, 1)]);
        addLog(`Starting passkey registration for "${finalDeviceName}"`);

        let activeSessionToken = undefined;
        let activeSessionObject: any = undefined;

        if (!hasSession) {
            if (!tempMasterPassword) {
                toast({ title: "Se requiere la contrasena maestra para registrar una llave", variant: "destructive" });
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

        if (typeof window.PublicKeyCredential === 'undefined') {
            addLog("FATAL: PublicKeyCredential API not available in this browser context");
            setIsRegistering(false);
            return;
        }

        try {
            const available = await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
            addLog(`Platform authenticator available: ${available}`);
        } catch (e: any) {
            addLog(`Platform check error: ${e.message}`);
        }

        addLog(`Browser hostname: ${window.location.hostname}`);

        try {
            const idToken = await user?.getIdToken();
            if (!idToken) {
                toast({ title: "Autenticacion requerida", variant: "destructive" });
                return;
            }

            const optionsResponse = await fetch('/api/staff/auth/webauthn/register', {
                method: 'GET',
                headers: { 'Authorization': `Bearer ${idToken}` },
            });

            if (!optionsResponse.ok) {
                addLog(`ERROR: optionsResponse not OK (${optionsResponse.status})`);
                toast({ title: 'Error al obtener opciones de registro', variant: "destructive" });
                return;
            }

            const options = await optionsResponse.json();
            let regResp;
            try {
                regResp = await startRegistration({ optionsJSON: options });
                addLog("startRegistration completed successfully.");
            } catch (err: any) {
                addLog(`ERROR in startRegistration: [${err.name}] ${err.message}`);
                toast({
                    title: err.name === 'NotAllowedError'
                        ? 'Registro de llave cancelado'
                        : `Error en el registro: ${err.name}`,
                    description: err.message,
                    variant: "destructive",
                });
                return;
            }

            const success = await registerPasskey(finalDeviceName, regResp, activeSessionToken);
            if (success) {
                setDeviceName("");
                setTempMasterPassword("");
                toast({ title: "Llave registrada", description: `"${finalDeviceName}" ha sido anadida.` });

                if (!hasSession && onAuthenticate) {
                    onAuthenticate(activeSessionObject, tempMasterPassword);
                    setIsDialogOpen(false);
                }
            }
        } catch (error: any) {
            addLog(`OUTER CATCH ERROR: [${error?.name || 'Error'}] ${error?.message || String(error)}`);
            toast({ title: 'Error al registrar la llave', variant: "destructive" });
        } finally {
            setIsRegistering(false);
        }
    };

    return (
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                {children || (
                    <Button variant="outline" className="w-full">
                        <Fingerprint className="mr-2 h-4 w-4" />
                        Administrar Llaves de Acceso
                    </Button>
                )}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] max-h-[85vh] overflow-y-auto">
                <DialogHeader>
                    <DialogTitle>Administrar Llaves de Acceso</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                    <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                            Registra llaves de acceso para entrar de forma segura al panel Candyman.
                        </p>
                        <Badge variant="secondary">{(passkeys || []).length}/3</Badge>
                    </div>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            {(passkeys || []).map((passkey: any) => (
                                <div key={passkey.id} className="flex items-center justify-between p-3 border rounded-lg">
                                    <div className="flex items-center space-x-3">
                                        {getDeviceIcon(passkey.transports || [])}
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <p className="font-medium">{passkey.name}</p>
                                                <Badge className={getPanelBadgeClass(passkey)}>
                                                    {passkey.panelLabel || 'Legacy'}
                                                </Badge>
                                            </div>
                                            <p className="text-xs text-muted-foreground">
                                                {getDeviceLabel(passkey.transports || [])} · Creada el {new Date(passkey.createdAt).toLocaleDateString()}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
                                        onClick={() => deletePasskey(passkey.id)}
                                    >
                                        <Trash2 className="w-4 h-4" />
                                    </Button>
                                </div>
                            ))}

                            {(!passkeys || passkeys.length === 0) && (
                                <div className="text-center py-4 space-y-4">
                                    <Shield className="w-12 h-12 mx-auto text-muted-foreground" />
                                    <div className="space-y-1">
                                        <h3 className="font-medium">Sin llaves de acceso</h3>
                                        <p className="text-sm text-muted-foreground">
                                            {hasSession ? "No tienes ninguna llave registrada para el panel Candyman." : "Ingresa tu contrasena maestra para registrar tu primera llave del panel Candyman y desbloquear."}
                                        </p>
                                    </div>

                                    <div className="space-y-4">
                                        {!hasSession && (
                                            <div className="space-y-2 text-left">
                                                <Label htmlFor="tempMasterPassword">Contrasena Maestra</Label>
                                                <Input
                                                    id="tempMasterPassword"
                                                    type="password"
                                                    value={tempMasterPassword}
                                                    onChange={(e) => setTempMasterPassword(e.target.value)}
                                                    placeholder="Ingresa tu contrasena de la boveda"
                                                />
                                            </div>
                                        )}

                                        <div className="border-t pt-4 space-y-3 text-left">
                                            <Label>Registrar Nuevo Dispositivo</Label>
                                            <div className="flex gap-2">
                                                <Input
                                                    value={deviceName}
                                                    onChange={e => setDeviceName(e.target.value)}
                                                    placeholder="Nombre del Dispositivo"
                                                />
                                                <Button variant="ghost" size="icon" onClick={() => setDeviceName(generateDeviceName())} type="button" className="shrink-0">
                                                    <RefreshCw className="h-4 w-4" />
                                                </Button>
                                            </div>
                                            <Button onClick={handleRegisterPasskey} disabled={isRegistering} className="w-full">
                                                {isRegistering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
                                                Registrar Llave de Acceso Candyman
                                            </Button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                        {(passkeys && passkeys.length > 0 && passkeys.length < 3) && (
                            <div className="border-t pt-4 space-y-3">
                                <Label>Agregar Otra Llave</Label>

                                {!hasSession && (
                                    <div className="space-y-2 mb-4 text-left">
                                        <Label htmlFor="tempMasterPasswordAdd">Contrasena Maestra</Label>
                                        <Input
                                            id="tempMasterPasswordAdd"
                                            type="password"
                                            value={tempMasterPassword}
                                            onChange={(e) => setTempMasterPassword(e.target.value)}
                                            placeholder="Ingresa tu contrasena para registrar"
                                        />
                                    </div>
                                )}

                                <div className="flex gap-2">
                                    <Input value={deviceName} onChange={e => setDeviceName(e.target.value)} placeholder="Nombre del Dispositivo" />
                                    <Button variant="ghost" size="icon" onClick={() => setDeviceName(generateDeviceName())} type="button" className="shrink-0">
                                        <RefreshCw className="h-4 w-4" />
                                    </Button>
                                </div>
                                <Button onClick={handleRegisterPasskey} disabled={isRegistering} className="w-full">
                                    {isRegistering ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Fingerprint className="mr-2 h-4 w-4" />}
                                    Registrar Llave de Acceso Candyman
                                </Button>
                            </div>
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
