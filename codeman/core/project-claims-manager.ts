import admin from 'firebase-admin';
import chalk from 'chalk';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createHash } from 'crypto';
import { fileURLToPath } from 'url';

import { List } from '../components/list';
import { state } from './state';
import { UserConfigManager } from '../config/user-config';
import {
    applyClaimPreset,
    buildPresetClaims,
    ClaimPreset,
    FIRST_PARTY_CLAIM_PRESETS,
    normalizeClaimsShape,
    normalizeImportedPreset,
    parseLooseClaimValue
} from './claims/presets';

type ClaimsManagerOptions = {
    projectRoot: string;
    title?: string;
};

type ClaimsSnapshot = {
    user: admin.auth.UserRecord;
    claims: Record<string, unknown>;
};

type ClaimPresetAction =
    | { kind: 'apply'; preset: ClaimPreset }
    | { kind: 'add'; preset?: ClaimPreset }
    | { kind: 'remove'; preset: ClaimPreset }
    | { kind: 'update'; preset: ClaimPreset }
    | { kind: 'view'; preset: ClaimPreset }
    | { kind: 'export'; preset: ClaimPreset }
    | { kind: 'import'; preset?: ClaimPreset };

type PresetOwnerIdentity = {
    key: string;
    email?: string;
    uid?: string;
    displayName: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const VISHNU_ROOT = process.env.VISHNU_ROOT ? path.resolve(process.env.VISHNU_ROOT) : path.resolve(__dirname, '..', '..');
const PRESET_COLLECTION = 'codemanUserSettings';
const PRESET_EXPORT_VERSION = 1;

function waitForEnter(message = 'Press Enter to continue...') {
    return import('inquirer').then((mod) => mod.default.prompt([
        { type: 'input', name: 'c', message }
    ]));
}

function sanitizeDocKey(input: string): string {
    return createHash('sha1').update(input.toLowerCase()).digest('hex');
}

function resolvePresetOwnerIdentity(): PresetOwnerIdentity {
    const activeUser = state.user || UserConfigManager.getCachedUser();
    if (activeUser?.email || activeUser?.uid) {
        const keySource = String(activeUser.email || activeUser.uid);
        return {
            key: sanitizeDocKey(keySource),
            email: activeUser.email,
            uid: activeUser.uid,
            displayName: activeUser.email || activeUser.uid
        };
    }

    const username = os.userInfo().username || 'local-user';
    return {
        key: sanitizeDocKey(username),
        displayName: username
    };
}

function resolveCredentialCandidates(projectRoot: string): string[] {
    const envCredentialPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
        ? path.isAbsolute(process.env.GOOGLE_APPLICATION_CREDENTIALS)
            ? process.env.GOOGLE_APPLICATION_CREDENTIALS
            : path.resolve(projectRoot, process.env.GOOGLE_APPLICATION_CREDENTIALS)
        : '';

    return [
        envCredentialPath,
        path.join(projectRoot, '.secrets', 'admin-sdk.json'),
        path.join(projectRoot, 'scripts', '.secrets', 'admin-sdk.json'),
        path.join(projectRoot, 'admin-sdk.json')
    ].filter(Boolean);
}

function resolveServiceAccountPath(projectRoot: string): string | null {
    for (const candidate of resolveCredentialCandidates(projectRoot)) {
        if (candidate && fs.existsSync(candidate)) {
            return candidate;
        }
    }
    return null;
}

function loadServiceAccount(serviceAccountPath: string): { serviceAccount: admin.ServiceAccount; projectId: string } {
    const raw = fs.readFileSync(serviceAccountPath, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
        throw new Error(`Invalid service account JSON: ${serviceAccountPath}`);
    }

    return {
        serviceAccount: parsed,
        projectId: parsed.project_id
    };
}

function ensureNamedAdminApp(appName: string, serviceAccountPath: string): admin.app.App {
    const existing = admin.apps.find((app) => app?.name === appName);
    if (existing) {
        return existing;
    }

    const { serviceAccount, projectId } = loadServiceAccount(serviceAccountPath);
    return admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId
    }, appName);
}

function resolveProjectAppName(projectRoot: string): string {
    return `claims-target-${sanitizeDocKey(path.resolve(projectRoot)).slice(0, 12)}`;
}

function resolvePresetStoreAppName(): string {
    return `claims-presets-${sanitizeDocKey(VISHNU_ROOT).slice(0, 12)}`;
}

function formatClaims(claims: Record<string, unknown>): string {
    if (!claims || Object.keys(claims).length === 0) {
        return chalk.gray('(no custom claims)');
    }

    return JSON.stringify(claims, null, 2);
}

function formatPresetChoice(preset: ClaimPreset): string {
    const source = preset.source === 'first-party' ? chalk.cyan('[First party]') : chalk.green('[Custom]');
    const role = preset.role ? ` role=${preset.role}` : '';
    const owner = typeof preset.owner !== 'undefined' ? ` owner=${String(preset.owner)}` : '';
    const opRole = preset.opRole?.length ? ` oprole=${preset.opRole.join(',')}` : '';
    return `${source} ${preset.name}${chalk.gray(` - ${preset.description}${role}${owner}${opRole}`)}`;
}

function normalizeCustomPresetForStorage(preset: ClaimPreset): ClaimPreset {
    return {
        ...preset,
        source: 'custom',
        readonly: false,
        updatedAt: preset.updatedAt || Date.now()
    };
}

async function getProjectAuthContext(projectRoot: string) {
    const serviceAccountPath = resolveServiceAccountPath(projectRoot);
    if (!serviceAccountPath) {
        throw new Error(
            `Missing Firebase Admin credentials. Checked ${resolveCredentialCandidates(projectRoot).map((item) => path.relative(projectRoot, item).replace(/\\/g, '/')).join(', ')}`
        );
    }

    const app = ensureNamedAdminApp(resolveProjectAppName(projectRoot), serviceAccountPath);
    return {
        auth: app.auth(),
        serviceAccountPath,
        projectId: app.options.projectId || loadServiceAccount(serviceAccountPath).projectId
    };
}

async function getPresetStoreContext() {
    const serviceAccountPath = path.join(VISHNU_ROOT, '.secrets', 'admin-sdk.json');
    if (!fs.existsSync(serviceAccountPath)) {
        return null;
    }

    const app = ensureNamedAdminApp(resolvePresetStoreAppName(), serviceAccountPath);
    return {
        firestore: app.firestore(),
        identity: resolvePresetOwnerIdentity()
    };
}

async function resolveClaimsSnapshot(projectRoot: string, identifier: string): Promise<ClaimsSnapshot> {
    const { auth } = await getProjectAuthContext(projectRoot);
    const trimmed = identifier.trim();
    if (!trimmed) {
        throw new Error('Enter a Firebase user UID or email first.');
    }

    const user = trimmed.includes('@')
        ? await auth.getUserByEmail(trimmed)
        : await auth.getUser(trimmed);

    return {
        user,
        claims: normalizeClaimsShape(user.customClaims || {})
    };
}

async function loadCustomPresets(): Promise<{ presets: ClaimPreset[]; warning?: string }> {
    const context = await getPresetStoreContext();
    if (!context) {
        return { presets: [], warning: 'Custom presets are unavailable until Vishnu .secrets/admin-sdk.json is configured.' };
    }

    const snapshot = await context.firestore.collection(PRESET_COLLECTION).doc(context.identity.key).get();
    const data = snapshot.data();
    const rawPresets = Array.isArray(data?.claimPresets) ? data?.claimPresets : [];
    const presets = rawPresets
        .map((item) => normalizeImportedPreset(item as Record<string, unknown>, 'custom'))
        .filter((item): item is ClaimPreset => !!item)
        .map((item) => ({ ...item, source: 'custom' as const, readonly: false }));

    return { presets };
}

async function saveCustomPresets(presets: ClaimPreset[]) {
    const context = await getPresetStoreContext();
    if (!context) {
        throw new Error('Custom preset storage is unavailable because the Vishnu admin SDK credentials are missing.');
    }

    const payload = presets.map((preset) => normalizeCustomPresetForStorage(preset));
    await context.firestore.collection(PRESET_COLLECTION).doc(context.identity.key).set({
        version: PRESET_EXPORT_VERSION,
        ownerEmail: context.identity.email || null,
        ownerUid: context.identity.uid || null,
        displayName: context.identity.displayName,
        updatedAt: Date.now(),
        claimPresets: payload
    }, { merge: true });
}

async function promptIdentifier(defaultValue = ''): Promise<string> {
    const inquirer = (await import('inquirer')).default;
    const answer = await inquirer.prompt([{
        type: 'input',
        name: 'identifier',
        message: 'Active UID or email',
        default: defaultValue
    }]);

    return String(answer.identifier || '').trim();
}

async function promptManualClaimChange(mode: 'set' | 'clear', currentClaims: Record<string, unknown>) {
    const inquirer = (await import('inquirer')).default;
    if (mode === 'clear') {
        const answer = await inquirer.prompt([{
            type: 'input',
            name: 'claimKey',
            message: 'Claim key to clear'
        }]);
        return {
            claimKey: String(answer.claimKey || '').trim()
        };
    }

    const answer = await inquirer.prompt([
        {
            type: 'input',
            name: 'claimKey',
            message: 'Claim key'
        },
        {
            type: 'input',
            name: 'claimValue',
            message: 'Claim value (true/false/number/string/json)',
            default: ''
        }
    ]);

    const claimKey = String(answer.claimKey || '').trim();
    const claimValue = parseLooseClaimValue(answer.claimValue);

    return {
        claimKey,
        nextClaims: normalizeClaimsShape({
            ...currentClaims,
            [claimKey]: claimValue
        })
    };
}

async function confirmClaimsChange(params: {
    label: string;
    currentClaims: Record<string, unknown>;
    nextClaims: Record<string, unknown>;
    targetLabel: string;
}): Promise<boolean> {
    console.clear();
    console.log(chalk.bold.cyan(`👤 ${params.label}`));
    console.log(chalk.gray('------------------------------------------------------------'));
    console.log(chalk.bold('Current claims:'));
    console.log(formatClaims(params.currentClaims));
    console.log('');
    console.log(chalk.bold('New claims:'));
    console.log(formatClaims(params.nextClaims));
    console.log('');

    const inquirer = (await import('inquirer')).default;
    const answer = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: `Apply this change to ${params.targetLabel}?`,
        default: false
    }]);

    return !!answer.confirm;
}

async function applyClaimsChange(projectRoot: string, uid: string, nextClaims: Record<string, unknown>) {
    const { auth } = await getProjectAuthContext(projectRoot);
    await auth.setCustomUserClaims(uid, nextClaims);
}

async function promptCustomPresetEditor(existing?: ClaimPreset): Promise<ClaimPreset | null> {
    const inquirer = (await import('inquirer')).default;
    const extraDefault = existing
        ? JSON.stringify(existing.claims, null, 2)
        : '{}';
    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Preset name',
            default: existing?.name || ''
        },
        {
            type: 'input',
            name: 'description',
            message: 'Description',
            default: existing?.description || ''
        },
        {
            type: 'input',
            name: 'role',
            message: 'role value (optional)',
            default: existing?.role || ''
        },
        {
            type: 'input',
            name: 'owner',
            message: 'owner value (optional: true / false / master / custom string)',
            default: typeof existing?.owner === 'undefined' ? '' : String(existing.owner)
        },
        {
            type: 'input',
            name: 'opRole',
            message: 'oprole values (comma separated)',
            default: existing?.opRole?.join(', ') || ''
        },
        {
            type: 'list',
            name: 'applyMode',
            message: 'How should this preset apply?',
            default: existing?.applyMode || 'managed-merge',
            choices: [
                { name: 'Managed merge (replace role/owner/oprole claims only)', value: 'managed-merge' },
                { name: 'Replace all claims', value: 'replace-all' }
            ]
        },
        {
            type: 'input',
            name: 'extraJson',
            message: 'Extra claims JSON object',
            default: extraDefault
        }
    ]);

    const name = String(answers.name || '').trim();
    if (!name) {
        return null;
    }

    const extraClaims = JSON.parse(String(answers.extraJson || '{}'));
    if (!extraClaims || typeof extraClaims !== 'object' || Array.isArray(extraClaims)) {
        throw new Error('Extra claims JSON must be an object.');
    }

    const claims = buildPresetClaims({
        role: answers.role,
        owner: answers.owner,
        opRole: answers.opRole,
        extraClaims
    });

    const id = existing?.id || `custom-${sanitizeDocKey(`${name}-${Date.now()}`)}`;
    return {
        id,
        name,
        description: String(answers.description || '').trim() || 'Custom claim preset',
        source: 'custom',
        applyMode: answers.applyMode,
        claims,
        role: typeof claims.role === 'string' ? claims.role : undefined,
        owner: typeof claims.owner === 'boolean' || typeof claims.owner === 'string'
            ? claims.owner as boolean | string
            : undefined,
        opRole: Array.isArray(claims.oprole) ? claims.oprole.map((item) => String(item)) : undefined,
        readonly: false,
        updatedAt: Date.now()
    };
}

async function exportPreset(preset: ClaimPreset, projectRoot: string) {
    const inquirer = (await import('inquirer')).default;
    const defaultPath = path.join(projectRoot, `${preset.id}.claim-preset.json`);
    const answer = await inquirer.prompt([{
        type: 'input',
        name: 'filePath',
        message: 'Export path',
        default: defaultPath
    }]);

    const targetPath = path.resolve(projectRoot, String(answer.filePath || defaultPath));
    const payload = {
        version: PRESET_EXPORT_VERSION,
        exportedAt: new Date().toISOString(),
        preset
    };
    fs.writeFileSync(targetPath, `${JSON.stringify(payload, null, 2)}\n`);
    console.log(chalk.green(`\n✅ Exported preset to ${targetPath}`));
    await waitForEnter();
}

async function importPresets(projectRoot: string) {
    const inquirer = (await import('inquirer')).default;
    const answer = await inquirer.prompt([{
        type: 'input',
        name: 'filePath',
        message: 'Import JSON path'
    }]);

    const filePath = path.resolve(projectRoot, String(answer.filePath || '').trim());
    if (!filePath || !fs.existsSync(filePath)) {
        throw new Error(`Import file not found: ${filePath}`);
    }

    const payload = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const rawItems = Array.isArray(payload?.presets)
        ? payload.presets
        : payload?.preset
            ? [payload.preset]
            : Array.isArray(payload)
                ? payload
                : [];

    const imported = rawItems
        .map((item: Record<string, unknown>) => normalizeImportedPreset(item, 'custom'))
        .filter((item): item is ClaimPreset => !!item)
        .map((preset) => ({
            ...preset,
            id: FIRST_PARTY_CLAIM_PRESETS.some((item) => item.id === preset.id)
                ? `imported-${preset.id}-${Date.now()}`
                : preset.id,
            source: 'custom' as const,
            readonly: false,
            updatedAt: Date.now()
        }));

    if (imported.length === 0) {
        throw new Error('No presets were found in that JSON file.');
    }

    const current = await loadCustomPresets();
    const merged = [...current.presets];
    for (const preset of imported) {
        const existingIndex = merged.findIndex((item) => item.id === preset.id);
        if (existingIndex >= 0) {
            merged[existingIndex] = preset;
        } else {
            merged.push(preset);
        }
    }

    await saveCustomPresets(merged);
    console.log(chalk.green(`\n✅ Imported ${imported.length} preset(s).`));
    await waitForEnter();
}

async function runClaimPresetsSubmenu(projectRoot: string, activeIdentifier: string): Promise<ClaimPreset | null> {
    const resolveSelectedPreset = (current: ClaimPresetAction): ClaimPreset => {
        if ('preset' in current && current.preset) {
            return current.preset;
        }
        return FIRST_PARTY_CLAIM_PRESETS[0];
    };

    while (true) {
        const customPresetState = await loadCustomPresets();
        const presets = [
            ...FIRST_PARTY_CLAIM_PRESETS,
            ...customPresetState.presets.sort((a, b) => a.name.localeCompare(b.name))
        ];

        const selection = await List<ClaimPresetAction>(
            [
                '📚 Claim Presets',
                chalk.gray(`Active UID/email: ${activeIdentifier || '(not set)'}`),
                chalk.gray('Enter applies the selected preset. Hotkeys act on the selected preset.')
            ].join('\n'),
            presets.map((preset) => ({
                name: formatPresetChoice(preset),
                value: { kind: 'apply', preset }
            })),
            {
                pageSize: 16,
                keyBindings: [
                    { key: 'a', label: 'add custom', action: () => ({ kind: 'add' }) },
                    { key: 'r', label: 'remove selected', action: (current) => ({ kind: 'remove', preset: resolveSelectedPreset(current) }) },
                    { key: 'u', label: 'update selected', action: (current) => ({ kind: 'update', preset: resolveSelectedPreset(current) }) },
                    { key: 'v', label: 'view selected', action: (current) => ({ kind: 'view', preset: resolveSelectedPreset(current) }) },
                    { key: 'e', label: 'export selected', action: (current) => ({ kind: 'export', preset: resolveSelectedPreset(current) }) },
                    { key: 'i', label: 'import json', action: () => ({ kind: 'import' }) }
                ]
            }
        );

        if (selection === '__BACK__' as any) {
            return null;
        }

        switch (selection.kind) {
            case 'add': {
                try {
                    const preset = await promptCustomPresetEditor();
                    if (!preset) break;
                    const next = [...customPresetState.presets, preset];
                    await saveCustomPresets(next);
                } catch (error: any) {
                    console.log(chalk.red(`\n❌ ${error?.message || error}`));
                    await waitForEnter();
                }
                break;
            }
            case 'remove': {
                if (selection.preset.source !== 'custom') {
                    console.log(chalk.yellow('\nFirst-party presets are built in and cannot be removed.'));
                    await waitForEnter();
                    break;
                }
                await saveCustomPresets(customPresetState.presets.filter((item) => item.id !== selection.preset.id));
                break;
            }
            case 'update': {
                if (selection.preset.source !== 'custom') {
                    console.log(chalk.yellow('\nFirst-party presets are read-only. Create a custom preset if you want to fork one.'));
                    await waitForEnter();
                    break;
                }
                try {
                    const preset = await promptCustomPresetEditor(selection.preset);
                    if (!preset) break;
                    const next = customPresetState.presets.map((item) => item.id === preset.id ? preset : item);
                    await saveCustomPresets(next);
                } catch (error: any) {
                    console.log(chalk.red(`\n❌ ${error?.message || error}`));
                    await waitForEnter();
                }
                break;
            }
            case 'view': {
                console.clear();
                console.log(chalk.bold.cyan(`Preset: ${selection.preset.name}`));
                console.log(chalk.gray('------------------------------------------------------------'));
                console.log(JSON.stringify(selection.preset, null, 2));
                console.log('');
                if (customPresetState.warning) {
                    console.log(chalk.yellow(customPresetState.warning));
                    console.log('');
                }
                await waitForEnter();
                break;
            }
            case 'export': {
                await exportPreset(selection.preset, projectRoot);
                break;
            }
            case 'import': {
                try {
                    await importPresets(projectRoot);
                } catch (error: any) {
                    console.log(chalk.red(`\n❌ ${error?.message || error}`));
                    await waitForEnter();
                }
                break;
            }
            case 'apply':
                return selection.preset;
        }
    }
}

export async function runProjectClaimsManager(options: ClaimsManagerOptions): Promise<void> {
    const title = options.title || 'Project Claims';
    let activeIdentifier = state.user?.uid || state.user?.email || '';

    if (!activeIdentifier) {
        activeIdentifier = await promptIdentifier(activeIdentifier);
    }

    while (true) {
        console.clear();

        let snapshot: ClaimsSnapshot | null = null;
        let claimsError: string | null = null;
        try {
            snapshot = activeIdentifier
                ? await resolveClaimsSnapshot(options.projectRoot, activeIdentifier)
                : null;
        } catch (error: any) {
            claimsError = String(error?.message || error);
        }

        const authContext = await getProjectAuthContext(options.projectRoot).catch((error: any) => ({
            projectId: 'unknown',
            serviceAccountPath: String(error?.message || error)
        }));

        const header = [
            `👤 ${title}`,
            chalk.gray(`Project: ${authContext.projectId}`),
            chalk.gray(`Active UID/email: ${activeIdentifier || '(not set)'}`),
            chalk.gray(`Credentials: ${authContext.serviceAccountPath}`),
            ''
        ];

        if (snapshot) {
            header.push(chalk.bold('Current custom claims'));
            header.push(formatClaims(snapshot.claims));
        } else if (claimsError) {
            header.push(chalk.yellow('Could not load the current claims.'));
            header.push(chalk.gray(claimsError));
        } else {
            header.push(chalk.gray('Set an active UID/email to begin.'));
        }

        const choice = await List(
            header.join('\n'),
            [
                { name: 'Claim Presets', value: 'presets' },
                { name: 'Set Claim (Manual)', value: 'manual-set' },
                { name: 'Clear Claim (Manual)', value: 'manual-clear' },
                { name: 'Change active UID', value: 'change-id' },
                { name: 'Refresh current claims', value: 'refresh' },
                { type: 'separator' as const, line: '──────────────' },
                { name: '⬅️  Back', value: '__BACK__' }
            ],
            { pageSize: 12 }
        );

        if (choice === '__BACK__') {
            return;
        }

        if (choice === 'refresh') {
            continue;
        }

        if (choice === 'change-id') {
            activeIdentifier = await promptIdentifier(activeIdentifier);
            continue;
        }

        if (!activeIdentifier) {
            console.log(chalk.yellow('\nSet an active UID/email first.'));
            await waitForEnter();
            continue;
        }

        if (choice === 'presets') {
            const selectedPreset = await runClaimPresetsSubmenu(options.projectRoot, activeIdentifier);
            if (!selectedPreset) {
                continue;
            }

            try {
                const latestSnapshot = await resolveClaimsSnapshot(options.projectRoot, activeIdentifier);
                const nextClaims = applyClaimPreset(latestSnapshot.claims, selectedPreset);
                const confirmed = await confirmClaimsChange({
                    label: `Apply preset: ${selectedPreset.name}`,
                    currentClaims: latestSnapshot.claims,
                    nextClaims,
                    targetLabel: latestSnapshot.user.email || latestSnapshot.user.uid
                });

                if (confirmed) {
                    await applyClaimsChange(options.projectRoot, latestSnapshot.user.uid, nextClaims);
                    console.log(chalk.green('\n✅ Claim update completed.'));
                    await waitForEnter();
                }
            } catch (error: any) {
                console.log(chalk.red(`\n❌ ${error?.message || error}`));
                await waitForEnter();
            }

            continue;
        }

        if (!snapshot) {
            console.log(chalk.yellow('\nCould not load the current claims for that UID/email.'));
            await waitForEnter();
            continue;
        }

        try {
            if (choice === 'manual-set') {
                const result = await promptManualClaimChange('set', snapshot.claims);
                if (!result.claimKey) {
                    console.log(chalk.yellow('\nClaim key cannot be empty.'));
                    await waitForEnter();
                    continue;
                }

                const confirmed = await confirmClaimsChange({
                    label: `Set claim: ${result.claimKey}`,
                    currentClaims: snapshot.claims,
                    nextClaims: result.nextClaims!,
                    targetLabel: snapshot.user.email || snapshot.user.uid
                });

                if (confirmed) {
                    await applyClaimsChange(options.projectRoot, snapshot.user.uid, result.nextClaims!);
                    console.log(chalk.green('\n✅ Claim update completed.'));
                    await waitForEnter();
                }
                continue;
            }

            if (choice === 'manual-clear') {
                const result = await promptManualClaimChange('clear', snapshot.claims);
                if (!result.claimKey) {
                    console.log(chalk.yellow('\nClaim key cannot be empty.'));
                    await waitForEnter();
                    continue;
                }

                const nextClaims = { ...snapshot.claims };
                delete nextClaims[result.claimKey];
                const normalized = normalizeClaimsShape(nextClaims);
                const confirmed = await confirmClaimsChange({
                    label: `Clear claim: ${result.claimKey}`,
                    currentClaims: snapshot.claims,
                    nextClaims: normalized,
                    targetLabel: snapshot.user.email || snapshot.user.uid
                });

                if (confirmed) {
                    await applyClaimsChange(options.projectRoot, snapshot.user.uid, normalized);
                    console.log(chalk.green('\n✅ Claim update completed.'));
                    await waitForEnter();
                }
                continue;
            }
        } catch (error: any) {
            console.log(chalk.red(`\n❌ ${error?.message || error}`));
            await waitForEnter();
        }
    }
}
