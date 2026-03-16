import fs from 'fs';
import path from 'path';
import { detectAppCheck, AppCheckDetection } from '../security/appcheck-detector';

export interface FrameworkIntel {
    kind: 'nextjs' | 'flutter' | 'custom' | 'unknown';
    signals: string[];
    details?: Record<string, string | boolean | number>;
}

export interface FirebaseIntel {
    detected: boolean;
    projectId?: string;
    signals: string[];
    appCheck: AppCheckDetection;
}

export interface VercelIntel {
    detected: boolean;
    signals: string[];
}

export interface DatabaseIntel {
    kinds: string[];
    artifacts: string[];
}

export interface ProjectIntelligence {
    framework: FrameworkIntel;
    firebase: FirebaseIntel;
    vercel: VercelIntel;
    database: DatabaseIntel;
}

function readJson(filePath: string): any | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    } catch {
        return null;
    }
}

function readText(filePath: string): string | null {
    try {
        if (!fs.existsSync(filePath)) return null;
        return fs.readFileSync(filePath, 'utf-8');
    } catch {
        return null;
    }
}

function detectFramework(projectPath: string): FrameworkIntel {
    const signals: string[] = [];
    const packageJson = readJson(path.join(projectPath, 'package.json'));
    const pubspec = readText(path.join(projectPath, 'pubspec.yaml'));

    const hasNextConfig = fs.existsSync(path.join(projectPath, 'next.config.js')) ||
        fs.existsSync(path.join(projectPath, 'next.config.mjs')) ||
        fs.existsSync(path.join(projectPath, 'next.config.ts'));
    const hasNextDeps = !!packageJson?.dependencies?.next || !!packageJson?.devDependencies?.next;
    const hasNextAppDir = fs.existsSync(path.join(projectPath, 'app'));
    const hasNextPagesDir = fs.existsSync(path.join(projectPath, 'pages'));

    if (hasNextConfig || hasNextDeps || hasNextAppDir || hasNextPagesDir) {
        if (hasNextConfig) signals.push('next.config');
        if (hasNextDeps) signals.push('package.json:next');
        if (hasNextAppDir) signals.push('app/');
        if (hasNextPagesDir) signals.push('pages/');
        return {
            kind: 'nextjs',
            signals,
            details: {
                router: hasNextAppDir ? 'app' : (hasNextPagesDir ? 'pages' : 'unknown')
            }
        };
    }

    if (pubspec) {
        signals.push('pubspec.yaml');
        const hasFlutterSdk = /sdk:\s*flutter/i.test(pubspec) || /flutter:\s*$/im.test(pubspec);
        if (hasFlutterSdk) {
            return {
                kind: 'flutter',
                signals,
                details: {
                    android: fs.existsSync(path.join(projectPath, 'android')),
                    ios: fs.existsSync(path.join(projectPath, 'ios')),
                    web: fs.existsSync(path.join(projectPath, 'web'))
                }
            };
        }
    }

    return { kind: 'custom', signals };
}

function detectFirebase(projectPath: string): FirebaseIntel {
    const signals: string[] = [];
    const firebaseJson = path.join(projectPath, 'firebase.json');
    const firebaserc = path.join(projectPath, '.firebaserc');
    const env = readText(path.join(projectPath, '.env'));
    const packageJson = readJson(path.join(projectPath, 'package.json'));
    const pubspec = readText(path.join(projectPath, 'pubspec.yaml'));

    if (fs.existsSync(firebaseJson)) signals.push('firebase.json');
    if (fs.existsSync(firebaserc)) signals.push('.firebaserc');
    if (env && /FIREBASE_PROJECT_ID\s*=/m.test(env)) signals.push('.env:FIREBASE_PROJECT_ID');
    if (packageJson?.dependencies?.firebase || packageJson?.devDependencies?.firebase) signals.push('package.json:firebase');
    if (pubspec && /firebase_/i.test(pubspec)) signals.push('pubspec.yaml:firebase_*');

    let projectId: string | undefined;
    if (env) {
        const match = env.match(/^(?:NEXT_PUBLIC_)?FIREBASE_PROJECT_ID=(.+)$/m);
        if (match && match[1]) projectId = match[1].trim();
    }

    const appCheck = detectAppCheck(projectPath);

    return {
        detected: signals.length > 0,
        projectId,
        signals,
        appCheck
    };
}

function detectVercel(projectPath: string): VercelIntel {
    const signals: string[] = [];
    const vercelJson = path.join(projectPath, 'vercel.json');
    const vercelDir = path.join(projectPath, '.vercel');
    const packageJson = readJson(path.join(projectPath, 'package.json'));

    if (fs.existsSync(vercelJson)) signals.push('vercel.json');
    if (fs.existsSync(vercelDir)) signals.push('.vercel/');
    if (packageJson?.devDependencies?.vercel || packageJson?.dependencies?.vercel) signals.push('package.json:vercel');
    if (packageJson?.dependencies?.next || packageJson?.devDependencies?.next) signals.push('package.json:next');

    return {
        detected: signals.length > 0,
        signals
    };
}

function detectDatabase(projectPath: string): DatabaseIntel {
    const kinds: string[] = [];
    const artifacts: string[] = [];

    const prismaSchema = path.join(projectPath, 'prisma', 'schema.prisma');
    if (fs.existsSync(prismaSchema)) {
        kinds.push('prisma');
        artifacts.push('prisma/schema.prisma');
    }

    const drizzleConfig = ['drizzle.config.ts', 'drizzle.config.js', 'drizzle.config.mjs']
        .find(file => fs.existsSync(path.join(projectPath, file)));
    if (drizzleConfig) {
        kinds.push('drizzle');
        artifacts.push(drizzleConfig);
    }

    const supabaseConfig = path.join(projectPath, 'supabase', 'config.toml');
    if (fs.existsSync(supabaseConfig)) {
        kinds.push('supabase');
        artifacts.push('supabase/config.toml');
    }

    const migrationsDir = path.join(projectPath, 'migrations');
    if (fs.existsSync(migrationsDir)) {
        kinds.push('sql');
        artifacts.push('migrations/');
    }

    const schemaSql = ['schema.sql', 'database.sql'].find(file => fs.existsSync(path.join(projectPath, file)));
    if (schemaSql) {
        kinds.push('sql');
        artifacts.push(schemaSql);
    }

    const pubspec = readText(path.join(projectPath, 'pubspec.yaml'));
    if (pubspec && /drift|moor|floor/i.test(pubspec)) {
        kinds.push('flutter-db');
        artifacts.push('pubspec.yaml');
    }

    return {
        kinds: Array.from(new Set(kinds)),
        artifacts: Array.from(new Set(artifacts))
    };
}

export function buildProjectIntelligence(projectPath: string): ProjectIntelligence {
    const framework = detectFramework(projectPath);
    const firebase = detectFirebase(projectPath);
    const vercel = detectVercel(projectPath);
    const database = detectDatabase(projectPath);

    return {
        framework,
        firebase,
        vercel,
        database
    };
}
