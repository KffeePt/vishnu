import { useCallback, useEffect, useRef } from 'react';

import { UserAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';

interface UseSessionGuardParams {
    onLockSession: () => void;
    panelName: string;
}

type SessionStateResponse = {
    valid: boolean;
    reason?: string;
    expiresAt?: number;
    remainingMs?: number;
    timers?: {
        tuiInactivityLock: number;
    };
};

const HEARTBEAT_DEBOUNCE_MS = 30_000;
const STATUS_REFRESH_MS = 15_000;

export function useSessionGuard({ onLockSession, panelName }: UseSessionGuardParams) {
    const { user } = UserAuth();
    const { toast } = useToast();
    const warnedTenMinutesRef = useRef(false);
    const warnedTwoMinutesRef = useRef(false);
    const lastHeartbeatRef = useRef(0);
    const pollingRef = useRef<NodeJS.Timeout | null>(null);

    const lockSession = useCallback((reason: string) => {
        if (pollingRef.current) {
            clearInterval(pollingRef.current);
            pollingRef.current = null;
        }
        warnedTenMinutesRef.current = false;
        warnedTwoMinutesRef.current = false;
        onLockSession();
        toast({
            title: 'Session locked',
            description: `The ${panelName} session is no longer valid (${reason}).`,
            variant: 'destructive',
            duration: 10000,
        });
    }, [onLockSession, panelName, toast]);

    const handleSessionState = useCallback((payload: SessionStateResponse) => {
        if (!payload.valid) {
            lockSession(payload.reason || 'invalid');
            return;
        }

        const remainingMs = typeof payload.remainingMs === 'number'
            ? payload.remainingMs
            : Math.max(0, (payload.expiresAt || 0) - Date.now());

        if (remainingMs <= 0) {
            lockSession('expired');
            return;
        }

        if (remainingMs <= 2 * 60 * 1000 && !warnedTwoMinutesRef.current) {
            warnedTwoMinutesRef.current = true;
            toast({
                title: 'Session expires soon',
                description: 'Your shared Vishnu session expires in under 2 minutes.',
                duration: 10000,
            });
        }

        if (remainingMs <= 10 * 60 * 1000 && !warnedTenMinutesRef.current) {
            warnedTenMinutesRef.current = true;
            window.dispatchEvent(new CustomEvent('session-reauth-required'));
        }

        if (remainingMs > 10 * 60 * 1000) {
            warnedTenMinutesRef.current = false;
        }
        if (remainingMs > 2 * 60 * 1000) {
            warnedTwoMinutesRef.current = false;
        }
    }, [lockSession, toast]);

    const refreshSessionState = useCallback(async () => {
        const response = await fetch('/api/session', {
            method: 'GET',
            credentials: 'same-origin',
        });
        const payload = await response.json().catch(() => ({ valid: false, reason: 'invalid-json' })) as SessionStateResponse;
        handleSessionState({
            ...payload,
            valid: response.ok && payload.valid === true,
        });
    }, [handleSessionState]);

    const touchSession = useCallback(async () => {
        const now = Date.now();
        if (now - lastHeartbeatRef.current < HEARTBEAT_DEBOUNCE_MS) {
            return;
        }

        lastHeartbeatRef.current = now;
        const response = await fetch('/api/session', {
            method: 'PATCH',
            credentials: 'same-origin',
        });
        const payload = await response.json().catch(() => ({ valid: false, reason: 'invalid-json' })) as SessionStateResponse;
        handleSessionState({
            ...payload,
            valid: response.ok && payload.valid === true,
        });
    }, [handleSessionState]);

    useEffect(() => {
        if (!user) {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            return;
        }

        void refreshSessionState();
        pollingRef.current = setInterval(() => {
            void refreshSessionState();
        }, STATUS_REFRESH_MS);

        const activityHandler = () => {
            void touchSession();
        };

        window.addEventListener('mousemove', activityHandler);
        window.addEventListener('keydown', activityHandler);
        window.addEventListener('click', activityHandler);
        window.addEventListener('scroll', activityHandler);
        window.addEventListener('touchstart', activityHandler);

        const handleReauthSuccess = () => {
            warnedTenMinutesRef.current = false;
            warnedTwoMinutesRef.current = false;
            void refreshSessionState();
        };

        window.addEventListener('session-reauth-success', handleReauthSuccess);

        return () => {
            if (pollingRef.current) {
                clearInterval(pollingRef.current);
                pollingRef.current = null;
            }
            window.removeEventListener('mousemove', activityHandler);
            window.removeEventListener('keydown', activityHandler);
            window.removeEventListener('click', activityHandler);
            window.removeEventListener('scroll', activityHandler);
            window.removeEventListener('touchstart', activityHandler);
            window.removeEventListener('session-reauth-success', handleReauthSuccess);
        };
    }, [refreshSessionState, touchSession, user]);

    return { refreshSessionState, touchSession };
}
