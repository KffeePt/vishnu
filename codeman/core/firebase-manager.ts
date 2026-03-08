import { MenuNode } from './types';
import { z } from 'zod';
import { List } from '../components/list';
import chalk from 'chalk';
import { spawn, exec } from 'child_process';
import inquirer from 'inquirer';
import { GlobalStateManager } from '../managers/global-state-manager';
import path from 'path';
import dotenv from 'dotenv';
import fs from 'fs';
import { io } from './io';

// Cache the CLI check so it doesn't run every time the menu renders
let hasCheckedCLI = false;
const globalState = new GlobalStateManager();

export const FirebaseManagerMenu: MenuNode = {
    id: 'firebase-manager',
    propsSchema: z.void(),
    render: async (_props, _state) => {
        // Safe check for Firebase CLI (Cached)
        if (!hasCheckedCLI) {
            await ensureFirebaseCLI();
            hasCheckedCLI = true;
        }

        // Get Current Context
        const currentPath = process.cwd();
        const projectEnv = dotenv.parse(fs.existsSync('.env') ? fs.readFileSync('.env') : '');
        const currentProjectId = projectEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID || projectEnv.FIREBASE_PROJECT_ID || 'Unknown';
        const currentUser = await getCurrentUserEmail() || 'Not Logged In';

        console.log(chalk.blue(`\n[ Context: ${chalk.bold(currentProjectId)} | User: ${chalk.bold(currentUser)} ]`));
        console.log(chalk.gray(`Path: ${currentPath}`));

        const action = await List('🔥 Firebase Manager', [
            { name: '🔄 Switch Project / Context', value: 'switch-project' },
            { name: '👤 Manage Accounts (Login/Logout)', value: 'manage-accounts' },
            { name: '🔗 Link Current Directory as Project', value: 'link-project' },
            { name: '🔍 Check Status (firebase use)', value: 'context' },
            new inquirer.Separator() as any,
            { name: '🔥 Deploy Firestore Rules', value: 'deploy-firestore' },
            { name: '💾 Deploy Storage Rules', value: 'deploy-storage' },
            { name: '🗄️  Deploy RTDB Rules', value: 'deploy-rtdb' },
            { name: '⬅️  Back to Main Menu', value: 'back' }
        ]);

        if (action === 'back') return 'ROOT';

        try {
            switch (action) {
                case 'context':
                    await runFirebaseCommand(['use']);
                    break;
                case 'link-project':
                    await handleLinkProject(currentPath, currentProjectId);
                    break;
                case 'switch-project':
                    await handleSwitchProject();
                    return 'ROOT'; // Return to root to trigger full refresh/header update? Or stay here?
                // Ideally stay here but with updated context.
                case 'manage-accounts':
                    await handleManageAccounts();
                    break;
                case 'deploy-firestore':
                    await runFirebaseCommand(['deploy', '--only', 'firestore:rules']);
                    break;
                case 'deploy-storage':
                    await runFirebaseCommand(['deploy', '--only', 'storage']);
                    break;
                case 'deploy-rtdb':
                    await runFirebaseCommand(['deploy', '--only', 'database']);
                    break;
            }
        } catch (e) {
            console.log(chalk.red('\n❌ Command failed.'));
            console.log(chalk.gray(e));
        }

        console.log(chalk.gray('\nPress any key to continue...'));
        await new Promise(resolve => {
            const handler = (key: Buffer, str: string) => {
                io.release(handler);
                resolve(null);
            };
            io.consume(handler);
        });

        return 'firebase-manager';
    },
    next: (result) => result === 'ROOT' ? 'ROOT' : 'firebase-manager'
};

async function handleLinkProject(currentPath: string, currentProjectId: string) {
    const alias = await inquirer.prompt([{
        type: 'input',
        name: 'val',
        message: 'Enter an alias for this project:',
        default: currentProjectId !== 'Unknown' ? currentProjectId : path.basename(currentPath)
    }]).then(a => a.val);

    globalState.registerProject({
        alias,
        path: currentPath,
        envPath: path.join(currentPath, '.env'),
        lastUsed: new Date().toISOString(),
        projectId: currentProjectId
    });
    console.log(chalk.green(`✅ Project linked as "${alias}"`));
}

async function handleSwitchProject() {
    const projects = globalState.getAllProjects();
    if (projects.length === 0) {
        console.log(chalk.yellow("No linked projects found. Use 'Link Current Directory' first."));
        return;
    }

    const selection = await List('Select Project to Switch To', [
        ...projects.map(p => ({
            name: `${p.alias} (${chalk.gray(p.projectId || 'No ID')})`,
            value: p.path
        })),
        { name: '⬅️ Cancel', value: 'cancel' }
    ]);

    if (selection !== 'cancel') {
        const target = projects.find(p => p.path === selection);
        if (target) {
            console.log(chalk.blue(`Switching to ${target.alias}...`));
            try {
                process.chdir(target.path);
                // Force reload env?
                // Dotenv doesn't easily un-set, but we can overwrite.
                const newEnvPath = path.join(target.path, '.env');
                if (fs.existsSync(newEnvPath)) {
                    const newEnv = dotenv.parse(fs.readFileSync(newEnvPath));
                    for (const k in newEnv) {
                        process.env[k] = newEnv[k];
                    }
                    console.log(chalk.green(`Loaded environment for ${target.alias}.`));
                }

                // Update Global State
                globalState.setLastActive(target.path);

                // Run firebase use
                if (target.projectId && target.projectId !== 'Unknown') {
                    await runFirebaseCommand(['use', target.projectId]);
                }
            } catch (err) {
                console.log(chalk.red(`Failed to switch context: ${err}`));
            }
        }
    }
}

async function handleManageAccounts() {
    const action = await List('Account Management', [
        { name: 'Login (Add Account)', value: 'login' },
        { name: 'Logout', value: 'logout' },
        { name: 'Check Status', value: 'status' },
        { name: '⬅️ Back', value: 'back' }
    ]);

    if (action === 'login') {
        console.log(chalk.cyan('\n> firebase login (Automating prompts: No Telemetry, Yes Gemini)\n'));
        const loginCmd = process.platform === 'win32'
            ? 'cmd /c "(echo n & echo Y) | firebase login --interactive"'
            : 'printf "n\\nY\\n" | firebase login --interactive';
        await runCommand(loginCmd);
    } else if (action === 'logout') {
        await runFirebaseCommand(['logout']);
    } else if (action === 'status') {
        await runFirebaseCommand(['login:list']); // or login just to see
    }
}

async function getCurrentUserEmail(): Promise<string | null> {
    return new Promise((resolve) => {
        exec('firebase login:list', (err, stdout) => {
            // Stdout is messy or not supported for list in json?
            // Actually 'firebase login' shows status.
            // Let's try parsing 'firebase login' output
            if (err) {
                // Maybe not logged in
                resolve(null);
                return;
            }
            // Resolving null for now as parsing is tricky without structured output
            // But we can try to find an email
            const match = stdout.match(/([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9._-]+)/);
            if (match) resolve(match[1]);
            else resolve(null);
        });
    });
}
// ... ensureFirebaseCLI and runFirebaseCommand helpers remain same ...

async function ensureFirebaseCLI() {
    try {
        await runCommandSilent('firebase --version');
    } catch {
        console.clear();
        console.log(chalk.yellow("⚠️  Firebase CLI not found."));
        const { install } = await inquirer.prompt([{
            type: 'confirm',
            name: 'install',
            message: 'Do you want to install firebase-tools globally now?',
            default: true
        }]);

        if (install) {
            console.log(chalk.blue("📦 Installing firebase-tools..."));
            await runCommand('npm install -g firebase-tools');
            console.log(chalk.green("✅ Installed!"));
            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.log(chalk.red("❌ Cannot proceed without Firebase CLI."));
            throw new Error("Firebase CLI missing");
        }
    }
}

async function runFirebaseCommand(args: string[]) {
    console.log(chalk.cyan(`\n> firebase ${args.join(' ')}\n`));
    await runCommand(`firebase ${args.join(' ')}`);
}

function runCommand(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
        if (process.stdin.setRawMode) process.stdin.setRawMode(false);
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        const child = spawn(cmd, args, {
            stdio: 'inherit',
            shell: true
        });

        child.on('close', (code) => {
            if (process.stdin.setRawMode) process.stdin.setRawMode(true);
            process.stdin.resume();
            if (code === 0) resolve();
            else reject(new Error(`Command exited with code ${code}`));
        });

        child.on('error', (err) => {
            if (process.stdin.setRawMode) process.stdin.setRawMode(true);
            process.stdin.resume();
            reject(err);
        });
    });
}

function runCommandSilent(command: string): Promise<void> {
    return new Promise((resolve, reject) => {
        const parts = command.split(' ');
        const cmd = parts[0];
        const args = parts.slice(1);

        const child = spawn(cmd, args, {
            stdio: 'ignore',
            shell: true
        });

        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject();
        });
        child.on('error', reject);
    });
}

