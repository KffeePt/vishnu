import { beforeEach, describe, expect, it, vi } from 'vitest';

const login = vi.fn(async (state: any) => {
    state.setUser({
        email: 'owner@vishnu.local',
        uid: 'owner-uid',
        isAdmin: true,
        role: 'owner'
    });
    return true;
});

const clearAuthState = vi.fn();
const clearAuthBypass = vi.fn();
const clearTokenStore = vi.fn();

vi.mock('../../../codeman/core/auth', () => ({
    AuthService: {
        login
    }
}));

vi.mock('../../../codeman/config/user-config', () => ({
    UserConfigManager: {
        clearAuthState,
        clearAuthBypass,
        getAuthMode: vi.fn(() => 'normal'),
        getLastAuth: vi.fn(() => 0),
        getAuthBypassStartedAt: vi.fn(() => 0),
        getAuthBypassExpiresAt: vi.fn(() => 0),
        getCachedUser: vi.fn(() => null),
        setLastAuth: vi.fn(),
        ensureConfig: vi.fn()
    }
}));

vi.mock('../../../codeman/core/auth/token-store', () => ({
    AuthTokenStore: {
        clear: clearTokenStore
    }
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

    it('forces a fresh owner login before opening maintenance', async () => {
        const handler = registry.getScript('enterMaintenance');
        expect(handler).toBeDefined();

        const nextTarget = await handler?.();

        expect(clearAuthState).toHaveBeenCalledTimes(1);
        expect(clearAuthBypass).toHaveBeenCalledTimes(1);
        expect(clearTokenStore).toHaveBeenCalledTimes(1);
        expect(login).toHaveBeenCalledTimes(1);
        expect(state.user?.role).toBe('owner');
        expect(nextTarget).toBe('maintenance-menu');
    });
});
