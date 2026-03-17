import fs from 'fs';
import path from 'path';
import chalk from 'chalk';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);

interface ProcessEntry {
    type: string;
    pid: number;
    timestamp: number;
}

export class ProcessRegistryManager {
    private static getRegistryPath(projectRoot: string): string {
        return path.join(projectRoot, '.codeman-registry.json');
    }

    private static getLockFilePath(projectRoot: string, type: string): string | null {
        if (type === 'codeman') return path.join(projectRoot, '.codeman.lock');
        if (type === 'shiva') return path.join(projectRoot, '.shiva.lock');
        return null;
    }

    private static ensureGitIgnore(projectRoot: string) {
        const gitIgnorePath = path.join(projectRoot, '.gitignore');

        // If no .gitignore, we don't create one just for this (unless requested? User said "if there is a .gitignore they should be added")
        if (!fs.existsSync(gitIgnorePath)) return;

        let content = fs.readFileSync(gitIgnorePath, 'utf-8');
        const linesToAdd = [
            '.codeman.lock',
            '.shiva.lock',
            '.codeman-registry.json'
        ];
        if (fs.existsSync(path.join(projectRoot, 'bun.lock'))) {
            linesToAdd.push('bun.lock');
        }
        if (fs.existsSync(path.join(projectRoot, 'bun.lockb'))) {
            linesToAdd.push('bun.lockb');
        }

        let modified = false;
        let hasHeader = content.includes('# Codeman Specific');

        // We append missing items
        let appendBlock = '';
        if (!hasHeader) {
            appendBlock += '\n\n# Codeman Specific';
        }

        let needsWrite = false;
        linesToAdd.forEach(line => {
            if (!content.includes(line)) {
                appendBlock += `\n${line}`;
                needsWrite = true;
            }
        });

        if (needsWrite) {
            fs.writeFileSync(gitIgnorePath, content + appendBlock + '\n');
        }
    }

    public static getRegistry(projectRoot: string): ProcessEntry[] {
        const p = this.getRegistryPath(projectRoot);
        if (!fs.existsSync(p)) return [];
        try {
            return JSON.parse(fs.readFileSync(p, 'utf-8'));
        } catch {
            return [];
        }
    }

    public static register(type: string, pid: number, projectRoot: string) {
        this.ensureGitIgnore(projectRoot);

        const registry = this.getRegistry(projectRoot);
        // Remove existing of same type to ensure cleanlyness
        const filtered = registry.filter(e => e.type !== type);
        filtered.push({ type, pid, timestamp: Date.now() });

        try {
            fs.writeFileSync(this.getRegistryPath(projectRoot), JSON.stringify(filtered, null, 2));
        } catch (e) {
            console.error(chalk.red("Failed to write process registry: " + e));
        }

        const lockFile = this.getLockFilePath(projectRoot, type);
        if (lockFile) {
            try {
                fs.writeFileSync(lockFile, pid.toString());
            } catch (e) {
                console.error(chalk.red(`Failed to write ${type} lockfile: ${e}`));
            }
        }
    }

    public static unregister(type: string, projectRoot: string) {
        const registry = this.getRegistry(projectRoot);
        const filtered = registry.filter(e => e.type !== type);
        try {
            fs.writeFileSync(this.getRegistryPath(projectRoot), JSON.stringify(filtered, null, 2));
        } catch (e) { }

        const lockFile = this.getLockFilePath(projectRoot, type);
        if (lockFile && fs.existsSync(lockFile)) {
            try { fs.unlinkSync(lockFile); } catch { }
        }
    }

    public static killConflicting(type: string, projectRoot: string, currentPid: number, silent: boolean = false) {
        const lockFile = this.getLockFilePath(projectRoot, type);
        let pidToKill: number | null = null;

        // 1. Check Lock File
        if (lockFile && fs.existsSync(lockFile)) {
            try {
                const content = fs.readFileSync(lockFile, 'utf-8').trim();
                const parsed = parseInt(content, 10);
                if (!isNaN(parsed)) pidToKill = parsed;
            } catch { }
        }

        // 2. Check Registry if not found
        if (!pidToKill) {
            const registry = this.getRegistry(projectRoot);
            const entry = registry.find(e => e.type === type);
            if (entry) pidToKill = entry.pid;
        }

        if (pidToKill && pidToKill !== currentPid) {
            try {
                process.kill(pidToKill, 0); // Check existence
                if (!silent) {
                    console.log(chalk.yellow(`>>> Stopping previous ${type} instance (PID: ${pidToKill})...`));
                }
                if (process.platform === 'win32') {
                    const { execSync } = require('child_process');
                    execSync(`taskkill /F /PID ${pidToKill}`);
                } else {
                    process.kill(pidToKill, 'SIGTERM');
                }

                // Wait briefly for cleanup
                const start = Date.now();
                while (Date.now() - start < 300) { }

            } catch (e) {
                // Not running or permission issue
            }
        }
    }
}
