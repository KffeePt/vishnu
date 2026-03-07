import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import inquirer from 'inquirer';
import { exec, spawn } from 'child_process';
import * as util from 'util';

const execAsync = util.promisify(exec);

export class FirebaseContextManager {
    static async getLocalEnvProjectId(): Promise<string | null> {
        const envPath = path.join(process.cwd(), '.env');

        if (fs.existsSync(envPath)) {
            const content = fs.readFileSync(envPath, 'utf-8');
            // Simple regex to find the key
            const match = content.match(/^(?:NEXT_PUBLIC_)?FIREBASE_PROJECT_ID=(.*)$/m);
            if (match && match[1]) {
                return match[1].trim();
            }
        }
        return null;
    }

    static async getFirebaseCliState(): Promise<{ user: string | null, project: string | null }> {
        try {
            // Helper to strip ANSI codes
            const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');

            // Check Login
            let user = null;
            try {
                // Reverted --no-colors as it is not supported by all firebase versions
                const { stdout: loginOut } = await execAsync('firebase login:list', { timeout: 15000 });
                const cleanLogin = stripAnsi(loginOut).trim();
                // "Logged in as user@example.com"
                const userMatch = cleanLogin.match(/Logged in as (.*)/);
                if (userMatch) {
                    user = userMatch[1].trim();
                } else if (cleanLogin.includes('No users logged in')) {
                    user = null;
                }
            } catch (e: any) {
                console.error(chalk.red(`[Debug] Login Check Failed: ${e.message}`));
                // If error, assume not logged in or CLI issue
                user = null;
            }

            // Check Active Project
            let project = null;
            try {
                const { stdout: useOut } = await execAsync('firebase use', { timeout: 8000 });
                const cleanUse = stripAnsi(useOut).trim();

                // Match "Active Project: alias (project-id)" or "Active Project: project-id"
                const standardMatch = cleanUse.match(/Active Project:\s*(?:[^\s]+\s+\((.*)\)|([^\s]+))/);

                if (standardMatch) {
                    project = standardMatch[1] || standardMatch[2]; // Captures id from (id) or raw id
                    project = project?.trim() || null;
                } else if (/^[a-z0-9-]+$/.test(cleanUse) && cleanUse !== 'default' && !cleanUse.includes('No active project')) {
                    // Fallback for just ID output
                    project = cleanUse;
                }

                if (project === 'default') project = 'default';

            } catch (e: any) {
                // console.error(chalk.yellow(`[Debug] Project Check Failed: ${e.message}`));
                // Ignore
            }

            return { user, project };

        } catch (error) {
            return { user: null, project: null };
        }
    }

    /**
     * Interactive loop to verify and ensure the Firebase CLI context (user and project) 
     * matches the expectations (or at least is valid).
     * 
     * @param targetProjectId - Optional explicit project ID to enforce. If not provided, it tries to read from .env.
     */
    static async checkContext(targetProjectId?: string) {
        // Dynamic import to avoid circular dependency issues if any, keeping it clean
        const { GlobalStateManager } = await import('./global-state-manager');
        const manager = new GlobalStateManager();
        const currentPath = process.cwd();

        // 1. Get Local .env ID if not passed
        let targetId = targetProjectId || 'None';
        if (!targetProjectId) {
            const localId = await this.getLocalEnvProjectId();
            if (localId) targetId = localId;
        }

        // 2. Refresh Firebase CLI State loop
        while (true) {
            // console.clear(); // Removing aggressive clear to prevent flicker
            console.log(chalk.bold.blue('\n🔍 Context Check'));
            console.log(chalk.gray('   Verifying environment consistency...'));

            const fbState = await this.getFirebaseCliState();

            const isFbMismatch = (fbState.project && fbState.project !== targetId);
            const isUserMissing = !fbState.user;

            const tableOutput = `
   ${chalk.bold('System State')}
   ${'─'.repeat(55)}
   ${chalk.bold('Scope'.padEnd(20))} | ${chalk.bold('Value')}
   ${'─'.repeat(55)}
   ${'Local Project'.padEnd(20)} | ${targetId}
   ${'Path'.padEnd(20)} | ${currentPath}
   ${'─'.repeat(55)}
   ${'Firebase Project'.padEnd(20)} | ${fbState.project || 'None'}
   ${'Firebase User'.padEnd(20)} | ${fbState.user || 'Not Logged In'}
   ${'─'.repeat(55)}
`;

            // Copy to clipboard (strip ansi first)
            const stripAnsi = (str: string) => str.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '');
            const cleanTable = stripAnsi(tableOutput);
            try {
                // Native Windows copy
                const { execSync } = await import('child_process');
                execSync('clip', { input: cleanTable });
            } catch (e) { }

            // Print Table with Colors
            console.log(tableOutput);

            // Auto-break if everything is perfect?
            // "The auth is not triggering correctly... instantly goes to session menu"
            // If we are logged in AND (project matches OR target is None), and user didn't request a mandatory check...
            // But this function IS the mandatory check.
            // If we automate the exit, we might skip the user seeing the status.
            // However, for "Resume Session", if everything is green, we probably just want to notify and proceed.

            /* 
               AUTO-PROCEED LOGIC:
               If User IS logged in AND
               (Project Matches Target OR Target is None)
               -> Proceed automatically?
               
               Current User Feedback implies they WANT to be forced to authenticate if MISSING.
               So if NOT Missing, we can maybe skip the prompt?
               Let's keep the prompt for now unless we implement an explicit "autoProceedIfValid" flag.
               Actually, for better UX:
               If (User && (Match || NoTarget)), maybe just return?
            */

            // Let's implement smart auto-proceed so we don't annoy users who are already set up.
            if (!isUserMissing && (!isFbMismatch || targetId === 'None')) {
                // All good!
                // console.log(chalk.green('   ✅ Environment verified.'));
                // return; 
                // Wait, the original code had a prompt every time.
                // The user complaint is that "auth is not triggering... when I resume... without having to open browser".
                // This implies they expect to be stopped IF auth is missing.
                // If auth is PRESENT, they probably want to flow through.
                // But previously checkContext was called in bootstrap every time?
                // No, only if cloud features enabled.
            }

            // --- INTERACTIVE PROMPT ---
            const matchOption = `✅ Proceed with ${chalk.bold(targetId)}`;
            const switchOption = `🔄 Switch Firebase to ${chalk.bold(targetId)}`;
            const logoutOption = `❌ Log out from ${fbState.user}`;

            const choices: any[] = [];

            // --- DECISION LOGIC ---

            // 1. Proceed Option
            // Rule: Must be logged in AND have *some* project selected (or valid local target).
            const canProceed = fbState.user && fbState.project && (fbState.project === targetId || targetId === 'None');

            if (!fbState.user) {
                choices.push(new inquirer.Separator(chalk.dim(`   (Proceed disabled: Login required)`)));
            } else if (!fbState.project && targetId !== 'None') {
                choices.push(new inquirer.Separator(chalk.dim(`   (Proceed disabled: Select Project first)`)));
            } else {
                if (!isFbMismatch && targetId !== 'None') {
                    choices.push({ name: matchOption, value: 'proceed' });
                } else {
                    choices.push({ name: chalk.dim(`⏩ Proceed anyway (as ${fbState.project})`), value: 'proceed' });
                }
            }

            // 2. Switch Option
            if (targetId !== 'None') {
                if (isFbMismatch) {
                    choices.push({ name: switchOption, value: 'switch_target' });
                } else {
                    choices.push(new inquirer.Separator(chalk.dim(`   (Already on ${targetId})`)));
                }
            }

            // 3. Manual Switch
            choices.push({ name: '🔀 Select different Firebase Project', value: 'switch_manual' });

            // 4. Login/Logout
            if (fbState.user) {
                choices.push({ name: logoutOption, value: 'logout' });
            } else {
                choices.push({ name: '🔑 Login to Firebase', value: 'login' });
            }

            // 5. Restart Init
            choices.push({ name: '⚡ Restart Init Process', value: 'restart_init' });

            choices.push(new inquirer.Separator());
            choices.push({ name: '👋 Exit', value: 'exit' });

            // --- TIME-BASED AUTO-RESUME CHECK ---
            // "make it so it only skips the context check like that if the user last session quit timestamp was less than 10 minutes ago"
            // "then if it is make it timeout for 3 seconds before entering the session"

            const { GlobalConfigManager } = await import('./global-config-manager');
            const timeoutMins = parseInt(GlobalConfigManager.get('SESSION_TIMEOUT_MINUTES', '10')!);
            const delaySecs = parseInt(GlobalConfigManager.get('AUTH_RESUME_DELAY_SECONDS', '1')!);

            const lastProject = manager.getLastActive();
            let isRecent = false;

            // Should we look at `lastProject.lastUsed`?
            // `currentPath` is what we are checking.
            // If the *current folder* matches the *last active project*, we check timestamp.
            // If we are opening a random folder, we should probably force check?
            // Assuming "Resume Session" context implies we are in the last active project.

            if (lastProject && lastProject.path === currentPath && lastProject.lastUsed) {
                const lastUsedTime = new Date(lastProject.lastUsed).getTime();
                const diffMs = Date.now() - lastUsedTime;
                const limitMs = timeoutMins * 60 * 1000;

                if (diffMs < limitMs) {
                    isRecent = true;
                }
            }

            const isPerfect = !isUserMissing && (!isFbMismatch && targetId !== 'None');

            // AUTO-PROCEED if Perfect AND Recent
            if (isPerfect && isRecent) {
                console.log(chalk.green(`   ✅ Context verified: ${fbState.user} @ ${targetId}`));
                console.log(chalk.dim(`   Session active within ${timeoutMins}m. Auto-resuming in ${delaySecs}s...`));

                // Countdown
                for (let i = delaySecs; i > 0; i--) {
                    process.stdout.write(`\r   Resuming in ${i}...`);
                    await new Promise(r => setTimeout(r, 1000));
                }
                console.log(''); // Newline

                // Update History silently
                manager.registerProject({
                    alias: path.basename(currentPath),
                    path: currentPath,
                    envPath: path.join(currentPath, '.env'),
                    lastUsed: new Date().toISOString(),
                    projectId: targetId !== 'None' ? targetId : undefined,
                    userEmail: fbState.user || undefined
                });
                return;
            }

            // If not auto-proceeding, showing the menu below...
            // Note: If isPerfect is true but NOT recent, we fall through to the menu.
            // Result: User sees the green state, and has to hit "Proceed". This matches request.

            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'Action Required:',
                choices: choices,
                pageSize: 12
            }]);

            // --- HANDLE ACTIONS ---

            if (action === 'exit') {
                console.log(chalk.gray('Bye!'));
                process.exit(0);
            }

            if (action === 'restart_init') {
                // Return a special signal or handle here?
                // We'll throw an error or handle logic. 
                // Currently this logic was in bootstrap. 
                // Let's just do the file move and return 'restart' signal logic if possible,
                // OR just do it and let the caller handle.

                // To keep it clean, we can do the rename here, then tell user to restart CLI?
                // Or better, return true/false?
                // For now, duplicate the rename logic as it's simple file op.
                console.log(chalk.yellow('\n⚠️  Restarting Initialization...'));
                const envPath = path.join(process.cwd(), '.env');
                if (fs.existsSync(envPath)) {
                    const backupPath = path.join(process.cwd(), '.env.bak');
                    fs.renameSync(envPath, backupPath);
                    console.log(chalk.gray(`   Moved existing .env to .env.bak`));
                }
                console.log(chalk.cyan('Please run "Restart CLI" or restart manually to trigger setup wizard.'));
                await new Promise(r => setTimeout(r, 2000));
                return;
            }

            if (action === 'proceed') {
                console.log(chalk.green(`\n🚀 Launching...`));
                await new Promise(r => setTimeout(r, 800));
                manager.registerProject({
                    alias: path.basename(currentPath),
                    path: currentPath,
                    envPath: path.join(currentPath, '.env'),
                    lastUsed: new Date().toISOString(),
                    projectId: targetId !== 'None' ? targetId : undefined,
                    userEmail: fbState.user || undefined
                });
                return;
            }

            if (action === 'switch_target') {
                console.log(chalk.blue(`\n🔄 Switching to ${targetId}...`));
                try {
                    await execAsync(`firebase use ${targetId}`);
                    await new Promise(r => setTimeout(r, 1000));
                } catch (e: any) {
                    console.error(chalk.yellow(`\n⚠️  Could not switch automatically.`));
                    console.log(chalk.dim(`   Error: ${e.message.split('\n')[0]}`));
                    await inquirer.prompt([{ type: 'input', name: 'ack', message: 'Press Enter to continue...' }]);
                }
            }

            if (action === 'switch_manual') {
                console.log(chalk.blue(`\n📋 Fetching projects...`));
                try {
                    const { stdout } = await execAsync('firebase projects:list --json');
                    const projects = JSON.parse(stdout).result || [];

                    if (projects.length === 0) throw new Error('No projects found');

                    const projectChoices = projects.map((p: any) => ({
                        name: `${chalk.bold(p.projectId)} ${chalk.dim(p.displayName ? `(${p.displayName})` : '')}`,
                        value: p.projectId
                    }));
                    projectChoices.push(new inquirer.Separator());
                    projectChoices.push({ name: '🔙 Cancel', value: 'cancel' });

                    const { pid } = await inquirer.prompt([{
                        type: 'list',
                        name: 'pid',
                        message: 'Select Firebase Project:',
                        choices: projectChoices,
                        pageSize: 15
                    }]);

                    if (pid && pid !== 'cancel') {
                        await execAsync(`firebase use ${pid}`);
                        console.log(chalk.green(`\n✅ Switched to ${pid}`));
                        await new Promise(r => setTimeout(r, 1000));
                    }
                } catch (e: any) {
                    console.error(chalk.red(`\n❌ Error/Fallback: ${e.message}`));
                    const { pid } = await inquirer.prompt([{ type: 'input', name: 'pid', message: 'Enter Project ID:' }]);
                    if (pid) await execAsync(`firebase use ${pid}`).catch(() => { });
                }
            }

            if (action === 'logout') {
                console.log(chalk.yellow(`\n❌ Logging out...`));
                try {
                    await execAsync('firebase logout');
                    await new Promise(r => setTimeout(r, 1000));
                } catch (e) { }
            }

            if (action === 'login') {
                console.log(chalk.green(`\n🔑 Initiating Login...`));
                await new Promise<void>((resolve) => {
                    const p = spawn('firebase', ['login'], { stdio: 'inherit', shell: true });
                    p.on('close', resolve);
                });
            }
        }
    }
}
