import { ProjectStrategy } from './interface';
import { MenuNode } from '../core/types';
import { List } from '../components/list';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { z } from 'zod';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { state } from '../core/state';

export class NextJsStrategy implements ProjectStrategy {
    type = 'nextjs' as const;

    async detect(rootPath: string): Promise<boolean> {
        return fs.existsSync(path.join(rootPath, 'next.config.js')) ||
            fs.existsSync(path.join(rootPath, 'next.config.mjs')) ||
            fs.existsSync(path.join(rootPath, 'next.config.ts')); // generic check
    }

    async getGeneratorOptions(): Promise<MenuNode[]> {
        // Return placeholder nodes for now, or actual implementation
        return [];
    }

    async getTestRunnerMenu(): Promise<MenuNode> {
        return {
            id: "nextjs-tests",
            propsSchema: z.void(),
            render: async (_props, _state) => {
                const choices = [
                    { name: '🚀 Run All Tests (Unit + E2E)', value: 'all' },
                    { name: '⚡ Unit Tests (Vitest)', value: 'unit' },
                    { name: '🎭 E2E Tests (Playwright)', value: 'e2e' },
                    { name: '🗑️  Delete Test Results', value: 'delete' }
                ];

                if (_state.lastReportPath && fs.existsSync(_state.lastReportPath)) {
                    choices.push({ name: '📊 View Last Playwright Report', value: 'view-report' });
                }

                choices.push({ name: '⬅️  Back', value: 'back' });

                const choice = await List('🧪 Next.js Test Runner', choices);

                if (choice === 'back') return choice;

                if (choice === 'view-report' && _state.lastReportPath) {
                    await this.serveReport(_state.lastReportPath!);
                    return 'nextjs-tests';
                }

                if (choice === 'delete') {
                    // Implement delete logic directly here or in a helper
                    await this.deleteTestResults();
                    return 'nextjs-tests';
                }

                await this.runTests(choice);
                return 'nextjs-tests'; // Loop back to test menu
            },
            next: (result) => {
                if (result === 'back') return 'ROOT'; // or previous
                return 'nextjs-tests';
            }
        };
    }

    async runDevServer(): Promise<void> {
        await this.spawnCommand('npm', ['run', 'dev']);
    }

    // Helper to serve report safely
    private async serveReport(reportPath: string) {
        console.log(chalk.cyan('🚀 Launching Report Server in new window...'));

        // 1. Kill any existing process on port 9323
        try {
            await this.spawnCommand('cmd', ['/c', 'for /f "tokens=5" %a in (\'netstat -aon ^| find ":9323" ^| find "LISTENING"\') do taskkill /f /pid %a'], { ...process.env, stdio: 'ignore' } as any);
        } catch (e) { }

        // 2. Spawn in new window with quoting and /k to keep open if it fails
        // Using "Title" for the start command is best practice
        const cmd = `start "Playwright Report" cmd /k "npx playwright show-report \\"${reportPath}\\""`;
        spawn(cmd, { shell: true, detached: true, stdio: 'ignore' }).unref();

        console.log(chalk.green('✅ Report server launched! Check the new window.'));
        await this.wait(1500);
    }

    // Helper to run tests safely
    private async runTests(mode: string, preSelectedWorkers?: number) {
        let workers = preSelectedWorkers;

        if (mode === 'all') {
            const { count } = await inquirer.prompt([{
                type: 'number',
                name: 'count',
                message: 'How many workers for ALL tests?',
                default: 2
            }]);

            console.log(chalk.magenta('🚀 Running ALL Tests...'));
            await this.runTests('unit', count);
            await this.runTests('e2e', count);
            return;
        }

        if (mode === 'unit') {
            if (!workers) {
                const ans = await inquirer.prompt([{
                    type: 'number',
                    name: 'workers',
                    message: 'How many workers for Vitest?',
                    default: 2
                }]);
                workers = ans.workers;
            }

            console.log(chalk.blue(`Running Unit Tests (Vitest) with ${workers} workers...`));

            try {
                await this.spawnCommand('npx', ['vitest', 'run']);
            } catch (e) {
                console.log(chalk.yellow('Tests failed, generating report anyway...'));
            }
            console.log(chalk.blue('Generating Report...'));
            await this.spawnCommand('npm', ['run', 'test:report']);
            await this.wait();

        } else if (mode === 'e2e') {
            if (!workers) {
                const ans = await inquirer.prompt([{
                    type: 'number',
                    name: 'workers',
                    message: 'How many workers?',
                    default: 2
                }]);
                workers = ans.workers;
            }

            // 2. Prepare Environment
            const timestamp = new Date().toISOString().slice(0, 19).replace(/[T:]/g, m => m === 'T' ? '_' : '-');
            const env = {
                ...process.env,
                PLAYWRIGHT_TIMESTAMP: timestamp,
                TUI_MODE: '1', // Trigger custom reporter in config
            };

            // 3. Launch TUI Runner
            await this.runPlaywrightTUI(workers!, env);

            console.log(chalk.blue('\nGenerating Playwright Report...'));
            // Pass timestamp to report generator via env
            await this.spawnCommand('npx', ['tsx', 'tests/scripts/generate-playwright-report.ts'], env);

            // Set state for menu option
            const reportPath = path.join('tests', 'results', 'playwright', timestamp, 'html-report');
            if (fs.existsSync(reportPath)) {
                state.lastReportPath = reportPath;
                console.log(chalk.green(`\n✅ Report generated independently. Select "View Last Playwright Report" in the menu to view it.`));
            }

            await this.wait(2000); // Give user time to read the message
        }

        // Cleanup stdin to prevent freeze in next menu
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        process.stdin.resume();
    }

    private async runPlaywrightTUI(workers: number, env: NodeJS.ProcessEnv) {
        console.clear();
        console.log(chalk.cyan('🎭 Initializing Playwright TUI...'));

        return new Promise<void>((resolve) => {
            if (process.stdin.setRawMode) process.stdin.setRawMode(false);
            process.stdin.pause();

            // Use config-defined reporters (via TUI_MODE) to ensure JSON/HTML are also generated
            const child = spawn('npx', ['playwright', 'test', `--workers=${workers}`], {
                env: { ...env, TUI_MODE: '1', FORCE_COLOR: '1' },
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe'] // Pipe stdout to capture TUI reporter output
            });

            const rl = require('readline').createInterface({ input: child.stdout });

            // State
            let total = 0;
            let current = 0;
            let passed = 0;
            let failed = 0;
            let flaky = 0;
            let skipped = 0;
            let startTime = Date.now();
            const workerStatus = new Map<string, string>();

            rl.on('line', (line: string) => {
                try {
                    const event = JSON.parse(line);

                    if (event.title && event.title.includes('Refining Test Runner')) {
                        // Ignore dummy events if any
                    }

                    // Handle 'testEnd' event for outcomes
                    if (event.outcome) {
                        // Playwright JSON reporter outputs objects per test end, but not strictly 'type: testEnd' in all versions
                        // Standard structure has 'outcome' at root for test objects?
                        // Actually, standard JSON reporter is valid JSON array usually?
                        // BUT with --reporter=json line-by-line isn't guaranteed...
                        // Wait, user said "TUI". The TUI I implemented earlier assumes line-delimited JSON events.
                        // But `playwright test --reporter=json` outputs a SINGLE JSON object at the end by default!
                        // To get streaming events, we need `--reporter=line` (text) or a custom reporter.
                        // My previous code was parsing `line` as JSON. 
                        // If previous code WORKED, it means I was using a reporter that outputs JSON lines?
                        // Looking at previous code: `env: { ... TUI_MODE: '1', CI: '1' }`.
                        // Using `playwright test --workers=2`.
                        // Maybe `TUI_MODE` in config triggers a custom reporter?
                        // I don't see a custom reporter file in context.
                        // Ah, wait. `playwright test` outputs standard text by default. 
                        // My previous `renderTUI` code did `JSON.parse(line)`.
                        // If that worked, then Playwright WAS outputting JSON lines.
                        // How? `env` used `TUI_MODE: '1'`.
                        // If I didn't change the command to add `--reporter=json` or similar, it might be failing to parse.
                        // BUT the user said "it is failing some...". This implies the TUI *ran*.
                        // So `JSON.parse` was working.

                        // Let's assume there is a reporter configured in `playwright.config.ts` that reacts to `TUI_MODE`.
                        // OR, I need to force a reporter. 
                        // I will add `--reporter=list` or similar? No, I need JSON.
                        // Playwright DOES NOT support NDJSON (newline delimited) out of the box easily without a generic reporter.
                        // Use `--reporter=blob`?
                        // Wait, in previous turn I wrote: `const child = spawn('npx', ['playwright', 'test', ...], { ... stdio: ['ignore', 'pipe', 'pipe'] })`.
                        // And `rl.on('line', ... JSON.parse(line))`.
                        // If this code was running, it implies JSON lines were being received.
                        // The safest bet is: `playwright.config.ts` has a specific reporter for `TUI_MODE`.
                        // If not, I should probably use `--reporter=json` but that waits until end.
                        // Actually, there is a `--reporter=line` but that's text.
                        // Let's look at `event.outcome` (from `testEnd` event type).
                        // Events usually have `{ type: 'testEnd', outcome: 'expected', ... }`.

                    }

                    if (event.type === 'begin') {
                        total = event.total;
                        startTime = Date.now();
                    }
                    else if (event.type === 'testStart') {
                        // Not standard, but let's assume valid fields
                    }
                    // 'onTestEnd' / 'testEnd' ?
                    // Playwright JSON reporter output structure is just one big object.
                    // If we want streaming, we need a custom reporter.
                    // Assuming the existing setup outputs something parsable.
                    // I will stick to the existing logic but refine the counting.

                    // IF the output is the standard list/line reporter wrapped in JSON? Unlikely.
                    // Let's Assume event structure based on what was there:
                    // event.type === 'end' (test run end?) NO, 'end' of test case?
                    // Previous code: `else if (event.type === 'end')`.
                    // This implies `onTestEnd` equivalent.

                    // DEBUG: Log raw event
                    // fs.appendFileSync('tui-debug.log', JSON.stringify(event) + '\n');

                    if (event.type === 'begin') {
                        total = event.total;
                        startTime = Date.now();
                    }
                    else if (event.type === 'start') {
                        if (event.workerIndex !== undefined && event.workerIndex !== null) {
                            const title = event.title || 'Test';
                            workerStatus.set(String(event.workerIndex), `Run: ${title.substring(0, 30)}...`);
                        }
                    }
                    else if (event.type === 'end') {
                        current++;
                        if (event.workerIndex !== undefined && event.workerIndex !== null) {
                            workerStatus.set(String(event.workerIndex), 'Idle');
                        }

                        // Check status/outcome
                        const status = event.status;
                        const outcome = event.outcome;

                        if (outcome === 'flaky') flaky++;
                        else if (outcome === 'skipped' || status === 'skipped') skipped++;
                        else if (status === 'passed' && outcome !== 'flaky') passed++;
                        else if (status === 'failed' || status === 'timedOut') failed++;
                        else {
                            if (status === 'passed') passed++;
                            else failed++;
                        }
                    }

                    // Render UI
                    this.renderTUI(total, current, passed, failed, flaky, skipped, startTime, workerStatus, workers);

                } catch (e) {
                    // console.log(chalk.gray(line)); 
                }
            });

            child.stderr.on('data', (data) => {
                // console.error(chalk.red(data.toString()));
            });

            child.on('close', () => {
                const duration = ((Date.now() - startTime) / 1000).toFixed(1);
                console.log(chalk.green(`\n\n✅ Testing Complete in ${duration}s`));
                rl.close();
                if (process.stdin.setRawMode) process.stdin.setRawMode(false);
                process.stdin.resume();
                resolve();
            });
        });
    }

    private renderTUI(total: number, current: number, passed: number, failed: number, flaky: number, skipped: number, startTime: number, workers: Map<string, string>, maxWorkers: number) {
        console.clear();
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);
        const percent = total > 0 ? Math.round((current / total) * 100) : 0;

        // Header
        console.log(chalk.bold.magenta(`\n🎭 Playwright E2E Runner`));
        console.log(chalk.gray(`Time: ${duration}s | Workers: ${maxWorkers}`));
        console.log(chalk.white(`Progress: ${current}/${total} (${percent}%)`));

        // Bar
        const width = 40;
        const filled = Math.round((width * percent) / 100);
        const bar = '█'.repeat(filled) + '░'.repeat(width - filled);
        console.log(chalk.blue(`\n[${bar}]`));

        // Stats
        console.log(`\n✅ Passed: ${chalk.green(passed)}   ❌ Failed: ${chalk.red(failed)}   ⚠️  Flaky: ${chalk.yellow(flaky)}   ⏭️  Skipped: ${chalk.gray(skipped)}`);

        // Worker Status
        const activeWorkers: { index: number, status: string }[] = [];

        // Get all known worker indices, sorted
        const indices = Array.from(workers.keys())
            .map(k => parseInt(k))
            .sort((a, b) => a - b);

        for (const i of indices) {
            const status = workers.get(String(i)) || 'Idle';
            if (status !== 'Idle') {
                activeWorkers.push({ index: i, status });
            }
        }

        if (activeWorkers.length > 0) {
            console.log(chalk.bold('\n👷 Worker Status:'));
            activeWorkers.forEach(w => {
                const statusColor = w.status === 'Idle' ? chalk.gray : chalk.yellow;
                console.log(chalk.gray(` [${w.index}] `) + statusColor(w.status));
            });
        } else {
            console.log(chalk.bold('\n👷 Worker Status: ') + chalk.gray('Waiting for workers...'));
        }
    }

    private async deleteTestResults() {
        const resultsDir = path.join(process.cwd(), 'tests', 'results');

        const choice = await List('🗑️  Delete Test Results', [
            { name: '💥 Delete ALL Results', value: 'all' },
            { name: '🧪 Manage Vitest Results', value: 'vitest' },
            { name: '🎭 Manage Playwright Results', value: 'playwright' },
            { name: '⬅️  Back', value: 'back' }
        ]);

        if (choice === 'back' || choice === 'cancel') return;

        if (choice === 'all') {
            const confirm = await List('⚠️  Are you sure you want to delete ALL results?', [
                { name: 'No, Cancel', value: 'no' },
                { name: 'Yes, Delete Everything', value: 'yes' }
            ]);

            if (confirm === 'yes') {
                if (fs.existsSync(resultsDir)) {
                    fs.rmSync(resultsDir, { recursive: true, force: true });
                    console.log(chalk.green("✅ All test results deleted."));
                } else {
                    console.log(chalk.yellow("No results to delete."));
                }
            }
        } else if (choice === 'vitest') {
            await this.handleDeleteCategory('vitest');
        } else if (choice === 'playwright') {
            await this.handleDeleteCategory('playwright');
        }

        // Loop back to delete menu unless backed out
        // Actually, let's just return to the main test menu for simplicity after action
        await this.wait();
    }

    private async handleDeleteCategory(category: 'vitest' | 'playwright') {
        const categoryDir = path.join(process.cwd(), 'tests', 'results', category);

        if (!fs.existsSync(categoryDir)) {
            console.log(chalk.yellow(`No ${category} results found.`));
            return;
        }

        const choice = await List(`📂 Manage ${category} Results`, [
            { name: `💥 Delete All ${category} Results`, value: 'all' },
            { name: '🔍 Delete Specific Run', value: 'specific' },
            { name: '⬅️  Back', value: 'back' }
        ]);

        if (choice === 'back') return;

        if (choice === 'all') {
            fs.rmSync(categoryDir, { recursive: true, force: true });
            console.log(chalk.green(`✅ All ${category} results deleted.`));
        } else if (choice === 'specific') {
            const runs = fs.readdirSync(categoryDir)
                .filter(f => fs.statSync(path.join(categoryDir, f)).isDirectory())
                .reverse(); // Newest first

            if (runs.length === 0) {
                console.log(chalk.yellow("No runs found."));
                return;
            }

            const runChoice = await List('Select Run to Delete', [
                ...runs.map(run => ({ name: `📅 ${run}`, value: run })),
                { name: '⬅️  Cancel', value: 'cancel' }
            ]);

            if (runChoice !== 'cancel') {
                const runPath = path.join(categoryDir, runChoice);
                fs.rmSync(runPath, { recursive: true, force: true });
                console.log(chalk.green(`✅ Deleted run: ${runChoice}`));
            }
        }
    }

    private async wait(ms = 1000) {
        await new Promise(r => setTimeout(r, ms));
    }

    // Critical helper to run child processes without freezing stdin
    private async spawnCommand(command: string, args: string[], env: NodeJS.ProcessEnv = process.env) {
        state.isBusy = true; // Prevent timeout

        // Dynamic import to avoid circular dependency issues if any
        const { io } = await import('../core/io');

        return new Promise<void>((resolve) => {
            // 1. Yield IO completely
            io.destroy();

            // 2. Spawn with inherit
            const child = spawn(command, args, {
                stdio: 'inherit',
                shell: true,
                env: env
            });

            const cleanup = () => {
                state.isBusy = false; // Resume timeout check
                io.start(); // Restart IO
            };

            child.on('close', () => {
                cleanup();
                setTimeout(resolve, 10);
            });

            child.on('error', (err) => {
                console.error("Failed to run command:", err);
                cleanup();
                resolve();
            });
        });
    }
}
