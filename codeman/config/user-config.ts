import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.vishnu');
const CONFIG_FILE = path.join(CONFIG_DIR, 'codeman.json');

interface UserConfig {
    version: string;
    lastAuthTimestamp?: number;
    cachedUser?: any;
}

const DEFAULT_CONFIG: UserConfig = {
    version: '2.0',
    lastAuthTimestamp: 0,
    cachedUser: null
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
            const config = JSON.parse(content);
            return { ...DEFAULT_CONFIG, ...config };
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

    setLastAuth: (timestamp: number, user?: any) => {
        const config = UserConfigManager.ensureConfig();
        config.lastAuthTimestamp = timestamp;
        if (user) {
            config.cachedUser = user;
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
    }
};
