import { useEffect, useRef, useCallback } from 'react';
import { rtdb } from '@/config/firebase';
import { ref as rtdbRef, set, onValue, off } from 'firebase/database';
import { UserAuth } from '@/context/auth-context';
import { useToast } from '@/hooks/use-toast';

interface UseSessionGuardParams {
    onLockSession: () => void;
    panelName: string;
}

export function useSessionGuard({ onLockSession, panelName }: UseSessionGuardParams) {
    const { user } = UserAuth();
    const { toast } = useToast();
    const lastActiveRef = useRef<number>(Date.now());
    const intervalRef = useRef<NodeJS.Timeout | null>(null);
    const warned10Ref = useRef(false);

    // Debounce RTDB writes to max once per minute
    const updateHeartbeat = useCallback(() => {
        if (!user) return;
        const now = Date.now();
        // Only write to RTDB if it's been at least 60 seconds since last write
        if (now - lastActiveRef.current > 60000) {
            lastActiveRef.current = now;
            const sessionRef = rtdbRef(rtdb, `sessions/${user.uid}/lastActive`);
            set(sessionRef, now).catch(console.error);
        }
    }, [user]);

    // Bind to window events to track activity automatically
    useEffect(() => {
        if (!user) return;

        const handleActivity = () => {
            updateHeartbeat();
        };

        // Listen to standard interaction events
        window.addEventListener('mousemove', handleActivity);
        window.addEventListener('keydown', handleActivity);
        window.addEventListener('click', handleActivity);
        window.addEventListener('scroll', handleActivity);
        window.addEventListener('touchstart', handleActivity);

        // Initial heartbeat
        updateHeartbeat();

        return () => {
            window.removeEventListener('mousemove', handleActivity);
            window.removeEventListener('keydown', handleActivity);
            window.removeEventListener('click', handleActivity);
            window.removeEventListener('scroll', handleActivity);
            window.removeEventListener('touchstart', handleActivity);
        };
    }, [user, updateHeartbeat]);

    // Sync with RTDB to support cross-tab and cross-device session timeouts
    useEffect(() => {
        if (!user) return;

        const sessionRef = rtdbRef(rtdb, `sessions/${user.uid}/lastActive`);

        const handleRemoteUpdate = (snapshot: any) => {
            if (snapshot.exists()) {
                const remoteTime = snapshot.val();
                // If remote time is newer, update local ref to push back the timeout
                if (remoteTime > lastActiveRef.current) {
                    lastActiveRef.current = remoteTime;
                    // Reset warning flags if user interacted elsewhere
                    warned10Ref.current = false;
                    window.dispatchEvent(new CustomEvent('session-reauth-dismiss'));
                }
            }
        };

        onValue(sessionRef, handleRemoteUpdate);

        return () => {
            off(sessionRef, 'value', handleRemoteUpdate);
        };
    }, [user]);

    // Listen to reauth success/dismiss to reset timers
    useEffect(() => {
        const handleReauthSuccess = () => {
            lastActiveRef.current = Date.now();
            warned10Ref.current = false;
        };
        window.addEventListener('session-reauth-success', handleReauthSuccess);
        return () => window.removeEventListener('session-reauth-success', handleReauthSuccess);
    }, []);

    // Interval checker for the 10-minute guard + 90s countdown
    useEffect(() => {
        if (!user) return;

        intervalRef.current = setInterval(() => {
            const now = Date.now();
            const elapsedMs = now - lastActiveRef.current;

            // 11.5 minutes (690,000 ms) = 10 min inactivity + 1:30 min countdown -> Force lock
            if (elapsedMs >= 690000) {
                // Enforce lock
                clearInterval(intervalRef.current!);
                onLockSession();
                toast({
                    title: "Sesión Finalizada",
                    description: `Tu bóveda en el ${panelName} se ha bloqueado automáticamente por inactividad.`,
                    variant: "destructive",
                    duration: 10000
                });
                return;
            }

            // 10 minutes (600,000 ms) -> Trigger re-auth warning dialog
            if (elapsedMs >= 600000 && !warned10Ref.current) {
                warned10Ref.current = true;
                window.dispatchEvent(new CustomEvent('session-reauth-required'));
            }

        }, 1000); // Check every second to keep the countdown dialog accurate

        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [user, onLockSession, panelName, toast]);

    return { updateHeartbeat };
}
