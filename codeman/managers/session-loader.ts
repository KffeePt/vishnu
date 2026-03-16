import { state } from '../core/state';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { checkAndSetupAuth } from '../core/auth-helper';
// We'll import specific strategies dynamically or statically if circular deps aren't an issue.
// For now dynamic imports are safer for the massive menu-map dependencies.

export class SessionLoader {
    /**
     * Activates a project session at the given path.
     * Handles chdir, env loading, type detection, and auth checks.
     * @returns true if successful, false if cancelled or failed.
     */
    public static async load(projectPath: string): Promise<boolean> {
        const { Logger } = await import('../utils/logger');
        Logger.log(`SessionLoader: Attempting to load session for ${projectPath}`);

        try {
            if (!await fs.pathExists(projectPath)) {
                Logger.error(`SessionLoader: Path not found ${projectPath}`);
                console.error(chalk.red(`\n❌ Path not found: ${projectPath}`));
                await new Promise(r => setTimeout(r, 2000));
                return false;
            }

            console.log(chalk.blue(`\n📂 Loading Session: ${path.basename(projectPath)}...`));

            // 1. Change Directory
            Logger.log(`SessionLoader: Changing directory to ${projectPath}`);
            process.chdir(projectPath);

            // 2. Load Environment
            Logger.log(`SessionLoader: Loading .env`);
            dotenv.config({ path: path.join(projectPath, '.env'), override: true });

            // 3. Update Global State Path
            state.project.rootPath = projectPath;

            // 4. Update Global State Manager (Recent Sessions)
            Logger.log(`SessionLoader: Updating GlobalStateManager`);
            const { GlobalStateManager } = await import('./global-state-manager');
            const manager = new GlobalStateManager();
            manager.updateLastActive(projectPath);

            // 5. Detect Project Type
            Logger.log(`SessionLoader: Detecting Project Type`);
            // TODO: In future, iterate over a list of registered strategies
            const { NextJsStrategy } = await import('../modes/nextjs'); // Assuming location
            const { FlutterStrategy } = await import('../modes/flutter');

            const nextStrat = new NextJsStrategy();
            const flutterStrat = new FlutterStrategy();

            if (await nextStrat.detect(projectPath)) {
                state.setProjectType('nextjs');
                console.log(chalk.green('   Detected: Next.js'));
                Logger.log(`SessionLoader: Detected Next.js`);
            } else if (await flutterStrat.detect(projectPath)) {
                state.setProjectType('flutter');
                console.log(chalk.cyan('   Detected: Flutter'));
                Logger.log(`SessionLoader: Detected Flutter`);
            } else {
                state.setProjectType('custom');
                console.log(chalk.gray('   Detected: Generic/Custom Project'));
                Logger.log(`SessionLoader: Detected Custom`);
            }

            // 5b. Build Project Intelligence (framework, Firebase, App Check, Vercel, DB schema)
            Logger.log(`SessionLoader: Building Project Intelligence`);
            const { buildProjectIntelligence } = await import('../core/intelligence/project-intelligence');
            const intelligence = buildProjectIntelligence(projectPath);
            state.project.intelligence = intelligence;
            state.project.database = intelligence.database;
            if (!state.project.id && intelligence.firebase.projectId) {
                state.project.id = intelligence.firebase.projectId;
            }

            const appCheck = intelligence.firebase.appCheck;
            const gatewayRequired = appCheck.enabled === true;
            const mode = intelligence.vercel.detected ? 'vercel' : (gatewayRequired ? 'gateway' : 'direct');

            state.project.security = {
                appCheck,
                gatewayRequired,
                mode
            };

            state.project.deployment = {
                platform: intelligence.vercel.detected ? 'vercel' : (intelligence.firebase.detected ? 'firebase' : 'unknown'),
                signals: intelligence.vercel.signals
            };

            if (intelligence.firebase.detected) {
                console.log(chalk.green('   ✔ Firebase detected'));
            }

            if (appCheck.enabled) {
                console.log(chalk.yellow('   ✔ App Check enabled'));
                console.log(chalk.yellow('   ✔ Gateway mode required'));
            } else if (intelligence.firebase.detected) {
                console.log(chalk.gray('   ✔ App Check not detected'));
            }

            if (intelligence.vercel.detected) {
                console.log(chalk.cyan('   ✔ Vercel deployment detected'));
            }

            // Enforce env migration prompt on entry if format is not correct
            const { runEnvMigrationPrompt } = await import('../core/project/env-migration');
            await runEnvMigrationPrompt(projectPath);

            if (appCheck.enabled) {
                const { DebugTokenManager } = await import('../core/security/debug-token-manager');
                await DebugTokenManager.runDevWorkflow({
                    projectPath,
                    framework: intelligence.framework.kind,
                    intelligence
                });
            }

            // 6. Auth & Context Checks
            // This might verify Firebase, Setup, etc.

            // UI Polish: Clear screen and show header before auth check
            console.clear();
            const { getCodemanHeaderString } = await import('../components/header');
            console.log(await getCodemanHeaderString('auth'));

            console.log(chalk.gray('   Verifying Authentication...'));
            Logger.log(`SessionLoader: Verifying Authentication`);
            const authOk = await checkAndSetupAuth(projectPath);
            if (!authOk) {
                console.log(chalk.red('   Auth failed. Project access blocked.'));
                Logger.error(`SessionLoader: Auth failed, clearing project context.`);
                state.project.rootPath = '';
                state.setProjectType('unknown');
                state.user = undefined;
                state.authBypass = false;
                state.rawIdToken = undefined;
                return false;
            }
            console.log(chalk.gray('   Auth Check Complete.'));
            Logger.log(`SessionLoader: Auth Check Complete, Session Loaded.`);

            // 7. Success
            return true;

        } catch (error: any) {
            Logger.error(`SessionLoader: Crash during load`, error);
            const { ErrorUtil } = await import('../utils/error-util');
            await ErrorUtil.handleError(error, `Loading Session ${path.basename(projectPath)}`);
            return false;
        }
    }
}
