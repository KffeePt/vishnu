import fs from 'fs';
import path from 'path';
import os from 'os';
import { SessionTimerManager } from '../core/session-timers';
import { APP_VERSION } from '../utils/app-version';

const CONFIG_DIR = path.join(os.homedir(), '.vishnu');
const CONFIG_FILE = path.join(CONFIG_DIR, 'codeman.json');

interface UserConfig {
    version: string;
    lastAuthTimestamp?: number;
    cachedUser?: any;
    authMode?: 'normal' | 'owner-bypass';
    authBypassExpiresAt?: number;
    authBypassStartedAt?: number;
    authStorageVersion?: string;
}

const DEFAULT_CONFIG: UserConfig = {
    version: APP_VERSION,
    lastAuthTimestamp: 0,
    cachedUser: null,
    authMode: 'normal',
    authBypassExpiresAt: 0,
    authBypassStartedAt: 0,
    authStorageVersion: 'legacy'
};

export const UserConfigManager = {
    ensureConfig: (): UserConfig => {
        if (!fs.existsSync(CONFIG_DIR)) {
            fs.mkdirSync(CONFIG_DIR, { recursive: true });
        }

        if (!fs.existsSync(CONFIG_FILE)) {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
            return DEFAULT_CONFIG;
        }

        try {
            const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
            const config = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
            if (config.version !== APP_VERSION) {
                config.version = APP_VERSION;
                fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
            }
            return config;
        } catch (error) {
            console.error('Failed to read config file, using default:', error);
            // backup default
            return DEFAULT_CONFIG;
        }
    },

    getVersion: (): string => {
        const config = UserConfigManager.ensureConfig();
        return config.version;
    },

    setLastAuth: (timestamp: number, user?: any, options?: { authMode?: 'normal' | 'owner-bypass'; authBypassExpiresAt?: number; authBypassStartedAt?: number }) => {
        const config = UserConfigManager.ensureConfig();
        config.lastAuthTimestamp = timestamp;
        if (user) {
            config.cachedUser = user;
        }
        if (options?.authMode) {
            config.authMode = options.authMode;
        }
        if (typeof options?.authBypassExpiresAt === 'number') {
            config.authBypassExpiresAt = options.authBypassExpiresAt;
        }
        if (typeof options?.authBypassStartedAt === 'number') {
            config.authBypassStartedAt = options.authBypassStartedAt;
        } else if (options?.authMode === 'normal') {
            config.authBypassStartedAt = 0;
            config.authBypassExpiresAt = 0;
        }
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    },

    getLastAuth: (): number => {
        const config = UserConfigManager.ensureConfig();
        return config.lastAuthTimestamp || 0;
    },

    getCachedUser: (): any | null => {
        const config = UserConfigManager.ensureConfig();
        return config.cachedUser || null;
    },

    getAuthMode: (): 'normal' | 'owner-bypass' => {
        const config = UserConfigManager.ensureConfig();
        return config.authMode || 'normal';
    },

    getAuthBypassExpiresAt: (): number => {
        const config = UserConfigManager.ensureConfig();
        if (config.authMode === 'owner-bypass' && typeof config.authBypassStartedAt === 'number' && config.authBypassStartedAt > 0) {
            const duration = SessionTimerManager.getConfig().ownerBypassTimeoutMs;
            return config.authBypassStartedAt + duration;
        }
        return config.authBypassExpiresAt || 0;
    },

    getAuthBypassStartedAt: (): number => {
        const config = UserConfigManager.ensureConfig();
        return config.authBypassStartedAt || 0;
    },

    setAuthBypassExpiresAt: (expiresAt: number) => {
        const config = UserConfigManager.ensureConfig();
        config.authMode = 'owner-bypass';
        config.authBypassExpiresAt = expiresAt;
        config.authBypassStartedAt = Date.now();
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    },

    clearAuthBypass: () => {
        const config = UserConfigManager.ensureConfig();
        config.authMode = 'normal';
        config.authBypassExpiresAt = 0;
        config.authBypassStartedAt = 0;
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    },

    clearAuthState: () => {
        const config = UserConfigManager.ensureConfig();
        config.lastAuthTimestamp = 0;
        config.cachedUser = null;
        config.authMode = 'normal';
        config.authBypassExpiresAt = 0;
        config.authBypassStartedAt = 0;
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    },

    getAuthStorageVersion: (): string => {
        const config = UserConfigManager.ensureConfig();
        return typeof config.authStorageVersion === 'string' && config.authStorageVersion.trim()
            ? config.authStorageVersion.trim()
            : 'legacy';
    },

    setAuthStorageVersion: (version: string) => {
        const config = UserConfigManager.ensureConfig();
        config.authStorageVersion = version;
        try {
            fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        } catch (e) {
            console.error('Failed to save config:', e);
        }
    }
};
