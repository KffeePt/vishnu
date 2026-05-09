import { beforeEach, describe, expect, it, vi } from 'vitest';

const login = vi.fn(async (runtimeState: any) => {
    runtimeState.setUser({
        email: 'owner@vishnu.local',
        uid: 'owner-uid',
        isAdmin: true,
        role: 'owner'
    });
    return true;
});

const ensureVishnuBackendBootstrap = vi.fn(async () => true);
const refreshFromRemote = vi.fn(async () => ({
    projectInactivityMs: 30 * 60 * 1000
}));
const startRealtimeSync = vi.fn(async () => ({
    projectInactivityMs: 30 * 60 * 1000
}));

vi.mock('../../../codeman/core/auth', () => ({
    AuthService: {
        login
    }
}));

vi.mock('../../../codeman/managers/env-setup', () => ({
    EnvSetupManager: {
        ensureVishnuBackendBootstrap
    }
}));

vi.mock('../../../codeman/core/session-timers', async () => {
    const actual = await vi.importActual<any>('../../../codeman/core/session-timers');
    return {
        ...actual,
        SessionTimerManager: {
            ...actual.SessionTimerManager,
            refreshFromRemote,
            startRealtimeSync
        }
    };
});

vi.mock('../../../codeman/core/project/firebase-credentials', () => ({
    resolveFirebaseBackendConfig: vi.fn(() => ({
        projectId: 'vishnu-6f7a9',
        apiKey: 'test-api-key',
        authDomain: 'vishnu-6f7a9.firebaseapp.com',
        databaseURL: 'https://vishnu-6f7a9-default-rtdb.firebaseio.com/',
        serviceAccountPath: 'C:/vishnu/.secrets/admin-sdk.json',
        clientSdkPath: 'C:/vishnu/.secrets/firebase-sdk.js',
        secretsDir: 'C:/vishnu/.secrets'
    }))
}));

import { state } from '../../../codeman/core/state';
import { registry } from '../../../codeman/core/registry';
import '../../../codeman/config/menu-map';

describe('maintenance access gate', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        state.user = {
            email: 'cached-owner@vishnu.local',
            uid: 'cached-owner',
            isAdmin: true,
            role: 'owner'
        };
        state.authBypass = true;
        state.rawIdToken = 'cached-token';
    });

    it('reuses the current auth flow and refreshes centralized session timers before entering maintenance', async () => {
        const handler = registry.getScript('enterMaintenance');
        expect(handler).toBeDefined();

        const nextTarget = await handler?.();

        expect(ensureVishnuBackendBootstrap).toHaveBeenCalledTimes(1);
        expect(refreshFromRemote).toHaveBeenCalledTimes(1);
        expect(startRealtimeSync).toHaveBeenCalledTimes(1);
        expect(login).toHaveBeenCalledTimes(1);
        expect(state.user?.role).toBe('owner');
        expect(nextTarget).toBe('maintenance-menu');
    });
});
