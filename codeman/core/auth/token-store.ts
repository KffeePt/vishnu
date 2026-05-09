import fs from 'fs';
import path from 'path';
import os from 'os';
import { refreshFirebaseIdToken } from './refresh-manager';
import { isBrowserSessionReusable, MAX_BROWSER_SESSION_AGE_MS, resolveSessionStartedAt } from './access-policy';

export interface StoredAuthTokens {
    firebaseIdToken: string;
    refreshToken: string;
    expiresAt: number; // epoch ms
    sessionStartedAt?: number;
    provider?: 'firebase';
    updatedAt?: number;
}

const VISHNU_DIR = path.join(os.homedir(), '.vishnu');
const AUTH_FILE = path.join(VISHNU_DIR, 'auth.json');

const DEFAULT_SKEW_MS = 5 * 60 * 1000; // Refresh 5 minutes before expiry

function ensureDir() {
    if (!fs.existsSync(VISHNU_DIR)) {
        fs.mkdirSync(VISHNU_DIR, { recursive: true });
    }
}

export const AuthTokenStore = {
    load(): StoredAuthTokens | null {
        try {
            if (!fs.existsSync(AUTH_FILE)) return null;
            const raw = fs.readFileSync(AUTH_FILE, 'utf-8');
            const parsed = JSON.parse(raw) as StoredAuthTokens;
            if (!parsed.firebaseIdToken || !parsed.refreshToken || !parsed.expiresAt) return null;
            return parsed;
        } catch {
            return null;
        }
    },

    save(tokens: StoredAuthTokens) {
        ensureDir();
        const payload: StoredAuthTokens = {
            ...tokens,
            sessionStartedAt: resolveSessionStartedAt(tokens),
            provider: 'firebase',
            updatedAt: Date.now()
        };
        fs.writeFileSync(AUTH_FILE, JSON.stringify(payload, null, 2));
    },

    clear() {
        try {
            if (fs.existsSync(AUTH_FILE)) fs.unlinkSync(AUTH_FILE);
        } catch {
            // Ignore
        }
    },

    isExpired(tokens: StoredAuthTokens, skewMs = DEFAULT_SKEW_MS): boolean {
        return tokens.expiresAt <= Date.now() + skewMs;
    },

    getSessionStartedAt(tokens?: StoredAuthTokens | null): number {
        return resolveSessionStartedAt(tokens);
    },

    hasFreshBrowserSession(maxAgeMs = MAX_BROWSER_SESSION_AGE_MS, tokens?: StoredAuthTokens | null): boolean {
        const effectiveTokens = tokens ?? AuthTokenStore.load();
        if (!effectiveTokens) return false;
        return isBrowserSessionReusable({
            sessionStartedAt: effectiveTokens.sessionStartedAt,
            updatedAt: effectiveTokens.updatedAt,
            maxAgeMs
        });
    },

    async getValidIdToken(
        apiKey?: string,
        minUpdatedAt = 0,
        options: { maxSessionAgeMs?: number; refreshSkewMs?: number } = {}
    ): Promise<string | null> {
        const tokens = this.load();
        if (!tokens) return null;

        if (minUpdatedAt > 0 && typeof tokens.updatedAt === 'number' && tokens.updatedAt < minUpdatedAt) {
            this.clear();
            return null;
        }

        const maxSessionAgeMs = options.maxSessionAgeMs ?? MAX_BROWSER_SESSION_AGE_MS;
        if (!this.hasFreshBrowserSession(maxSessionAgeMs, tokens)) {
            this.clear();
            return null;
        }

        const refreshSkewMs = options.refreshSkewMs ?? DEFAULT_SKEW_MS;
        if (!this.isExpired(tokens, refreshSkewMs)) {
            return tokens.firebaseIdToken;
        }

        if (!apiKey) return null;

        try {
            const refreshed = await refreshFirebaseIdToken(tokens.refreshToken, apiKey);
            this.save({
                ...refreshed,
                sessionStartedAt: this.getSessionStartedAt(tokens)
            });
            return refreshed.firebaseIdToken;
        } catch {
            return null;
        }
    }
};
