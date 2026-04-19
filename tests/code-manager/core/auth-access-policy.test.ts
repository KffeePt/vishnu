import { describe, expect, it } from 'vitest';

import {
    clampOwnerBypassDuration,
    isBrowserSessionReusable,
    MAX_BROWSER_SESSION_AGE_MS,
    shouldAllowOwnerBypass
} from '../../../codeman/core/auth/access-policy';

describe('auth access policy', () => {
    it('caps owner bypass duration to one day', () => {
        expect(clampOwnerBypassDuration(30 * 60 * 1000)).toBe(30 * 60 * 1000);
        expect(clampOwnerBypassDuration(7 * 24 * 60 * 60 * 1000)).toBe(MAX_BROWSER_SESSION_AGE_MS);
    });

    it('treats browser sessions older than one day as non-reusable', () => {
        const now = Date.now();
        expect(isBrowserSessionReusable({
            sessionStartedAt: now - (12 * 60 * 60 * 1000),
            now
        })).toBe(true);

        expect(isBrowserSessionReusable({
            sessionStartedAt: now - (MAX_BROWSER_SESSION_AGE_MS + 1),
            now
        })).toBe(false);
    });

    it('requires a fresh browser session for owner bypass restore', () => {
        const now = Date.now();

        expect(shouldAllowOwnerBypass({
            authMode: 'owner-bypass',
            cachedUser: { role: 'owner', isAdmin: true },
            bypassExpiresAt: now + 60_000,
            sessionStartedAt: now - 60_000,
            now
        })).toBe(true);

        expect(shouldAllowOwnerBypass({
            authMode: 'owner-bypass',
            cachedUser: { role: 'owner', isAdmin: true },
            bypassExpiresAt: now + 60_000,
            sessionStartedAt: now - (MAX_BROWSER_SESSION_AGE_MS + 1),
            now
        })).toBe(false);
    });
});
