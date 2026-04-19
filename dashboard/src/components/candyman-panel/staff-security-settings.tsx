"use client";

import React from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Fingerprint, QrCode, Settings, Shield, User2, Loader2 } from "lucide-react";
import { StaffTotpSetup } from "./staff-security/staff-totp-setup";
import { StaffPasskeyManagement } from "./staff-security/staff-passkey-management";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface StaffSecuritySettingsProps {
    usernameDraft: string;
    canManageUsername: boolean;
    isSavingUsername: boolean;
    onUsernameChange: (value: string) => void;
    onSaveUsername: () => void;
}

export function StaffSecuritySettings({
    usernameDraft,
    canManageUsername,
    isSavingUsername,
    onUsernameChange,
    onSaveUsername,
}: StaffSecuritySettingsProps) {
    return (
        <Dialog>
            <DialogTrigger asChild>
                <Button variant="outline" size="sm">
                    <Settings className="mr-2 h-4 w-4" />
                    Configuracion
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[680px] max-h-[88vh] overflow-hidden">
                <DialogHeader>
                    <DialogTitle>Configuracion</DialogTitle>
                </DialogHeader>

                <div className="max-h-[72vh] overflow-y-auto pr-1">
                    <div className="space-y-6 py-4">
                        <section className="space-y-3">
                            <div>
                                <h3 className="text-base font-semibold">General</h3>
                                <p className="text-sm text-muted-foreground">Personaliza como aparece tu panel Candyman.</p>
                            </div>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <User2 className="h-4 w-4" />
                                        Username
                                    </CardTitle>
                                    <CardDescription>
                                        Este nombre se muestra arriba del dashboard como "Welcome {'{username}'}".
                                    </CardDescription>
                                </CardHeader>
                                <CardContent className="space-y-3">
                                    <div className="grid gap-2">
                                        <Label htmlFor="staff-settings-username">Username</Label>
                                        <Input
                                            id="staff-settings-username"
                                            value={usernameDraft}
                                            onChange={(e) => onUsernameChange(e.target.value)}
                                            placeholder="staff.username"
                                            disabled={!canManageUsername}
                                        />
                                    </div>
                                    <Button onClick={onSaveUsername} disabled={!canManageUsername || isSavingUsername || !usernameDraft.trim()}>
                                        {isSavingUsername && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save Username
                                    </Button>
                                </CardContent>
                            </Card>
                        </section>

                        <section className="space-y-3">
                            <div>
                                <h3 className="text-base font-semibold">Security</h3>
                                <p className="text-sm text-muted-foreground">Gestiona tus llaves de acceso y autenticador en un solo lugar.</p>
                            </div>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <Fingerprint className="h-4 w-4" />
                                        Llaves de Acceso (Passkeys)
                                    </CardTitle>
                                    <CardDescription>
                                        Usa biometria, Windows Hello, Touch ID o una llave de seguridad para entrar al panel correcto.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <StaffPasskeyManagement />
                                </CardContent>
                            </Card>

                            <Card>
                                <CardHeader className="pb-3">
                                    <CardTitle className="text-base flex items-center gap-2">
                                        <QrCode className="h-4 w-4" />
                                        Aplicacion de Autenticador
                                    </CardTitle>
                                    <CardDescription>
                                        Agrega una segunda capa con codigos temporales.
                                    </CardDescription>
                                </CardHeader>
                                <CardContent>
                                    <StaffTotpSetup />
                                </CardContent>
                            </Card>
                        </section>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
}
