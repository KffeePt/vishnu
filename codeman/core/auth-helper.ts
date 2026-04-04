import { state } from '../core/state';
import chalk from 'chalk';
import path from 'path';
import { UserConfigManager } from '../config/user-config';

async function ensureProjectContext(projectPath: string) {
    if (!projectPath) return;
    try {
        process.chdir(projectPath);
    } catch { }
    state.project.rootPath = projectPath;
    if (state.project.type === 'unknown') {
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
}

export async function checkAndSetupAuth(projectPath: string): Promise<boolean> {
    const { EnvSetupManager } = await import('../managers/env-setup');
    const { GlobalStateManager } = await import('../managers/global-state-manager');

    // We should ensure process.cwd() is projectPath before calling if not already
    const current = process.cwd();
    if (projectPath && current !== projectPath) {
        process.chdir(projectPath);
    }
    await ensureProjectContext(projectPath);

    const OWNER_BYPASS_TTL_MS = 30 * 60 * 1000;
    const cachedUser = UserConfigManager.getCachedUser();
    const authMode = UserConfigManager.getAuthMode();
    const bypassExpiresAt = UserConfigManager.getAuthBypassExpiresAt();
    const ownerBypassFresh =
        authMode === 'owner-bypass' &&
        !!cachedUser &&
        typeof bypassExpiresAt === 'number' &&
        bypassExpiresAt > Date.now() &&
        (cachedUser.role === 'owner' || cachedUser.isAdmin === true);

    if (authMode === 'owner-bypass' && !ownerBypassFresh) {
        UserConfigManager.clearAuthBypass();
    }

    if (state.authBypass && !ownerBypassFresh) {
        state.authBypass = false;
        state.rawIdToken = undefined;
        UserConfigManager.clearAuthBypass();
    }

    if (!state.authBypass && ownerBypassFresh) {
        state.authBypass = true;
        state.user = cachedUser;
        console.log(chalk.green('\n✅ Restored Vishnu owner bypass from cache.'));
        console.log(chalk.gray(`   Bypass expires at: ${new Date(bypassExpiresAt).toLocaleString()}`));
    }

    // 1. Verify Environment (.env, API Keys)
    await EnvSetupManager.verifyAndSetupEnv();

    // 2. Check Auth if Cloud Features Enabled
    if (state.cloudFeaturesEnabled) {
        if (ownerBypassFresh) {
            await ensureProjectContext(projectPath);
            return true;
        }

        if (!state.authBypass) {
            const { fileURLToPath } = await import('url');
            const __filename = fileURLToPath(import.meta.url);
            const __dirname = path.dirname(__filename);
            const inferredVishnuRoot = path.resolve(__dirname, '..', '..');
            const vishnuRoot = process.env.VISHNU_ROOT ? path.resolve(process.env.VISHNU_ROOT) : inferredVishnuRoot;

            let bypassChoice: 'bypass' | 'continue';
            const isRaw = !!(process.stdin.isTTY && process.stdin.isRaw);
            if (isRaw) {
                const { List } = await import('../components/list');
                const { io } = await import('../core/io');
                // Ensure mouse input works even when schema menus temporarily disable it
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
                const claimsPath = path.join(vishnuRoot, 'claims');
                const serviceAccountPath = path.join(claimsPath, 'admin-sdk.json');

                if (!serviceAccountPath || !(await import('fs')).existsSync(serviceAccountPath)) {
                    console.log(chalk.red('\n🚫 Missing Vishnu admin service account (claims/admin-sdk.json).'));
                    console.log(chalk.gray('   Cannot verify owner claim for bypass.'));
                    console.log(chalk.red('\n🚫 Owner bypass denied. Access blocked.'));
                    return false;
                }

                try {
                    const { AuthService } = await import('../core/auth');
                    const vishnuAuth = {
                        projectId: 'vishnu-b65bd',
                        apiKey: 'AIzaSyCSntkOv0yMAAF2CduDvl638EsdMN6xU1U',
                        authDomain: 'vishnu-b65bd.firebaseapp.com',
                        serviceAccount: serviceAccountPath
                    };

                    console.log(chalk.cyan('\n🔐 Opening Vishnu owner login...'));
                    const success = await AuthService.login(state, vishnuAuth);
                    if (!success) {
                        console.log(chalk.red('\n🚫 Owner bypass failed. Authentication cancelled or denied.'));
                        state.authBypass = false;
                        state.rawIdToken = undefined;
                        return false;
                    }

                    const isOwner = state.user?.role === 'owner';
                    const isAdmin = state.user?.isAdmin === true;
                    if (!isOwner && !isAdmin) {
                        console.log(chalk.red('\n🚫 Owner bypass denied. user is not owner/admin in Vishnu.'));
                        state.authBypass = false;
                        state.rawIdToken = undefined;
                        return false;
                    }

                    state.authBypass = true;
                    const bypassExpiresAt = Date.now() + OWNER_BYPASS_TTL_MS;
                    UserConfigManager.setLastAuth(Date.now(), state.user, {
                        authMode: 'owner-bypass',
                        authBypassExpiresAt: bypassExpiresAt
                    });
                    await ensureProjectContext(projectPath);
                    console.log(chalk.yellow('\n⚠️  Owner bypass enabled. Project Firebase auth skipped.'));
                    console.log(chalk.gray(`   Bypass expires at: ${new Date(bypassExpiresAt).toLocaleString()}`));
                    return true;
                } catch (err: any) {
                    console.log(chalk.red(`\n🚫 Owner bypass failed: ${err?.message || err}`));
                    state.authBypass = false;
                    state.rawIdToken = undefined;
                    return false;
                }
            }
        }
        if (state.authBypass) {
            if (typeof bypassExpiresAt === 'number' && bypassExpiresAt > 0 && Date.now() > bypassExpiresAt) {
                console.log(chalk.yellow('\n⚠️  Vishnu owner bypass expired. Re-authentication required.'));
                state.authBypass = false;
                state.rawIdToken = undefined;
                UserConfigManager.clearAuthBypass();
            } else {
                await ensureProjectContext(projectPath);
                return true;
            }
        }

        if (state.project.security?.mode === 'vercel') {
            const { VercelTokenStore } = await import('./auth/vercel-token');
            const token = await VercelTokenStore.ensureToken();
            if (!token) {
                console.log(chalk.red('\n🚫 Missing Vercel developer token.'));
                console.log(chalk.gray('   Please obtain a signed Vishnu CLI token from your backend.'));
                process.exit(1);
            }
            state.rawIdToken = token;
            return true;
        }

        const { FirebaseContextManager } = await import('../managers/firebase-context');
        await FirebaseContextManager.checkContext();

        // 3. Spawn Authentication Flow
        const { AuthService } = await import('../core/auth');
        const isAuthenticated = await AuthService.login(state);

        if (!isAuthenticated) {
            console.log(chalk.red('\n🚫 Authentication Failed or Cancelled.'));
            console.log(chalk.gray('   To access the session, you must authenticate successfully.'));
            return false;
        }
        await ensureProjectContext(projectPath);
        return true;
    } else {
        console.log(chalk.dim('\nCloud features disabled. Skipping Auth check.'));
        return true;
    }
}
