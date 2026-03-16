import { GatewayRequest, GatewayResponse } from '../adapters/types';
import { FirebaseGatewayAdapter } from '../adapters/firebase-gateway-adapter';
import { FirebaseAdapter } from '../adapters/firebase-adapter';
import { VercelAdapter } from '../adapters/vercel-adapter';
import { state } from '../core/state';

const firebaseGatewayAdapter = new FirebaseGatewayAdapter();
const firebaseAdapter = new FirebaseAdapter();
const vercelAdapter = new VercelAdapter();

export async function routeRequest(request: GatewayRequest): Promise<GatewayResponse> {
    const mode = state.project.security?.mode || 'direct';

    if (mode === 'vercel') {
        return vercelAdapter.send(request);
    }

    if (mode === 'gateway') {
        return firebaseGatewayAdapter.send(request);
    }

    return firebaseAdapter.send(request);
}
