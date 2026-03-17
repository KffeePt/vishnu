import inquirer from 'inquirer';
import chalk from 'chalk';
import { createSpinner } from '../components/spinner';
import { ProcessManager } from '../core/process-manager';
import { List } from '../components/list';
import * as fs from 'fs-extra';
import * as path from 'path';

export async function runDevServer(system?: any) {
    console.log(chalk.blue('🚀 Checking ports...'));

    const DEFAULT_PORT = 3000;
    const pidOnPort = await ProcessManager.getPidOnPort(DEFAULT_PORT);

    if (pidOnPort) {
        // Port is busy. Check connectivity/ownership.
        const isOurs = await isMyDevServer(pidOnPort); // We keep this local helper as it's specific

        if (isOurs) {
            console.log(chalk.yellow(`Found existing dev server instance (PID: ${pidOnPort}) for this project.`));
            const spinner = createSpinner('Restarting server (Killing old instance)...').start();
            try {
                await ProcessManager.killByPid(pidOnPort);
                spinner.succeed('Old instance killed.');
                await launchDevServer(DEFAULT_PORT);
            } catch (e: any) {
                spinner.fail(`Failed to kill old instance: ${e.message}`);
                // Proceed to ask user what to do if auto-kill failed
                await handlePortConflict(pidOnPort, DEFAULT_PORT);
            }
        } else {
            // Not ours, show conflict screen
            await handlePortConflict(pidOnPort, DEFAULT_PORT);
        }
    } else {
        // Port is free
        await launchDevServer(DEFAULT_PORT);
    }
}

async function handlePortConflict(pid: string, port: number) {
    // using List component for consistent UI
    const action = await List(`⚠️  Port ${port} is Occupied by Process ID ${pid}.\nSelect an action:`, [
        { name: `☠️  Kill Process (PID ${pid}) and Run Here`, value: 'kill' },
        { name: `⏭️  Start anyways (Scan for next available port)`, value: 'next' },
        { name: `🔢 Manually specify a port`, value: 'manual' },
        { name: `⬅️  Cancel`, value: 'cancel' }
    ]);

    if (action === 'kill') {
        const spinner = createSpinner(`Killing PID ${pid}...`).start();
        try {
            await ProcessManager.killByPid(pid);
            spinner.succeed(`Freed up port ${port}.`);
            await new Promise(r => setTimeout(r, 1000));
            await launchDevServer(port);
        } catch (error: any) {
            spinner.fail(`Failed to kill process: ${error.message}`);
        }
    } else if (action === 'next') {
        const spinner = createSpinner('Scanning for available port...').start();
        const targetPort = await ProcessManager.findNextAvailablePort(port + 1);
        spinner.succeed(`Found available port: ${targetPort}`);
        await new Promise(r => setTimeout(r, 1000));
        await launchDevServer(targetPort);
    } else if (action === 'manual') {
        const { manualPort } = await inquirer.prompt([{
            type: 'number',
            name: 'manualPort',
            message: 'Enter custom port:',
            default: 3001,
            validate: async (input) => {
                if (!input || isNaN(input)) return 'Invalid port';
                if (await ProcessManager.isPortOccupied(input)) return `Port ${input} is also busy.`;
                return true;
            }
        }]);

        if (manualPort) {
            await launchDevServer(manualPort);
        }
    }
}

async function launchDevServer(targetPort: number) {
    // Launch in new window
    const runner = await detectJsRunner(process.cwd());
    const runnerLabel = runner === 'bun' ? 'bun run dev' : 'npm run dev';
    console.log(chalk.green(`\nStarting '${runnerLabel}' on port ${targetPort} in a new window...`));
    console.log(chalk.gray('(This process runs in the background. Check the new window for logs.)'));

    const commandArgs = ['run', 'dev'];
    if (targetPort !== 3000) {
        commandArgs.push('--', '-p', targetPort.toString());
    }

    const npmCmd = `${runner} ${commandArgs.join(' ')}`;

    // Use centralized spawner
    await ProcessManager.spawnDetachedWindow(
        `Triada Dev Server :${targetPort}`,
        npmCmd
    );

    await new Promise(r => setTimeout(r, 2000));
}

async function detectJsRunner(projectRoot: string): Promise<'bun' | 'npm'> {
    try {
        const bunLock = path.join(projectRoot, 'bun.lockb');
        const bunLockText = path.join(projectRoot, 'bun.lock');
        if (await fs.pathExists(bunLock) || await fs.pathExists(bunLockText)) {
            return 'bun';
        }

        const pkgPath = path.join(projectRoot, 'package.json');
        if (await fs.pathExists(pkgPath)) {
            const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
            const pm = typeof pkg.packageManager === 'string' ? pkg.packageManager : '';
            if (pm.startsWith('bun@')) return 'bun';
        }
    } catch { }

    return 'npm';
}

// Use WMIC to check if the process CommandLine contains our CWD
// Kept local as it involves specific logic about "is this MY server"
async function isMyDevServer(pid: string): Promise<boolean> {
    const { exec } = await import('child_process');
    const { promisify } = await import('util');
    const execAsync = promisify(exec);

    try {
        // Warning: WMIC is slow but reliable for full command line
        const { stdout } = await execAsync(`wmic process where "ProcessId=${pid}" get CommandLine /format:list`);
        if (!stdout) return false;

        // Output format: CommandLine=Node.exe ... C:\Users\path...
        // We look for our CWD in the command arguments.
        // Normalize slashes for comparison
        const normalizedOutput = stdout.replace(/\\/g, '/').toLowerCase();
        const normalizedCwd = process.cwd().replace(/\\/g, '/').toLowerCase();

        return normalizedOutput.includes(normalizedCwd);
    } catch {
        // If wmic fails or permissions issues, assume false to be safe
        return false;
    }
}
