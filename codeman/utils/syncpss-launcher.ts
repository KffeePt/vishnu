import { execFile } from 'child_process';
import { promisify } from 'util';
import chalk from 'chalk';

import { ProcessManager } from '../core/process-manager';

const execFileAsync = promisify(execFile);

async function hasWsl(): Promise<boolean> {
    if (process.platform !== 'win32') {
        return false;
    }

    try {
        await execFileAsync('wsl.exe', ['--status'], { windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

async function hasWslCommand(commandName: string): Promise<boolean> {
    if (!(await hasWsl())) {
        return false;
    }

    try {
        await execFileAsync('wsl.exe', ['bash', '-lc', `command -v ${commandName} >/dev/null 2>&1`], { windowsHide: true });
        return true;
    } catch {
        return false;
    }
}

export async function launchSyncPssInWsl(): Promise<boolean> {
    if (!(await hasWsl())) {
        console.log(chalk.red('\n❌ WSL is not available on this machine.'));
        console.log(chalk.gray('   Install WSL first, then make sure `syncpss` is available inside your default distro.'));
        return false;
    }

    if (!(await hasWslCommand('syncpss'))) {
        console.log(chalk.red('\n❌ `syncpss` was not found inside WSL.'));
        console.log(chalk.gray('   Install it in your WSL environment and ensure it is on PATH.'));
        return false;
    }

    console.log(chalk.blue('\n🚀 Launching `syncpss` in WSL...'));
    await ProcessManager.spawnDetachedWindow('syncpss (WSL)', 'wsl.exe bash -lc syncpss', process.cwd());
    return true;
}
