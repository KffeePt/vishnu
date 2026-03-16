export interface GatewayRequest {
    action: string;
    project?: string;
    payload?: any;
}

export interface GatewayResponse<T = any> {
    status: 'ok' | 'error';
    result?: T;
    error?: string;
}

export interface VishnuAdapter {
    name: string;
    send(request: GatewayRequest): Promise<GatewayResponse>;
}
