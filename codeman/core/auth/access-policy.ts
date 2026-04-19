export const MAX_BROWSER_SESSION_AGE_MS = 24 * 60 * 60 * 1000;

export function clampOwnerBypassDuration(requestedMs: number): number {
    if (!Number.isFinite(requestedMs) || requestedMs <= 0) {
        return MAX_BROWSER_SESSION_AGE_MS;
    }

    return Math.min(Math.floor(requestedMs), MAX_BROWSER_SESSION_AGE_MS);
}

export function resolveSessionStartedAt(input?: { sessionStartedAt?: number; updatedAt?: number } | null): number {
    if (!input) return 0;
    if (typeof input.sessionStartedAt === 'number' && input.sessionStartedAt > 0) {
        return input.sessionStartedAt;
    }
    if (typeof input.updatedAt === 'number' && input.updatedAt > 0) {
        return input.updatedAt;
    }
    return 0;
}

export function isBrowserSessionReusable(params: {
    sessionStartedAt?: number;
    updatedAt?: number;
    now?: number;
    maxAgeMs?: number;
}): boolean {
    const now = params.now ?? Date.now();
    const maxAgeMs = params.maxAgeMs ?? MAX_BROWSER_SESSION_AGE_MS;
    const startedAt = resolveSessionStartedAt({
        sessionStartedAt: params.sessionStartedAt,
        updatedAt: params.updatedAt
    });

    return startedAt > 0 && startedAt + maxAgeMs > now;
}

export function isOwnerLikeUser(user: { role?: string; isAdmin?: boolean } | null | undefined): boolean {
    if (!user) return false;
    return user.role === 'owner' || user.isAdmin === true;
}

export function shouldAllowOwnerBypass(params: {
    authMode?: string;
    cachedUser?: { role?: string; isAdmin?: boolean } | null;
    bypassExpiresAt?: number;
    sessionStartedAt?: number;
    updatedAt?: number;
    now?: number;
}): boolean {
    const now = params.now ?? Date.now();
    const bypassExpiresAt = params.bypassExpiresAt ?? 0;

    return (
        params.authMode === 'owner-bypass' &&
        bypassExpiresAt > now &&
        isOwnerLikeUser(params.cachedUser) &&
        isBrowserSessionReusable({
            sessionStartedAt: params.sessionStartedAt,
            updatedAt: params.updatedAt,
            now
        })
    );
}
