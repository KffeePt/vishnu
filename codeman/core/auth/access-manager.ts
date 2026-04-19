import chalk from 'chalk';
import path from 'path';

import { state } from '../state';
import { UserConfigManager } from '../../config/user-config';
import { SessionTimerManager } from '../session-timers';
import { AuthTokenStore } from './token-store';
import {
    clampOwnerBypassDuration,
    isOwnerLikeUser,
    MAX_BROWSER_SESSION_AGE_MS,
    shouldAllowOwnerBypass
} from './access-policy';

export class AuthAccessManager {
    private static async ensureProjectContext(projectPath: string) {
        if (!projectPath) return;
        try {
            process.chdir(projectPath);
        } catch {
            // Ignore chdir failures here; downstream env checks surface the real issue.
        }

        state.project.rootPath = projectPath;
        if (state.project.type !== 'unknown') {
            return;
        }

        const inferred = state.project.intelligence?.framework.kind;
        if (inferred === 'nextjs' || inferred === 'flutter' || inferred === 'custom') {
            state.setProjectType(inferred);
            return;
        }

        const fs = await import('fs');
        if (fs.existsSync(path.join(projectPath, 'pubspec.yaml'))) {
            state.setProjectType('flutter');
        } else if (
            fs.existsSync(path.join(projectPath, 'next.config.js')) ||
            fs.existsSync(path.join(projectPath, 'next.config.mjs')) ||
            fs.existsSync(path.join(projectPath, 'next.config.ts'))
        ) {
            state.setProjectType('nextjs');
        } else {
            state.setProjectType('custom');
        }
    }

    private static clearBypassRuntimeState() {
        state.authBypass = false;
        state.rawIdToken = undefined;
        UserConfigManager.clearAuthBypass();
    }

    private static clearAllAuthState(message?: string) {
        state.authBypass = false;
        state.rawIdToken = undefined;
        state.user = undefined;
        state.project.rootPath = '';
        state.setProjectType('unknown');
        state.shouldRestart = true;
        state.restartTargetNode = 'ROOT';
        process.env.CODEMAN_FORCE_LAUNCHER = 'true';
        UserConfigManager.clearAuthState();
        AuthTokenStore.clear();
        if (message) {
            state.tempMessage = chalk.yellow(message);
        }
    }

    static async ensureProjectAccess(projectPath: string): Promise<boolean> {
        const { EnvSetupManager } = await import('../../managers/env-setup');

        const current = process.cwd();
        if (projectPath && current !== projectPath) {
            process.chdir(projectPath);
        }
        await this.ensureProjectContext(projectPath);

        const forcedReauthAt = SessionTimerManager.getConfig().forcedReauthAt || 0;
        const storedTokens = AuthTokenStore.load();
        const authWatermark = Math.max(
            UserConfigManager.getLastAuth(),
            UserConfigManager.getAuthBypassStartedAt(),
            storedTokens?.updatedAt || 0
        );

        if (forcedReauthAt > 0 && authWatermark > 0 && authWatermark < forcedReauthAt) {
            console.log(chalk.yellow('\n⚠️  Global session reset detected. Cached auth has been cleared.'));
            this.clearAllAuthState('Global session reset detected. Please sign in again.');
            return false;
        }

        if (storedTokens && !AuthTokenStore.hasFreshBrowserSession(MAX_BROWSER_SESSION_AGE_MS, storedTokens)) {
            AuthTokenStore.clear();
        }

        const cachedUser = UserConfigManager.getCachedUser();
        const authMode = UserConfigManager.getAuthMode();
        const bypassExpiresAt = UserConfigManager.getAuthBypassExpiresAt();
        const ownerBypassFresh = shouldAllowOwnerBypass({
            authMode,
            cachedUser,
            bypassExpiresAt,
            sessionStartedAt: storedTokens?.sessionStartedAt,
            updatedAt: storedTokens?.updatedAt
        });

        if (authMode === 'owner-bypass' && !ownerBypassFresh) {
            UserConfigManager.clearAuthBypass();
        }

        if (state.authBypass && !ownerBypassFresh) {
            this.clearBypassRuntimeState();
        }

        if (!state.authBypass && ownerBypassFresh) {
            state.authBypass = true;
            state.user = cachedUser;
            console.log(chalk.green('\n✅ Restored Vishnu owner bypass from cache.'));
            console.log(chalk.gray(`   Bypass expires at: ${new Date(bypassExpiresAt).toLocaleString()}`));
        }

        await EnvSetupManager.verifyAndSetupEnv();

        if (!state.cloudFeaturesEnabled) {
            console.log(chalk.dim('\nCloud features disabled. Skipping Auth check.'));
            return true;
        }

        if (ownerBypassFresh) {
            await this.ensureProjectContext(projectPath);
            return true;
        }

        if (!state.authBypass) {
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const inferredVishnuRoot = path.resolve(__dirname, '..', '..', '..');
            const vishnuRoot = process.env.VISHNU_ROOT ? path.resolve(process.env.VISHNU_ROOT) : inferredVishnuRoot;
            const { resolveFirebaseBackendConfig } = await import('../project/firebase-credentials');

            let bypassChoice: 'bypass' | 'continue';
            const isRaw = !!(process.stdin.isTTY && process.stdin.isRaw);
            if (isRaw) {
                const { List } = await import('../../components/list');
                const { io } = await import('../io');
                io.enableMouse();
                bypassChoice = await List('Owner bypass (Vishnu project only)', [
                    { name: 'Bypass auth using Vishnu owner', value: 'bypass' },
                    { name: 'Continue normal auth', value: 'continue' }
                ]);
                io.disableMouse();
            } else {
                const inquirer = (await import('inquirer')).default;
                const answer = await inquirer.prompt([{
                    type: 'list',
                    name: 'bypassChoice',
                    message: 'Owner bypass (Vishnu project only)',
                    choices: [
                        { name: 'Bypass auth using Vishnu owner', value: 'bypass' },
                        { name: 'Continue normal auth', value: 'continue' }
                    ]
                }]);
                bypassChoice = answer.bypassChoice;
            }

            if (bypassChoice === 'bypass') {
                const vishnuBackend = resolveFirebaseBackendConfig(vishnuRoot);

                if (!vishnuBackend) {
                    console.log(chalk.red('\n🚫 Vishnu backend credentials are incomplete.'));
                    console.log(chalk.gray('   Expected .secrets/admin-sdk.json plus firebase-sdk.js/firebase-sdk.json for owner bypass.'));
                    console.log(chalk.red('\n🚫 Owner bypass denied. Access blocked.'));
                    return false;
                }

                try {
                    const { AuthService } = await import('../auth');
                    const vishnuAuth = {
                        projectId: vishnuBackend.projectId,
                        apiKey: vishnuBackend.apiKey,
                        authDomain: vishnuBackend.authDomain,
                        serviceAccount: vishnuBackend.serviceAccountPath
                    };

                    console.log(chalk.cyan('\n🔐 Opening Vishnu owner login...'));
                    const success = await AuthService.login(state, vishnuAuth);
                    if (!success) {
                        console.log(chalk.red('\n🚫 Owner bypass failed. Authentication cancelled or denied.'));
                        state.tempMessage = chalk.red('Owner bypass failed. Authentication cancelled or denied.');
                        this.clearBypassRuntimeState();
                        return false;
                    }

                    if (!isOwnerLikeUser(state.user)) {
                        console.log(chalk.red('\n🚫 Owner bypass denied. user is not owner/admin in Vishnu.'));
                        state.tempMessage = chalk.red('Owner bypass denied. user is not owner/admin in Vishnu.');
                        this.clearBypassRuntimeState();
                        return false;
                    }

                    state.authBypass = true;
                    const bypassStartedAt = Date.now();
                    const bypassExpiresAt = bypassStartedAt + clampOwnerBypassDuration(SessionTimerManager.getConfig().ownerBypassTimeoutMs);
                    UserConfigManager.setLastAuth(bypassStartedAt, state.user, {
                        authMode: 'owner-bypass',
                        authBypassStartedAt: bypassStartedAt,
                        authBypassExpiresAt: bypassExpiresAt
                    });
                    await this.ensureProjectContext(projectPath);
                    console.log(chalk.yellow('\n⚠️  Owner bypass enabled. Project Firebase auth skipped.'));
                    console.log(chalk.gray(`   Bypass expires at: ${new Date(bypassExpiresAt).toLocaleString()}`));
                    return true;
                } catch (err: any) {
                    console.log(chalk.red(`\n🚫 Owner bypass failed: ${err?.message || err}`));
                    state.tempMessage = chalk.red(`Owner bypass failed: ${err?.message || err}`);
                    this.clearBypassRuntimeState();
                    return false;
                }
            }
        }

        if (state.authBypass) {
            if (typeof bypassExpiresAt === 'number' && bypassExpiresAt > 0 && Date.now() > bypassExpiresAt) {
                console.log(chalk.yellow('\n⚠️  Vishnu owner bypass expired. Re-authentication required.'));
                this.clearBypassRuntimeState();
            } else {
                await this.ensureProjectContext(projectPath);
                return true;
            }
        }

        if (state.project.security?.mode === 'vercel') {
            const { VercelTokenStore } = await import('./vercel-token');
            const token = await VercelTokenStore.ensureToken();
            if (!token) {
                console.log(chalk.red('\n🚫 Missing Vercel developer token.'));
                console.log(chalk.gray('   Please obtain a signed Vishnu CLI token from your backend.'));
                process.exit(1);
            }
            state.rawIdToken = token;
            return true;
        }

        const { FirebaseContextManager } = await import('../../managers/firebase-context');
        await FirebaseContextManager.checkContext();

        const { AuthService } = await import('../auth');
        const isAuthenticated = await AuthService.login(state);

        if (!isAuthenticated) {
            console.log(chalk.red('\n🚫 Authentication Failed or Cancelled.'));
            console.log(chalk.gray('   To access the session, you must authenticate successfully.'));
            state.tempMessage = chalk.red('Authentication failed or was cancelled. Scroll up for the specific error.');
            return false;
        }

        await this.ensureProjectContext(projectPath);
        return true;
    }
}
