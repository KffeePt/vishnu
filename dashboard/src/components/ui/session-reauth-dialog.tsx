"use client";

import { useEffect, useState, useRef } from 'react';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { AuthForm } from '@/components/admin-panel/authentication-tab/auth-form';
import { AuthSession } from '@/types/candyland';

interface SessionReauthDialogProps {
    mode: 'admin' | 'staff';
}

export function SessionReauthDialog({ mode }: SessionReauthDialogProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [timeLeft, setTimeLeft] = useState(90); // 1:30 in seconds
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const handleReauthRequired = () => {
            setIsOpen(true);
            setTimeLeft(90);
        };
        const handleDismiss = () => {
            setIsOpen(false);
            if (timerRef.current) clearInterval(timerRef.current);
        };

        window.addEventListener('session-reauth-required', handleReauthRequired);
        window.addEventListener('session-reauth-dismiss', handleDismiss);

        return () => {
            window.removeEventListener('session-reauth-required', handleReauthRequired);
            window.removeEventListener('session-reauth-dismiss', handleDismiss);
        };
    }, []);

    useEffect(() => {
        if (isOpen) {
            timerRef.current = setInterval(() => {
                setTimeLeft((prev) => {
                    if (prev <= 1) {
                        clearInterval(timerRef.current!);
                        setIsOpen(false);
                        // The lock is enforced by use-session-guard, we just close the dialog
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [isOpen]);

    const handleAuthenticated = (session: AuthSession, masterPassword?: string) => {
        setIsOpen(false);
        if (timerRef.current) clearInterval(timerRef.current);
        // We successfully re-authenticated. Dispatch event so session guard resets timer.
        window.dispatchEvent(new CustomEvent('session-reauth-success'));
    };

    const minutes = Math.floor(timeLeft / 60);
    const seconds = timeLeft % 60;
    const timeString = `${minutes}:${seconds.toString().padStart(2, '0')}`;

    return (
        <AlertDialog open={isOpen} onOpenChange={setIsOpen}>
            <AlertDialogContent className="sm:max-w-[425px]">
                <AlertDialogHeader>
                    <AlertDialogTitle className="flex items-center justify-between">
                        <span>Sesión Inactiva</span>
                        <span className="text-destructive font-mono text-xl">{timeString}</span>
                    </AlertDialogTitle>
                    <AlertDialogDescription>
                        Por seguridad, necesitamos verificar que sigues ahí. Inicia sesión nuevamente para continuar trabajando, de lo contrario tu bóveda se bloqueará.
                    </AlertDialogDescription>
                </AlertDialogHeader>

                <div className="mt-4">
                    <AuthForm onAuthenticated={handleAuthenticated} mode={mode} />
                </div>
            </AlertDialogContent>
        </AlertDialog>
    );
}
