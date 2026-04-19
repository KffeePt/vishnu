import { useState, useEffect, useRef } from 'react';
import { useToast } from '@/hooks/use-toast';

export interface SessionTimerHook {
  sessionTimeLeft: number | null;
  startSessionTimer: (expiresAt: Date) => void;
  clearSessionTimer: () => void;
}

export function useSessionTimer(): SessionTimerHook {
  const [sessionTimeLeft, setSessionTimeLeft] = useState<number | null>(null);
  const { toast } = useToast();

  // Keep track of which warnings we've already shown for this session
  const warningsShownRef = useRef<Set<number>>(new Set());

  const startSessionTimer = (expiresAt: Date) => {
    setSessionTimeLeft(Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000)));
    warningsShownRef.current = new Set();
  };

  const clearSessionTimer = () => {
    setSessionTimeLeft(null);
    warningsShownRef.current = new Set();
  };

  useEffect(() => {
    if (sessionTimeLeft === null) return;

    const interval = setInterval(() => {
      const now = new Date();
      // Calculate current actual time left to avoid drifting interval checks
      const timeLeft = Math.max(0, sessionTimeLeft - 1);

      if (timeLeft <= 0) {
        clearSessionTimer();
      } else {
        setSessionTimeLeft(timeLeft);

        // Exact thresholds for exactly 20m, 10m, and 2m left
        // timeLeft is in seconds
        const checkPoints = [
          { time: 1200, title: "Sesión activa: 10 min", desc: "Llevas 10 minutos con tu sesión abierta. Por seguridad se cerrará en 20 minutos." }, // 20 mins remaining
          { time: 600, title: "Sesión activa: 20 min", desc: "Llevas 20 minutos con tu sesión abierta. Por seguridad se cerrará en 10 minutos." }, // 10 mins remaining
          { time: 120, title: "Expiración inminente", desc: "Tu sesión expirará en 2 minutos. Si necesitas más tiempo, actualiza la página." } // 2 mins remaining
        ];

        for (const cp of checkPoints) {
          if (timeLeft === cp.time && !warningsShownRef.current.has(cp.time)) {
            warningsShownRef.current.add(cp.time);
            toast({
              title: cp.title,
              description: cp.desc,
              duration: 10000 // 10 seconds to read
            });
          }
        }
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [sessionTimeLeft, toast]);

  // Hook for "sesión restaurada" logic on mount
  useEffect(() => {
    const hasSession = sessionStorage.getItem('vishnu_admin_session');
    const hasShownWelcome = sessionStorage.getItem('vishnu_welcome_toast_shown');
    if (hasSession && !hasShownWelcome) {
      toast({
        title: "Sesión restaurada",
        description: "Has recargado la página antes de 5 minutos, por lo que tu sesión se ha mantenido viva.",
      });
      sessionStorage.setItem('vishnu_welcome_toast_shown', 'true');
    }
  }, [toast]);

  return {
    sessionTimeLeft,
    startSessionTimer,
    clearSessionTimer,
  };
}
