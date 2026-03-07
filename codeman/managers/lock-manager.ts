
import fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';

interface LockData {
    [key: string]: {
        pid: number;
        start_time: string;
    }
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

    static async acquire(projectRoot: string, key: string): Promise<boolean> {
        const data = await this.getLockData(projectRoot);
        const pid = process.pid;

        if (data[key]) {
            const oldEntry = data[key];
            const oldPid = oldEntry.pid;

            if (oldPid === pid) {
                // We already own it
                return true;
            }

            // Check if old process is running
            try {
                process.kill(oldPid, 0); // Throws if not running (or no permission)
                console.log(chalk.red(`[LOCK] Key '${key}' is locked by PID ${oldPid}.`));

                // For now, in TypeScript, we'll just fail rather than aggressive killing unless forced.
                // Or we can try to kill it like the PS1 script did.
                console.log(chalk.yellow(`Attempting to kill stale process ${oldPid}...`));
                try {
                    process.kill(oldPid, 'SIGTERM');
                } catch (e) { /* ignore */ }

                await new Promise(r => setTimeout(r, 1000));
            } catch (e) {
                // Not running, safe to overwrite
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
