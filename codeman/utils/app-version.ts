import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION_FILE = path.resolve(__dirname, '..', '..', 'version.json');

function readAppVersion(): string {
    try {
        const raw = fs.readFileSync(VERSION_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        if (typeof parsed.version === 'string' && parsed.version.trim().length > 0) {
            return parsed.version.trim();
        }
    } catch {
        // Ignore and use fallback.
    }

    return '0.0.0';
}

export const APP_VERSION = readAppVersion();
