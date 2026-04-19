
import fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawnSync } from 'child_process';

interface LockData {
    [key: string]: {
        pid: number;
        start_time: string;
    }
}

interface AcquireOptions {
    allowSteal?: boolean;
    autoSteal?: boolean;
}

export class LockManager {

    private static getLockFilePath(projectRoot: string): string {
        return path.join(projectRoot, '.lock.json');
    }

    private static async getLockData(projectRoot: string): Promise<LockData> {
        const p = this.getLockFilePath(projectRoot);
        if (!await fs.pathExists(p)) return {};
        try {
            return await fs.readJson(p);
        } catch {
            return {};
        }
    }

    private static async saveLockData(projectRoot: string, data: LockData) {
        await fs.writeFile(this.getLockFilePath(projectRoot), JSON.stringify(data, null, 2), 'utf-8');
    }

    private static isProcessRunning(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch {
            return false;
        }
    }

    private static async shouldStealLock(key: string, pid: number, startTime?: string): Promise<boolean> {
        const envDecision = (
            process.env.CODEMAN_STEAL_LOCK ??
            process.env.VISHNU_STEAL_LOCK ??
            process.env.STEAL_LOCK
        )?.trim().toLowerCase();

        if (envDecision && ['1', 'true', 'yes', 'y', 'force'].includes(envDecision)) {
            return true;
        }

        if (!process.stdin.isTTY || !process.stdout.isTTY) {
            return false;
        }

        const started = startTime
            ? `\nStarted: ${startTime}`
            : '';

        const { shouldSteal } = await inquirer.prompt([{
            type: 'confirm',
            name: 'shouldSteal',
            message: `Lock '${key}' is owned by PID ${pid}.${started}\nSteal it and terminate that process?`,
            default: false
        }]);

        return shouldSteal;
    }

    private static terminateProcess(pid: number): boolean {
        if (!this.isProcessRunning(pid)) {
            return true;
        }

        if (process.platform === 'win32') {
            const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
                shell: true,
                stdio: 'ignore'
            });
            return result.status === 0 && !this.isProcessRunning(pid);
        }

        try {
            process.kill(pid, 'SIGTERM');
        } catch {
            return !this.isProcessRunning(pid);
        }

        const deadline = Date.now() + 3000;
        while (Date.now() < deadline) {
            if (!this.isProcessRunning(pid)) {
                return true;
            }
        }

        try {
            process.kill(pid, 'SIGKILL');
        } catch {
            return !this.isProcessRunning(pid);
        }

        return !this.isProcessRunning(pid);
    }

    static async acquire(projectRoot: string, key: string, options: AcquireOptions = {}): Promise<boolean> {
        const data = await this.getLockData(projectRoot);
        const pid = process.pid;
        const allowSteal = options.allowSteal ?? false;
        const autoSteal = options.autoSteal ?? false;

        if (data[key]) {
            const oldEntry = data[key];
            const oldPid = oldEntry.pid;

            if (oldPid === pid) {
                // We already own it
                return true;
            }

            if (this.isProcessRunning(oldPid)) {
                console.log(chalk.red(`[LOCK] Action is already running (PID ${oldPid}).`));

                const stealRequested = allowSteal && (
                    autoSteal ||
                    await this.shouldStealLock(key, oldPid, oldEntry.start_time)
                );

                if (!stealRequested) {
                    console.log(chalk.yellow(`Please wait for it to finish or close the other terminal window.`));
                    return false;
                }

                console.log(chalk.yellow(`[LOCK] Stealing '${key}' from PID ${oldPid}...`));
                if (!this.terminateProcess(oldPid)) {
                    console.log(chalk.red(`[LOCK] Failed to terminate PID ${oldPid}. Lock not stolen.`));
                    return false;
                }

                console.log(chalk.green(`[LOCK] Previous owner terminated. Continuing with stolen lock.`));
            } else {
                console.log(chalk.gray(`[LOCK] Stale lock found for '${key}' (PID ${oldPid}). Overwriting.`));
            }
        }

        data[key] = {
            pid: pid,
            start_time: new Date().toISOString()
        };

        await this.saveLockData(projectRoot, data);
        console.log(chalk.green(`[LOCK] Acquired '${key}'`));
        return true;
    }

    static async release(projectRoot: string, key: string): Promise<void> {
        const data = await this.getLockData(projectRoot);
        const pid = process.pid;

        if (data[key] && data[key].pid === pid) {
            delete data[key];
            await this.saveLockData(projectRoot, data);
            console.log(chalk.green(`[LOCK] Released '${key}'`));
        }
    }
}
