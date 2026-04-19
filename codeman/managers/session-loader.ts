import { state } from '../core/state';
import * as fs from 'fs-extra';
import * as path from 'path';
import chalk from 'chalk';
import * as dotenv from 'dotenv';
import { checkAndSetupAuth } from '../core/auth-helper';
import { SessionTimerManager } from '../core/session-timers';
import { io } from '../core/io';
// We'll import specific strategies dynamically or statically if circular deps aren't an issue.
// For now dynamic imports are safer for the massive menu-map dependencies.

const PRESENCE_REGISTRATION_TIMEOUT_MS = 5000;

export async function awaitPresenceRegistration(context: {
    projectPath?: string;
    projectId?: string;
    userEmail?: string;
    uid?: string;
}, timeoutMs: number = PRESENCE_REGISTRATION_TIMEOUT_MS) {
    return await Promise.race([
        SessionTimerManager.startPresence(context),
        new Promise<null>((resolve) => {
            setTimeout(() => resolve(null), timeoutMs);
        })
    ]);
}

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

            await SessionTimerManager.stopPresence();
            SessionTimerManager.stopRealtimeSync();

            // 1. Change Directory
            Logger.log(`SessionLoader: Changing directory to ${projectPath}`);
            process.chdir(projectPath);

            // 2. Detect Project Type early so env sync can be framework-aware
            const hasPubspec = await fs.pathExists(path.join(projectPath, 'pubspec.yaml'));
            const hasNextConfig =
                await fs.pathExists(path.join(projectPath, 'next.config.js')) ||
                await fs.pathExists(path.join(projectPath, 'next.config.mjs')) ||
                await fs.pathExists(path.join(projectPath, 'next.config.ts'));
            const detectedFramework =
                hasPubspec
                    ? 'flutter'
                    : hasNextConfig
                        ? 'nextjs'
                        : 'custom';

            // 3. Auto-sync env from credential files on project open when possible
            const { syncProjectCredentialsFromSecrets } = await import('../core/project/firebase-credentials');
            const syncResult = syncProjectCredentialsFromSecrets({
                projectPath,
                framework: detectedFramework
            });

            if (syncResult.performed) {
                Logger.log(`SessionLoader: Synced env from secrets for ${detectedFramework}`);
                if (syncResult.movedFiles.length > 0) {
                    console.log(chalk.cyan('   Sorted credential files into .secrets'));
                }
                for (const warning of syncResult.warnings) {
                    console.log(chalk.yellow(`   ${warning}`));
                }
            }

            // 4. Load Environment
            Logger.log(`SessionLoader: Loading .env`);
            dotenv.config({ path: path.join(projectPath, '.env'), override: true });
            await SessionTimerManager.startRealtimeSync({
                projectId: process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || undefined
            });

            // 5. Update Global State Path
            state.project.rootPath = projectPath;

            // 6. Update Global State Manager (Recent Sessions)
            Logger.log(`SessionLoader: Updating GlobalStateManager`);
            const { GlobalStateManager } = await import('./global-state-manager');
            const manager = new GlobalStateManager();
            manager.updateLastActive(projectPath);

            // 7. Detect Project Type
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

            // 7b. Build Project Intelligence (framework, Firebase, App Check, Vercel, DB schema)
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
                const workflowResult = await DebugTokenManager.runDevWorkflow({
                    projectPath,
                    framework: intelligence.framework.kind,
                    intelligence
                });
                if (workflowResult === 'exit-to-root') {
                    console.log(chalk.gray('Leaving project setup and returning to the main menu.'));
                    state.project.rootPath = '';
                    state.setProjectType('unknown');
                    state.user = undefined;
                    state.authBypass = false;
                    state.rawIdToken = undefined;
                    await SessionTimerManager.stopPresence();
                    SessionTimerManager.stopRealtimeSync();
                    return false;
                }
            }

            // 8. Auth & Context Checks
            // This might verify Firebase, Setup, etc.

            // UI Polish: Clear screen and show header before auth check
            console.clear();
            const { getCodemanHeaderString } = await import('../components/header');
            console.log(await getCodemanHeaderString('auth'));

            console.log(chalk.gray('   Verifying Authentication...'));
            Logger.log(`SessionLoader: Verifying Authentication`);
            const authOk = await checkAndSetupAuth(projectPath);
            if (!authOk) {
                if (state.shouldRestart) {
                    Logger.log('SessionLoader: Auth reset requested, returning to launcher without failure screen.');
                    state.project.rootPath = '';
                    state.setProjectType('unknown');
                    state.user = undefined;
                    state.authBypass = false;
                    state.rawIdToken = undefined;
                    await SessionTimerManager.stopPresence();
                    SessionTimerManager.stopRealtimeSync();
                    return false;
                }
                console.log(chalk.red('   Auth failed. Project access blocked.'));
                Logger.error(`SessionLoader: Auth failed, clearing project context.`);
                await this.showLoadFailure(
                    'Authentication failed',
                    state.tempMessage || chalk.red('The project could not be opened because authentication did not complete.')
                );
                state.project.rootPath = '';
                state.setProjectType('unknown');
                state.user = undefined;
                state.authBypass = false;
                state.rawIdToken = undefined;
                await SessionTimerManager.stopPresence();
                SessionTimerManager.stopRealtimeSync();
                return false;
            }
            console.log(chalk.gray('   Auth Check Complete.'));
            Logger.log(`SessionLoader: Auth Check Complete, Session Loaded.`);

            const presence = await awaitPresenceRegistration({
                projectPath,
                projectId: state.project.id,
                userEmail: state.user?.email,
                uid: state.user?.uid
            });
            if (!presence) {
                console.log(chalk.yellow('   Session presence was not registered yet (limit reached, backend unavailable, or registration timed out).'));
            }

            // 9. Success
            return true;

        } catch (error: any) {
            Logger.error(`SessionLoader: Crash during load`, error);
            const { ErrorUtil } = await import('../utils/error-util');
            await ErrorUtil.handleError(error, `Loading Session ${path.basename(projectPath)}`);
            await SessionTimerManager.stopPresence();
            SessionTimerManager.stopRealtimeSync();
            return false;
        }
    }

    private static async showLoadFailure(title: string, message: string): Promise<void> {
        const plainMessage = String(message || '').replace(/\u001b\[[0-9;]*m/g, '');
        state.tempMessage = chalk.red(plainMessage);

        console.clear();
        console.log(chalk.bgRed.white(` ${title.toUpperCase()} `));
        console.log('');
        console.log(message);
        console.log('');
        console.log(chalk.gray('Press Enter to return to the launcher.'));

        if (!process.stdin.isTTY) {
            await new Promise(r => setTimeout(r, 1500));
            return;
        }

        await new Promise<void>((resolve) => {
            if (typeof process.stdin.setRawMode === 'function') {
                process.stdin.setRawMode(true);
            }
            process.stdin.resume();

            let settled = false;
            const timeout = setTimeout(() => finish(), 15000);

            const cleanup = () => {
                clearTimeout(timeout);
                io.release(handler);
                process.stdin.off('data', onData);
                if (typeof process.stdin.setRawMode === 'function') {
                    try {
                        process.stdin.setRawMode(false);
                    } catch { }
                }
            };

            const finish = () => {
                if (settled) return;
                settled = true;
                cleanup();
                resolve();
            };

            const onData = () => {
                finish();
            };

            const handler = (key: Buffer, str: string) => {
                if (str === '\r' || str === '\n' || str === 'q' || str === '\u001B' || str === '\u0003') {
                    finish();
                }
            };
            io.consume(handler);
            process.stdin.on('data', onData);
        });
    }
}
