import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import {
    buildEnvTemplate,
    getEnvTemplateKeys,
    mergeEnvValues,
    parseEnv,
    validateEnvFormat,
    type FrameworkEnvMode
} from './env-template';
import { SessionTimerManager } from '../session-timers';
import { inspectCredentialFiles, normalizeCredentialFiles } from './firebase-credentials';
import { List } from '../../components/list';
import { io } from '../io';

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

const FIREBASE_PURGE_KEYS = new Set([
    'GOOGLE_APPLICATION_CREDENTIALS',
    'GOOGLE_OAUTH_CLIENT_FILE',
    'FIREBASE_WEB_SDK_FILE',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_WEB_CLIENT_ID',
    'ANDROID_SHA1',
    'ANDROID_SHA256',
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
    'APP_CHECK_ANDROID_PROVIDER',
    'APP_CHECK_APPLE_PROVIDER',
    'APP_CHECK_WEB_RECAPTCHA_KEY',
    'APP_CHECK_DEBUG_TOKEN',
    'APP_CHECK_WEB_DEBUG_TOKEN',
    'APP_CHECK_ANDROID_DEBUG_TOKEN',
    'APP_CHECK_APPLE_DEBUG_TOKEN',
    'APP_CHECK_DEBUG_LOG_TOKEN',
    'NEXT_PUBLIC_FIREBASE_API_KEY',
    'NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN',
    'NEXT_PUBLIC_FIREBASE_PROJECT_ID',
    'NEXT_PUBLIC_FIREBASE_DATABASE_URL',
    'NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET',
    'NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
    'NEXT_PUBLIC_FIREBASE_APP_ID',
    'NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID'
]);

function detectFramework(projectPath: string): FrameworkEnvMode {
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

function collectPreservedEnvLines(content: string, mode: FrameworkEnvMode): string[] {
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

function buildRebasedEnvContent(existingEnv: Record<string, string>, mode: FrameworkEnvMode): string {
    const rebased = mergeEnvValues(existingEnv, {});
    return buildEnvTemplate(rebased, mode);
}

function buildMergedEnvContent(existingContent: string, existingEnv: Record<string, string>, mode: FrameworkEnvMode): string {
    const rebased = buildRebasedEnvContent(existingEnv, mode).trimEnd();
    const preserved = collectPreservedEnvLines(existingContent, mode);
    if (preserved.length === 0) {
        return `${rebased}\n`;
    }

    return `${rebased}\n\n# Preserved custom values\n${preserved.join('\n')}\n`;
}

function findLegacyEnvKeys(existingEnv: Record<string, string>): string[] {
    return Object.keys(existingEnv)
        .filter((key) => key.startsWith('NEXT_PUBLIC_') || key === 'NextJS_Public')
        .sort((a, b) => a.localeCompare(b));
}

function printMismatchSection(title: string, items: string[], color: typeof chalk.gray = chalk.gray) {
    if (items.length === 0) return;
    console.log(color(`\n${title}`));
    for (const item of items) {
        console.log(color(` - ${item}`));
    }
}

function buildMismatchSummary(projectPath: string, framework: FrameworkEnvMode) {
    const envPath = path.join(projectPath, '.env');
    const formatCheck = validateEnvFormat(envPath, framework);
    const beforeEnv = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';
    const parsedEnv = beforeEnv ? parseEnv(beforeEnv) : {};
    const legacyEnvKeys = framework === 'nextjs' ? [] : findLegacyEnvKeys(parsedEnv);
    const nextPublicMatches = framework === 'nextjs' ? [] : scanForNextPublic(projectPath);
    const credentialState = inspectCredentialFiles(projectPath);
    const timerIssues = SessionTimerManager.getTimerValidationIssues();

    return {
        envPath,
        formatCheck,
        beforeEnv,
        parsedEnv,
        legacyEnvKeys,
        nextPublicMatches,
        credentialState,
        timerIssues
    };
}

function isMismatchResolved(summary: ReturnType<typeof buildMismatchSummary>): boolean {
    return (
        summary.formatCheck.ok &&
        summary.legacyEnvKeys.length === 0 &&
        summary.nextPublicMatches.length === 0 &&
        summary.credentialState.missingFiles.length === 0 &&
        summary.credentialState.suggestedMoves.length === 0 &&
        summary.timerIssues.length === 0
    );
}

function printMismatchSummary(projectPath: string, framework: FrameworkEnvMode, summary: ReturnType<typeof buildMismatchSummary>) {
    console.log(chalk.yellow('\n⚠️  Environment mismatch detected'));
    console.log(chalk.gray('The current project does not fully match the expected setup yet.'));
    console.log(chalk.gray(`Framework: ${framework}`));
    console.log(chalk.gray(`Project: ${projectPath}`));

    if (!fs.existsSync(summary.envPath)) {
        printMismatchSection('Missing project files', ['.env does not exist in this project root'], chalk.red);
    }

    if (!summary.formatCheck.ok && summary.formatCheck.missing.length > 0) {
        printMismatchSection(`.env keys missing or empty (${summary.formatCheck.missing.length})`, summary.formatCheck.missing, chalk.red);
    }

    if (summary.credentialState.missingFiles.length > 0) {
        printMismatchSection(`.secrets files still missing (${summary.credentialState.missingFiles.length})`, summary.credentialState.missingFiles, chalk.red);
    }

    if (summary.credentialState.suggestedMoves.length > 0) {
        printMismatchSection(`Credential files found outside .secrets (${summary.credentialState.suggestedMoves.length})`, summary.credentialState.suggestedMoves, chalk.yellow);
    }

    if (summary.legacyEnvKeys.length > 0) {
        printMismatchSection(`Legacy env keys still present (${summary.legacyEnvKeys.length})`, summary.legacyEnvKeys, chalk.yellow);
    }

    if (summary.nextPublicMatches.length > 0) {
        printMismatchSection(`Legacy code references still present (${summary.nextPublicMatches.length})`, summary.nextPublicMatches, chalk.yellow);
    }

    if (summary.timerIssues.length > 0) {
        printMismatchSection(`Global timer values need attention (${summary.timerIssues.length})`, summary.timerIssues.map((issue) => `${issue.key}: ${issue.message} [current=${String(issue.rawValue)}]`), chalk.red);
    }
}

function printDetailedMismatchView(projectPath: string, framework: FrameworkEnvMode, summary: ReturnType<typeof buildMismatchSummary>) {
    const expectedKeys = getEnvTemplateKeys(framework).map(String);
    const foundSecrets = [
        summary.credentialState.adminSdkPath ? path.relative(projectPath, summary.credentialState.adminSdkPath).replace(/\\/g, '/') : null,
        summary.credentialState.clientSdkPath ? path.relative(projectPath, summary.credentialState.clientSdkPath).replace(/\\/g, '/') : null,
        summary.credentialState.oauthClientPath ? path.relative(projectPath, summary.credentialState.oauthClientPath).replace(/\\/g, '/') : null
    ].filter((value): value is string => !!value);

    console.log(chalk.cyan('\nDetailed mismatch review'));
    console.log(chalk.gray(`Project: ${projectPath}`));
    console.log(chalk.gray(`Framework: ${framework}`));

    printMismatchSection(`Expected .env keys (${expectedKeys.length})`, expectedKeys, chalk.cyan);

    if (foundSecrets.length > 0) {
        printMismatchSection('Credential files currently found', foundSecrets, chalk.green);
    }

    if (summary.credentialState.missingFiles.length > 0) {
        printMismatchSection('Credential files still missing', summary.credentialState.missingFiles, chalk.red);
    }

    if (summary.credentialState.suggestedMoves.length > 0) {
        printMismatchSection('Files that can be auto-moved into .secrets', summary.credentialState.suggestedMoves, chalk.yellow);
    }

    if (!summary.formatCheck.ok && summary.formatCheck.missing.length > 0) {
        printMismatchSection('Missing .env keys', summary.formatCheck.missing, chalk.red);
    }

    if (summary.legacyEnvKeys.length > 0) {
        printMismatchSection('Legacy env keys detected', summary.legacyEnvKeys, chalk.yellow);
    }

    if (summary.nextPublicMatches.length > 0) {
        printMismatchSection('Legacy code references detected', summary.nextPublicMatches, chalk.yellow);
    }

    if (summary.timerIssues.length > 0) {
        printMismatchSection(
            'Invalid global timer values',
            summary.timerIssues.map((issue) => `${issue.key}: ${issue.message} [current=${String(issue.rawValue)}]`),
            chalk.red
        );
    }
}

type MismatchReviewKind =
    | 'env-sync'
    | 'env-setup'
    | 'credential-move'
    | 'credential-missing'
    | 'legacy-env-key'
    | 'next-public-file'
    | 'timer-issue';

interface MismatchReviewItem {
    id: string;
    name: string;
    kind: MismatchReviewKind;
    target?: string;
    detail?: string;
}

function buildMismatchReviewItems(projectPath: string, framework: FrameworkEnvMode, summary: ReturnType<typeof buildMismatchSummary>): MismatchReviewItem[] {
    const items: MismatchReviewItem[] = [];

    if (!summary.formatCheck.ok && summary.formatCheck.missing.length > 0) {
        items.push({
            id: 'env-sync',
            name: `📝 Rebuild .env from credentials (${summary.formatCheck.missing.length})`,
            kind: 'env-sync',
            detail: summary.formatCheck.missing.join(', ')
        });
    }

    for (const file of summary.credentialState.missingFiles) {
        items.push({
            id: `credential-missing:${file}`,
            name: `📁 Missing credential file: ${file}`,
            kind: 'credential-missing',
            target: file,
            detail: 'Open the setup flow and wait for the required files.'
        });
    }

    for (const move of summary.credentialState.suggestedMoves) {
        const [source, destination] = move.split(' -> ');
        items.push({
            id: `credential-move:${source ?? move}`,
            name: `📦 Move credential: ${move}`,
            kind: 'credential-move',
            target: source ?? move,
            detail: destination
        });
    }

    for (const key of summary.legacyEnvKeys) {
        items.push({
            id: `legacy-env-key:${key}`,
            name: `🧹 Remove legacy env key: ${key}`,
            kind: 'legacy-env-key',
            target: key,
            detail: 'Clears legacy Firebase env keys from the project env files.'
        });
    }

    for (const file of summary.nextPublicMatches) {
        items.push({
            id: `next-public-file:${file}`,
            name: `🔁 Replace NEXT_PUBLIC references in: ${file}`,
            kind: 'next-public-file',
            target: file,
            detail: 'Rewrites old NEXT_PUBLIC keys to the new Firebase env names.'
        });
    }

    for (const issue of summary.timerIssues) {
        items.push({
            id: `timer-issue:${issue.key}:${String(issue.rawValue)}`,
            name: `⏱️  ${issue.key}: ${issue.message}`,
            kind: 'timer-issue',
            target: issue.key,
            detail: String(issue.rawValue)
        });
    }

    return items;
}

function buildMismatchReviewChoices(projectPath: string, framework: FrameworkEnvMode, summary: ReturnType<typeof buildMismatchSummary>) {
    const items = buildMismatchReviewItems(projectPath, framework, summary);
    const choices: Array<{ name: string; value: string } | { type: 'separator'; line: string }> = [];

    if (items.length > 0) {
        choices.push({ type: 'separator', line: '--- Actionable mismatches ---' });
        for (const item of items) {
            choices.push({ name: item.name, value: item.id });
        }
    } else {
        choices.push({ type: 'separator', line: '--- No actionable mismatches found ---' });
    }

    choices.push({ type: 'separator', line: '---' });
    choices.push({ name: '🔄 Refresh review', value: '__refresh__' });
    choices.push({ name: '⬅️  Back', value: '__back__' });

    return { items, choices };
}

async function runWithNormalInput<T>(task: () => Promise<T>): Promise<T> {
    io.destroy();
    try {
        return await task();
    } finally {
        io.start();
    }
}

async function promptTimerFix(projectPath: string, item: MismatchReviewItem): Promise<boolean> {
    if (!item.target) {
        return false;
    }

    const issue = SessionTimerManager.getTimerValidationIssues().find((candidate) => candidate.key === item.target);
    if (!issue) {
        return false;
    }

    const timerChoices = item.target === 'forcedReauthAt'
        ? [
            { name: 'Reset to inactive (0)', value: 'reset' },
            { name: '⬅️  Back', value: 'back' }
        ]
        : [
            { name: '1 minute', value: '1' },
            { name: '5 minutes', value: '5' },
            { name: '15 minutes', value: '15' },
            { name: '30 minutes', value: '30' },
            { name: '60 minutes', value: '60' },
            { name: '⬅️  Back', value: 'back' }
        ];

    const choice = await List(
        `Fix timer mismatch\n${issue.key}: ${issue.message}\nCurrent value: ${String(issue.rawValue)}`,
        timerChoices
    );

    if (choice === '__BACK__' || choice === 'back') {
        return false;
    }

    if (item.target === 'forcedReauthAt') {
        SessionTimerManager.updateLocalTimers({ forcedReauthAt: 0 });
        return true;
    }

    const minutes = Number(choice);
    if (!Number.isFinite(minutes) || minutes <= 0) {
        return false;
    }

    SessionTimerManager.updateLocalTimers({
        [item.target]: minutes * 60 * 1000
    } as Partial<ReturnType<typeof SessionTimerManager.getConfig>>);

    return true;
}

async function runMismatchReviewPrompt(projectPath: string, framework: FrameworkEnvMode, summary: ReturnType<typeof buildMismatchSummary>): Promise<void> {
    while (true) {
        const { items, choices } = buildMismatchReviewChoices(projectPath, framework, summary);
        const headerLines = [
            'Detailed mismatch review',
            `Project: ${projectPath}`,
            `Framework: ${framework}`,
            `Use arrows to move, Enter to fix the selected item, and q to return.`
        ];

        const selected = await List(headerLines.join('\n'), choices);
        if (selected === '__BACK__') {
            return;
        }

        if (selected === '__refresh__') {
            summary = buildMismatchSummary(projectPath, framework);
            continue;
        }

        const item = items.find((entry) => entry.id === selected);
        if (!item) {
            continue;
        }

        const fixResult = await (async () => {
            switch (item.kind) {
                case 'env-sync':
                    return await runWithNormalInput(async () => {
                        const { syncProjectCredentialsFromSecrets } = await import('./firebase-credentials');
                        const syncResult = syncProjectCredentialsFromSecrets({ projectPath, framework });
                        if (!syncResult.performed) {
                            const { EnvSetupManager } = await import('../../managers/env-setup');
                            await EnvSetupManager.verifyAndSetupEnv(true);
                        }
                        return true;
                    });
                case 'credential-missing':
                    return await runWithNormalInput(async () => {
                        const { EnvSetupManager } = await import('../../managers/env-setup');
                        await EnvSetupManager.verifyAndSetupEnv(true);
                        return true;
                    });
                case 'credential-move':
                    return await runWithNormalInput(async () => {
                        normalizeCredentialFiles(projectPath);
                        const { syncProjectCredentialsFromSecrets } = await import('./firebase-credentials');
                        syncProjectCredentialsFromSecrets({ projectPath, framework });
                        return true;
                    });
                case 'legacy-env-key':
                    return await runWithNormalInput(async () => {
                        const envFiles = [
                            path.join(projectPath, '.env'),
                            path.join(projectPath, '.env.local'),
                            path.join(projectPath, '.env.example')
                        ];

                        for (const envFile of envFiles) {
                            purgeFirebaseKeysFromEnvFile(envFile);
                        }

                        return true;
                    });
                case 'next-public-file':
                    return await runWithNormalInput(async () => {
                        if (!item.target) return false;
                        replaceNextPublicInFile(path.join(projectPath, item.target));
                        return true;
                    });
                case 'timer-issue':
                    return await promptTimerFix(projectPath, item);
                default:
                    return false;
            }
        })();

        summary = buildMismatchSummary(projectPath, framework);
        if (fixResult) {
            console.log(chalk.green('\n✅ Mismatch item processed. Review refreshed.'));
        } else {
            console.log(chalk.yellow('\nℹ️  No change was applied. Review refreshed.'));
        }
    }
}

function purgeFirebaseKeysFromEnvFile(filePath: string): boolean {
    if (!fs.existsSync(filePath)) return false;
    const original = fs.readFileSync(filePath, 'utf-8');
    const lines = original.split(/\r?\n/);
    const filtered = lines.filter((line) => {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) return true;
        const idx = trimmed.indexOf('=');
        if (idx === -1) return true;
        const key = trimmed.slice(0, idx).trim();
        return !FIREBASE_PURGE_KEYS.has(key);
    });

    const next = filtered.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd();
    fs.writeFileSync(filePath, `${next}${next ? '\n' : ''}`);
    return original !== `${next}${next ? '\n' : ''}`;
}

function purgeFirebaseArtifacts(projectPath: string): { removedFiles: string[]; updatedFiles: string[] } {
    const removedFiles: string[] = [];
    const updatedFiles: string[] = [];
    const candidateFiles = [
        path.join(projectPath, '.env'),
        path.join(projectPath, '.env.local'),
        path.join(projectPath, '.env.example')
    ];

    for (const candidate of candidateFiles) {
        if (purgeFirebaseKeysFromEnvFile(candidate)) {
            updatedFiles.push(path.relative(projectPath, candidate).replace(/\\/g, '/'));
        }
    }

    const credentialFiles = [
        path.join(projectPath, '.secrets', 'admin-sdk.json'),
        path.join(projectPath, '.secrets', 'firebase-sdk.js'),
        path.join(projectPath, '.secrets', 'firebase-sdk.json'),
        path.join(projectPath, '.secrets', 'client-secret-oauth.json'),
        path.join(projectPath, '.secrets', 'client_secret_oauth.json'),
        path.join(projectPath, '.secrets', 'client_secret.json'),
        path.join(projectPath, 'admin-sdk.json'),
        path.join(projectPath, 'firebase-sdk.js'),
        path.join(projectPath, 'firebase-sdk.json'),
        path.join(projectPath, 'firestore-sdk.js'),
        path.join(projectPath, 'client-secret-oauth.json'),
        path.join(projectPath, 'client_secret_oauth.json'),
        path.join(projectPath, 'client_secret.json')
    ];

    for (const candidate of credentialFiles) {
        if (!fs.existsSync(candidate)) continue;
        fs.unlinkSync(candidate);
        removedFiles.push(path.relative(projectPath, candidate).replace(/\\/g, '/'));
    }

    return { removedFiles, updatedFiles };
}

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
    const framework = detectFramework(projectPath);
    let summary = buildMismatchSummary(projectPath, framework);

    while (true) {
        printMismatchSummary(projectPath, framework, summary);
        if (isMismatchResolved(summary)) {
            console.log(chalk.gray('\nNo blocking mismatches detected. Leave as is is safe if you just want to continue.'));
        }

        const choice = await List('What would you like to do?', [
            { name: 'Leave as is', value: 'skip' },
            { name: 'Fix now (open credential setup)', value: 'fix' },
            { name: 'Visualize mismatches', value: 'visualize' },
            { name: 'Purge Firebase and re-transplant', value: 'purge' }
        ]);

        if (choice === 'skip') {
            return;
        }

        if (choice === 'visualize') {
            await runMismatchReviewPrompt(projectPath, framework, summary);
            continue;
        }

        if (choice === 'purge') {
            const purgeResult = purgeFirebaseArtifacts(projectPath);
            if (purgeResult.updatedFiles.length > 0) {
                printMismatchSection('Firebase-related env files reset', purgeResult.updatedFiles, chalk.green);
            }
            if (purgeResult.removedFiles.length > 0) {
                printMismatchSection('Firebase credential files removed', purgeResult.removedFiles, chalk.green);
            }
            if (purgeResult.updatedFiles.length === 0 && purgeResult.removedFiles.length === 0) {
                console.log(chalk.gray('\nNo Firebase credential traces were found to purge.'));
            }

            const { EnvSetupManager } = await import('../../managers/env-setup');
            await EnvSetupManager.verifyAndSetupEnv(true);
            summary = buildMismatchSummary(projectPath, framework);

            if (isMismatchResolved(summary)) {
                console.log(chalk.green('\n✅ Firebase transplant completed and the environment now matches the expected structure.'));
                return;
            }

            console.log(chalk.yellow('\nSome mismatches are still present after the purge/setup flow. Review them below.'));
            continue;
        }

        const { EnvSetupManager } = await import('../../managers/env-setup');
        await EnvSetupManager.verifyAndSetupEnv(true);
        summary = buildMismatchSummary(projectPath, framework);

        if (isMismatchResolved(summary)) {
            console.log(chalk.green('\n✅ Environment setup now matches the expected structure.'));
            return;
        }

        console.log(chalk.yellow('\nSome mismatches are still present after setup. Review them below.'));
    }
}
