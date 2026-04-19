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
    console.log(chalk.cyan('\nDetailed mismatch review'));
    console.log(chalk.gray(`Project: ${projectPath}`));
    console.log(chalk.gray(`Framework: ${framework}`));

    for (const line of buildMismatchReviewDetailLines(projectPath, framework, summary)) {
        console.log(line);
    }
}

function buildMismatchReviewDetailLines(projectPath: string, framework: FrameworkEnvMode, summary: ReturnType<typeof buildMismatchSummary>): string[] {
    const expectedKeys = getEnvTemplateKeys(framework).map(String);
    const foundSecrets = [
        summary.credentialState.adminSdkPath ? path.relative(projectPath, summary.credentialState.adminSdkPath).replace(/\\/g, '/') : null,
        summary.credentialState.clientSdkPath ? path.relative(projectPath, summary.credentialState.clientSdkPath).replace(/\\/g, '/') : null,
        summary.credentialState.oauthClientPath ? path.relative(projectPath, summary.credentialState.oauthClientPath).replace(/\\/g, '/') : null
    ].filter((value): value is string => !!value);

    const lines: string[] = [];
    const addSection = (title: string, items: string[]) => {
        if (items.length === 0) return;
        lines.push(title);
        for (const item of items) {
            lines.push(` - ${item}`);
        }
        lines.push('');
    };

    addSection(`Expected .env keys (${expectedKeys.length})`, expectedKeys);
    addSection('Credential files currently found', foundSecrets);
    addSection('Credential files still missing', summary.credentialState.missingFiles);
    addSection('Files that can be auto-moved into .secrets', summary.credentialState.suggestedMoves);
    addSection('Missing .env keys', !summary.formatCheck.ok ? summary.formatCheck.missing : []);
    addSection('Legacy env keys detected', summary.legacyEnvKeys);
    addSection('Legacy code references detected', summary.nextPublicMatches);
    addSection(
        'Invalid global timer values',
        summary.timerIssues.map((issue) => `${issue.key}: ${issue.message} [current=${String(issue.rawValue)}]`)
    );

    if (lines.length === 0) {
        lines.push('No actionable mismatches found.');
    }

    return lines;
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

type MismatchReviewEntry =
    | { kind: 'item'; item: MismatchReviewItem; label: string }
    | { kind: 'refresh'; label: string }
    | { kind: 'back'; label: string };

const MISMATCH_REVIEW_BACK = '__BACK__';
const MISMATCH_REVIEW_REFRESH = '__REFRESH__';

function getMismatchReviewKindColor(kind: MismatchReviewKind): typeof chalk.gray {
    switch (kind) {
        case 'env-sync':
        case 'next-public-file':
            return chalk.cyan;
        case 'credential-move':
        case 'legacy-env-key':
            return chalk.yellow;
        case 'credential-missing':
        case 'timer-issue':
            return chalk.red;
        default:
            return chalk.gray;
    }
}

function buildMismatchReviewOverviewLines(summary: ReturnType<typeof buildMismatchSummary>, itemCount: number): string[] {
    const lines: string[] = [];
    lines.push(chalk.gray(`Actionable mismatches: ${itemCount}`));
    lines.push(chalk.gray(`Missing env keys: ${summary.formatCheck.missing.length}`));
    lines.push(chalk.gray(`Missing credential files: ${summary.credentialState.missingFiles.length}`));
    lines.push(chalk.gray(`Suggested credential moves: ${summary.credentialState.suggestedMoves.length}`));
    lines.push(chalk.gray(`Legacy env keys: ${summary.legacyEnvKeys.length}`));
    lines.push(chalk.gray(`Legacy code references: ${summary.nextPublicMatches.length}`));
    lines.push(chalk.gray(`Timer issues: ${summary.timerIssues.length}`));
    return lines;
}

function buildMismatchReviewDetailLinesForItem(projectPath: string, framework: FrameworkEnvMode, summary: ReturnType<typeof buildMismatchSummary>, entry: MismatchReviewEntry): string[] {
    if (entry.kind === 'refresh') {
        return [
            chalk.cyan('Refresh the review list'),
            chalk.gray('Rescans the project after you make a fix so the list stays current.')
        ];
    }

    if (entry.kind === 'back') {
        return [
            chalk.gray('Exit mismatch review'),
            chalk.gray('Returns to the previous menu without changing anything.')
        ];
    }

    const item = entry.item;
    const color = getMismatchReviewKindColor(item.kind);
    const lines: string[] = [color(item.name)];

    if (item.detail) {
        lines.push(chalk.gray(item.detail));
    }

    switch (item.kind) {
        case 'env-sync':
            lines.push(chalk.gray(`Framework: ${framework}`));
            lines.push(chalk.gray(`Project: ${projectPath}`));
            lines.push(chalk.gray(`Will rebuild .env using the credential sources already found.`));
            break;
        case 'credential-missing':
            lines.push(chalk.gray(`Missing file: ${item.target ?? 'unknown'}`));
            lines.push(chalk.gray('Opens the setup flow to wait for the required credential files.'));
            break;
        case 'credential-move':
            lines.push(chalk.gray(`Move target: ${item.target ?? 'unknown'}`));
            lines.push(chalk.gray('Moves the credential into .secrets and then regenerates env files.'));
            break;
        case 'legacy-env-key':
            lines.push(chalk.gray(`Remove key: ${item.target ?? 'unknown'}`));
            lines.push(chalk.gray('Cleans the legacy Firebase env key from .env files.'));
            break;
        case 'next-public-file':
            lines.push(chalk.gray(`Rewrite file: ${item.target ?? 'unknown'}`));
            lines.push(chalk.gray('Replaces NEXT_PUBLIC references with the new canonical Firebase keys.'));
            break;
        case 'timer-issue':
            lines.push(chalk.gray(`Timer key: ${item.target ?? 'unknown'}`));
            lines.push(chalk.gray(`Current value: ${item.detail ?? 'unknown'}`));
            lines.push(chalk.gray('Opens the timer picker so you can repair this value directly.'));
            break;
    }

    if (summary.timerIssues.length === 0 && item.kind !== 'timer-issue') {
        lines.push(chalk.gray('Press Enter to fix the selected item.'));
    }

    return lines;
}

function buildMismatchReviewEntries(items: MismatchReviewItem[]): MismatchReviewEntry[] {
    const entries: MismatchReviewEntry[] = items.map((item) => ({ kind: 'item', item, label: item.name }));
    entries.push({ kind: 'refresh', label: '🔄 Refresh review' });
    entries.push({ kind: 'back', label: '⬅️  Back' });
    return entries;
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
    choices.push({ name: '🔄 Refresh review', value: MISMATCH_REVIEW_REFRESH });
    choices.push({ name: '⬅️  Back', value: MISMATCH_REVIEW_BACK });

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
    let selectedIndex = 0;
    let items = buildMismatchReviewItems(projectPath, framework, summary);
    let entries = buildMismatchReviewEntries(items);
    let windowStart = 0;
    let busy = false;
    let closed = false;
    let resolveExit: (() => void) | null = null;

    const clampSelection = () => {
        if (entries.length === 0) {
            selectedIndex = 0;
            return;
        }

        selectedIndex = Math.max(0, Math.min(selectedIndex, entries.length - 1));
    };

    const refreshReview = () => {
        summary = buildMismatchSummary(projectPath, framework);
        items = buildMismatchReviewItems(projectPath, framework, summary);
        entries = buildMismatchReviewEntries(items);
        clampSelection();
    };

    const formatEntryLabel = (entry: MismatchReviewEntry) => {
        if (entry.kind === 'refresh') {
            return chalk.blueBright(entry.label);
        }

        if (entry.kind === 'back') {
            return chalk.gray(entry.label);
        }

        const color = getMismatchReviewKindColor(entry.item.kind);
        return color(entry.label);
    };

    const render = () => {
        const rows = process.stdout.rows || 25;
        const detailEntry = entries[selectedIndex] ?? entries[0];
        const detailLines = detailEntry ? buildMismatchReviewDetailLinesForItem(projectPath, framework, summary, detailEntry) : [chalk.gray('No mismatches found.')];
        const overviewLines = buildMismatchReviewOverviewLines(summary, items.length);
        const headerLines = 4 + overviewLines.length + 2 + detailLines.length + 2;
        const footerLines = 2;
        const availableRows = Math.max(1, rows - headerLines - footerLines);
        const actualPageSize = Math.min(entries.length || 1, availableRows);

        if (selectedIndex < windowStart) {
            windowStart = selectedIndex;
        } else if (selectedIndex >= windowStart + actualPageSize) {
            windowStart = selectedIndex - actualPageSize + 1;
        }

        if (entries.length <= actualPageSize) {
            windowStart = 0;
        } else if (windowStart + actualPageSize > entries.length) {
            windowStart = Math.max(0, entries.length - actualPageSize);
        }

        const visibleEntries = entries.slice(windowStart, windowStart + actualPageSize);
        let output = '\x1b[2J\x1b[H';

        output += chalk.cyan.bold('Detailed mismatch review') + '\x1b[K\n';
        output += chalk.gray(`Project: ${projectPath}`) + '\x1b[K\n';
        output += chalk.gray(`Framework: ${framework}`) + '\x1b[K\n';
        output += '\x1b[K\n';

        for (const line of overviewLines) {
            output += line + '\x1b[K\n';
        }

        output += '\x1b[K\n';
        output += chalk.bold('Selected mismatch') + '\x1b[K\n';
        for (const line of detailLines) {
            output += line + '\x1b[K\n';
        }

        output += '\x1b[K\n';
        output += chalk.bold('Mismatches') + '\x1b[K\n';
        if (windowStart > 0) {
            output += chalk.gray('  ↑ ...') + '\x1b[K\n';
        }

        visibleEntries.forEach((entry, i) => {
            const actualIndex = windowStart + i;
            const isSelected = actualIndex === selectedIndex;
            const prefix = isSelected ? chalk.cyan('>') : ' ';
            const label = formatEntryLabel(entry);
            output += `${prefix} ${label}` + '\x1b[K\n';
        });

        if (windowStart + actualPageSize < entries.length) {
            output += chalk.gray('  ↓ ...') + '\x1b[K\n';
        }

        output += chalk.dim('\nControls: ↑/↓ move  Enter fix  r refresh  q back') + '\x1b[K\n';
        output += '\x1b[J';
        process.stdout.write(output);
    };

    const onResize = () => {
        render();
    };

    const cleanup = () => {
        if (closed) return;
        closed = true;
        io.release(handler);
        process.stdout.off('resize', onResize);
        resolveExit?.();
    };

    const handler = async (key: Buffer, str: string) => {
        if (busy || closed) return;

        if (str === '\u001B[A') {
            if (entries.length > 0) {
                selectedIndex = (selectedIndex - 1 + entries.length) % entries.length;
                render();
            }
            return;
        }

        if (str === '\u001B[B') {
            if (entries.length > 0) {
                selectedIndex = (selectedIndex + 1) % entries.length;
                render();
            }
            return;
        }

        if (str === 'r' || str === 'R') {
            refreshReview();
            render();
            return;
        }

        if (str === 'q' || str === '\u001B') {
            cleanup();
            return;
        }

        if (str === '\r' || str === '\n') {
            const selectedEntry = entries[selectedIndex];
            if (!selectedEntry) {
                return;
            }

            if (selectedEntry.kind === 'refresh') {
                refreshReview();
                render();
                return;
            }

            if (selectedEntry.kind === 'back') {
                cleanup();
                return;
            }

            busy = true;
            const currentItemId = selectedEntry.item.id;

            try {
                const fixResult = await (async () => {
                    switch (selectedEntry.item.kind) {
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
                                if (!selectedEntry.item.target) return false;
                                replaceNextPublicInFile(path.join(projectPath, selectedEntry.item.target));
                                return true;
                            });
                        case 'timer-issue':
                            return await promptTimerFix(projectPath, selectedEntry.item);
                        default:
                            return false;
                    }
                })();

                refreshReview();
                const nextIndex = entries.findIndex((entry) => entry.kind === 'item' && entry.item.id === currentItemId);
                if (nextIndex >= 0) {
                    selectedIndex = nextIndex;
                } else {
                    clampSelection();
                }

                if (fixResult) {
                    console.log(chalk.green('\n✅ Mismatch item processed. Review refreshed.'));
                } else {
                    console.log(chalk.yellow('\nℹ️  No change was applied. Review refreshed.'));
                }
            } finally {
                busy = false;
                io.consume(handler);
                render();
            }
        }
    };

    io.consume(handler);
    process.stdout.on('resize', onResize);
    render();

    await new Promise<void>((resolve) => {
        resolveExit = resolve;
    });
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
        path.join(projectPath, '.secrets', 'app-check.json'),
        path.join(projectPath, '.secrets', 'stripe.json'),
        path.join(projectPath, '.secrets', 'firebase-sdk.js'),
        path.join(projectPath, '.secrets', 'firebase-sdk.json'),
        path.join(projectPath, '.secrets', 'client-secret-oauth.json'),
        path.join(projectPath, '.secrets', 'client_secret_oauth.json'),
        path.join(projectPath, '.secrets', 'client_secret.json'),
        path.join(projectPath, 'scripts', '.secrets', 'admin-sdk.json'),
        path.join(projectPath, 'scripts', '.secrets', 'app-check.json'),
        path.join(projectPath, 'scripts', '.secrets', 'stripe.json'),
        path.join(projectPath, 'scripts', '.secrets', 'firebase-sdk.js'),
        path.join(projectPath, 'scripts', '.secrets', 'firebase-sdk.json'),
        path.join(projectPath, 'scripts', '.secrets', 'client-secret-oauth.json'),
        path.join(projectPath, 'scripts', '.secrets', 'client_secret_oauth.json'),
        path.join(projectPath, 'scripts', '.secrets', 'client_secret.json'),
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

    if (isMismatchResolved(summary)) {
        return;
    }

    while (true) {
        printMismatchSummary(projectPath, framework, summary);

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
            summary = buildMismatchSummary(projectPath, framework);
            if (isMismatchResolved(summary)) {
                return;
            }
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
