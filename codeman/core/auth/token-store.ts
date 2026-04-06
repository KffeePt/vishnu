import fs from 'fs';
import path from 'path';
import os from 'os';
import { refreshFirebaseIdToken } from './refresh-manager';

export interface StoredAuthTokens {
    firebaseIdToken: string;
    refreshToken: string;
    expiresAt: number; // epoch ms
    provider?: 'firebase';
    updatedAt?: number;
}

const VISHNU_DIR = path.join(os.homedir(), '.vishnu');
const AUTH_FILE = path.join(VISHNU_DIR, 'auth.json');

const DEFAULT_SKEW_MS = 2 * 60 * 1000; // Refresh 2 minutes before expiry

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

    async getValidIdToken(apiKey?: string, minUpdatedAt = 0): Promise<string | null> {
        const tokens = this.load();
        if (!tokens) return null;

        if (minUpdatedAt > 0 && typeof tokens.updatedAt === 'number' && tokens.updatedAt < minUpdatedAt) {
            this.clear();
            return null;
        }

        if (!this.isExpired(tokens)) {
            return tokens.firebaseIdToken;
        }

        if (!apiKey) return null;

        try {
            const refreshed = await refreshFirebaseIdToken(tokens.refreshToken, apiKey);
            this.save(refreshed);
            return refreshed.firebaseIdToken;
        } catch {
            return null;
        }
    }
};
