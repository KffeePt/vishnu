import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { spawn } from 'child_process';
import { state } from '../core/state';

export class EnvSetupManager {
    static async verifyAndSetupEnv(forceValidations = false): Promise<boolean> {
        const localConfigPath = path.join(process.cwd(), '.codeman.json');
        const envPath = path.join(process.cwd(), '.env');

        // 1. Determine Intent
        let cloudEnabled = false;

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

        // Update Global State
        state.cloudFeaturesEnabled = cloudEnabled;

        if (!cloudEnabled) {
            return false; // Valid (no cloud needed)
        }

        // 2. Check for missing configuration (Strict Check: Values must exist)
        const isFlutterProject = fs.existsSync(path.join(process.cwd(), 'pubspec.yaml'));
        const missing = [];
        let envContent = '';
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, 'utf-8');

            if (!isFlutterProject) {
                // These are required for Next.js but optional for Flutter
                // Check OWNER_EMAIL
                const emailMatch = envContent.match(/^OWNER_EMAIL=(.+)$/m);
                if (!emailMatch || !emailMatch[1].trim()) missing.push('OWNER_EMAIL');

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
        console.log(chalk.white('   - ') + chalk.bold('admin-sdk.json') + chalk.dim(' (Firebase Admin SDK)'));
        console.log(chalk.white('   - ') + chalk.bold('firebase-sdk.js') + chalk.dim(' (Firebase Client SDK)'));
        console.log(chalk.dim('\n   Waiting for files... (Press Ctrl+C to cancel)'));

        // Poll for files
        const adminSdkPath = path.join(process.cwd(), 'admin-sdk.json');
        const clientSdkPath = path.join(process.cwd(), 'firebase-sdk.js');

        await new Promise<void>((resolve) => {
            const interval = setInterval(() => {
                const hasAdmin = fs.existsSync(adminSdkPath) && fs.statSync(adminSdkPath).size > 0;
                const hasClient = fs.existsSync(clientSdkPath) && fs.statSync(clientSdkPath).size > 0;

                if (hasAdmin && hasClient) {
                    clearInterval(interval);
                    console.log(chalk.green('\n✅ Configuration files detected!'));
                    setTimeout(resolve, 1000);
                }
            }, 1000);
        });

        // Files found, start interactive setup
        console.log(chalk.blue('\n📝 Configuring Environment...'));

        const { email, geminiKey } = await inquirer.prompt([
            {
                type: 'input',
                name: 'email',
                message: 'Enter Owner Email:',
                validate: (input) => input.includes('@') ? true : 'Invalid email'
            },
            {
                type: 'input',
                name: 'geminiKey',
                message: 'Enter Gemini API Key (Optional):',
                default: ''
            }
        ]);

        // Parse files
        let apiKey = '', authDomain = '', projectId = '', storageBucket = '', messagingSenderId = '', appId = '', measurementId = '';

        try {
            const clientContent = fs.readFileSync(clientSdkPath, 'utf-8');
            apiKey = clientContent.match(/apiKey: "(.*)"/)?.[1] || '';
            authDomain = clientContent.match(/authDomain: "(.*)"/)?.[1] || '';
            projectId = clientContent.match(/projectId: "(.*)"/)?.[1] || '';
            storageBucket = clientContent.match(/storageBucket: "(.*)"/)?.[1] || '';
            messagingSenderId = clientContent.match(/messagingSenderId: "(.*)"/)?.[1] || '';
            appId = clientContent.match(/appId: "(.*)"/)?.[1] || '';
            measurementId = clientContent.match(/measurementId: "(.*)"/)?.[1] || '';
        } catch (e) {
            console.log(chalk.red("Error parsing firebase-sdk.js. Make sure it's valid format."));
        }

        // Generate .env
        const newEnvContent = `
# Admin Setup
OWNER_EMAIL=${email}
GOOGLE_APPLICATION_CREDENTIALS=admin-sdk.json

# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=${apiKey}
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=${authDomain}
NEXT_PUBLIC_FIREBASE_PROJECT_ID=${projectId}
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=${storageBucket}
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=${messagingSenderId}
NEXT_PUBLIC_FIREBASE_APP_ID=${appId}
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=${measurementId}
FIREBASE_PROJECT_ID=${projectId}

# AI
GEMINI_API_KEY=${geminiKey}
`.trim();

        fs.writeFileSync(envPath, newEnvContent);
        console.log(chalk.green('✅ .env file generated successfully.'));

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
