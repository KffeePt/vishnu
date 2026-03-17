import inquirer from 'inquirer';
import chalk from 'chalk';
import fs from 'fs';
import path from 'path';
import clipboardy from 'clipboardy';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { execSync } from 'child_process';
import { state } from '../../core/state';
import { io } from '../../core/io';
import { initDocsStructure } from '../../singletons/shiva/core/docs-init';
import { runOrganizerCycle } from '../../singletons/shiva/core/organizer';
import { GlobalKeyManager } from '../../managers/global-key-manager';

const TIMESTAMP_PATTERN = /^(.*)_(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})\.md$/;

type DocType = 'pending' | 'spec' | 'audit';

type PromptMode = 'generic' | 'gemini-31' | 'gemini-31-flash-lite' | 'cancel';

function slugify(input: string): string {
    const base = input
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-');
    return base || 'untitled';
}

function formatTimestampCompact(date: Date): string {
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear().toString();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    const ss = pad(date.getSeconds());
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}`;
}

function ensureUniquePath(filePath: string): string {
    if (!fs.existsSync(filePath)) return filePath;
    const ext = path.extname(filePath);
    const base = filePath.slice(0, -ext.length);
    let counter = 2;
    let candidate = `${base}-${counter}${ext}`;
    while (fs.existsSync(candidate)) {
        counter += 1;
        candidate = `${base}-${counter}${ext}`;
    }
    return candidate;
}

function getDocsRoot(): string {
    return path.join(state.project.rootPath || process.cwd(), 'docs');
}

function buildBoilerplate(type: DocType, title: string): string {
    const created = new Date().toISOString();

    if (type === 'pending') {
        return [
            `# Pending Task: ${title}`,
            '',
            `Created: ${created}`,
            'Status: pending',
            '',
            '## Intent',
            '- ',
            '',
            '## Context',
            '- ',
            '',
            '## Next Steps',
            '- ',
            '',
            '## Done When',
            '- '
        ].join('\n');
    }

    if (type === 'audit') {
        return [
            `# Audit: ${title}`,
            '',
            `Created: ${created}`,
            '',
            '## Scope',
            '- ',
            '',
            '## Findings',
            '- ',
            '',
            '## Risks',
            '- ',
            '',
            '## Recommendations',
            '- ',
            '',
            '## Follow-ups',
            '- '
        ].join('\n');
    }

    return [
        `# Spec: ${title}`,
        '',
        '## Summary',
        '- ',
        '',
        '## Goals / Non-goals',
        '- ',
        '',
        '## Design',
        '- ',
        '',
        '## Interfaces / APIs',
        '- ',
        '',
        '## Data Flow',
        '- ',
        '',
        '## Edge Cases',
        '- ',
        '',
        '## Test Plan',
        '- '
    ].join('\n');
}

function buildGenericPrompt(params: {
    type: DocType;
    intent: string;
    filePath: string;
    projectRoot: string;
}): string {
    const { type, intent, filePath, projectRoot } = params;

    const typeLabel = type === 'pending' ? 'Pending Task' : type === 'audit' ? 'Audit' : 'Spec';

    return [
        `You are an agent assisting with documentation in the Vishnu system.`,
        '',
        `Objective: Create a ${typeLabel} based on the intent below.`,
        `Intent: ${intent}`,
        '',
        'Required steps:',
        '1. Review recent git history to understand relevant context (use git log -n 20 --oneline).',
        '2. Check pending task status and related docs (docs/pending and docs/pending/PENDING.md).',
        '3. Scan related source files and summarize any relevant behavior or gaps.',
        '4. Fill out the boilerplate with precise details and concrete next steps.',
        '5. Keep the writing concise and actionable.',
        '',
        `Target file: ${filePath}`,
        `Project root: ${projectRoot}`,
        '',
        'Notes:',
        '- Do not reorganize the file yourself unless instructed; Shiva will handle organization where applicable.',
        '- For specs, ensure the final file lives under docs/specs and follows the structure in docs/specs/SPECS.md.',
        '- For audits, include risk severity and mitigation suggestions.',
        '- For pending tasks, clearly mark done-when criteria and owners if known.',
        ''
    ].join('\n');
}

function getOrganizedPathIfNeeded(docType: DocType, docsRoot: string, fileName: string): string {
    if (docType !== 'audit') return path.join(docsRoot, docType === 'pending' ? 'pending' : 'specs', fileName);

    const match = fileName.match(TIMESTAMP_PATTERN);
    if (!match) return path.join(docsRoot, 'audits', fileName);

    const [, slug, year, month, day, hour, minute, second] = match;
    const folderDate = `${year}-${month}-${day}`;
    const newFilename = `${slug}_${hour}-${minute}-${second}.md`;
    return path.join(docsRoot, 'audits', folderDate, newFilename);
}

function getGitContext(root: string): string {
    try {
        const output = execSync('git log -n 10 --oneline', { cwd: root, stdio: 'pipe' }).toString().trim();
        return output || 'No git history found.';
    } catch {
        return 'No git history found.';
    }
}

function updatePendingIndex(docsRoot: string, title: string, filePath: string) {
    const indexPath = path.join(docsRoot, 'pending', 'PENDING.md');
    if (!fs.existsSync(indexPath)) return;

    const relativePath = path.relative(path.join(docsRoot, 'pending'), filePath).replace(/\\/g, '/');
    const entry = `- [ ] ${title} (${relativePath})`;

    const content = fs.readFileSync(indexPath, 'utf8');
    const startMarker = '<!-- AUTO-GENERATED START -->';
    const endMarker = '<!-- AUTO-GENERATED END -->';
    const startIndex = content.indexOf(startMarker);
    const endIndex = content.indexOf(endMarker);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        return;
    }

    const before = content.slice(0, startIndex + startMarker.length);
    const middle = content.slice(startIndex + startMarker.length, endIndex).trim();
    const after = content.slice(endIndex);

    const lines = middle ? middle.split(/\r?\n/).map(line => line.trim()).filter(Boolean) : [];
    if (!lines.includes(entry)) {
        lines.push(entry);
    }

    const newMiddle = lines.length > 0 ? `\n${lines.join('\n')}\n` : '\nNo pending tasks yet.\n';
    const updated = `${before}${newMiddle}${after}`;
    fs.writeFileSync(indexPath, updated, 'utf8');
}

function removePendingIndexEntry(docsRoot: string, filePath: string) {
    const indexPath = path.join(docsRoot, 'pending', 'PENDING.md');
    if (!fs.existsSync(indexPath)) return;

    const relativePath = path
        .relative(path.join(docsRoot, 'pending'), filePath)
        .replace(/\\/g, '/');
    const markerStart = '<!-- AUTO-GENERATED START -->';
    const markerEnd = '<!-- AUTO-GENERATED END -->';

    const content = fs.readFileSync(indexPath, 'utf8');
    const startIndex = content.indexOf(markerStart);
    const endIndex = content.indexOf(markerEnd);
    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) return;

    const before = content.slice(0, startIndex + markerStart.length);
    const middle = content.slice(startIndex + markerStart.length, endIndex).trim();
    const after = content.slice(endIndex);

    const lines = middle ? middle.split(/\r?\n/).map(l => l.trim()).filter(Boolean) : [];
    const filtered = lines.filter(line => !line.includes(`(${relativePath})`));
    const newMiddle = filtered.length > 0 ? `\n${filtered.join('\n')}\n` : '\nNo pending tasks yet.\n';

    fs.writeFileSync(indexPath, `${before}${newMiddle}${after}`, 'utf8');
}

type DocFile = {
    path: string;
    rel: string;
    mtimeMs: number;
};

function collectDocsFlat(dir: string, docsRoot: string, excludeNames: Set<string>): DocFile[] {
    const results: DocFile[] = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectDocsFlat(fullPath, docsRoot, excludeNames));
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        if (excludeNames.has(entry.name)) continue;
        const stat = fs.statSync(fullPath);
        results.push({
            path: fullPath,
            rel: path.relative(docsRoot, fullPath).replace(/\\/g, '/'),
            mtimeMs: stat.mtimeMs
        });
    }
    return results;
}

function collectDocs(dir: string, docsRoot: string, results: DocFile[], excludeNames: Set<string>) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            collectDocs(fullPath, docsRoot, results, excludeNames);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.md')) continue;
        if (excludeNames.has(entry.name)) continue;
        const stat = fs.statSync(fullPath);
        results.push({
            path: fullPath,
            rel: path.relative(docsRoot, fullPath).replace(/\\/g, '/'),
            mtimeMs: stat.mtimeMs
        });
    }
}

function formatTimestampForDisplay(mtimeMs: number): string {
    const date = new Date(mtimeMs);
    const pad = (n: number) => n.toString().padStart(2, '0');
    const yyyy = date.getFullYear();
    const mm = pad(date.getMonth() + 1);
    const dd = pad(date.getDate());
    const hh = pad(date.getHours());
    const min = pad(date.getMinutes());
    return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function truncate(text: string, max: number): string {
    if (text.length <= max) return text.padEnd(max, ' ');
    if (max <= 3) return text.slice(0, max);
    return text.slice(0, max - 3) + '...';
}

function sortByRecent(items: DocFile[]) {
    return items.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function ensureGeminiKey(): Promise<string | null> {
    const active = GlobalKeyManager.getActive() || process.env.GEMINI_API_KEY;
    if (active && active.trim()) return active.trim();

    const { setKey } = await inquirer.prompt([
        {
            type: 'confirm',
            name: 'setKey',
            message: 'No Gemini API key found. Set one now?',
            default: true
        }
    ]);

    if (!setKey) return null;

    const { alias, newKey } = await inquirer.prompt([
        { type: 'input', name: 'alias', message: 'Key alias (e.g. Personal, Work):', default: 'Default' },
        { type: 'password', name: 'newKey', message: 'Enter Gemini API Key:' }
    ]);

    if (!newKey || !newKey.trim()) return null;

    GlobalKeyManager.pushKey(alias || 'Default', newKey.trim());
    GlobalKeyManager.setActive(newKey.trim());

    return newKey.trim();
}

async function buildPromptWithGemini(modelName: string, params: {
    type: DocType;
    intent: string;
    filePath: string;
    projectRoot: string;
}): Promise<string | null> {
    const apiKey = await ensureGeminiKey();
    if (!apiKey) return null;

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });

    const gitContext = getGitContext(params.projectRoot);

    const prompt = [
        'You are crafting a system prompt for another agent.',
        'The prompt must instruct the agent to create and fill a documentation node in the Vishnu docs system.',
        '',
        `Doc type: ${params.type}`,
        `Intent: ${params.intent}`,
        `Target file path: ${params.filePath}`,
        `Project root: ${params.projectRoot}`,
        '',
        'Context to include:',
        gitContext,
        '',
        'Requirements for the prompt:',
        '- Tell the agent to review recent git history and relevant files.',
        '- Tell the agent to check pending task status and related docs.',
        '- Tell the agent to fill the boilerplate with concrete, actionable detail.',
        '- Tell the agent where to save the final spec (docs/specs) if applicable.',
        '- Keep the prompt concise and operational.',
        '',
        'Return ONLY the prompt text. Do not add commentary.'
    ].join('\n');

    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text();
        return response.trim();
    } catch (e) {
        return null;
    }
}

function resolveFileName(docType: DocType, intent: string, docsRoot: string): { fileName: string; title: string } {
    const title = intent.trim() || 'Untitled';
    const slug = slugify(title);

    if (docType === 'spec') {
        return { fileName: `${slug}.md`, title };
    }

    const baseFolder = docType === 'audit' ? 'audits' : 'pending';
    let attempt = new Date();
    let fileName = `${slug}_${formatTimestampCompact(attempt)}.md`;

    while (fs.existsSync(path.join(docsRoot, baseFolder, fileName))) {
        attempt = new Date(attempt.getTime() + 1000);
        fileName = `${slug}_${formatTimestampCompact(attempt)}.md`;
    }

    return { fileName, title };
}

export async function openPendingIndex(): Promise<void> {
    const docsRoot = getDocsRoot();
    initDocsStructure(docsRoot);

    const pendingPath = path.join(docsRoot, 'pending', 'PENDING.md');
    const inquirer = (await import('inquirer')).default;
    const open = (await import('open')).default;

    if (!fs.existsSync(pendingPath)) {
        console.log(chalk.yellow('Pending index not found. Creating it now...'));
        initDocsStructure(docsRoot);
    }

    try {
        void open(pendingPath, { wait: false, newInstance: true });
        console.log(chalk.green(`Opened: ${pendingPath}`));
    } catch {
        console.log(chalk.yellow('Could not open file automatically.'));
        console.log(chalk.gray(`Path: ${pendingPath}`));
    }

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
}

export async function showRecentDocs(): Promise<void> {
    const docsRoot = getDocsRoot();
    initDocsStructure(docsRoot);

    const excludeNames = new Set(['TASKS.md', 'GIT.md', 'AUDITS.md', 'SPECS.md', 'PENDING.md']);
    const results: DocFile[] = [];

    const folders = ['tasks', 'git', 'audits', 'specs', 'pending'];
    for (const folder of folders) {
        collectDocs(path.join(docsRoot, folder), docsRoot, results, excludeNames);
    }

    results.sort((a, b) => b.mtimeMs - a.mtimeMs);
    const recent = results.slice(0, 15);

    const inquirer = (await import('inquirer')).default;
    const open = (await import('open')).default;

    if (recent.length === 0) {
        console.log(chalk.yellow('No recent doc nodes found yet.'));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
        return;
    }

    const { target } = await inquirer.prompt([
        {
            type: 'list',
            name: 'target',
            message: 'Recent doc nodes:',
            choices: [
                ...recent.map(item => ({
                    name: `${item.rel} (${formatTimestampForDisplay(item.mtimeMs)})`,
                    value: item.path
                })),
                { name: '👈 Back', value: 'back' }
            ]
        }
    ]);

    if (target === 'back') return;

    try {
        void open(target, { wait: false, newInstance: true });
        console.log(chalk.green(`Opened: ${target}`));
    } catch {
        console.log(chalk.yellow('Could not open file automatically.'));
        console.log(chalk.gray(`Path: ${target}`));
    }

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
}

export async function manageDocNodes(): Promise<void> {
    const docsRoot = getDocsRoot();
    initDocsStructure(docsRoot);

    const inquirer = (await import('inquirer')).default;
    const open = (await import('open')).default;

    const { docType } = await inquirer.prompt([
        {
            type: 'list',
            name: 'docType',
            message: 'Manage Doc Nodes:',
            choices: [
                { name: 'Pending Tasks', value: 'pending' },
                { name: 'Specs', value: 'specs' },
                { name: 'Audits', value: 'audits' },
                { name: 'Cancel', value: 'cancel' }
            ]
        }
    ]);

    if (docType === 'cancel') return;

    const folderPath = path.join(docsRoot, docType);
    const excludeNames = new Set(['PENDING.md', 'TASKS.md', 'GIT.md', 'AUDITS.md', 'SPECS.md']);
    const nodes = collectDocsFlat(folderPath, docsRoot, excludeNames).sort((a, b) => b.mtimeMs - a.mtimeMs);

    if (nodes.length === 0) {
        console.log(chalk.yellow('No doc nodes found in this section.'));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
        return;
    }

    const { target } = await inquirer.prompt([
        {
            type: 'list',
            name: 'target',
            message: 'Select a doc node:',
            choices: [
                ...nodes.map(item => ({
                    name: `${item.rel} (${formatTimestampForDisplay(item.mtimeMs)})`,
                    value: item.path
                })),
                { name: '👈 Back', value: 'back' }
            ]
        }
    ]);

    if (target === 'back') return;

    const { action } = await inquirer.prompt([
        {
            type: 'list',
            name: 'action',
            message: 'What do you want to do?',
            choices: [
                { name: '📝 Open in Editor', value: 'open' },
                { name: '🗑️ Delete Node', value: 'delete' },
                { name: '👈 Back', value: 'back' }
            ]
        }
    ]);

    if (action === 'back') return;

    if (action === 'open') {
        try {
            void open(target, { wait: false, newInstance: true });
            console.log(chalk.green(`Opened: ${target}`));
        } catch {
            console.log(chalk.yellow('Could not open file automatically.'));
            console.log(chalk.gray(`Path: ${target}`));
        }

        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
        return;
    }

    if (action === 'delete') {
        const { confirm } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'confirm',
                message: `Delete this doc node?\n${target}`,
                default: false
            }
        ]);

        if (!confirm) return;

        try {
            fs.unlinkSync(target);
            console.log(chalk.green('✅ Doc node deleted.'));
        } catch (e: any) {
            console.log(chalk.red(`Failed to delete: ${e?.message || e}`));
        }

        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
        return;
    }
}

export async function runDocActivityPanel(): Promise<void> {
    const docsRoot = getDocsRoot();
    initDocsStructure(docsRoot);

    const excludeNames = new Set(['PENDING.md', 'TASKS.md', 'GIT.md', 'AUDITS.md', 'SPECS.md']);

    const refreshData = () => {
        const pending = sortByRecent(collectDocsFlat(path.join(docsRoot, 'pending'), docsRoot, excludeNames));
        const specs = sortByRecent(collectDocsFlat(path.join(docsRoot, 'specs'), docsRoot, excludeNames));
        const audits = sortByRecent(collectDocsFlat(path.join(docsRoot, 'audits'), docsRoot, excludeNames));
        const recent = sortByRecent([
            ...pending,
            ...specs,
            ...audits,
            ...collectDocsFlat(path.join(docsRoot, 'tasks'), docsRoot, excludeNames),
            ...collectDocsFlat(path.join(docsRoot, 'git'), docsRoot, excludeNames)
        ]).slice(0, 12);

        return [
            { id: 'pending', title: 'Pending', items: pending },
            { id: 'specs', title: 'Specs', items: specs },
            { id: 'audits', title: 'Audits', items: audits },
            { id: 'recent', title: 'Recent', items: recent }
        ];
    };

    let panels = refreshData();
    let activePanel = 0;
    const selected = panels.map(() => 0);
    const windowStart = panels.map(() => 0);
    let confirmDelete: { panelIndex: number; itemIndex: number } | null = null;

    const render = () => {
        const cols = process.stdout.columns || 120;
        const rows = process.stdout.rows || 30;
        const headerLines = 4;
        const footerLines = 3;
        const availableRows = Math.max(5, rows - headerLines - footerLines);
        const columnGap = 2;
        const panelCount = panels.length;
        const columnWidth = Math.max(20, Math.floor((cols - columnGap * (panelCount - 1)) / panelCount));
        const maxRows = Math.min(availableRows, 14);

        let output = '\x1b[2J\x1b[H';
        output += chalk.bold('📚 Doc Activity Panel') + '\n';
        output += chalk.gray('Use ←/→ to switch panels, ↑/↓ to navigate, Enter to open, D to delete, R to refresh, Q to exit') + '\n';
        output += '\n';

        // Panel headers
        const headerLine = panels.map((panel, idx) => {
            const title = idx === activePanel ? chalk.cyan(panel.title) : chalk.white(panel.title);
            return truncate(title, columnWidth);
        }).join(' '.repeat(columnGap));
        output += headerLine + '\n';
        output += panels.map(() => chalk.dim('─'.repeat(columnWidth))).join(' '.repeat(columnGap)) + '\n';

        for (let row = 0; row < maxRows; row++) {
            const line = panels.map((panel, panelIdx) => {
                const items = panel.items;
                if (items.length === 0) {
                    const emptyLabel = row === 0 ? chalk.dim('(empty)') : '';
                    return truncate(emptyLabel, columnWidth);
                }

                // Ensure selection in range
                if (selected[panelIdx] >= items.length) {
                    selected[panelIdx] = Math.max(0, items.length - 1);
                }

                // Maintain window start
                if (selected[panelIdx] < windowStart[panelIdx]) {
                    windowStart[panelIdx] = selected[panelIdx];
                } else if (selected[panelIdx] >= windowStart[panelIdx] + maxRows) {
                    windowStart[panelIdx] = selected[panelIdx] - maxRows + 1;
                }

                const itemIndex = windowStart[panelIdx] + row;
                if (itemIndex >= items.length) return ''.padEnd(columnWidth, ' ');

                const item = items[itemIndex];
                const label = truncate(item.rel, columnWidth - 2);

                if (panelIdx === activePanel && itemIndex === selected[panelIdx]) {
                    return chalk.cyan(`> ${label}`);
                }
                return `  ${label}`;
            }).join(' '.repeat(columnGap));
            output += line + '\n';
        }

        if (confirmDelete) {
            const panel = panels[confirmDelete.panelIndex];
            const item = panel.items[confirmDelete.itemIndex];
            if (item) {
                output += '\n' + chalk.yellow(`Delete this doc node? (y/n)\n${item.rel}`) + '\n';
            }
        }

        process.stdout.write(output);
    };

    const open = (await import('open')).default;

    return new Promise<void>((resolve) => {
        const cleanup = () => {
            io.release(handler);
        };

        const handler = (key: Buffer, str: string) => {
            const char = str;

            if (confirmDelete) {
                if (char.toLowerCase() === 'y') {
                    const panel = panels[confirmDelete.panelIndex];
                    const item = panel.items[confirmDelete.itemIndex];
                    if (item) {
                        try {
                            fs.unlinkSync(item.path);
                            if (panel.id === 'pending') {
                                removePendingIndexEntry(docsRoot, item.path);
                            }
                        } catch { }
                    }
                    panels = refreshData();
                    confirmDelete = null;
                    render();
                    return;
                }
                if (char.toLowerCase() === 'n' || char === '\u001B') {
                    confirmDelete = null;
                    render();
                    return;
                }
                return;
            }

            if (char === '\u001B[C') { // Right
                activePanel = (activePanel + 1) % panels.length;
                render();
                return;
            }
            if (char === '\u001B[D') { // Left
                activePanel = (activePanel - 1 + panels.length) % panels.length;
                render();
                return;
            }
            if (char === '\u001B[A') { // Up
                const items = panels[activePanel].items;
                if (items.length === 0) return;
                selected[activePanel] = (selected[activePanel] - 1 + items.length) % items.length;
                render();
                return;
            }
            if (char === '\u001B[B') { // Down
                const items = panels[activePanel].items;
                if (items.length === 0) return;
                selected[activePanel] = (selected[activePanel] + 1) % items.length;
                render();
                return;
            }
            if (char === '\r' || char === '\n') {
                const item = panels[activePanel].items[selected[activePanel]];
                if (!item) return;
                try {
                    void open(item.path, { wait: false, newInstance: true });
                } catch { }
                render();
                return;
            }
            if (char.toLowerCase() === 'd') {
                const item = panels[activePanel].items[selected[activePanel]];
                if (!item) return;
                confirmDelete = { panelIndex: activePanel, itemIndex: selected[activePanel] };
                render();
                return;
            }
            if (char.toLowerCase() === 'r') {
                panels = refreshData();
                render();
                return;
            }
            if (char === 'q') {
                cleanup();
                resolve();
                return;
            }
            if (char === '\u0003') {
                cleanup();
                process.exit(0);
            }
        };

        io.enableAlternateScreen();
        io.enableMouse();
        io.consume(handler);
        render();
    });
}

export async function runDocActions(): Promise<void> {
    const docsRoot = getDocsRoot();
    initDocsStructure(docsRoot);

    const { docType } = await inquirer.prompt([
        {
            type: 'list',
            name: 'docType',
            message: 'Doc Actions: What do you want to create?',
            choices: [
                { name: 'Pending Task', value: 'pending' },
                { name: 'Spec', value: 'spec' },
                { name: 'Audit', value: 'audit' },
                { name: 'Cancel', value: 'cancel' }
            ]
        }
    ]);

    if (docType === 'cancel') return;

    const { intent } = await inquirer.prompt([
        {
            type: 'input',
            name: 'intent',
            message: 'Describe the intent (short and clear):',
            validate: (input: string) => (input.trim().length > 0 ? true : 'Intent is required')
        }
    ]);

    const { mode } = await inquirer.prompt([
        {
            type: 'list',
            name: 'mode',
            message: 'How should the prompt be generated?',
            choices: [
                { name: 'Generic prompt (no AI)', value: 'generic' },
                { name: 'Gemini 3.1 (AI)', value: 'gemini-31' },
                { name: 'Gemini 3.1 Flash Lite (AI)', value: 'gemini-31-flash-lite' },
                { name: 'Cancel', value: 'cancel' }
            ]
        }
    ]);

    if (mode === 'cancel') return;

    const projectRoot = state.project.rootPath || process.cwd();
    const { fileName, title } = resolveFileName(docType, intent, docsRoot);

    const baseFolder = docType === 'spec' ? 'specs' : docType === 'audit' ? 'audits' : 'pending';
    const basePath = docType === 'spec'
        ? ensureUniquePath(path.join(docsRoot, baseFolder, fileName))
        : path.join(docsRoot, baseFolder, fileName);

    const boilerplate = buildBoilerplate(docType, title);
    fs.mkdirSync(path.dirname(basePath), { recursive: true });
    fs.writeFileSync(basePath, boilerplate, 'utf8');

    let finalPath = getOrganizedPathIfNeeded(docType, docsRoot, path.basename(basePath));

    if (docType === 'audit') {
        runOrganizerCycle(docsRoot);
    }
    if (docType === 'pending') {
        updatePendingIndex(docsRoot, title, basePath);
    }

    let promptText = buildGenericPrompt({
        type: docType,
        intent,
        filePath: finalPath,
        projectRoot
    });

    if (mode !== 'generic') {
        const modelName = mode === 'gemini-31' ? 'gemini-3.1' : 'gemini-3.1-flash-lite';
        const aiPrompt = await buildPromptWithGemini(modelName, {
            type: docType,
            intent,
            filePath: finalPath,
            projectRoot
        });
        if (aiPrompt) {
            promptText = aiPrompt;
        } else {
            console.log(chalk.yellow('\n⚠️  Gemini prompt failed. Falling back to generic prompt.'));
        }
    }

    console.log(chalk.cyan('\n--- Prompt ---\n'));
    console.log(promptText);
    console.log(chalk.cyan('\n--------------\n'));

    try {
        clipboardy.writeSync(promptText);
        console.log(chalk.green('✅ Prompt copied to clipboard.'));
    } catch {
        console.log(chalk.yellow('⚠️  Failed to copy prompt to clipboard.'));
    }

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
}
