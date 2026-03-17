import fs from 'fs';
import path from 'path';
import os from 'os';
import { GlobalConfigManager } from './global-config-manager';

interface GeminiKey {
    key: string;
    alias: string;
    addedAt: string;
}

export class GlobalKeyManager {
    private static registryPath = path.join(os.homedir(), '.vishnu', 'gemini-keys.json');

    private static loadRegistry(): GeminiKey[] {
        if (fs.existsSync(this.registryPath)) {
            try {
                return JSON.parse(fs.readFileSync(this.registryPath, 'utf-8'));
            } catch { return []; }
        }
        return [];
    }

    private static saveRegistry(keys: GeminiKey[]) {
        const dir = path.dirname(this.registryPath);
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(this.registryPath, JSON.stringify(keys, null, 2));
    }

    public static getKeys(): GeminiKey[] {
        return this.loadRegistry();
    }

    public static pushKey(alias: string, key: string) {
        const keys = this.loadRegistry();
        keys.push({ alias, key, addedAt: new Date().toISOString() });
        this.saveRegistry(keys);
    }

    public static updateKey(index: number, newKey: string) {
        const keys = this.loadRegistry();
        if (keys[index]) {
            keys[index].key = newKey;
            this.saveRegistry(keys);
        }
    }

    public static deleteKey(index: number) {
        const keys = this.loadRegistry();
        keys.splice(index, 1);
        this.saveRegistry(keys);
    }

    public static setActive(key: string) {
        GlobalConfigManager.set('GEMINI_API_KEY', key);
        GlobalConfigManager.setUserEnvVar('GEMINI_API_KEY', key);
    }

    public static getActive(): string | undefined {
        return GlobalConfigManager.get('GEMINI_API_KEY');
    }
}
