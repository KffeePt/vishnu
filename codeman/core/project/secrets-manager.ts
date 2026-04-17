import fs from 'fs';
import path from 'path';
import chalk from 'chalk';

import { List } from '../../components/list';
import { io } from '../io';

export interface SecretReviewEntry {
    label: string;
    description: string;
    filePath: string;
    category: 'env' | 'secret';
}

function detectFramework(projectPath: string): 'flutter' | 'nextjs' | 'custom' {
    if (fs.existsSync(path.join(projectPath, 'pubspec.yaml'))) {
        return 'flutter';
    }

    if (
        fs.existsSync(path.join(projectPath, 'next.config.js')) ||
        fs.existsSync(path.join(projectPath, 'next.config.mjs')) ||
        fs.existsSync(path.join(projectPath, 'next.config.ts'))
    ) {
        return 'nextjs';
    }

    return 'custom';
}

function pushIfExists(entries: SecretReviewEntry[], filePath: string, label: string, description: string, category: 'env' | 'secret') {
    if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
        return;
    }

    entries.push({ label, description, filePath, category });
}

function collectProjectSecretEntries(projectPath: string): SecretReviewEntry[] {
    const framework = detectFramework(projectPath);
    const entries: SecretReviewEntry[] = [];
    const secretsDir = path.join(projectPath, '.secrets');

    pushIfExists(entries, path.join(projectPath, '.env'), '.env', 'Active project environment values', 'env');
    pushIfExists(entries, path.join(projectPath, '.env.example'), '.env.example', 'Template environment file', 'env');

    if (framework === 'nextjs') {
        pushIfExists(entries, path.join(projectPath, '.env.local'), '.env.local', 'Next.js local runtime environment', 'env');
    }

    if (fs.existsSync(secretsDir)) {
        const preferredOrder = [
            'admin-sdk.json',
            'firebase-sdk.js',
            'firebase-sdk.json',
            'client-secret-oauth.json',
            'stripe.json'
        ];

        const seen = new Set<string>();
        for (const fileName of preferredOrder) {
            const fullPath = path.join(secretsDir, fileName);
            if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) continue;
            seen.add(fullPath.toLowerCase());
            entries.push({
                label: formatSecretLabel(fileName),
                description: describeSecretFile(fileName, framework),
                filePath: fullPath,
                category: 'secret'
            });
        }

        const extraFiles = fs.readdirSync(secretsDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && entry.name !== '.gitignore' && entry.name !== 'README.md')
            .map((entry) => path.join(secretsDir, entry.name))
            .filter((fullPath) => !seen.has(fullPath.toLowerCase()))
            .sort((a, b) => a.localeCompare(b));

        for (const extraPath of extraFiles) {
            const fileName = path.basename(extraPath);
            entries.push({
                label: formatSecretLabel(fileName),
                description: describeSecretFile(fileName, framework),
                filePath: extraPath,
                category: 'secret'
            });
        }
    }

    return entries;
}

function formatSecretLabel(fileName: string): string {
    if (fileName === 'firebase-sdk.json') {
        return '.secrets/firebase-sdk.json (generated from firebase-sdk.js)';
    }

    return `.secrets/${fileName}`;
}

function describeSecretFile(fileName: string, framework: 'flutter' | 'nextjs' | 'custom'): string {
    switch (fileName) {
        case 'admin-sdk.json':
            return 'Firebase Admin SDK service account';
        case 'firebase-sdk.js':
            return 'Literal Firebase web snippet copied from Firebase Console';
        case 'firebase-sdk.json':
            return framework === 'nextjs'
                ? 'Generated readable Firebase web config for Next.js, derived from firebase-sdk.js'
                : 'Generated readable Firebase web config for Flutter/web, derived from firebase-sdk.js';
        case 'client-secret-oauth.json':
            return 'Google OAuth client export used for Google Sign-In';
        case 'stripe.json':
            return 'Local Stripe onboarding / account bootstrap payload';
        default:
            return 'Local project secret or migration file';
    }
}

function formatFilePreview(entry: SecretReviewEntry): string {
    const raw = fs.readFileSync(entry.filePath, 'utf-8');
    const normalized = raw.replace(/\t/g, '  ');
    const lines = normalized.split(/\r?\n/);
    const maxLines = 200;
    const truncated = lines.length > maxLines;
    const visibleLines = truncated ? lines.slice(0, maxLines) : lines;

    return [
        chalk.bold.cyan('🔐 Secret Review'),
        chalk.gray('------------------------------------------------------------'),
        `${chalk.bold('File:')} ${entry.label}`,
        `${chalk.bold('Path:')} ${entry.filePath}`,
        `${chalk.bold('Type:')} ${entry.category === 'env' ? 'Environment file' : 'Secret source file'}`,
        `${chalk.bold('Notes:')} ${entry.description}`,
        chalk.gray('------------------------------------------------------------'),
        ...visibleLines,
        ...(truncated ? [chalk.yellow('\n... output truncated after 200 lines ...')] : []),
        '',
        chalk.gray('Press Enter, q, or Esc to return to the secrets list.')
    ].join('\n');
}

async function runFilePreview(entry: SecretReviewEntry): Promise<void> {
    return new Promise((resolve) => {
        let closed = false;
        let previousLines = 0;

        const close = () => {
            if (closed) return;
            closed = true;
            io.release(handler);
            if (previousLines > 0) {
                process.stdout.write(`\x1b[${previousLines}A`);
                process.stdout.write('\x1b[J');
            }
            process.stdout.write('\x1b[?25h');
            process.stdout.write('\x1b[0m');
            resolve();
        };

        const render = () => {
            const frame = formatFilePreview(entry);
            const lineCount = frame.split('\n').length;
            if (previousLines > 0) {
                process.stdout.write(`\x1b[${previousLines}A`);
            } else {
                process.stdout.write('\x1b[?25l');
            }
            process.stdout.write(frame);
            if (previousLines > lineCount) {
                process.stdout.write('\x1b[J');
            }
            previousLines = lineCount;
        };

        const handler = (_key: Buffer, str: string) => {
            if (str === '\r' || str === '\n' || str === 'q' || str === '\u001B' || str === '\u0003') {
                close();
            }
        };

        io.consume(handler);
        render();
    });
}

export async function runSecretsManager(projectPath: string): Promise<void> {
    while (true) {
        const entries = collectProjectSecretEntries(projectPath);

        if (entries.length === 0) {
            console.log(chalk.yellow('\nNo secret or env files were found for this project yet.'));
            console.log(chalk.gray('Expected sources include .env, .env.example, .env.local, and files inside .secrets/.'));
            const inquirer = (await import('inquirer')).default;
            await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
            return;
        }

        const framework = detectFramework(projectPath);
        const choice = await List(
            `🔐 Manage Secrets\n${chalk.gray(`Project: ${path.basename(projectPath)} • Mode: ${framework}`)}\n${chalk.gray('Select a file to review its contents.')}`,
            [
                ...entries.map((entry) => ({
                    name: `${entry.label}${chalk.gray(` - ${entry.description}`)}`,
                    value: entry.filePath
                })),
                { type: 'separator' as const, line: '──────────────' },
                { name: '⬅️  Back', value: '__BACK__' }
            ],
            { pageSize: 14 }
        );

        if (choice === '__BACK__') {
            return;
        }

        const selected = entries.find((entry) => entry.filePath === choice);
        if (!selected) {
            return;
        }

        await runFilePreview(selected);
    }
}
