import fs from 'fs';
import path from 'path';

import {
    buildEnvTemplate,
    collectPreservedEnvLines,
    EnvTemplateValues,
    FrameworkEnvMode,
    mergeEnvValues,
    parseEnv
} from './env-template';

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

export interface GoogleOAuthClientMetadata {
    projectId: string;
    clientId: string;
    clientSecret: string;
    type: 'web' | 'installed' | 'unknown';
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

export interface NormalizedCredentialFiles {
    adminSdkPath: string | null;
    clientSdkPath: string | null;
    clientSdkJsonPath: string | null;
    oauthClientPath: string | null;
    movedFiles: string[];
    warnings: string[];
    missingFiles: string[];
}

export interface ProjectCredentialSyncResult {
    framework: FrameworkEnvMode;
    performed: boolean;
    ready: boolean;
    envPath: string;
    envExamplePath: string;
    nextLocalEnvPath: string | null;
    movedFiles: string[];
    warnings: string[];
    missingFiles: string[];
    projectId: string;
}

export interface CredentialInspectionResult {
    adminSdkPath: string | null;
    clientSdkPath: string | null;
    clientSdkJsonPath: string | null;
    oauthClientPath: string | null;
    missingFiles: string[];
    suggestedMoves: string[];
}

export interface ResolvedFirebaseBackendConfig {
    projectId: string;
    apiKey: string;
    authDomain: string;
    databaseURL: string;
    serviceAccountPath: string;
    clientSdkPath: string;
    secretsDir: string;
}

export interface VishnuBackendCredentialBundleStatus {
    ready: boolean;
    secretsDir: string;
    adminSdkPath: string | null;
    clientSdkPath: string | null;
    clientSdkJsonPath: string | null;
    movedFiles: string[];
    warnings: string[];
    missingFiles: string[];
    backendConfig: ResolvedFirebaseBackendConfig | null;
}

const SECRETS_DIRNAME = '.secrets';
const LEGACY_SCRIPTS_SECRETS_DIRNAME = 'scripts/.secrets';
const CANONICAL_ADMIN_SDK = 'admin-sdk.json';
const CANONICAL_FIREBASE_SDK_JS = 'firebase-sdk.js';
const CANONICAL_FIREBASE_SDK_JSON = 'firebase-sdk.json';
const CANONICAL_OAUTH_JSON = 'client-secret-oauth.json';
const SUPPORTED_SECRET_FILENAMES = [
    CANONICAL_ADMIN_SDK,
    CANONICAL_FIREBASE_SDK_JS,
    CANONICAL_FIREBASE_SDK_JSON,
    CANONICAL_OAUTH_JSON,
    'client_secret_oauth.json',
    'client_secret.json',
    'stripe.json',
    'app-check.json'
];

function readText(filePath: string): string {
    return fs.readFileSync(filePath, 'utf-8');
}

function loadProjectEnvValues(projectPath: string): Record<string, string> {
    const envFiles = [
        path.join(projectPath, '.env'),
        path.join(projectPath, '.env.local')
    ];

    const merged: Record<string, string> = {};
    for (const envFile of envFiles) {
        if (!fs.existsSync(envFile)) {
            continue;
        }

        Object.assign(merged, parseEnv(fs.readFileSync(envFile, 'utf-8')));
    }

    return merged;
}

function extractLiteralValue(content: string, key: string): string {
    const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = content.match(new RegExp(`${escapedKey}\\s*:\\s*["'\`]([^"'\`]+)["'\`]`));
    return match?.[1]?.trim() ?? '';
}

function asString(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function listSupportedSecretsDirs(projectPath: string): string[] {
    return [
        path.join(projectPath, SECRETS_DIRNAME),
        path.join(projectPath, 'scripts', SECRETS_DIRNAME)
    ];
}

function scoreSecretsDirectory(secretsDir: string): number {
    if (!fs.existsSync(secretsDir) || !fs.statSync(secretsDir).isDirectory()) {
        return -1;
    }

    return SUPPORTED_SECRET_FILENAMES.reduce((score, fileName) => {
        return score + (fs.existsSync(path.join(secretsDir, fileName)) ? 1 : 0);
    }, 0);
}

export function resolveSupportedSecretsDir(projectPath: string): string {
    const candidates = listSupportedSecretsDirs(projectPath)
        .map((dirPath) => ({ dirPath, score: scoreSecretsDirectory(dirPath) }))
        .sort((left, right) => right.score - left.score);

    if (candidates.length > 0 && candidates[0].score >= 0) {
        return candidates[0].dirPath;
    }

    return path.join(projectPath, SECRETS_DIRNAME);
}

export function getSecretsRelativeDir(projectPath: string, secretsDir: string): string {
    const relative = path.relative(projectPath, secretsDir).replace(/\\/g, '/');
    return relative || SECRETS_DIRNAME;
}

function isWithinSupportedSecretsDir(projectPath: string, filePath: string): boolean {
    const normalizedTarget = path.resolve(filePath).toLowerCase();
    return listSupportedSecretsDirs(projectPath)
        .map((dirPath) => path.resolve(dirPath).toLowerCase())
        .some((dirPath) => normalizedTarget.startsWith(dirPath));
}

function ensureSecretsDirectory(projectPath: string, preferredSecretsDir?: string): string {
    const secretsDir = preferredSecretsDir || resolveSupportedSecretsDir(projectPath);
    fs.mkdirSync(secretsDir, { recursive: true });
    return secretsDir;
}

function ensureSecretsSupportFiles(projectPath: string, preferredSecretsDir?: string): void {
    const secretsDir = ensureSecretsDirectory(projectPath, preferredSecretsDir);
    const relativeSecretsDir = getSecretsRelativeDir(projectPath, secretsDir);
    const gitignorePath = path.join(secretsDir, '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
        fs.writeFileSync(gitignorePath, '*\n!.gitignore\n!README.md\n');
    }

    const readmePath = path.join(secretsDir, 'README.md');
    if (!fs.existsSync(readmePath)) {
        fs.writeFileSync(
            readmePath,
            [
                '# Local credential files',
                '',
                'Place local-only Firebase and OAuth files in this folder.',
                '',
                '- admin-sdk.json',
                '- firebase-sdk.js (literal Firebase web snippet source)',
                '- firebase-sdk.json (generated readable form of firebase-sdk.js)',
                '- client-secret-oauth.json',
                '- stripe.json',
                '- app-check.json',
                '',
                `This project currently supports both ${SECRETS_DIRNAME} and ${LEGACY_SCRIPTS_SECRETS_DIRNAME}.`,
                `Active secrets folder: ${relativeSecretsDir}`
            ].join('\n') + '\n'
        );
    }
}

function writeGeneratedFirebaseSdkJson(targetPath: string, sourcePath: string, config: FirebaseWebSdkConfig): void {
    const payload = {
        generatedFrom: path.basename(sourcePath),
        firebaseConfig: {
            apiKey: config.apiKey,
            authDomain: config.authDomain,
            projectId: config.projectId,
            storageBucket: config.storageBucket,
            messagingSenderId: config.messagingSenderId,
            appId: config.appId,
            measurementId: config.measurementId
        }
    };

    fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
}

function resolveRelativePath(projectPath: string, filePath: string | null, fallback: string): string {
    if (!filePath) return fallback;
    const relative = path.relative(projectPath, filePath).replace(/\\/g, '/');
    return relative || fallback;
}

function pickExistingPath(candidates: string[]): string | null {
    for (const candidate of candidates) {
        if (!candidate) continue;
        if (fs.existsSync(candidate) && fs.statSync(candidate).size > 0) {
            return candidate;
        }
    }
    return null;
}

function moveIntoSecrets(
    projectPath: string,
    sourcePath: string | null,
    canonicalFilename: string,
    movedFiles: string[],
    warnings: string[]
): string | null {
    if (!sourcePath) return null;

    const destinationDir = resolveSupportedSecretsDir(projectPath);
    const destinationPath = path.join(ensureSecretsDirectory(projectPath, destinationDir), canonicalFilename);
    const relativeSecretsDir = getSecretsRelativeDir(projectPath, destinationDir);
    if (path.resolve(sourcePath) === path.resolve(destinationPath)) {
        return destinationPath;
    }

    if (fs.existsSync(destinationPath)) {
        warnings.push(
            `Both ${path.basename(sourcePath)} and ${path.join(relativeSecretsDir, canonicalFilename)} exist. Keeping the supported secrets-folder version.`
        );
        return destinationPath;
    }

    fs.renameSync(sourcePath, destinationPath);
    movedFiles.push(`${path.relative(projectPath, sourcePath).replace(/\\/g, '/')} -> ${path.join(relativeSecretsDir, canonicalFilename).replace(/\\/g, '/')}`);
    return destinationPath;
}

function discoverOAuthCandidates(projectPath: string, secretsDir: string): string[] {
    const extraSecretsDirs = listSupportedSecretsDirs(projectPath).filter((dirPath) => path.resolve(dirPath) !== path.resolve(secretsDir));
    const roots = [
        path.join(secretsDir, CANONICAL_OAUTH_JSON),
        path.join(secretsDir, 'client_secret_oauth.json'),
        path.join(secretsDir, 'client_secret.json'),
        ...fs.readdirSync(secretsDir, { withFileTypes: true })
            .filter((entry) => entry.isFile() && /^client[-_]?secret.*\.json$/i.test(entry.name))
            .map((entry) => path.join(secretsDir, entry.name)),
        ...extraSecretsDirs.flatMap((dirPath) => [
            path.join(dirPath, CANONICAL_OAUTH_JSON),
            path.join(dirPath, 'client_secret_oauth.json'),
            path.join(dirPath, 'client_secret.json')
        ]),
        path.join(projectPath, CANONICAL_OAUTH_JSON),
        path.join(projectPath, 'client_secret_oauth.json'),
        path.join(projectPath, 'client_secret.json'),
        ...fs.readdirSync(projectPath, { withFileTypes: true })
            .filter((entry) => entry.isFile() && /^client[-_]?secret.*\.json$/i.test(entry.name))
            .map((entry) => path.join(projectPath, entry.name))
    ];

    return Array.from(new Set(roots));
}

export function detectFramework(projectPath: string): FrameworkEnvMode {
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

export function parseFirebaseWebSdkSource(content: string): FirebaseWebSdkConfig {
    const trimmed = content.trim();

    if (trimmed.startsWith('{')) {
        try {
            const json = JSON.parse(trimmed);
            const source = isObject(json.firebaseConfig)
                ? json.firebaseConfig
                : (isObject(json) ? json : {});

            return {
                apiKey: asString(source.apiKey),
                authDomain: asString(source.authDomain),
                projectId: asString(source.projectId),
                storageBucket: asString(source.storageBucket),
                messagingSenderId: asString(source.messagingSenderId),
                appId: asString(source.appId),
                measurementId: asString(source.measurementId)
            };
        } catch {
            // Fall back to literal extraction below.
        }
    }

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

export function parseGoogleOAuthClientSource(content: string): GoogleOAuthClientMetadata {
    const json = JSON.parse(content);
    const payload = isObject(json.web)
        ? json.web
        : (isObject(json.installed) ? json.installed : (isObject(json) ? json : {}));

    const type: GoogleOAuthClientMetadata['type'] = isObject(json.web)
        ? 'web'
        : (isObject(json.installed) ? 'installed' : 'unknown');

    return {
        projectId: asString(payload.project_id),
        clientId: asString(payload.client_id),
        clientSecret: asString(payload.client_secret),
        type
    };
}

export function readGoogleOAuthClientFile(filePath: string): GoogleOAuthClientMetadata {
    return parseGoogleOAuthClientSource(readText(filePath));
}

export function normalizeCredentialFiles(projectPath: string): NormalizedCredentialFiles {
    const secretsDir = resolveSupportedSecretsDir(projectPath);
    ensureSecretsSupportFiles(projectPath, secretsDir);
    const relativeSecretsDir = getSecretsRelativeDir(projectPath, secretsDir);
    const movedFiles: string[] = [];
    const warnings: string[] = [];
    const additionalSecretsDirs = listSupportedSecretsDirs(projectPath).filter((dirPath) => path.resolve(dirPath) !== path.resolve(secretsDir));

    const adminSource = pickExistingPath([
        path.join(secretsDir, CANONICAL_ADMIN_SDK),
        ...additionalSecretsDirs.map((dirPath) => path.join(dirPath, CANONICAL_ADMIN_SDK)),
        path.join(projectPath, CANONICAL_ADMIN_SDK)
    ]);

    const firebaseSource = pickExistingPath([
        path.join(secretsDir, CANONICAL_FIREBASE_SDK_JS),
        path.join(secretsDir, CANONICAL_FIREBASE_SDK_JSON),
        ...additionalSecretsDirs.flatMap((dirPath) => [
            path.join(dirPath, CANONICAL_FIREBASE_SDK_JS),
            path.join(dirPath, CANONICAL_FIREBASE_SDK_JSON)
        ]),
        path.join(projectPath, CANONICAL_FIREBASE_SDK_JS),
        path.join(projectPath, CANONICAL_FIREBASE_SDK_JSON),
        path.join(projectPath, 'firestore-sdk.js')
    ]);

    const oauthSource = pickExistingPath(discoverOAuthCandidates(projectPath, secretsDir));

    const adminSdkPath = moveIntoSecrets(projectPath, adminSource, CANONICAL_ADMIN_SDK, movedFiles, warnings);
    const normalizedClientSourcePath = firebaseSource?.endsWith('.json')
        ? moveIntoSecrets(projectPath, firebaseSource, CANONICAL_FIREBASE_SDK_JSON, movedFiles, warnings)
        : moveIntoSecrets(projectPath, firebaseSource, CANONICAL_FIREBASE_SDK_JS, movedFiles, warnings);
    const oauthClientPath = moveIntoSecrets(projectPath, oauthSource, CANONICAL_OAUTH_JSON, movedFiles, warnings);
    const clientSdkPath = pickExistingPath([
        path.join(secretsDir, CANONICAL_FIREBASE_SDK_JS),
        ...(normalizedClientSourcePath ? [normalizedClientSourcePath] : [])
    ]);
    const clientSdkJsonPath = pickExistingPath([
        path.join(secretsDir, CANONICAL_FIREBASE_SDK_JSON)
    ]);

    if (clientSdkPath) {
        const generatedJsonPath = path.join(secretsDir, CANONICAL_FIREBASE_SDK_JSON);
        const parsedClient = readFirebaseWebSdkFile(clientSdkPath);
        const shouldWriteJson =
            !fs.existsSync(generatedJsonPath) ||
            fs.readFileSync(generatedJsonPath, 'utf-8').trim().length === 0;

        if (shouldWriteJson || path.resolve(clientSdkPath).toLowerCase().endsWith('.js')) {
            writeGeneratedFirebaseSdkJson(generatedJsonPath, clientSdkPath, parsedClient);
            if (!clientSdkJsonPath) {
                movedFiles.push(
                    `${path.join(relativeSecretsDir, CANONICAL_FIREBASE_SDK_JS).replace(/\\/g, '/')} -> ${path.join(relativeSecretsDir, CANONICAL_FIREBASE_SDK_JSON).replace(/\\/g, '/')} (generated readable JSON)`
                );
            }
        }
    }

    const resolvedClientSdkJsonPath = pickExistingPath([
                path.join(secretsDir, CANONICAL_FIREBASE_SDK_JSON)
    ]);

    const missingFiles: string[] = [];
    if (!adminSdkPath) missingFiles.push(path.join(relativeSecretsDir, CANONICAL_ADMIN_SDK).replace(/\\/g, '/'));
    if (!clientSdkPath) missingFiles.push(`${relativeSecretsDir}/${CANONICAL_FIREBASE_SDK_JS}`);
    if (!oauthClientPath) missingFiles.push(path.join(relativeSecretsDir, CANONICAL_OAUTH_JSON).replace(/\\/g, '/'));

    return {
        adminSdkPath,
        clientSdkPath,
        clientSdkJsonPath: resolvedClientSdkJsonPath,
        oauthClientPath,
        movedFiles,
        warnings,
        missingFiles
    };
}

export function inspectCredentialFiles(projectPath: string): CredentialInspectionResult {
    const secretsDir = resolveSupportedSecretsDir(projectPath);
    const relativeSecretsDir = getSecretsRelativeDir(projectPath, secretsDir);
    const additionalSecretsDirs = listSupportedSecretsDirs(projectPath).filter((dirPath) => path.resolve(dirPath) !== path.resolve(secretsDir));
    const adminSdkPath = pickExistingPath([
        path.join(secretsDir, CANONICAL_ADMIN_SDK),
        ...additionalSecretsDirs.map((dirPath) => path.join(dirPath, CANONICAL_ADMIN_SDK)),
        path.join(projectPath, CANONICAL_ADMIN_SDK)
    ]);
    const clientSdkPath = pickExistingPath([
        path.join(secretsDir, CANONICAL_FIREBASE_SDK_JS),
        path.join(secretsDir, CANONICAL_FIREBASE_SDK_JSON),
        ...additionalSecretsDirs.flatMap((dirPath) => [
            path.join(dirPath, CANONICAL_FIREBASE_SDK_JS),
            path.join(dirPath, CANONICAL_FIREBASE_SDK_JSON)
        ]),
        path.join(projectPath, CANONICAL_FIREBASE_SDK_JS),
        path.join(projectPath, CANONICAL_FIREBASE_SDK_JSON),
        path.join(projectPath, 'firestore-sdk.js')
    ]);
    const oauthClientPath = pickExistingPath(
        fs.existsSync(secretsDir)
            ? discoverOAuthCandidates(projectPath, secretsDir)
            : [
                path.join(projectPath, CANONICAL_OAUTH_JSON),
                path.join(projectPath, 'client_secret_oauth.json'),
                path.join(projectPath, 'client_secret.json')
            ]
    );
    const clientSdkJsonPath = pickExistingPath([
        path.join(secretsDir, CANONICAL_FIREBASE_SDK_JSON),
        ...additionalSecretsDirs.map((dirPath) => path.join(dirPath, CANONICAL_FIREBASE_SDK_JSON)),
        path.join(projectPath, CANONICAL_FIREBASE_SDK_JSON)
    ]);

    const missingFiles: string[] = [];
    if (!adminSdkPath) missingFiles.push(`${relativeSecretsDir}/${CANONICAL_ADMIN_SDK}`);
    if (!clientSdkPath) missingFiles.push(`${relativeSecretsDir}/${CANONICAL_FIREBASE_SDK_JS}`);
    if (!oauthClientPath) missingFiles.push(`${relativeSecretsDir}/${CANONICAL_OAUTH_JSON}`);

    const suggestedMoves: string[] = [];
    const pushMove = (foundPath: string | null, canonicalName: string) => {
        if (!foundPath) return;
        if (!isWithinSupportedSecretsDir(projectPath, foundPath)) {
            suggestedMoves.push(`${path.relative(projectPath, foundPath).replace(/\\/g, '/')} -> ${relativeSecretsDir}/${canonicalName}`);
        }
    };

    pushMove(adminSdkPath, CANONICAL_ADMIN_SDK);
    if (clientSdkPath) {
        pushMove(clientSdkPath, clientSdkPath.endsWith('.json') ? CANONICAL_FIREBASE_SDK_JSON : CANONICAL_FIREBASE_SDK_JS);
    }
    pushMove(oauthClientPath, CANONICAL_OAUTH_JSON);

    return {
        adminSdkPath,
        clientSdkPath,
        clientSdkJsonPath,
        oauthClientPath,
        missingFiles,
        suggestedMoves
    };
}

export function buildEnvValuesFromCredentialFiles(options: {
    projectPath: string;
    adminSdkPath: string;
    clientSdkPath: string;
    oauthClientPath?: string | null;
    existingEnvContent?: string;
    geminiKey?: string;
    framework?: FrameworkEnvMode;
}): EnvTemplateValues {
    const admin = readAdminSdkMetadata(options.adminSdkPath);
    const client = readFirebaseWebSdkFile(options.clientSdkPath);
    const oauth = options.oauthClientPath ? readGoogleOAuthClientFile(options.oauthClientPath) : null;
    const existing = parseEnv(options.existingEnvContent ?? '');
    const base = mergeEnvValues(existing, {});
    const projectId = client.projectId || admin.projectId || oauth?.projectId || '';

    return {
        ...base,
        OWNER_EMAIL: base.OWNER_EMAIL ?? '',
        GOOGLE_APPLICATION_CREDENTIALS: resolveRelativePath(
            options.projectPath,
            options.adminSdkPath,
            `${SECRETS_DIRNAME}/${CANONICAL_ADMIN_SDK}`
        ),
        GOOGLE_OAUTH_CLIENT_FILE: resolveRelativePath(
            options.projectPath,
            options.oauthClientPath ?? null,
            `${SECRETS_DIRNAME}/${CANONICAL_OAUTH_JSON}`
        ),
        FIREBASE_WEB_SDK_FILE: resolveRelativePath(
            options.projectPath,
            options.clientSdkPath.endsWith('.js')
                ? path.join(path.dirname(options.clientSdkPath), CANONICAL_FIREBASE_SDK_JSON)
                : options.clientSdkPath,
            `${SECRETS_DIRNAME}/${CANONICAL_FIREBASE_SDK_JSON}`
        ),
        GOOGLE_WEB_CLIENT_ID: oauth?.clientId || base.GOOGLE_WEB_CLIENT_ID || '',
        GOOGLE_CLIENT_SECRET: oauth?.clientSecret || base.GOOGLE_CLIENT_SECRET || '',
        FIREBASE_API_KEY: client.apiKey,
        FIREBASE_AUTH_DOMAIN: client.authDomain,
        FIREBASE_PROJECT_ID: projectId,
        FIREBASE_DATABASE_URL: projectId ? `https://${projectId}-default-rtdb.firebaseio.com/` : '',
        FIREBASE_STORAGE_BUCKET: client.storageBucket,
        FIREBASE_MESSAGING_SENDER_ID: client.messagingSenderId,
        FIREBASE_APP_ID: client.appId,
        FIREBASE_MEASUREMENT_ID: client.measurementId,
        APP_CHECK_TOKEN_AUTO_REFRESH: base.APP_CHECK_TOKEN_AUTO_REFRESH || 'true',
        APP_CHECK_WEB_PROVIDER: base.APP_CHECK_WEB_PROVIDER || 'enterprise',
        APP_CHECK_ANDROID_PROVIDER: base.APP_CHECK_ANDROID_PROVIDER || 'debug',
        APP_CHECK_APPLE_PROVIDER: base.APP_CHECK_APPLE_PROVIDER || 'auto',
        APP_CHECK_WEB_RECAPTCHA_KEY: base.APP_CHECK_WEB_RECAPTCHA_KEY || '',
        APP_CHECK_DEBUG_TOKEN: base.APP_CHECK_DEBUG_TOKEN || '',
        APP_CHECK_WEB_DEBUG_TOKEN: base.APP_CHECK_WEB_DEBUG_TOKEN || '',
        APP_CHECK_ANDROID_DEBUG_TOKEN: base.APP_CHECK_ANDROID_DEBUG_TOKEN || '',
        APP_CHECK_APPLE_DEBUG_TOKEN: base.APP_CHECK_APPLE_DEBUG_TOKEN || '',
        APP_CHECK_DEBUG_LOG_TOKEN: base.APP_CHECK_DEBUG_LOG_TOKEN || 'false',
        NEXT_PUBLIC_FIREBASE_API_KEY: client.apiKey,
        NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: client.authDomain,
        NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
        NEXT_PUBLIC_FIREBASE_DATABASE_URL: projectId ? `https://${projectId}-default-rtdb.firebaseio.com/` : '',
        NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: client.storageBucket,
        NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: client.messagingSenderId,
        NEXT_PUBLIC_FIREBASE_APP_ID: client.appId,
        NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: client.measurementId,
        GEMINI_API_KEY: typeof options.geminiKey === 'string'
            ? options.geminiKey
            : (base.GEMINI_API_KEY ?? '')
    };
}

function buildExampleEnvValues(
    projectPath: string,
    framework: FrameworkEnvMode,
    envValues: EnvTemplateValues
): EnvTemplateValues {
    const secretsDir = resolveSupportedSecretsDir(projectPath);
    const relativeSecretsDir = getSecretsRelativeDir(projectPath, secretsDir);
    return {
        ...envValues,
        GOOGLE_APPLICATION_CREDENTIALS: `${relativeSecretsDir}/${CANONICAL_ADMIN_SDK}`,
        GOOGLE_OAUTH_CLIENT_FILE: `${relativeSecretsDir}/${CANONICAL_OAUTH_JSON}`,
        FIREBASE_WEB_SDK_FILE: envValues.FIREBASE_WEB_SDK_FILE?.endsWith('.json')
            ? `${relativeSecretsDir}/${CANONICAL_FIREBASE_SDK_JSON}`
            : `${relativeSecretsDir}/${CANONICAL_FIREBASE_SDK_JS}`,
        GOOGLE_CLIENT_SECRET: '',
        GEMINI_API_KEY: '',
        ...(framework === 'nextjs'
            ? {
                NEXT_PUBLIC_FIREBASE_API_KEY: envValues.FIREBASE_API_KEY ?? '',
                NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: envValues.FIREBASE_AUTH_DOMAIN ?? '',
                NEXT_PUBLIC_FIREBASE_PROJECT_ID: envValues.FIREBASE_PROJECT_ID ?? '',
                NEXT_PUBLIC_FIREBASE_DATABASE_URL: envValues.FIREBASE_DATABASE_URL ?? '',
                NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: envValues.FIREBASE_STORAGE_BUCKET ?? '',
                NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: envValues.FIREBASE_MESSAGING_SENDER_ID ?? '',
                NEXT_PUBLIC_FIREBASE_APP_ID: envValues.FIREBASE_APP_ID ?? '',
                NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID: envValues.FIREBASE_MEASUREMENT_ID ?? ''
            }
            : {}),
        GOOGLE_WEB_CLIENT_ID: envValues.GOOGLE_WEB_CLIENT_ID ?? '',
        OWNER_EMAIL: envValues.OWNER_EMAIL ?? ''
    };
}

function appendPreservedEnvLines(content: string, preservedLines: string[]): string {
    if (preservedLines.length === 0) {
        return content.endsWith('\n') ? content : `${content}\n`;
    }

    return `${content.trimEnd()}\n\n# Preserved custom values\n${preservedLines.join('\n')}\n`;
}

function buildCredentialWarnings(
    framework: FrameworkEnvMode,
    adminPath: string,
    clientPath: string,
    oauthPath: string | null
): string[] {
    const warnings: string[] = [];

    const admin = readAdminSdkMetadata(adminPath);
    const client = readFirebaseWebSdkFile(clientPath);
    const oauth = oauthPath ? readGoogleOAuthClientFile(oauthPath) : null;
    const projectId = client.projectId || admin.projectId || '';

    if (oauth?.projectId && projectId && oauth.projectId !== projectId) {
        warnings.push(
            `OAuth project (${oauth.projectId}) does not match Firebase project (${projectId}). Replace ${SECRETS_DIRNAME}/${CANONICAL_OAUTH_JSON} before using Google Sign-In.`
        );
    }

    if (!oauth?.clientId) {
        warnings.push(
            `${SECRETS_DIRNAME}/${CANONICAL_OAUTH_JSON} is missing a client_id. Google Sign-In values will stay blank.`
        );
    }

    if (framework === 'flutter') {
        warnings.push(
            `Flutter projects still need FlutterFire native registration after env sync if ${projectId || 'the Firebase project'} changed.`
        );
    }

    return warnings;
}

export function syncProjectCredentialsFromSecrets(options: {
    projectPath: string;
    framework?: FrameworkEnvMode;
    geminiKey?: string;
}): ProjectCredentialSyncResult {
    const framework = options.framework && options.framework !== 'unknown'
        ? options.framework
        : detectFramework(options.projectPath);
    const normalized = normalizeCredentialFiles(options.projectPath);
    const envPath = path.join(options.projectPath, '.env');
    const envExamplePath = path.join(options.projectPath, '.env.example');
    const nextLocalEnvPath = framework === 'nextjs'
        ? path.join(options.projectPath, '.env.local')
        : null;

    ensureRootCredentialGitignore(options.projectPath);

    if (!normalized.adminSdkPath || !normalized.clientSdkPath) {
        return {
            framework,
            performed: false,
            ready: false,
            envPath,
            envExamplePath,
            nextLocalEnvPath,
            movedFiles: normalized.movedFiles,
            warnings: normalized.warnings,
            missingFiles: normalized.missingFiles,
            projectId: ''
        };
    }

    const existingPrimaryEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const existingNextLocalEnv = nextLocalEnvPath && fs.existsSync(nextLocalEnvPath)
        ? fs.readFileSync(nextLocalEnvPath, 'utf-8')
        : '';
    const existingEnvContent = [existingPrimaryEnv, existingNextLocalEnv]
        .filter(Boolean)
        .join('\n');

    const envValues = buildEnvValuesFromCredentialFiles({
        projectPath: options.projectPath,
        adminSdkPath: normalized.adminSdkPath,
        clientSdkPath: normalized.clientSdkPath,
        oauthClientPath: normalized.oauthClientPath,
        existingEnvContent,
        geminiKey: options.geminiKey,
        framework
    });

    const preservedPrimary = collectPreservedEnvLines(existingPrimaryEnv, framework);
    const envContent = appendPreservedEnvLines(
        buildEnvTemplate(envValues, framework),
        preservedPrimary
    );
    fs.writeFileSync(envPath, envContent);

    if (nextLocalEnvPath) {
        const preservedLocal = collectPreservedEnvLines(existingNextLocalEnv, framework);
        const nextContent = appendPreservedEnvLines(
            buildEnvTemplate(envValues, framework),
            preservedLocal
        );
        fs.writeFileSync(nextLocalEnvPath, nextContent);
    }

    const exampleValues = buildExampleEnvValues(options.projectPath, framework, envValues);
    const existingExample = fs.existsSync(envExamplePath) ? fs.readFileSync(envExamplePath, 'utf-8') : '';
    const preservedExample = collectPreservedEnvLines(existingExample, framework);
    fs.writeFileSync(
        envExamplePath,
        appendPreservedEnvLines(buildEnvTemplate(exampleValues, framework), preservedExample)
    );

    const warnings = [
        ...normalized.warnings,
        ...buildCredentialWarnings(
            framework,
            normalized.adminSdkPath,
            normalized.clientSdkPath,
            normalized.oauthClientPath
        )
    ];

    return {
        framework,
        performed: true,
        ready: normalized.missingFiles.length === 0,
        envPath,
        envExamplePath,
        nextLocalEnvPath,
        movedFiles: normalized.movedFiles,
        warnings,
        missingFiles: normalized.missingFiles,
        projectId: envValues.FIREBASE_PROJECT_ID ?? ''
    };
}

export function ensureRootCredentialGitignore(projectPath: string): void {
    const gitignorePath = path.join(projectPath, '.gitignore');
    const requiredEntries = [
        '.secrets/',
        'scripts/.secrets/',
        '.env.local',
        'admin-sdk.json',
        'firebase-sdk.js',
        'firebase-sdk.json',
        'firestore-sdk.js',
        'client_secret*.json',
        'client-secret*.json'
    ];

    const existing = fs.existsSync(gitignorePath)
        ? fs.readFileSync(gitignorePath, 'utf-8')
        : '';

    const missing = requiredEntries.filter((entry) =>
        !existing.split(/\r?\n/).some((line) => line.trim() === entry)
    );
    if (missing.length === 0) {
        return;
    }

    const trimmed = existing.trimEnd();
    const prefix = trimmed.length > 0 ? `${trimmed}\n` : '';
    const block = [
        '# Local Firebase credential files (codeman)',
        ...missing
    ].join('\n');

    fs.writeFileSync(gitignorePath, `${prefix}${block}\n`);
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
    return resolveFirebaseProjectId(projectPath);
}

export function resolveGoogleApplicationCredentialsPath(projectPath: string): string | null {
    const envValues = loadProjectEnvValues(projectPath);
    const configuredPath = envValues.GOOGLE_APPLICATION_CREDENTIALS?.trim();

    if (configuredPath) {
        const resolved = path.resolve(projectPath, configuredPath);
        if (fs.existsSync(resolved)) {
            return resolved;
        }
    }

    const inspection = inspectCredentialFiles(projectPath);
    if (inspection.adminSdkPath && fs.existsSync(inspection.adminSdkPath)) {
        return inspection.adminSdkPath;
    }

    const fallback = path.join(resolveSupportedSecretsDir(projectPath), CANONICAL_ADMIN_SDK);
    return fs.existsSync(fallback) ? fallback : null;
}

export function resolveFirebaseProjectId(projectPath: string): string | null {
    const envValues = loadProjectEnvValues(projectPath);
    const envProjectId = envValues.FIREBASE_PROJECT_ID?.trim() || envValues.NEXT_PUBLIC_FIREBASE_PROJECT_ID?.trim();
    if (envProjectId) {
        return envProjectId;
    }

    const inspection = inspectCredentialFiles(projectPath);
    if (inspection.clientSdkPath && fs.existsSync(inspection.clientSdkPath)) {
        const clientProjectId = readFirebaseWebSdkFile(inspection.clientSdkPath).projectId?.trim();
        if (clientProjectId) {
            return clientProjectId;
        }
    }

    if (inspection.adminSdkPath && fs.existsSync(inspection.adminSdkPath)) {
        const adminProjectId = readAdminSdkMetadata(inspection.adminSdkPath).projectId?.trim();
        if (adminProjectId) {
            return adminProjectId;
        }
    }

    const firebasercPath = path.join(projectPath, '.firebaserc');
    if (fs.existsSync(firebasercPath)) {
        try {
            const firebaserc = JSON.parse(fs.readFileSync(firebasercPath, 'utf-8'));
            if (isObject(firebaserc.projects)) {
                const defaultProject = asString(firebaserc.projects.default);
                if (defaultProject) {
                    return defaultProject;
                }

                const firstProject = Object.values(firebaserc.projects)
                    .map((value) => asString(value))
                    .find(Boolean);
                if (firstProject) {
                    return firstProject;
                }
            }
        } catch {
            // Ignore malformed .firebaserc and fall through.
        }
    }

    return null;
}

export function resolveFirebaseBackendConfig(projectPath: string): ResolvedFirebaseBackendConfig | null {
    const inspection = inspectCredentialFiles(projectPath);
    const serviceAccountPath = resolveGoogleApplicationCredentialsPath(projectPath);
    const clientSdkPath = inspection.clientSdkPath;

    if (!serviceAccountPath || !clientSdkPath) {
        return null;
    }

    const envValues = loadProjectEnvValues(projectPath);
    const webConfig = readFirebaseWebSdkFile(clientSdkPath);
    const projectId = resolveFirebaseProjectId(projectPath);

    if (!projectId || !webConfig.apiKey) {
        return null;
    }

    const authDomain = webConfig.authDomain?.trim() || `${projectId}.firebaseapp.com`;
    const databaseURL = envValues.FIREBASE_DATABASE_URL?.trim()
        || envValues.NEXT_PUBLIC_FIREBASE_DATABASE_URL?.trim()
        || `https://${projectId}-default-rtdb.firebaseio.com/`;

    return {
        projectId,
        apiKey: webConfig.apiKey.trim(),
        authDomain,
        databaseURL,
        serviceAccountPath,
        clientSdkPath,
        secretsDir: resolveSupportedSecretsDir(projectPath)
    };
}

export function ensureVishnuBackendCredentialBundle(projectPath: string): VishnuBackendCredentialBundleStatus {
    ensureRootCredentialGitignore(projectPath);

    const normalized = normalizeCredentialFiles(projectPath);
    const backendConfig = resolveFirebaseBackendConfig(projectPath);
    const secretsDir = resolveSupportedSecretsDir(projectPath);
    const relativeSecretsDir = getSecretsRelativeDir(projectPath, secretsDir);
    const missingFiles = [...normalized.missingFiles];

    if (!normalized.clientSdkJsonPath) {
        missingFiles.push(`${relativeSecretsDir}/${CANONICAL_FIREBASE_SDK_JSON}`);
    }

    return {
        ready: Boolean(
            normalized.adminSdkPath &&
            normalized.clientSdkPath &&
            normalized.clientSdkJsonPath &&
            backendConfig
        ),
        secretsDir,
        adminSdkPath: normalized.adminSdkPath,
        clientSdkPath: normalized.clientSdkPath,
        clientSdkJsonPath: normalized.clientSdkJsonPath,
        movedFiles: normalized.movedFiles,
        warnings: normalized.warnings,
        missingFiles: Array.from(new Set(missingFiles)),
        backendConfig
    };
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
