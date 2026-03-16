import { GatewayRequest, GatewayResponse, VishnuAdapter } from './types';
import { AuthTokenStore } from '../core/auth/token-store';
import { state } from '../core/state';

function resolveProjectId(): string | null {
    return state.project.id
        || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
        || process.env.FIREBASE_PROJECT_ID
        || null;
}

function resolveGatewayUrl(): string | null {
    const explicit = process.env.VISHNU_GATEWAY_URL;
    if (explicit) return explicit;
    const projectId = resolveProjectId();
    if (!projectId) return null;
    return `https://us-central1-${projectId}.cloudfunctions.net/vishnuGateway`;
}

function resolveApiKey(): string | undefined {
    return process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
}

export class FirebaseGatewayAdapter implements VishnuAdapter {
    public name = 'firebase-gateway';

    async send(request: GatewayRequest): Promise<GatewayResponse> {
        const url = resolveGatewayUrl();
        if (!url) {
            return { status: 'error', error: 'Missing gateway URL or Firebase project ID.' };
        }

        const apiKey = resolveApiKey();
        const idToken = await AuthTokenStore.getValidIdToken(apiKey);
        if (!idToken) {
            return { status: 'error', error: 'Missing Firebase ID token. Run vishnu login.' };
        }

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${idToken}`
            },
            body: JSON.stringify(request)
        });

        if (!res.ok) {
            const text = await res.text();
            return { status: 'error', error: `Gateway error (${res.status}): ${text}` };
        }

        const data = await res.json();
        return { status: 'ok', result: data };
    }
}
