import { state } from '../core/state';
import chalk from 'chalk';
import path from 'path';

export async function checkAndSetupAuth(projectPath: string) {
    const { EnvSetupManager } = await import('../managers/env-setup');
    const { GlobalStateManager } = await import('../managers/global-state-manager');

    // We should ensure process.cwd() is projectPath before calling if not already
    const current = process.cwd();
    if (projectPath && current !== projectPath) {
        process.chdir(projectPath);
    }

    // 1. Verify Environment (.env, API Keys)
    await EnvSetupManager.verifyAndSetupEnv();

    // 2. Check Auth if Cloud Features Enabled
    if (state.cloudFeaturesEnabled) {
        const { FirebaseContextManager } = await import('../managers/firebase-context');
        await FirebaseContextManager.checkContext();

        // 3. Spawn Authentication Flow
        const { AuthService } = await import('../core/auth');
        const isAuthenticated = await AuthService.login(state);

        if (!isAuthenticated) {
            console.log(chalk.red('\n🚫 Authentication Failed or Cancelled.'));
            console.log(chalk.gray('   To access the session, you must authenticate successfully.'));
            console.log(chalk.gray('   Restarting CLI...'));
            await new Promise(r => setTimeout(r, 2000));

            // Allow caller to handle exit, or force exit here?
            // If we are in the middle of a script, process.exit(1) is cleaner for security.
            process.exit(1);
        }
    } else {
        console.log(chalk.dim('\nCloud features disabled. Skipping Auth check.'));
    }
}
