import fs from 'fs';
import path from 'path';

import { EnvTemplateValues, mergeEnvValues, parseEnv } from './env-template';

export interface FirebaseWebSdkConfig {
    apiKey: string;
    authDomain: string;
    projectId: string;
    storageBucket: string;
    messagingSenderId: string;
    appId: string;
    measurementId: string;
}

export interface FirebaseAdminSdkMetadata {
    projectId: string;
    clientEmail: string;
}

export interface FlutterFirebaseOptionsStatus {
    exists: boolean;
    aligned: boolean;
    message: string;
}

export interface FlutterNativeFirebaseGuardResult {
    ok: boolean;
    expectedProjectId: string | null;
    message: string;
}

function readText(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
}

function extractLiteralValue(content: string, key: string): string {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`${escapedKey}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
    return match?.[1]?.trim() ?? '';
}

export function parseFirebaseWebSdkSource(content: string): FirebaseWebSdkConfig {
    return {
        apiKey: extractLiteralValue(content, 'apiKey'),
        authDomain: extractLiteralValue(content, 'authDomain'),
        projectId: extractLiteralValue(content, 'projectId'),
        storageBucket: extractLiteralValue(content, 'storageBucket'),
        messagingSenderId: extractLiteralValue(content, 'messagingSenderId'),
        appId: extractLiteralValue(content, 'appId'),
        measurementId: extractLiteralValue(content, 'measurementId')
    };
}

export function readFirebaseWebSdkFile(filePath: string): FirebaseWebSdkConfig {
    return parseFirebaseWebSdkSource(readText(filePath));
}

export function readAdminSdkMetadata(filePath: string): FirebaseAdminSdkMetadata {
    const json = JSON.parse(readText(filePath));
    return {
        projectId: typeof json.project_id === 'string' ? json.project_id : '',
        clientEmail: typeof json.client_email === 'string' ? json.client_email : ''
    };
}

export function buildEnvValuesFromCredentialFiles(options: {
    adminSdkPath: string;
    clientSdkPath: string;
    existingEnvContent?: string;
    geminiKey?: string;
}): EnvTemplateValues {
    const admin = readAdminSdkMetadata(options.adminSdkPath);
    const client = readFirebaseWebSdkFile(options.clientSdkPath);
    const existing = parseEnv(options.existingEnvContent ?? '');

    return mergeEnvValues(existing, {
        OWNER_EMAIL: existing.OWNER_EMAIL ?? '',
        GOOGLE_APPLICATION_CREDENTIALS: 'admin-sdk.json',
        FIREBASE_API_KEY: client.apiKey,
        FIREBASE_AUTH_DOMAIN: client.authDomain,
        FIREBASE_PROJECT_ID: client.projectId || admin.projectId,
        FIREBASE_STORAGE_BUCKET: client.storageBucket,
        FIREBASE_MESSAGING_SENDER_ID: client.messagingSenderId,
        FIREBASE_APP_ID: client.appId,
        FIREBASE_MEASUREMENT_ID: client.measurementId,
        GEMINI_API_KEY: typeof options.geminiKey === 'string'
            ? options.geminiKey
            : (existing.GEMINI_API_KEY ?? '')
    });
}

export function ensureRootCredentialGitignore(projectPath: string): void {
    const gitignorePath = path.join(projectPath, '.gitignore');
    const requiredEntries = [
        'admin-sdk.json',
        'firebase-sdk.js'
    ];

    const existing = fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, 'utf-8')
        : '';

    const missing = requiredEntries.filter((entry) => !existing.includes(entry));
    if (missing.length === 0) {
        return;
    }

    const block = [
        '',
        '# Local Firebase credential files (codeman)',
        ...missing
    ].join('\n');

    fs.writeFileSync(gitignorePath, `${existing.trimEnd()}\n${block}\n`);
}

export function inspectFlutterFirebaseOptions(
    projectPath: string,
    expectedProjectId: string
): FlutterFirebaseOptionsStatus {
    const filePath = path.join(projectPath, 'lib', 'firebase_options.dart');
    if (!fs.existsSync(filePath)) {
        return {
            exists: false,
            aligned: false,
            message: 'lib/firebase_options.dart is missing. Run FlutterFire configure for native/mobile targets.'
        };
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const aligned = content.includes(`projectId: '${expectedProjectId}'`);

    return {
        exists: true,
        aligned,
        message: aligned
            ? 'lib/firebase_options.dart already targets the same Firebase project.'
            : `lib/firebase_options.dart does not appear to target ${expectedProjectId}. Run: flutterfire configure --project ${expectedProjectId}`
    };
}

export function loadExpectedFirebaseProjectId(projectPath: string): string | null {
    const envPath = path.join(projectPath, '.env');
    if (!fs.existsSync(envPath)) {
        return null;
    }

    const parsed = parseEnv(fs.readFileSync(envPath, 'utf-8'));
    const projectId = parsed.FIREBASE_PROJECT_ID?.trim();
    return projectId ? projectId : null;
}

export function guardFlutterNativeFirebaseConfig(projectPath: string): FlutterNativeFirebaseGuardResult {
    const expectedProjectId = loadExpectedFirebaseProjectId(projectPath);
    if (!expectedProjectId) {
        return {
            ok: false,
            expectedProjectId: null,
            message: 'Missing FIREBASE_PROJECT_ID in .env. Run the Firebase setup wizard before native Flutter builds.'
        };
    }

    const status = inspectFlutterFirebaseOptions(projectPath, expectedProjectId);
    if (!status.aligned) {
        return {
            ok: false,
            expectedProjectId,
            message: status.message
        };
    }

    return {
        ok: true,
        expectedProjectId,
        message: status.message
    };
}
