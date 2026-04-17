import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
    buildEnvValuesFromCredentialFiles,
    normalizeCredentialFiles,
    guardFlutterNativeFirebaseConfig,
    inspectFlutterFirebaseOptions,
    parseFirebaseWebSdkSource,
    parseGoogleOAuthClientSource,
    syncProjectCredentialsFromSecrets
} from '../../../codeman/core/project/firebase-credentials';

const fixturesDir = path.join(process.cwd(), 'tests', 'fixtures');

describe('firebase credential helpers', () => {
    it('parses firebase-sdk.js snippets supplied by Firebase Console', () => {
        const content = fs.readFileSync(path.join(fixturesDir, 'firebase-sdk.js'), 'utf-8');
        const parsed = parseFirebaseWebSdkSource(content);

        expect(parsed.projectId).toBe('test-project-id');
        expect(parsed.apiKey).toBe('test-api-key');
        expect(parsed.measurementId).toBe('G-12345ABCDE');
    });

    it('builds env values from root credential files', () => {
        const envValues = buildEnvValuesFromCredentialFiles({
            projectPath: fixturesDir,
            adminSdkPath: path.join(fixturesDir, 'admin-sdk.json'),
            clientSdkPath: path.join(fixturesDir, 'firebase-sdk.js'),
            oauthClientPath: path.join(fixturesDir, 'client_secret_oauth.json'),
            existingEnvContent: 'OWNER_EMAIL=owner@example.com\nAPP_CHECK_WEB_RECAPTCHA_KEY=test-site-key\n',
            geminiKey: 'gemini-test-key'
        });

        expect(envValues.GOOGLE_APPLICATION_CREDENTIALS).toBe('admin-sdk.json');
        expect(envValues.GOOGLE_OAUTH_CLIENT_FILE).toBe('client_secret_oauth.json');
        expect(envValues.FIREBASE_PROJECT_ID).toBe('test-project-id');
        expect(envValues.OWNER_EMAIL).toBe('owner@example.com');
        expect(envValues.APP_CHECK_WEB_RECAPTCHA_KEY).toBe('test-site-key');
        expect(envValues.GEMINI_API_KEY).toBe('gemini-test-key');
        expect(envValues.GOOGLE_WEB_CLIENT_ID).toBe('test-web-client-id.apps.googleusercontent.com');
        expect(envValues.GOOGLE_CLIENT_SECRET).toBe('test-oauth-secret');
        expect(envValues.FIREBASE_WEB_SDK_FILE).toBe('firebase-sdk.json');
    });

    it('parses oauth json supplied by Google directly', () => {
        const content = fs.readFileSync(path.join(fixturesDir, 'client_secret_oauth.json'), 'utf-8');
        const parsed = parseGoogleOAuthClientSource(content);

        expect(parsed.projectId).toBe('test-project-id');
        expect(parsed.clientId).toBe('test-web-client-id.apps.googleusercontent.com');
        expect(parsed.clientSecret).toBe('test-oauth-secret');
        expect(parsed.type).toBe('installed');
    });

    it('detects mismatched flutterfire config separately from env readiness', () => {
        const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vishnu-flutter-config-'));
        try {
            fs.writeFileSync(
                path.join(projectPath, '.env'),
                'FIREBASE_PROJECT_ID=test-project-id\n'
            );
            fs.mkdirSync(path.join(projectPath, 'lib'), { recursive: true });
            fs.writeFileSync(
                path.join(projectPath, 'lib', 'firebase_options.dart'),
                "class DefaultFirebaseOptions { static const projectId = 'wrong-project'; }\n"
            );

            const status = inspectFlutterFirebaseOptions(projectPath, 'test-project-id');
            expect(status.exists).toBe(true);
            expect(status.aligned).toBe(false);
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('blocks native flutter builds when flutterfire config is stale', () => {
        const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vishnu-flutter-guard-'));
        try {
            fs.writeFileSync(path.join(projectPath, '.env'), 'FIREBASE_PROJECT_ID=test-project-id\n');
            fs.writeFileSync(path.join(projectPath, 'pubspec.yaml'), 'name: test_app\n');
            fs.mkdirSync(path.join(projectPath, 'lib'), { recursive: true });
            fs.writeFileSync(
                path.join(projectPath, 'lib', 'firebase_options.dart'),
                "class DefaultFirebaseOptions { static const projectId = 'wrong-project'; }\n"
            );

            const result = guardFlutterNativeFirebaseConfig(projectPath);
            expect(result.ok).toBe(false);
            expect(result.message).toContain('flutterfire configure');
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('normalizes root credential files into .secrets', () => {
        const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vishnu-credential-normalize-'));
        try {
            fs.writeFileSync(path.join(projectPath, 'admin-sdk.json'), fs.readFileSync(path.join(fixturesDir, 'admin-sdk.json'), 'utf-8'));
            fs.writeFileSync(path.join(projectPath, 'firebase-sdk.js'), fs.readFileSync(path.join(fixturesDir, 'firebase-sdk.js'), 'utf-8'));
            fs.writeFileSync(path.join(projectPath, 'client_secret_demo.json'), fs.readFileSync(path.join(fixturesDir, 'client_secret_oauth.json'), 'utf-8'));

            const result = normalizeCredentialFiles(projectPath);

            expect(result.adminSdkPath).toBe(path.join(projectPath, '.secrets', 'admin-sdk.json'));
            expect(result.clientSdkPath).toBe(path.join(projectPath, '.secrets', 'firebase-sdk.js'));
            expect(result.clientSdkJsonPath).toBe(path.join(projectPath, '.secrets', 'firebase-sdk.json'));
            expect(result.oauthClientPath).toBe(path.join(projectPath, '.secrets', 'client-secret-oauth.json'));
            expect(fs.existsSync(path.join(projectPath, '.secrets', 'firebase-sdk.json'))).toBe(true);
            expect(result.movedFiles.length).toBe(4);
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('writes flutter env files from .secrets using the secure canonical names', () => {
        const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vishnu-flutter-sync-'));
        try {
            fs.writeFileSync(path.join(projectPath, 'pubspec.yaml'), 'name: test_app\n');
            fs.mkdirSync(path.join(projectPath, '.secrets'), { recursive: true });
            fs.writeFileSync(path.join(projectPath, '.secrets', 'admin-sdk.json'), fs.readFileSync(path.join(fixturesDir, 'admin-sdk.json'), 'utf-8'));
            fs.writeFileSync(path.join(projectPath, '.secrets', 'firebase-sdk.js'), fs.readFileSync(path.join(fixturesDir, 'firebase-sdk.js'), 'utf-8'));
            fs.writeFileSync(path.join(projectPath, '.secrets', 'client_secret_oauth.json'), fs.readFileSync(path.join(fixturesDir, 'client_secret_oauth.json'), 'utf-8'));
            fs.writeFileSync(path.join(projectPath, '.env'), 'OWNER_EMAIL=owner@example.com\nCUSTOM_FLAG=keep-me\n');

            const result = syncProjectCredentialsFromSecrets({ projectPath, framework: 'flutter' });
            const envContent = fs.readFileSync(path.join(projectPath, '.env'), 'utf-8');

            expect(result.performed).toBe(true);
            expect(envContent).toContain('GOOGLE_APPLICATION_CREDENTIALS=.secrets/admin-sdk.json');
            expect(envContent).toContain('GOOGLE_OAUTH_CLIENT_FILE=.secrets/client-secret-oauth.json');
            expect(envContent).toContain('FIREBASE_WEB_SDK_FILE=.secrets/firebase-sdk.json');
            expect(envContent).toContain('GOOGLE_WEB_CLIENT_ID=test-web-client-id.apps.googleusercontent.com');
            expect(envContent).toContain('APP_CHECK_ANDROID_PROVIDER=debug');
            expect(envContent).toContain('CUSTOM_FLAG=keep-me');
            expect(fs.existsSync(path.join(projectPath, '.env.example'))).toBe(true);
            expect(fs.existsSync(path.join(projectPath, '.secrets', 'firebase-sdk.json'))).toBe(true);
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });

    it('writes nextjs env and env.local with next public firebase keys', () => {
        const projectPath = fs.mkdtempSync(path.join(os.tmpdir(), 'vishnu-next-sync-'));
        try {
            fs.writeFileSync(path.join(projectPath, 'next.config.js'), 'module.exports = {};\n');
            fs.mkdirSync(path.join(projectPath, '.secrets'), { recursive: true });
            fs.writeFileSync(path.join(projectPath, '.secrets', 'admin-sdk.json'), fs.readFileSync(path.join(fixturesDir, 'admin-sdk.json'), 'utf-8'));
            fs.writeFileSync(path.join(projectPath, '.secrets', 'firebase-sdk.js'), fs.readFileSync(path.join(fixturesDir, 'firebase-sdk.js'), 'utf-8'));
            fs.writeFileSync(path.join(projectPath, '.secrets', 'client_secret_oauth.json'), fs.readFileSync(path.join(fixturesDir, 'client_secret_oauth.json'), 'utf-8'));

            const result = syncProjectCredentialsFromSecrets({ projectPath, framework: 'nextjs' });
            const envContent = fs.readFileSync(path.join(projectPath, '.env'), 'utf-8');
            const envLocalContent = fs.readFileSync(path.join(projectPath, '.env.local'), 'utf-8');

            expect(result.performed).toBe(true);
            expect(envContent).toContain('NEXT_PUBLIC_FIREBASE_API_KEY=test-api-key');
            expect(envContent).not.toContain('ANDROID_SHA1=');
            expect(envLocalContent).toContain('NEXT_PUBLIC_FIREBASE_PROJECT_ID=test-project-id');
            expect(envLocalContent).toContain('GOOGLE_APPLICATION_CREDENTIALS=.secrets/admin-sdk.json');
        } finally {
            fs.rmSync(projectPath, { recursive: true, force: true });
        }
    });
});
