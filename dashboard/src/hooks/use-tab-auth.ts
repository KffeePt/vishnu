import { useState, useEffect } from "react";
import { useMasterPassword } from "@/hooks/use-master-password";

export function useTabAuth() {
    const [isTabAuthenticated, setIsTabAuthenticated] = useState(false);
    const { authSession } = useMasterPassword();

    useEffect(() => {
        // Check if master password session is valid (e.g. created by passkey or TOTP)
        // This allows seamless bypass without re-prompting.
    const sessionStr = sessionStorage.getItem('vishnu_admin_session');
        if (sessionStr) {
            try {
                const session = JSON.parse(sessionStr);
                const now = new Date();
                const expiry = new Date(session.expiresAt);
                if (now < expiry) {
                    setIsTabAuthenticated(true);
                } else {
      sessionStorage.removeItem('vishnu_admin_session');
                }
            } catch (e) {
      sessionStorage.removeItem('vishnu_admin_session');
            }
        }
    }, []);

    return {
        isTabAuthenticated,
        setIsTabAuthenticated,
        parentMasterPassword: authSession?.masterPassword
    };
}
