import fs from 'fs-extra';
import * as path from 'path';
import * as readline from 'readline';
import chalk from 'chalk';
import { fileURLToPath } from 'url';
import os from 'os';

// --- Standalone Explorer Class ---

export interface ExplorerOptions {
    basePath?: string;
    onlyDirectories?: boolean;
    title?: string;
    allowedExtensions?: string[];
    validationRules?: any;
    preserveRawMode?: boolean; // New option to prevent disabling raw mode on exit
}

export class StandaloneExplorer {
    private currentPath: string;
    private entries: fs.Dirent[] = [];
    private selectedIndex: number = 0;
    private pageSize: number = 15;
    private errorMessage: string | null = null;
    private options: ExplorerOptions;

    private resolvePromise: ((value: string | null) => void) | null = null;
    private boundKeyHandler: any;

    constructor(options: ExplorerOptions = {}) {
        this.options = options;
        this.currentPath = options.basePath ? path.resolve(options.basePath) : process.cwd();
    }

    public async run(): Promise<string | null> {
        if (!await fs.pathExists(this.currentPath)) {
            console.error(`Path does not exist: ${this.currentPath}`);
            return null;
        }

        await this.loadEntries();

        return new Promise((resolve) => {
            this.resolvePromise = resolve;
            this.render();

            // Setup Input
            // If running in-process (preserveRawMode), use IO Manager to avoid conflict
            // Otherwise use readline directly
            if (this.options.preserveRawMode) {
                import('../core/io').then(({ io }) => {
                    this.boundKeyHandler = (key: Buffer, str: string) => this.handleKeypress(str, { name: '' } as any); // Adapter

                    this.boundKeyHandler = async (key: Buffer, str: string) => {
                        // Manual mapping
                        const valid = this.mapInputToKey(str);
                        if (valid) await this.handleKeypress(str, valid);
                    };
                    io.consume(this.boundKeyHandler);
                });
            } else {
                // Standalone mode
                readline.emitKeypressEvents(process.stdin);
                if (process.stdin.isTTY) process.stdin.setRawMode(true);
                process.stdin.resume();

                this.boundKeyHandler = this.handleKeypress.bind(this);
                process.stdin.on('keypress', this.boundKeyHandler);
            }
        });
    }

    private async loadEntries() {
        try {
            const allEntries = await fs.readdir(this.currentPath, { withFileTypes: true });

            this.entries = allEntries.sort((a, b) => {
                if (a.isDirectory() && !b.isDirectory()) return -1;
                if (!a.isDirectory() && b.isDirectory()) return 1;
                return a.name.localeCompare(b.name);
            });

            const exts = this.options.allowedExtensions || [];

            if (this.options.onlyDirectories) {
                this.entries = this.entries.filter(e => e.isDirectory());
            } else if (exts.length > 0) {
                this.entries = this.entries.filter(e =>
                    e.isDirectory() ||
                    exts.some(ext => e.name.endsWith(ext))
                );
            }
            // Reset index
            this.selectedIndex = 0;
        } catch (error) {
            this.entries = [];
        }
    }

    private async handleKeypress(str: string, key: readline.Key) {
        if (!key) return;

        // Clear error on any key
        if (this.errorMessage) {
            this.errorMessage = null;
            this.render();
        }

        if (key.name === 'up') {
            this.selectedIndex = (this.selectedIndex - 1 + this.entries.length) % this.entries.length;
            this.render();
        } else if (key.name === 'down') {
            this.selectedIndex = (this.selectedIndex + 1) % this.entries.length;
            this.render();
        } else if (key.name === 'right') {
            await this.handleDiveIn();
        } else if (key.name === 'left' || key.name === 'backspace') {
            await this.handleGoUp();
        } else if (key.name === 'return') {
            await this.handleSelectCurrent();
        } else if (key.name === 'h') {
            await this.handleGoHome();
        } else if (key.name === 'escape' || (key.ctrl && key.name === 'c') || key.name === 'q') {
            this.exit(null);
        }
    }

    private async handleDiveIn() {
        const entry = this.entries[this.selectedIndex];
        if (!entry || !entry.isDirectory()) return;

        this.currentPath = path.join(this.currentPath, entry.name);
        await this.loadEntries();
        this.render();
    }

    private async handleGoUp() {
        const parent = path.dirname(this.currentPath);
        if (parent === this.currentPath) return; // Root reached
        this.currentPath = parent;
        await this.loadEntries();
        this.render();
    }

    private async handleGoHome() {
        this.currentPath = os.homedir();
        await this.loadEntries();
        this.render();
    }

    private async handleSelectCurrent() {
        const entry = this.entries[this.selectedIndex];
        // If an entry is selected, use it. Otherwise (empty folder?), use current path.
        const candidatePath = entry ? path.join(this.currentPath, entry.name) : this.currentPath;

        if (this.options.validationRules) {
            if (this.options.validationRules.requiredFile) {
                const subPath = path.join(candidatePath, this.options.validationRules.requiredFile);
                if (!await fs.pathExists(subPath)) {
                    this.errorMessage = `Warning: '${path.basename(candidatePath)}' does not contain '${this.options.validationRules.requiredFile}'`;
                    this.render();
                    return;
                }
            }
        }
        this.exit(candidatePath);
    }

    private mapInputToKey(str: string): any {
        if (str === '\u001B[A') return { name: 'up' };
        if (str === '\u001B[B') return { name: 'down' };
        if (str === '\u001B[C') return { name: 'right' };
        if (str === '\u001B[D') return { name: 'left' };
        if (str === '\r' || str === '\n') return { name: 'return' };
        if (str === '\u001B' || str === 'q') return { name: 'escape' };
        if (str === 'h') return { name: 'h' };
        if (str === '\u0003') return { ctrl: true, name: 'c' };
        if (str === '\u007F' || str === '\b') return { name: 'backspace' };
        return null;
    }

    private exit(resultPath: string | null) {
        // Cleanup listeners
        if (this.boundKeyHandler) {
            if (this.options.preserveRawMode) {
                import('../core/io').then(({ io }) => {
                    io.release(this.boundKeyHandler);
                });
            } else {
                process.stdin.removeListener('keypress', this.boundKeyHandler);
            }
        }

        // Only disable raw mode if NOT asked to preserve it.
        // If we are running inside the Engine, we typically want to preserve it.
        if (!this.options.preserveRawMode && process.stdin.isTTY) {
            try { process.stdin.setRawMode(false); } catch { }
        }

        process.stdout.write('\x1b[H\x1b[2J');

        if (this.resolvePromise) {
            this.resolvePromise(resultPath);
            this.resolvePromise = null;
        }
    }

    private render() {
        let outputBuffer = '';
        const nl = '\n';
        let frame = '\x1B[H\x1B[0J';

        if (this.options.title) {
            frame += chalk.cyan.bold(this.options.title) + nl;
        }

        frame += chalk.yellow(`📂 ${path.basename(this.currentPath) || this.currentPath}`) + nl;
        frame += chalk.dim('─'.repeat(50)) + nl;

        if (this.entries.length === 0) {
            frame += chalk.gray('(Empty directory)') + nl;
        }

        if (this.selectedIndex >= this.entries.length) this.selectedIndex = this.entries.length - 1;
        if (this.selectedIndex < 0) this.selectedIndex = 0;

        const maxVisible = this.pageSize;
        let startIdx = 0;
        let endIdx = this.entries.length;

        if (this.entries.length > maxVisible) {
            const halfWindow = Math.floor(maxVisible / 2);
            startIdx = this.selectedIndex - halfWindow;
            if (startIdx < 0) startIdx = 0;
            if (startIdx + maxVisible > this.entries.length) startIdx = this.entries.length - maxVisible;
            endIdx = startIdx + maxVisible;
        }

        for (let i = startIdx; i < endIdx; i++) {
            const entry = this.entries[i];
            const isSelected = i === this.selectedIndex;
            const icon = entry.isDirectory() ? '📁' : '📄';

            let line = '';
            if (isSelected) {
                line = chalk.green(`❯ ${icon} ${chalk.bold(entry.name)}`);
            } else {
                const style = entry.isDirectory() ? chalk.blue : chalk.white;
                line = `  ${icon} ${style(entry.name)}`;
            }
            frame += line + nl;
        }

        if (this.entries.length > maxVisible) {
            const remaining = this.entries.length - endIdx;
            frame += (remaining > 0 ? chalk.dim(`... (${remaining} more)`) : ' ') + nl;
        }

        frame += chalk.dim('─'.repeat(80)) + nl;
        if (this.errorMessage) {
            frame += chalk.red.bold(`⚠️  ${this.errorMessage}`) + nl;
        }

        const countStr = chalk.gray(`Item ${this.entries.length > 0 ? this.selectedIndex + 1 : 0}/${this.entries.length}`);
        const controls = [`${chalk.bold('↑/↓')}:Nav`, `${chalk.bold('→')}:Open`, `${chalk.bold('←')}:Back`, `${chalk.bold('Enter')}:Select Current`, `${chalk.bold('h')}:Home`, `${chalk.bold('q')}:Quit`].join('  ');
        frame += `${countStr}   ${chalk.dim('|')}   ${chalk.white(controls)}` + nl;

        process.stdout.write(frame);
    }
}

// --- Auto-Run Logic ---
import { fileURLToPath as fURL } from 'url';
const currentFile = fURL(import.meta.url);
const isDirectRun = process.argv[1] === currentFile;

if (isDirectRun) {
    const args = process.argv.slice(2);
    function getArg(name: string): string | undefined {
        const idx = args.indexOf(name);
        return idx !== -1 && idx + 1 < args.length ? args[idx + 1] : undefined;
    }
    const o = getArg('--output');
    if (o) {
        new StandaloneExplorer({
            basePath: getArg('--basePath'),
            onlyDirectories: args.includes('--onlyDirectories'),
            title: getArg('--title'),
            allowedExtensions: getArg('--extensions')?.split(','),
            validationRules: getArg('--validationRules') ? JSON.parse(getArg('--validationRules')!) : undefined
        }).run().then(res => {
            if (res) fs.writeFileSync(o, res, 'utf8');
            else fs.writeFileSync(o, '', 'utf8');
            process.exit(0);
        });
    }
}
