import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { state } from '../core/state';
import {
    ensureRootCredentialGitignore,
    inspectFlutterFirebaseOptions,
    normalizeCredentialFiles,
    syncProjectCredentialsFromSecrets
} from '../core/project/firebase-credentials';

export class EnvSetupManager {
    static async verifyAndSetupEnv(forceValidations = false): Promise<boolean> {
        const localConfigPath = path.join(process.cwd(), '.codeman.json');
        const envPath = path.join(process.cwd(), '.env');

        // 1. Determine Intent
        let cloudEnabled = false;

        // Detect project type (used for auto-setup)
        const isFlutterProject = fs.existsSync(path.join(process.cwd(), 'pubspec.yaml'));
        const isNextProject =
            fs.existsSync(path.join(process.cwd(), 'next.config.js')) ||
            fs.existsSync(path.join(process.cwd(), 'next.config.mjs')) ||
            fs.existsSync(path.join(process.cwd(), 'next.config.ts'));
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

        console.log(chalk.cyan('\n   To configure, please drop the following files into this folder:'));
        console.log(chalk.white('   - ') + chalk.bold('.secrets/admin-sdk.json') + chalk.dim(' (Firebase Admin SDK)'));
        console.log(chalk.white('   - ') + chalk.bold('.secrets/firebase-sdk.js') + chalk.dim(' (Firebase Client SDK)'));
        console.log(chalk.white('   - ') + chalk.bold('.secrets/client-secret-oauth.json') + chalk.dim(' (Google OAuth client export)'));
        console.log(chalk.dim('\n   Waiting for files... (Press Ctrl+C to cancel)'));

        // Poll for files
        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                const normalized = normalizeCredentialFiles(process.cwd());
                const hasAdmin = Boolean(normalized.adminSdkPath);
                const hasClient = Boolean(normalized.clientSdkPath);
                const hasOauth = Boolean(normalized.oauthClientPath);

                if (hasAdmin && hasClient && hasOauth) {
                    clearInterval(interval);
                    console.log(chalk.green('\n✅ Configuration files detected!'));
                    setTimeout(resolve, 1000);
                }
            }, 1000);
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

        const framework = isFlutterProject ? 'flutter' : (isNextProject ? 'nextjs' : 'custom');
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
        console.log(chalk.green('✅ .gitignore protects .secrets/ credentials.'));

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
