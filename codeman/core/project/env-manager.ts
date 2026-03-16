import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

export type FrameworkKind = 'nextjs' | 'flutter' | 'custom' | 'unknown';

export interface EnvWriteResult {
    filePath: string;
    updated: boolean;
}

function readEnvFile(filePath: string): string {
    if (!fs.existsSync(filePath)) return '';
    return fs.readFileSync(filePath, 'utf-8');
}

function writeEnvFile(filePath: string, content: string) {
    fs.writeFileSync(filePath, content.endsWith('\n') ? content : `${content}\n`);
}

export function resolveEnvFile(projectPath: string, framework: FrameworkKind): string {
    if (framework === 'nextjs') {
        return path.join(projectPath, '.env.local');
    }
    return path.join(projectPath, '.env');
}

export function resolveSharedEnvFile(projectPath: string): string {
    return path.join(projectPath, '.env');
}

export function getEnvVar(filePath: string, key: string): string | null {
    const content = readEnvFile(filePath);
    const match = content.match(new RegExp(`^${key}=(.*)$`, 'm'));
    return match && match[1] ? match[1].trim() : null;
}

export function setEnvVar(filePath: string, key: string, value: string): EnvWriteResult {
    const content = readEnvFile(filePath);
    const lineRegex = new RegExp(`^${key}=.*$`, 'm');
    const hasKey = lineRegex.test(content);
    let nextContent = content;

    if (hasKey) {
        nextContent = content.replace(lineRegex, `${key}=${value}`);
    } else {
        const separator = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
        nextContent = `${content}${separator}${key}=${value}`;
    }

    writeEnvFile(filePath, nextContent);
    return { filePath, updated: true };
}

export function tryInjectNextAppCheckSnippet(projectPath: string): { filePath: string | null; injected: boolean } {
    const candidates = [
        'src/firebase.ts',
        'src/firebase.tsx',
        'src/firebase.js',
        'src/firebase.jsx',
        'lib/firebase.ts',
        'lib/firebase.tsx',
        'lib/firebase.js',
        'lib/firebase.jsx',
        'src/lib/firebase.ts',
        'src/lib/firebase.js',
        'src/services/firebase.ts',
        'src/config/firebase.ts',
        'firebase.ts',
        'firebase.js'
    ];

    const snippet = 'self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN;';

    for (const rel of candidates) {
        const fullPath = path.join(projectPath, rel);
        if (!fs.existsSync(fullPath)) continue;

        const content = fs.readFileSync(fullPath, 'utf-8');
        if (content.includes(snippet)) {
            return { filePath: fullPath, injected: false };
        }

        if (!/initializeApp\s*\(/.test(content)) {
            continue;
        }

        const lines = content.split(/\r?\n/);
        let insertIndex = 0;
        if (lines[0]?.includes('use client') || lines[0]?.includes('"use client"') || lines[0]?.includes("'use client'")) {
            insertIndex = 1;
        }

        lines.splice(insertIndex, 0, snippet);
        fs.writeFileSync(fullPath, lines.join('\n'));
        return { filePath: fullPath, injected: true };
    }

    return { filePath: null, injected: false };
}

export async function configureVercelEnvVar(
    key: string,
    value: string,
    projectPath: string,
    environment: 'development' | 'preview' | 'production'
): Promise<boolean> {
    return new Promise((resolve) => {
        const child = spawn('vercel', ['env', 'add', key, environment], {
            cwd: projectPath,
            stdio: ['pipe', 'inherit', 'inherit'],
            shell: true
        });

        child.stdin?.write(`${value}\n`);
        child.stdin?.end();

        child.on('close', (code) => resolve(code === 0));
        child.on('error', () => resolve(false));
    });
}
