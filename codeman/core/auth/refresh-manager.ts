export interface RefreshedTokenBundle {
    firebaseIdToken: string;
    refreshToken: string;
    expiresAt: number;
}

export async function refreshFirebaseIdToken(refreshToken: string, apiKey: string): Promise<RefreshedTokenBundle> {
    const url = `https://securetoken.googleapis.com/v1/token?key=${apiKey}`;
    const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
    });

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body
    });

    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Token refresh failed (${res.status}): ${text}`);
    }

    const data = await res.json() as {
        id_token: string;
        refresh_token?: string;
        expires_in: string;
    };

    const expiresInSec = Number(data.expires_in || '0');
    const expiresAt = Date.now() + expiresInSec * 1000;

    return {
        firebaseIdToken: data.id_token,
        refreshToken: data.refresh_token || refreshToken,
        expiresAt
    };
}
