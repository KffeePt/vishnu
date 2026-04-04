import fs from 'fs';
import os from 'os';
import path from 'path';

import { describe, expect, it } from 'vitest';

import {
    buildEnvValuesFromCredentialFiles,
    guardFlutterNativeFirebaseConfig,
    inspectFlutterFirebaseOptions,
    parseFirebaseWebSdkSource
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
            adminSdkPath: path.join(fixturesDir, 'admin-sdk.json'),
            clientSdkPath: path.join(fixturesDir, 'firebase-sdk.js'),
            existingEnvContent: 'OWNER_EMAIL=owner@example.com\nAPP_CHECK_WEB_RECAPTCHA_KEY=test-site-key\n',
            geminiKey: 'gemini-test-key'
        });

        expect(envValues.GOOGLE_APPLICATION_CREDENTIALS).toBe('admin-sdk.json');
        expect(envValues.FIREBASE_PROJECT_ID).toBe('test-project-id');
        expect(envValues.OWNER_EMAIL).toBe('owner@example.com');
        expect(envValues.APP_CHECK_WEB_RECAPTCHA_KEY).toBe('test-site-key');
        expect(envValues.GEMINI_API_KEY).toBe('gemini-test-key');
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
});
