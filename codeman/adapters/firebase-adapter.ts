import { GatewayRequest, GatewayResponse, VishnuAdapter } from './types';

export class FirebaseAdapter implements VishnuAdapter {
    public name = 'firebase-direct';

    async send(_request: GatewayRequest): Promise<GatewayResponse> {
        return {
            status: 'error',
            error: 'Direct Firebase mode is not implemented yet. Use Gateway mode or add direct SDK calls.'
        };
    }
}
