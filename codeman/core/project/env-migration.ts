import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { buildEnvTemplate, mergeEnvValues, parseEnv, validateEnvFormat } from './env-template';
import { List } from '../../components/list';

const NEXT_PUBLIC_KEYS = [
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];

const KEY_MAP: Record<string, string> = {
    NEXT_PUBLIC_FIREBASE_API_KEY: 'FIREBASE_API_KEY',
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: 'FIREBASE_AUTH_DOMAIN',
    NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'FIREBASE_PROJECT_ID',
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: 'FIREBASE_STORAGE_BUCKET',
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: 'FIREBASE_MESSAGING_SENDER_ID',
    NEXT_PUBLIC_FIREBASE_APP_ID: 'FIREBASE_APP_ID',
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: 'FIREBASE_MEASUREMENT_ID'
};

const IGNORED_DIRS = new Set([
    'node_modules',
    '.git',
    '.dart_tool',
    '.next',
    'build',
    'dist',
    '.firebase',
    '.vercel'
]);

function scanForNextPublic(projectPath: string): string[] {
    const matches: string[] = [];
    const MAX_FILES = 1200;
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
                const ext = path.extname(fullPath).toLowerCase();
                if (!['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.dart'].includes(ext)) continue;
                scanned += 1;
                const content = fs.readFileSync(fullPath, 'utf-8');
                if (content.includes('NEXT_PUBLIC_') || content.includes('NextJS_Public')) {
                    matches.push(path.relative(projectPath, fullPath));
                }
            }
        }
    };

    walk(projectPath);
    return matches;
}

function replaceNextPublicInFile(filePath: string) {
    let content = fs.readFileSync(filePath, 'utf-8');
    let changed = false;

    for (const [fromKey, toKey] of Object.entries(KEY_MAP)) {
        if (content.includes(fromKey)) {
            content = content.replaceAll(fromKey, toKey);
            changed = true;
        }
    }

    if (content.includes('NextJS_Public')) {
        content = content.replaceAll('NextJS_Public', '');
        changed = true;
    }

    if (changed) {
        fs.writeFileSync(filePath, content);
    }
}

function buildSimpleDiff(beforeText: string, afterText: string, maxLines = 200): string[] {
    const beforeLines = beforeText.split(/\r?\n/);
    const afterLines = afterText.split(/\r?\n/);
    const max = Math.min(Math.max(beforeLines.length, afterLines.length), maxLines);
    const diff: string[] = [];

    for (let i = 0; i < max; i++) {
        const beforeLine = beforeLines[i] ?? '';
        const afterLine = afterLines[i] ?? '';
        if (beforeLine === afterLine) continue;
        if (beforeLine) diff.push(`- ${beforeLine}`);
        if (afterLine) diff.push(`+ ${afterLine}`);
    }

    if (Math.max(beforeLines.length, afterLines.length) > maxLines) {
        diff.push('... diff truncated ...');
    }

    return diff;
}

function ensureGitignoreEntry(projectPath: string, entry: string) {
    const gitignorePath = path.join(projectPath, '.gitignore');
    let content = '';
    if (fs.existsSync(gitignorePath)) {
        content = fs.readFileSync(gitignorePath, 'utf-8');
    }
    const hasEntry = content.split(/\r?\n/).some(line => line.trim() === entry);
    if (!hasEntry) {
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        fs.writeFileSync(gitignorePath, `${content}${separator}${entry}\n`);
    }
}

export async function runEnvMigrationPrompt(projectPath: string): Promise<void> {
    const envPath = path.join(projectPath, '.env');
    const formatCheck = validateEnvFormat(envPath);
    const nextPublicMatches = scanForNextPublic(projectPath);

    if (formatCheck.ok && nextPublicMatches.length === 0) {
        return;
    }

    console.log(chalk.yellow('\n⚠️  Environment migration required'));
    if (!formatCheck.ok) {
        console.log(chalk.gray(`Missing keys: ${formatCheck.missing.join(', ')}`));
    }
    if (nextPublicMatches.length > 0) {
        console.log(chalk.gray(`NEXT_PUBLIC references found in ${nextPublicMatches.length} files:`));
        for (const file of nextPublicMatches) {
            console.log(chalk.gray(` - ${file}`));
        }
    }
    console.log(chalk.gray('Files to be updated:'));
    console.log(chalk.gray(` - .env`));
    if (nextPublicMatches.length > 0) {
        for (const file of nextPublicMatches) {
            console.log(chalk.gray(` - ${file}`));
        }
    }

    const choice = await List('Fix now or leave as-is?', [
        { name: 'Fix now (migrate)', value: 'fix' },
        { name: 'Leave as-is', value: 'skip' }
    ]);

    if (choice !== 'fix') {
        return;
    }

    let existing: Record<string, string> = {};
    const beforeEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    if (beforeEnv) existing = parseEnv(beforeEnv);

    for (const key of NEXT_PUBLIC_KEYS) {
        if (existing[key] && !existing[KEY_MAP[key]]) {
            existing[KEY_MAP[key]] = existing[key];
        }
    }

    const merged = mergeEnvValues(existing, {});
    const envContent = buildEnvTemplate(merged);

    const diffPreview = buildSimpleDiff(beforeEnv, envContent);
    console.log(chalk.cyan('\n.env diff preview:'));
    if (diffPreview.length === 0) {
        console.log(chalk.gray('No changes detected.'));
    } else {
        for (const line of diffPreview) {
            console.log(line.startsWith('-') ? chalk.red(line) : chalk.green(line));
        }
    }

    if (fs.existsSync(envPath)) {
        const backupPath = path.join(projectPath, '.env.bak');
        fs.copyFileSync(envPath, backupPath);
        ensureGitignoreEntry(projectPath, '.env.bak');
        console.log(chalk.gray('Backup created: .env.bak (added to .gitignore)'));
    }

    fs.writeFileSync(envPath, envContent);
    console.log(chalk.green('✅ .env migrated to new format.'));

    if (nextPublicMatches.length > 0) {
        console.log(chalk.cyan('\nCode diff preview (NEXT_PUBLIC_* → FIREBASE_*):'));
        for (const rel of nextPublicMatches) {
            const fullPath = path.join(projectPath, rel);
            const before = fs.readFileSync(fullPath, 'utf-8');
            replaceNextPublicInFile(fullPath);
            const after = fs.readFileSync(fullPath, 'utf-8');
            const codeDiff = buildSimpleDiff(before, after, 120);
            if (codeDiff.length > 0) {
                console.log(chalk.gray(`\n${rel}`));
                for (const line of codeDiff) {
                    console.log(line.startsWith('-') ? chalk.red(line) : chalk.green(line));
                }
            } else {
                console.log(chalk.gray(`\n${rel} (no changes)`));
            }
        }
        console.log(chalk.green('✅ NEXT_PUBLIC references updated in code.'));
    }
}
