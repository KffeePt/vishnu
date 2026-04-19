export function getAdminHeaders(idToken: string | null): Record<string, string> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json'
    };

    if (idToken) {
        headers['Authorization'] = `Bearer ${idToken}`;
    }

    try {
        const sessionStr = typeof window !== 'undefined' ? sessionStorage.getItem('vishnu_admin_session') : null;
        if (sessionStr) {
            const session = JSON.parse(sessionStr);
            if (session.token) {
                headers['x-master-password-session'] = session.token;
            }
        }
    } catch (e) {
        console.warn("Failed to parse session token for headers", e);
    }

    return headers;
}
