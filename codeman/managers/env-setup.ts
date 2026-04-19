import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { state } from '../core/state';
import {
    ensureVishnuBackendCredentialBundle,
    ensureRootCredentialGitignore,
    inspectFlutterFirebaseOptions,
    normalizeCredentialFiles,
    resolveFirebaseBackendConfig,
    syncProjectCredentialsFromSecrets
} from '../core/project/firebase-credentials';

export class EnvSetupManager {
    private static detectFramework(projectPath: string): 'flutter' | 'nextjs' | 'custom' {
        const isFlutterProject = fs.existsSync(path.join(projectPath, 'pubspec.yaml'));
        const isNextProject =
            fs.existsSync(path.join(projectPath, 'next.config.js')) ||
            fs.existsSync(path.join(projectPath, 'next.config.mjs')) ||
            fs.existsSync(path.join(projectPath, 'next.config.ts'));

        return isFlutterProject ? 'flutter' : (isNextProject ? 'nextjs' : 'custom');
    }

    private static async waitForCredentialFiles(options: {
        projectPath: string;
        requireOauth: boolean;
        successMessage: string;
    }): Promise<void> {
        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                const normalized = normalizeCredentialFiles(options.projectPath);
                const hasAdmin = Boolean(normalized.adminSdkPath);
                const hasClient = Boolean(normalized.clientSdkPath);
                const hasOauth = Boolean(normalized.oauthClientPath);

                if (hasAdmin && hasClient && (!options.requireOauth || hasOauth)) {
                    clearInterval(interval);
                    console.log(chalk.green(`\n✅ ${options.successMessage}`));
                    setTimeout(resolve, 800);
                }
            }, 1000);
        });
    }

    static async interactiveSetup(projectPath = process.cwd()): Promise<boolean> {
        const currentDir = process.cwd();
        if (currentDir !== projectPath) {
            process.chdir(projectPath);
        }

        return await this.verifyAndSetupEnv(true);
    }

    static async ensureVishnuBackendBootstrap(
        projectPath = process.cwd(),
        options?: { pauseAfterSetup?: boolean }
    ): Promise<boolean> {
        const pauseAfterSetup = options?.pauseAfterSetup !== false;
        const renderInstructions = () => {
            console.clear();
            console.log(chalk.bold.cyan('\n🔐 Vishnu Backend Credential Check'));
            console.log(chalk.gray('Vishnu maintenance, claims, and deployment tools need the local backend bundle before the launcher can continue.'));
            console.log(chalk.gray('This flow checks vishnu/.secrets first, then watches the repo root and moves any matching files into .secrets automatically.'));
            console.log(chalk.white(`   Repo root: ${projectPath}`));
            console.log(chalk.white(`   Secrets dir: ${path.join(projectPath, '.secrets')}`));
            console.log(chalk.white('   - ') + chalk.bold('admin-sdk.json') + chalk.dim(' (required)'));
            console.log(chalk.white('   - ') + chalk.bold('firebase-sdk.js') + chalk.dim(' (required, firebase-sdk.json will be generated automatically)'));
            console.log(chalk.white('   - ') + chalk.bold('firebase-sdk.json') + chalk.dim(' (auto-generated if only firebase-sdk.js is present)'));
            console.log(chalk.dim('\nDrop the files into the repo root or .secrets/, then this screen will continue automatically. Press Ctrl+C to cancel.\n'));
        };

        const printReadySummary = async (status: ReturnType<typeof ensureVishnuBackendCredentialBundle>, showFollowUp: boolean) => {
            console.clear();
            console.log(chalk.bold.green('\n✅ Vishnu backend credentials are ready.'));
            if (status.backendConfig) {
                console.log(chalk.gray(`   Project ID: ${status.backendConfig.projectId}`));
                console.log(chalk.gray(`   Auth Domain: ${status.backendConfig.authDomain}`));
                console.log(chalk.gray(`   Database URL: ${status.backendConfig.databaseURL}`));
                console.log(chalk.gray(`   Secrets Dir: ${path.relative(projectPath, status.secretsDir).replace(/\\/g, '/') || '.secrets'}`));
            }

            if (status.movedFiles.length > 0) {
                console.log(chalk.cyan('\n📦 Normalized files'));
                for (const moved of status.movedFiles) {
                    console.log(chalk.gray(`   ${moved}`));
                }
            }

            if (status.warnings.length > 0) {
                console.log(chalk.yellow('\n⚠️  Credential warnings'));
                for (const warning of status.warnings) {
                    console.log(chalk.gray(`   ${warning}`));
                }
            }

            if (showFollowUp) {
                console.log(chalk.yellow('\nNext step before using maintenance/admin tools:'));
                console.log(chalk.gray('   1. Run scripts\\set_claims.bat'));
                console.log(chalk.gray('   2. Apply the owner claim to your account'));
                console.log(chalk.gray('   3. Log in again so Vishnu refreshes your owner access'));
            }

            if (pauseAfterSetup) {
                await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to continue...' }]);
            }
        };

        const initialStatus = ensureVishnuBackendCredentialBundle(projectPath);
        if (initialStatus.ready) {
            if (initialStatus.movedFiles.length > 0) {
                await printReadySummary(initialStatus, true);
            }
            return true;
        }

        renderInstructions();

        const readyStatus = await new Promise<ReturnType<typeof ensureVishnuBackendCredentialBundle>>((resolve) => {
            const interval = setInterval(() => {
                const status = ensureVishnuBackendCredentialBundle(projectPath);
                if (status.ready) {
                    clearInterval(interval);
                    resolve(status);
                }
            }, 1000);
        });

        await printReadySummary(readyStatus, true);
        return true;
    }

    static async migrateVishnuBackendCredentials(projectPath = process.cwd()): Promise<boolean> {
        const currentDir = process.cwd();
        if (currentDir !== projectPath) {
            process.chdir(projectPath);
        }

        console.clear();
        console.log(chalk.bold.cyan('\n🔄 Vishnu Backend Migration'));
        console.log(chalk.gray('Copy the new backend credential files into this repo root or directly into .secrets/.'));
        console.log(chalk.gray('This flow will move them into vishnu/.secrets automatically and generate firebase-sdk.json.'));
        console.log(chalk.white('   - ') + chalk.bold('admin-sdk.json') + chalk.dim(' (required)'));
        console.log(chalk.white('   - ') + chalk.bold('firebase-sdk.js') + chalk.dim(' (required)'));
        console.log(chalk.white('   - ') + chalk.bold('firebase-sdk.json') + chalk.dim(' (generated automatically)'));
        console.log(chalk.dim('\nWaiting for the new backend files... (Press Ctrl+C to cancel)'));

        await this.waitForCredentialFiles({
            projectPath,
            requireOauth: false,
            successMessage: 'Backend credential files detected.'
        });

        const framework = this.detectFramework(projectPath);
        const syncResult = syncProjectCredentialsFromSecrets({
            projectPath,
            framework
        });

        if (!syncResult.performed) {
            console.log(chalk.red('\n❌ Could not normalize the backend credentials.'));
            console.log(chalk.gray('Make sure admin-sdk.json and firebase-sdk.js are valid Firebase exports.'));
            return false;
        }

        ensureRootCredentialGitignore(projectPath);

        if (syncResult.movedFiles.length > 0) {
            console.log(chalk.cyan('\n📦 Migrated files'));
            for (const moved of syncResult.movedFiles) {
                console.log(chalk.gray(`   ${moved}`));
            }
        }

        if (syncResult.warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  Migration warnings'));
            for (const warning of syncResult.warnings) {
                console.log(chalk.gray(`   ${warning}`));
            }
        }

        const backend = resolveFirebaseBackendConfig(projectPath);
        if (!backend) {
            console.log(chalk.red('\n❌ Backend credentials were detected, but the backend config could not be resolved.'));
            return false;
        }

        console.log(chalk.green('\n✅ Vishnu backend credentials updated.'));
        console.log(chalk.gray(`   Project ID: ${backend.projectId}`));
        console.log(chalk.gray(`   Auth Domain: ${backend.authDomain}`));
        console.log(chalk.gray(`   Database URL: ${backend.databaseURL}`));
        console.log(chalk.gray(`   Admin SDK: ${path.relative(projectPath, backend.serviceAccountPath).replace(/\\/g, '/')}`));
        console.log(chalk.gray(`   Client SDK: ${path.relative(projectPath, backend.clientSdkPath).replace(/\\/g, '/')}`));
        console.log(chalk.gray(`   Generated JSON: ${path.relative(projectPath, path.join(backend.secretsDir, 'firebase-sdk.json')).replace(/\\/g, '/')}`));

        return true;
    }

    static async verifyAndSetupEnv(forceValidations = false): Promise<boolean> {
        const localConfigPath = path.join(process.cwd(), '.codeman.json');
        const envPath = path.join(process.cwd(), '.env');

        // 1. Determine Intent
        let cloudEnabled = false;

        // Detect project type (used for auto-setup)
        const framework = this.detectFramework(process.cwd());
        const isFlutterProject = framework === 'flutter';
        const isNextProject = framework === 'nextjs';
        const isNextOrFlutter = isFlutterProject || isNextProject;

        // Check for explicit "cloud_features" flag if configuration exists
        if (fs.existsSync(localConfigPath)) {
            try {
                const conf = JSON.parse(fs.readFileSync(localConfigPath, 'utf-8'));
                if (conf.cloud_features === true) cloudEnabled = true;
            } catch (e) { }
        } else {
            // If .env ALREADY exists, we assume they want cloud features
            if (fs.existsSync(envPath)) {
                cloudEnabled = true;
            }
        }

        // Force validation if explicitly requested (e.g. via menu)
        if (forceValidations) cloudEnabled = true;

        // Update Global State (may be overridden below for Next/Flutter auto-setup)
        state.cloudFeaturesEnabled = cloudEnabled;

        // If not cloud-enabled and not a Next.js/Flutter project, skip setup
        if (!cloudEnabled && !isNextOrFlutter) {
            return false; // Valid (no cloud needed)
        }

        // 2. Check for missing configuration (Strict Check: Values must exist)
        const missing: string[] = [];
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');

            if (!isFlutterProject) {
                // These are required for Next.js but optional for Flutter
                // Check CREDENTIALS or SERVICE ACCOUNT
                const credsMatch = envContent.match(/^GOOGLE_APPLICATION_CREDENTIALS=(.+)$/m);
                const saMatch = envContent.match(/^FIREBASE_SERVICE_ACCOUNT=(.+)$/m);
                if ((!credsMatch || !credsMatch[1].trim()) && (!saMatch || !saMatch[1].trim())) {
                    missing.push('GOOGLE_APPLICATION_CREDENTIALS');
                }
            }

            // Check Firebase Project ID (Critical)
            const pidMatch = envContent.match(/^(?:NEXT_PUBLIC_)?FIREBASE_PROJECT_ID=(.+)$/m);
            if (!pidMatch || !pidMatch[1].trim()) missing.push('FIREBASE_PROJECT_ID');

        } else {
            missing.push('.env File');
        }

        if (missing.length === 0 && !forceValidations) {
            return false; // All good
        }

        // 3. Setup Flow
        console.clear();
        console.log(chalk.bold.yellow('\n⚠️  Environment Setup Required'));
        if (missing.length > 0) {
            console.log(chalk.gray(`   Missing or empty: ${missing.join(', ')}`));
        }

        console.log(chalk.cyan('\n   To configure, please drop the following files into a supported secrets folder:'));
        console.log(chalk.gray('   Supported folders: .secrets/ or scripts/.secrets/'));
        console.log(chalk.white('   - ') + chalk.bold('admin-sdk.json') + chalk.dim(' (Firebase Admin SDK)'));
        console.log(chalk.white('   - ') + chalk.bold('firebase-sdk.js') + chalk.dim(' (Firebase Client SDK)'));
        console.log(chalk.white('   - ') + chalk.bold('client-secret-oauth.json') + chalk.dim(' (Google OAuth client export)'));
        console.log(chalk.white('   - ') + chalk.bold('app-check.json') + chalk.dim(' (optional App Check config)'));
        console.log(chalk.white('   - ') + chalk.bold('stripe.json') + chalk.dim(' (optional Stripe payload/config)'));
        console.log(chalk.dim('\n   Waiting for files... (Press Ctrl+C to cancel)'));

        // Poll for files
        await this.waitForCredentialFiles({
            projectPath: process.cwd(),
            requireOauth: true,
            successMessage: 'Configuration files detected!'
        });

        // Files found, start interactive setup
        console.log(chalk.blue('\n📝 Configuring Environment...'));

        const { geminiKey } = await inquirer.prompt([
            {
                type: 'input',
                name: 'geminiKey',
                message: 'Enter Gemini API Key (Optional):',
                default: ''
            }
        ]);

        const syncResult = syncProjectCredentialsFromSecrets({
            projectPath: process.cwd(),
            framework,
            geminiKey
        });

        if (!syncResult.performed) {
            console.log(chalk.red('Error parsing credential files. Make sure admin-sdk.json, firebase-sdk.js, and client-secret-oauth.json are valid.'));
            return true;
        }

        console.log(chalk.green('✅ Environment files generated successfully.'));
        ensureRootCredentialGitignore(process.cwd());
        console.log(chalk.green('✅ .gitignore protects local credential folders.'));

        if (syncResult.movedFiles.length > 0) {
            console.log(chalk.cyan('\n📦 Sorted credential files'));
            for (const moved of syncResult.movedFiles) {
                console.log(chalk.gray(`   ${moved}`));
            }
        }

        if (syncResult.warnings.length > 0) {
            console.log(chalk.yellow('\n⚠️  Credential warnings'));
            for (const warning of syncResult.warnings) {
                console.log(chalk.gray(`   ${warning}`));
            }
        }

        if (isFlutterProject) {
            const projectId = syncResult.projectId ?? '';
            if (projectId) {
                const flutterStatus = inspectFlutterFirebaseOptions(process.cwd(), projectId);
                console.log(chalk.cyan('\n🪄 Flutter Firebase Status'));
                console.log(chalk.gray(`   ${flutterStatus.message}`));
                if (!flutterStatus.aligned) {
                    console.log(chalk.yellow(`   Website/web env is ready, but native targets still need FlutterFire for ${projectId}.`));
                }
            }
        }

        // Run firebase init ONLY if firebase.json doesn't exist yet
        const firebaseJsonPath = path.join(process.cwd(), 'firebase.json');
        if (!fs.existsSync(firebaseJsonPath)) {
            console.log(chalk.blue('\n🔥 Running Firebase Init...'));
            await new Promise<void>((resolve) => {
                const child = spawn('firebase', ['init'], { stdio: 'inherit', shell: true });
                child.on('close', () => resolve());
            });
        } else {
            console.log(chalk.green('✅ Firebase already initialized (firebase.json found). Skipping firebase init.'));
        }

        // Reload dotenv
        const dotenv = await import('dotenv');
        dotenv.config({ path: envPath, override: true });

        // Cloud enabled and configured
        state.cloudFeaturesEnabled = true;

        // Update local config to persist "Enabled" state
        const config: any = fs.existsSync(localConfigPath) ? JSON.parse(fs.readFileSync(localConfigPath, 'utf-8')) : {};
        config.cloud_features = true;
        fs.writeFileSync(localConfigPath, JSON.stringify(config, null, 2));

        return false; // Setup complete, now valid
    }
}
