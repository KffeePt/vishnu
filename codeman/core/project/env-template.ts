import fs from 'fs';

export interface EnvTemplateValues {
    GOOGLE_APPLICATION_CREDENTIALS?: string;
    FIREBASE_API_KEY?: string;
    FIREBASE_AUTH_DOMAIN?: string;
    FIREBASE_PROJECT_ID?: string;
    FIREBASE_STORAGE_BUCKET?: string;
    FIREBASE_MESSAGING_SENDER_ID?: string;
    FIREBASE_APP_ID?: string;
    FIREBASE_MEASUREMENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    GOOGLE_WEB_CLIENT_ID?: string;
    ANDROID_SHA1?: string;
    ANDROID_SHA256?: string;
    APP_CHECK_WEB_RECAPTCHA_KEY?: string;
    APP_CHECK_DEBUG_TOKEN?: string;
    MP_TEST_PUBLIC_KEY?: string;
    MP_TEST_ACCESS_TOKEN?: string;
    MP_PROD_PUBLIC_KEY?: string;
    MP_PROD_ACCESS_TOKEN?: string;
    MP_BACKEND_URL?: string;
    PRESCRIPTION_VIEWER_BASE_URL?: string;
    LEGAL_BASE_URL?: string;
    GEMINI_API_KEY?: string;
}

export const ENV_TEMPLATE_KEYS: Array<keyof EnvTemplateValues> = [
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_WEB_CLIENT_ID',
    'ANDROID_SHA1',
    'ANDROID_SHA256',
    'GOOGLE_APPLICATION_CREDENTIALS',
    'FIREBASE_API_KEY',
    'FIREBASE_AUTH_DOMAIN',
    'FIREBASE_PROJECT_ID',
    'FIREBASE_STORAGE_BUCKET',
    'FIREBASE_MESSAGING_SENDER_ID',
    'FIREBASE_APP_ID',
    'FIREBASE_MEASUREMENT_ID',
    'APP_CHECK_WEB_RECAPTCHA_KEY',
    'APP_CHECK_DEBUG_TOKEN',
    'MP_TEST_PUBLIC_KEY',
    'MP_TEST_ACCESS_TOKEN',
    'MP_PROD_PUBLIC_KEY',
    'MP_PROD_ACCESS_TOKEN',
    'MP_BACKEND_URL',
    'PRESCRIPTION_VIEWER_BASE_URL',
    'LEGAL_BASE_URL',
    'GEMINI_API_KEY'
];

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

export function buildEnvTemplate(values: EnvTemplateValues): string {
    return `
# Google Sign-In / OAuth
GOOGLE_CLIENT_SECRET=${values.GOOGLE_CLIENT_SECRET ?? ''}
GOOGLE_WEB_CLIENT_ID=${values.GOOGLE_WEB_CLIENT_ID ?? ''}
ANDROID_SHA1=${values.ANDROID_SHA1 ?? ''}
ANDROID_SHA256=${values.ANDROID_SHA256 ?? ''}

# Admin Setup
GOOGLE_APPLICATION_CREDENTIALS=${values.GOOGLE_APPLICATION_CREDENTIALS ?? 'admin-sdk.json'}

# Firebase Client (Browser API key from Google Cloud Console)
FIREBASE_API_KEY=${values.FIREBASE_API_KEY ?? ''}
FIREBASE_AUTH_DOMAIN=${values.FIREBASE_AUTH_DOMAIN ?? ''}
FIREBASE_PROJECT_ID=${values.FIREBASE_PROJECT_ID ?? ''}
FIREBASE_STORAGE_BUCKET=${values.FIREBASE_STORAGE_BUCKET ?? ''}
FIREBASE_MESSAGING_SENDER_ID=${values.FIREBASE_MESSAGING_SENDER_ID ?? ''}
FIREBASE_APP_ID=${values.FIREBASE_APP_ID ?? ''}
FIREBASE_MEASUREMENT_ID=${values.FIREBASE_MEASUREMENT_ID ?? ''}

# Firebase App Check
APP_CHECK_WEB_RECAPTCHA_KEY=${values.APP_CHECK_WEB_RECAPTCHA_KEY ?? ''}
APP_CHECK_DEBUG_TOKEN=${values.APP_CHECK_DEBUG_TOKEN ?? ''}

# MercadoPago
MP_TEST_PUBLIC_KEY=${values.MP_TEST_PUBLIC_KEY ?? 'YOUR_TEST_PUBLIC_KEY'}
MP_TEST_ACCESS_TOKEN=${values.MP_TEST_ACCESS_TOKEN ?? 'YOUR_TEST_ACCESS_TOKEN'}
MP_PROD_PUBLIC_KEY=${values.MP_PROD_PUBLIC_KEY ?? 'YOUR_PROD_PUBLIC_KEY'}
MP_PROD_ACCESS_TOKEN=${values.MP_PROD_ACCESS_TOKEN ?? 'YOUR_PROD_ACCESS_TOKEN'}
MP_BACKEND_URL=${values.MP_BACKEND_URL ?? 'https://us-central1-tu-proyecto.cloudfunctions.net/createPreference'}

# App URLs
PRESCRIPTION_VIEWER_BASE_URL=${values.PRESCRIPTION_VIEWER_BASE_URL ?? ''}
LEGAL_BASE_URL=${values.LEGAL_BASE_URL ?? ''}

# AI
GEMINI_API_KEY=${values.GEMINI_API_KEY ?? ''}
`.trim() + '\n';
}

export function validateEnvFormat(envPath: string): { ok: boolean; missing: string[] } {
    if (!fs.existsSync(envPath)) {
        return { ok: false, missing: ENV_TEMPLATE_KEYS.map(String) };
    }

    const content = fs.readFileSync(envPath, 'utf-8');
    const parsed = parseEnv(content);
    const missing = ENV_TEMPLATE_KEYS.filter(key => !(key in parsed)).map(String);
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
