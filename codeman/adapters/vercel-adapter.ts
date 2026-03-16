import { GatewayRequest, GatewayResponse, VishnuAdapter } from './types';
import { VercelTokenStore } from '../core/auth/vercel-token';

function resolveVercelUrl(): string | null {
    return process.env.VISHNU_VERCEL_GATEWAY_URL || null;
}

export class VercelAdapter implements VishnuAdapter {
    public name = 'vercel';

    async send(request: GatewayRequest): Promise<GatewayResponse> {
        const token = await VercelTokenStore.ensureToken();
        if (!token) {
            return { status: 'error', error: 'Missing Vercel dev token.' };
        }

        const url = resolveVercelUrl();
        if (!url) {
            return { status: 'error', error: 'Missing Vercel gateway URL (VISHNU_VERCEL_GATEWAY_URL).' };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(request)
        });

        if (!res.ok) {
            const text = await res.text();
            return { status: 'error', error: `Vercel gateway error (${res.status}): ${text}` };
        }

        const data = await res.json();
        return { status: 'ok', result: data };
    }
}
