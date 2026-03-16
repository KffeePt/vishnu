import fs from 'fs';
import path from 'path';

export interface AppCheckDetection {
    enabled: boolean;
    signals: string[];
}

const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.next',
    'build',
    'dist',
    '.dart_tool',
    '.firebase',
    '.vercel',
    'ios',
    'android'
]);

const MAX_FILES = 1200;
const MAX_FILE_SIZE = 256 * 1024; // 256 KB

function safeRead(filePath: string): string | null {
    try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size > MAX_FILE_SIZE) return null;
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

function scanForPatterns(root: string, patterns: RegExp[]): string[] {
    const matches: string[] = [];
    let scanned = 0;

    const walk = (dir: string) => {
        if (scanned >= MAX_FILES) return;
        let entries: fs.Dirent[];
        try {
            entries = fs.readdirSync(dir, { withFileTypes: true });
        } catch {
            return;
        }
        for (const entry of entries) {
            if (scanned >= MAX_FILES) return;
            if (entry.isDirectory()) {
                if (IGNORED_DIRS.has(entry.name)) continue;
                walk(path.join(dir, entry.name));
            } else if (entry.isFile()) {
                const fullPath = path.join(dir, entry.name);
                scanned += 1;
                const content = safeRead(fullPath);
                if (!content) continue;
                for (const pattern of patterns) {
                    if (pattern.test(content)) {
                        matches.push(path.relative(root, fullPath));
                        break;
                    }
                }
            }
        }
    };

    walk(root);
    return matches;
}

export function detectAppCheck(projectPath: string): AppCheckDetection {
    const signals: string[] = [];

    const firebaseJson = path.join(projectPath, 'firebase.json');
    if (fs.existsSync(firebaseJson)) {
        const content = safeRead(firebaseJson);
        if (content) {
            try {
                const json = JSON.parse(content);
                if (json.appCheck || json.appcheck) {
                    signals.push('firebase.json:appCheck');
                }
            } catch {
                // ignore parse errors
            }
        }
    }

    const pubspec = path.join(projectPath, 'pubspec.yaml');
    if (fs.existsSync(pubspec)) {
        const content = safeRead(pubspec);
        if (content && /firebase_app_check\s*:/i.test(content)) {
            signals.push('pubspec.yaml:firebase_app_check');
        }
    }

    const patterns = [
        /initializeAppCheck\s*\(/,
        /FirebaseAppCheck\.instance/,
        /firebase_app_check/i,
        /firebase\/app-check/i,
        /AppCheckProvider/i
    ];

    const codeSignals = scanForPatterns(projectPath, patterns);
    for (const match of codeSignals) {
        signals.push(`code:${match}`);
    }

    return {
        enabled: signals.length > 0,
        signals
    };
}
