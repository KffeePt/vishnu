import fs from 'fs';

export interface EnvTemplateValues {
    OWNER_EMAIL?: string;
    GOOGLE_APPLICATION_CREDENTIALS?: string;
    GOOGLE_OAUTH_CLIENT_FILE?: string;
    FIREBASE_WEB_SDK_FILE?: string;
    FIREBASE_API_KEY?: string;
    FIREBASE_AUTH_DOMAIN?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_DATABASE_URL?: string;
    FIREBASE_STORAGE_BUCKET?: string;
    FIREBASE_MESSAGING_SENDER_ID?: string;
    FIREBASE_APP_ID?: string;
    FIREBASE_MEASUREMENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_WEB_CLIENT_ID?: string;
    ANDROID_SHA1?: string;
    ANDROID_SHA256?: string;
    APP_CHECK_TOKEN_AUTO_REFRESH?: string;
    APP_CHECK_WEB_PROVIDER?: string;
    APP_CHECK_ANDROID_PROVIDER?: string;
    APP_CHECK_APPLE_PROVIDER?: string;
    APP_CHECK_WEB_RECAPTCHA_KEY?: string;
    APP_CHECK_DEBUG_TOKEN?: string;
    APP_CHECK_WEB_DEBUG_TOKEN?: string;
    APP_CHECK_ANDROID_DEBUG_TOKEN?: string;
    APP_CHECK_APPLE_DEBUG_TOKEN?: string;
    APP_CHECK_DEBUG_LOG_TOKEN?: string;
    NEXT_PUBLIC_FIREBASE_API_KEY?: string;
    NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN?: string;
    NEXT_PUBLIC_FIREBASE_PROJECT_ID?: string;
    NEXT_PUBLIC_FIREBASE_DATABASE_URL?: string;
    NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET?: string;
    NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID?: string;
    NEXT_PUBLIC_FIREBASE_APP_ID?: string;
    NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID?: string;
    GEMINI_API_KEY?: string;
}

export type FrameworkEnvMode = 'flutter' | 'nextjs' | 'custom' | 'unknown';

export const COMMON_ENV_TEMPLATE_KEYS: Array<keyof EnvTemplateValues> = [
    'OWNER_EMAIL',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_WEB_CLIENT_ID',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_OAUTH_CLIENT_FILE',
    'FIREBASE_WEB_SDK_FILE',
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_DATABASE_URL',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID',
    'FIREBASE_MEASUREMENT_ID',
    'APP_CHECK_TOKEN_AUTO_REFRESH',
    'APP_CHECK_WEB_PROVIDER',
    'APP_CHECK_WEB_RECAPTCHA_KEY',
    'APP_CHECK_DEBUG_TOKEN',
    'APP_CHECK_DEBUG_LOG_TOKEN',
    'GEMINI_API_KEY'
];

export const FLUTTER_ENV_TEMPLATE_KEYS: Array<keyof EnvTemplateValues> = [
    ...COMMON_ENV_TEMPLATE_KEYS,
    'ANDROID_SHA1',
    'ANDROID_SHA256',
    'APP_CHECK_ANDROID_PROVIDER',
    'APP_CHECK_APPLE_PROVIDER',
    'APP_CHECK_WEB_DEBUG_TOKEN',
    'APP_CHECK_ANDROID_DEBUG_TOKEN',
    'APP_CHECK_APPLE_DEBUG_TOKEN'
];

export const NEXTJS_ENV_TEMPLATE_KEYS: Array<keyof EnvTemplateValues> = [
    ...COMMON_ENV_TEMPLATE_KEYS,
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
];

export const ENV_TEMPLATE_KEYS: Array<keyof EnvTemplateValues> = Array.from(new Set([
    ...COMMON_ENV_TEMPLATE_KEYS,
    ...FLUTTER_ENV_TEMPLATE_KEYS,
    ...NEXTJS_ENV_TEMPLATE_KEYS
]));

export function parseEnv(content: string): Record<string, string> {
    const out: Record<string, string> = {};
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;
        const key = trimmed.slice(0, idx).trim();
        const value = trimmed.slice(idx + 1).trim();
        out[key] = value;
    }
    return out;
}

function dedupeKeys(keys: Array<keyof EnvTemplateValues>): Array<keyof EnvTemplateValues> {
    return Array.from(new Set(keys));
}

export function getEnvTemplateKeys(mode: FrameworkEnvMode): Array<keyof EnvTemplateValues> {
    if (mode === 'flutter') {
        return dedupeKeys(FLUTTER_ENV_TEMPLATE_KEYS);
    }

    if (mode === 'nextjs') {
        return dedupeKeys(NEXTJS_ENV_TEMPLATE_KEYS);
    }

    return dedupeKeys(COMMON_ENV_TEMPLATE_KEYS);
}

export function collectPreservedEnvLines(
    content: string,
    mode: FrameworkEnvMode
): string[] {
    const templateKeys = new Set(getEnvTemplateKeys(mode).map(String));
    const preserved: string[] = [];
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const idx = trimmed.indexOf('=');
        if (idx === -1) continue;

        const key = trimmed.slice(0, idx).trim();
        if (!key || templateKeys.has(key)) continue;

        preserved.push(trimmed);
    }

    return preserved;
}

export function buildEnvTemplate(
    values: EnvTemplateValues,
    mode: FrameworkEnvMode = 'custom'
): string {
    if (mode === 'flutter') {
        return buildFlutterEnvTemplate(values);
    }

    if (mode === 'nextjs') {
        return buildNextEnvTemplate(values);
    }

    return `
# Core Project Ownership
OWNER_EMAIL=${values.OWNER_EMAIL ?? ''}
GEMINI_API_KEY=${values.GEMINI_API_KEY ?? ''}

# Google Sign-In / OAuth
GOOGLE_OAUTH_CLIENT_FILE=${values.GOOGLE_OAUTH_CLIENT_FILE ?? '.secrets/client-secret-oauth.json'}
GOOGLE_CLIENT_SECRET=${values.GOOGLE_CLIENT_SECRET ?? ''}
GOOGLE_WEB_CLIENT_ID=${values.GOOGLE_WEB_CLIENT_ID ?? ''}

# Admin Setup
GOOGLE_APPLICATION_CREDENTIALS=${values.GOOGLE_APPLICATION_CREDENTIALS ?? '.secrets/admin-sdk.json'}
FIREBASE_WEB_SDK_FILE=${values.FIREBASE_WEB_SDK_FILE ?? '.secrets/firebase-sdk.js'}

# Firebase Client
FIREBASE_API_KEY=${values.FIREBASE_API_KEY ?? ''}
FIREBASE_AUTH_DOMAIN=${values.FIREBASE_AUTH_DOMAIN ?? ''}
FIREBASE_PROJECT_ID=${values.FIREBASE_PROJECT_ID ?? ''}
FIREBASE_DATABASE_URL=${values.FIREBASE_DATABASE_URL ?? ''}
FIREBASE_STORAGE_BUCKET=${values.FIREBASE_STORAGE_BUCKET ?? ''}
FIREBASE_MESSAGING_SENDER_ID=${values.FIREBASE_MESSAGING_SENDER_ID ?? ''}
FIREBASE_APP_ID=${values.FIREBASE_APP_ID ?? ''}
FIREBASE_MEASUREMENT_ID=${values.FIREBASE_MEASUREMENT_ID ?? ''}

# Firebase App Check
APP_CHECK_TOKEN_AUTO_REFRESH=${values.APP_CHECK_TOKEN_AUTO_REFRESH ?? 'true'}
APP_CHECK_WEB_PROVIDER=${values.APP_CHECK_WEB_PROVIDER ?? 'enterprise'}
APP_CHECK_WEB_RECAPTCHA_KEY=${values.APP_CHECK_WEB_RECAPTCHA_KEY ?? ''}
APP_CHECK_DEBUG_TOKEN=${values.APP_CHECK_DEBUG_TOKEN ?? ''}
APP_CHECK_DEBUG_LOG_TOKEN=${values.APP_CHECK_DEBUG_LOG_TOKEN ?? 'false'}
`.trim() + '\n';
}

export function buildNextPublicFirebaseBlock(values: EnvTemplateValues): string {
    return `
# Next.js Public Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=${values.FIREBASE_API_KEY ?? ''}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${values.FIREBASE_AUTH_DOMAIN ?? ''}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${values.FIREBASE_PROJECT_ID ?? ''}
NEXT_PUBLIC_FIREBASE_DATABASE_URL=${values.FIREBASE_DATABASE_URL ?? ''}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${values.FIREBASE_STORAGE_BUCKET ?? ''}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${values.FIREBASE_MESSAGING_SENDER_ID ?? ''}
NEXT_PUBLIC_FIREBASE_APP_ID=${values.FIREBASE_APP_ID ?? ''}
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${values.FIREBASE_MEASUREMENT_ID ?? ''}
`.trim() + '\n';
}

export function buildFlutterEnvTemplate(values: EnvTemplateValues): string {
    return `
# Core Project Ownership
OWNER_EMAIL=${values.OWNER_EMAIL ?? ''}
GEMINI_API_KEY=${values.GEMINI_API_KEY ?? ''}

# Google Sign-In / OAuth
GOOGLE_OAUTH_CLIENT_FILE=${values.GOOGLE_OAUTH_CLIENT_FILE ?? '.secrets/client-secret-oauth.json'}
GOOGLE_CLIENT_SECRET=${values.GOOGLE_CLIENT_SECRET ?? ''}
GOOGLE_WEB_CLIENT_ID=${values.GOOGLE_WEB_CLIENT_ID ?? ''}
ANDROID_SHA1=${values.ANDROID_SHA1 ?? ''}
ANDROID_SHA256=${values.ANDROID_SHA256 ?? ''}

# Firebase Admin + Web Config
GOOGLE_APPLICATION_CREDENTIALS=${values.GOOGLE_APPLICATION_CREDENTIALS ?? '.secrets/admin-sdk.json'}
FIREBASE_WEB_SDK_FILE=${values.FIREBASE_WEB_SDK_FILE ?? '.secrets/firebase-sdk.js'}
FIREBASE_API_KEY=${values.FIREBASE_API_KEY ?? ''}
FIREBASE_AUTH_DOMAIN=${values.FIREBASE_AUTH_DOMAIN ?? ''}
FIREBASE_PROJECT_ID=${values.FIREBASE_PROJECT_ID ?? ''}
FIREBASE_DATABASE_URL=${values.FIREBASE_DATABASE_URL ?? ''}
FIREBASE_STORAGE_BUCKET=${values.FIREBASE_STORAGE_BUCKET ?? ''}
FIREBASE_MESSAGING_SENDER_ID=${values.FIREBASE_MESSAGING_SENDER_ID ?? ''}
FIREBASE_APP_ID=${values.FIREBASE_APP_ID ?? ''}
FIREBASE_MEASUREMENT_ID=${values.FIREBASE_MEASUREMENT_ID ?? ''}

# Firebase App Check
APP_CHECK_TOKEN_AUTO_REFRESH=${values.APP_CHECK_TOKEN_AUTO_REFRESH ?? 'true'}
APP_CHECK_WEB_PROVIDER=${values.APP_CHECK_WEB_PROVIDER ?? 'enterprise'}
APP_CHECK_ANDROID_PROVIDER=${values.APP_CHECK_ANDROID_PROVIDER ?? 'debug'}
APP_CHECK_APPLE_PROVIDER=${values.APP_CHECK_APPLE_PROVIDER ?? 'auto'}
APP_CHECK_WEB_RECAPTCHA_KEY=${values.APP_CHECK_WEB_RECAPTCHA_KEY ?? ''}
APP_CHECK_DEBUG_TOKEN=${values.APP_CHECK_DEBUG_TOKEN ?? ''}
APP_CHECK_WEB_DEBUG_TOKEN=${values.APP_CHECK_WEB_DEBUG_TOKEN ?? ''}
APP_CHECK_ANDROID_DEBUG_TOKEN=${values.APP_CHECK_ANDROID_DEBUG_TOKEN ?? ''}
APP_CHECK_APPLE_DEBUG_TOKEN=${values.APP_CHECK_APPLE_DEBUG_TOKEN ?? ''}
APP_CHECK_DEBUG_LOG_TOKEN=${values.APP_CHECK_DEBUG_LOG_TOKEN ?? 'false'}
`.trim() + '\n';
}

export function buildNextEnvTemplate(values: EnvTemplateValues): string {
    return `
# Core Project Ownership
OWNER_EMAIL=${values.OWNER_EMAIL ?? ''}
GEMINI_API_KEY=${values.GEMINI_API_KEY ?? ''}

# Google Sign-In / OAuth
GOOGLE_OAUTH_CLIENT_FILE=${values.GOOGLE_OAUTH_CLIENT_FILE ?? '.secrets/client-secret-oauth.json'}
GOOGLE_CLIENT_SECRET=${values.GOOGLE_CLIENT_SECRET ?? ''}
GOOGLE_WEB_CLIENT_ID=${values.GOOGLE_WEB_CLIENT_ID ?? ''}

# Firebase Admin + Web Config
GOOGLE_APPLICATION_CREDENTIALS=${values.GOOGLE_APPLICATION_CREDENTIALS ?? '.secrets/admin-sdk.json'}
FIREBASE_WEB_SDK_FILE=${values.FIREBASE_WEB_SDK_FILE ?? '.secrets/firebase-sdk.js'}
FIREBASE_API_KEY=${values.FIREBASE_API_KEY ?? ''}
FIREBASE_AUTH_DOMAIN=${values.FIREBASE_AUTH_DOMAIN ?? ''}
FIREBASE_PROJECT_ID=${values.FIREBASE_PROJECT_ID ?? ''}
FIREBASE_DATABASE_URL=${values.FIREBASE_DATABASE_URL ?? ''}
FIREBASE_STORAGE_BUCKET=${values.FIREBASE_STORAGE_BUCKET ?? ''}
FIREBASE_MESSAGING_SENDER_ID=${values.FIREBASE_MESSAGING_SENDER_ID ?? ''}
FIREBASE_APP_ID=${values.FIREBASE_APP_ID ?? ''}
FIREBASE_MEASUREMENT_ID=${values.FIREBASE_MEASUREMENT_ID ?? ''}

# Firebase App Check (Web)
APP_CHECK_TOKEN_AUTO_REFRESH=${values.APP_CHECK_TOKEN_AUTO_REFRESH ?? 'true'}
APP_CHECK_WEB_PROVIDER=${values.APP_CHECK_WEB_PROVIDER ?? 'enterprise'}
APP_CHECK_WEB_RECAPTCHA_KEY=${values.APP_CHECK_WEB_RECAPTCHA_KEY ?? ''}
APP_CHECK_DEBUG_TOKEN=${values.APP_CHECK_DEBUG_TOKEN ?? ''}
APP_CHECK_DEBUG_LOG_TOKEN=${values.APP_CHECK_DEBUG_LOG_TOKEN ?? 'false'}

# Next.js Public Firebase
NEXT_PUBLIC_FIREBASE_API_KEY=${values.NEXT_PUBLIC_FIREBASE_API_KEY ?? values.FIREBASE_API_KEY ?? ''}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${values.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? values.FIREBASE_AUTH_DOMAIN ?? ''}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${values.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? values.FIREBASE_PROJECT_ID ?? ''}
NEXT_PUBLIC_FIREBASE_DATABASE_URL=${values.NEXT_PUBLIC_FIREBASE_DATABASE_URL ?? values.FIREBASE_DATABASE_URL ?? ''}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${values.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? values.FIREBASE_STORAGE_BUCKET ?? ''}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${values.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? values.FIREBASE_MESSAGING_SENDER_ID ?? ''}
NEXT_PUBLIC_FIREBASE_APP_ID=${values.NEXT_PUBLIC_FIREBASE_APP_ID ?? values.FIREBASE_APP_ID ?? ''}
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${values.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID ?? values.FIREBASE_MEASUREMENT_ID ?? ''}
`.trim() + '\n';
}

export function validateEnvFormat(
    envPath: string,
    mode: FrameworkEnvMode = 'custom'
): { ok: boolean; missing: string[] } {
    if (!fs.existsSync(envPath)) {
        return { ok: false, missing: getEnvTemplateKeys(mode).map(String) };
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    const parsed = parseEnv(content);
    const missing = getEnvTemplateKeys(mode).filter(key => !(key in parsed)).map(String);
    return { ok: missing.length === 0, missing };
}

export function mergeEnvValues(existing: Record<string, string>, defaults: EnvTemplateValues): EnvTemplateValues {
    const merged: EnvTemplateValues = { ...defaults };
    for (const key of ENV_TEMPLATE_KEYS) {
        const value = existing[key as string];
        if (typeof value !== 'undefined') {
            (merged as Record<string, string>)[key as string] = value;
        }
    }
    return merged;
}
