import { spawn } from 'child_process';
import chalk from 'chalk';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Singleton promise to prevent double restarts
let restartPromise: Promise<void> | null = null;

// Allow restarting into a specific node (e.g. 'mode-selector')
export async function restartCLI(startNode?: string): Promise<void> {
    if (restartPromise) return restartPromise;

    // We assign the async operation to the singleton promise
    restartPromise = (async () => {
        // Release input control via IO Manager
        const { io } = await import('./io');
        io.clear(); // Clear screen to prevent text leakage
        console.log(chalk.yellow('\n🔄 Reloading CLI...\n'));
        io.destroy();

        // ---------------------------------------------------------
        // LOCK HANDOFF FIX (Silent)
        // ---------------------------------------------------------
        const fs = await import('fs');
        const lockFile = path.join(process.cwd(), '.codeman.lock');

        // We must release the lock NOW so the child process can acquire it.
        if (fs.existsSync(lockFile)) {
            try {
                fs.unlinkSync(lockFile);
            } catch (e: any) {
                // Only log errors, not success
                console.log(chalk.red(`Failed to remove lock file: ${e.message}`));
            }
        }
        // ---------------------------------------------------------

        const cliEntry = path.resolve(__dirname, '../interactive-cli.ts');
        const args = ['tsx', cliEntry];
        if (startNode) {
            args.push(startNode);
        }

        // Return the promise that waits for the child process
        return new Promise<void>((resolve, reject) => {
            const child = spawn('npx', args, {
                stdio: 'inherit',
                shell: true, // Required for npx on Windows
                // Keep current CWD so we stay in the project context
                cwd: process.cwd(),
                env: {
                    ...process.env,
                    FORCE_COLOR: '1',
                    CODEMAN_RESTART_FROM_MENU: 'true'
                }
            });

            // Parent waits for child to exit.
            child.on('close', (code) => {
                if (code === 0) {
                    resolve();
                } else {
                    // If child crashed, we might want to know
                    console.error(chalk.red(`\nCLI Child process exited with code ${code}`));
                    process.exit(code || 1);
                }
            });

            child.on('error', (err) => {
                console.error("Failed to restart:", err);
                reject(err);
            });
        });
    })();

    return restartPromise;
}
