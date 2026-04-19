"use client";

import { useEffect, useState } from 'react';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { UserAuth } from '@/context/auth-context';
import { LogOut } from 'lucide-react';

export function SessionStaleDialog() {
    const [isOpen, setIsOpen] = useState(false);
    const { logOut } = UserAuth();

    useEffect(() => {
        const handleStaleSession = () => setIsOpen(true);
        window.addEventListener('session-stale', handleStaleSession);
        return () => window.removeEventListener('session-stale', handleStaleSession);
    }, []);

    const handleSignOut = () => {
        setIsOpen(false);
        if (logOut) {
            logOut().then(() => {
                window.location.href = '/';
            });
        } else {
            window.location.href = '/';
        }
    };

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>Sesión Expirada o Inválida</AlertDialogTitle>
                    <AlertDialogDescription>
                        Tu sesión ha caducado por motivos de seguridad o los permisos han cambiado.
                        Nada va a funcionar hasta que inicies sesión de nuevo. Por favor, cierra sesión y vuelve a autenticarte para continuar.
                    </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogAction onClick={handleSignOut} className="bg-destructive text-destructive-foreground hover:bg-destructive/90 w-full sm:w-auto">
                        <LogOut className="mr-2 h-4 w-4" />
                        Cerrar Sesión y Reautenticar
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    );
}
