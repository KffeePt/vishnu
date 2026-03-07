import fs from 'fs';
import path from 'path';
import os from 'os';
import dotenv from 'dotenv';

export class GlobalConfigManager {
    private static envPath = path.join(os.homedir(), '.vishnu', '.env');
    private static loaded = false;

    private static ensureInit() {
        const dir = path.dirname(this.envPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.envPath)) {
            fs.writeFileSync(this.envPath, '');
        }
    }

    public static load() {
        this.ensureInit();
        dotenv.config({ path: this.envPath }); // Load into process.env
        this.loaded = true;
    }

    public static get(key: string, defaultValue?: string): string | undefined {
        if (!this.loaded) this.load();
        return process.env[key] || defaultValue;
    }

    public static set(key: string, value: string) {
        this.ensureInit();
        // Read existing file to preserve comments/order if possible, 
        // or just simple key-value replacement
        let content = fs.readFileSync(this.envPath, 'utf-8');
        const regex = new RegExp(`^${key}=.*$`, 'm');

        if (regex.test(content)) {
            content = content.replace(regex, `${key}=${value}`);
        } else {
            content += `\n${key}=${value}`;
        }

        fs.writeFileSync(this.envPath, content.trim() + '\n');

        // Update current process env
        process.env[key] = value;
    }
}
