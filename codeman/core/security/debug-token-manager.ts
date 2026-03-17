import crypto from 'crypto';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { FrameworkKind, resolveSharedEnvFile, setEnvVar, getEnvVar, tryInjectNextAppCheckSnippet, configureVercelEnvVar } from '../project/env-manager';
import { ProjectIntelligence } from '../state';

export interface DebugTokenWorkflowOptions {
    projectPath: string;
    framework: FrameworkKind;
    intelligence: ProjectIntelligence;
}

function generateUuid(): string {
    if (crypto.randomUUID) {
        return crypto.randomUUID();
    }
    const buf = crypto.randomBytes(16);
    buf[6] = (buf[6] & 0x0f) | 0x40;
    buf[8] = (buf[8] & 0x3f) | 0x80;
    const hex = buf.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function isLikelyUuid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value.trim());
}

function resolveDebugKey(framework: FrameworkKind): string {
    return framework === 'nextjs' ? 'FIREBASE_APPCHECK_DEBUG_TOKEN' : 'APP_CHECK_DEBUG_TOKEN';
}

function resolveBrowserKey(framework: FrameworkKind): string {
    return 'FIREBASE_API_KEY';
}

function isLikelyApiKey(value: string): boolean {
    return value.trim().startsWith('AIza');
}

function printInstructions(token: string, framework: FrameworkKind) {
    console.log(chalk.cyan('\nApp Check debug token generated.'));
    console.log(chalk.gray('Add this token in Firebase Console: App Check -> Manage debug tokens -> Add token'));
    console.log(chalk.white(`Token: ${token}`));
    console.log(chalk.gray('\nAlso ensure your Firebase Browser API key is in .env (copy from Google Cloud Console).'));

    if (framework === 'nextjs') {
        console.log(chalk.gray('\nNext.js runtime snippet (before Firebase init):'));
        console.log(chalk.white('self.FIREBASE_APPCHECK_DEBUG_TOKEN = process.env.FIREBASE_APPCHECK_DEBUG_TOKEN'));
        console.log(chalk.gray('Client-side access requires FIREBASE_API_KEY (export it if needed).'));
    } else if (framework === 'flutter') {
        console.log(chalk.gray('\nFlutter activation snippet:'));
        console.log(chalk.white('await FirebaseAppCheck.instance.activate('));
        console.log(chalk.white('  androidProvider: AndroidProvider.debug,'));
        console.log(chalk.white('  appleProvider: AppleProvider.debug,'));
        console.log(chalk.white('  webProvider: ReCaptchaEnterpriseProvider(\'SITE_KEY\'),'));
        console.log(chalk.white(');'));
        console.log(chalk.gray('\nEnable refresh:'));
        console.log(chalk.white('FirebaseAppCheck.instance.setTokenAutoRefreshEnabled(true);'));
    }
}

export const DebugTokenManager = {
    async runDevWorkflow(options: DebugTokenWorkflowOptions): Promise<void> {
        const { projectPath, framework, intelligence } = options;
        const envFile = resolveSharedEnvFile(projectPath);
        const key = resolveDebugKey(framework);
        const existing = getEnvVar(envFile, key);

        console.log(chalk.yellow('\nFirebase App Check detected.'));
        const answer = await inquirer.prompt([{
            type: 'list',
            name: 'mode',
            message: 'Choose development mode:',
            choices: [
                { name: 'Run build to get the token', value: 'run-build' },
                { name: 'Skip (production mode)', value: 'skip' }
            ]
        }]);

        if (answer.mode === 'skip') {
            console.log(chalk.gray('Skipping App Check debug setup.'));
            return;
        }

        let token = existing || '';
        if (answer.mode === 'run-build') {
            console.log(chalk.cyan('\nLaunch the app in the emulator/device, capture the token from logs, and enter it here:'));
            const input = await inquirer.prompt([{
                type: 'input',
                name: 'token',
                message: 'Enter App Check debug token:',
                validate: (value: string) => isLikelyUuid(value) ? true : 'Please enter a valid UUID'
            }]);
            token = input.token.trim();
        }

        setEnvVar(envFile, key, token);
        console.log(chalk.green(`Debug token written to ${envFile}`));

        const browserKey = resolveBrowserKey(framework);
        const existingBrowserKey = getEnvVar(envFile, browserKey);
        const browserPrompt = await inquirer.prompt([{
            type: 'confirm',
            name: 'setBrowserKey',
            message: 'Add Firebase Browser API key to .env now?',
            default: !existingBrowserKey
        }]);

        if (browserPrompt.setBrowserKey) {
            const inputKey = await inquirer.prompt([{
                type: 'input',
                name: 'apiKey',
                message: 'Paste the Firebase Browser API key (AIza...)',
                validate: (value: string) => isLikelyApiKey(value) ? true : 'API key should start with "AIza"'
            }]);

            const apiKeyValue = inputKey.apiKey.trim();
            setEnvVar(envFile, browserKey, apiKeyValue);
            console.log(chalk.green(`Browser API key written to ${envFile}`));
        }

        if (framework === 'nextjs') {
            const injection = tryInjectNextAppCheckSnippet(projectPath);
            if (injection.injected) {
                console.log(chalk.green(`Injected App Check snippet in ${injection.filePath}`));
            } else if (!injection.filePath) {
                console.log(chalk.yellow('Could not find a Firebase init file to inject. Please add the snippet manually.'));
            }
        }

        if (framework === 'flutter') {
            console.log(chalk.gray('Flutter: you can also pass the token via --dart-define=APP_CHECK_DEBUG_TOKEN=...'));
        }

        if (intelligence.vercel.detected) {
            const shouldConfigure = await inquirer.prompt([{
                type: 'confirm',
                name: 'vercel',
                message: 'Add debug token to Vercel env variables now?',
                default: false
            }]);
            if (shouldConfigure.vercel) {
                const envChoice = await inquirer.prompt([{
                    type: 'list',
                    name: 'env',
                    message: 'Choose Vercel environment:',
                    choices: [
                        { name: 'development', value: 'development' },
                        { name: 'preview', value: 'preview' },
                        { name: 'production', value: 'production' }
                    ],
                    default: 'preview'
                }]);
                const ok = await configureVercelEnvVar('FIREBASE_APPCHECK_DEBUG_TOKEN', token, projectPath, envChoice.env);
                if (ok) console.log(chalk.green('Vercel env updated.'));
                else console.log(chalk.yellow('Failed to update Vercel env. Run: vercel env add FIREBASE_APPCHECK_DEBUG_TOKEN'));
            } else {
                console.log(chalk.gray('To set Vercel env later: vercel env add FIREBASE_APPCHECK_DEBUG_TOKEN'));
            }
        }

        printInstructions(token, framework);
    }
};
