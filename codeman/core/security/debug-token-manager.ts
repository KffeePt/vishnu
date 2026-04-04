import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import inquirer from 'inquirer';
import chalk from 'chalk';
import { FrameworkKind, resolveSharedEnvFile, setEnvVar, getEnvVar, tryInjectNextAppCheckSnippet, configureVercelEnvVar } from '../project/env-manager';
import { ProjectIntelligence } from '../state';
import { ProcessUtils } from '../../utils/process-utils';

export interface DebugTokenWorkflowOptions {
    projectPath: string;
    framework: FrameworkKind;
    intelligence: ProjectIntelligence;
}

export type DebugWorkflowResult = 'continue' | 'exit-to-root';

type PromptResult<T> =
    | { kind: 'value'; value: T }
    | { kind: 'back' }
    | { kind: 'exit' };

type KeystoreInfo = {
    keystorePath: string;
    alias: string;
    storePassword?: string;
};

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

function isBackCommand(value: string): boolean {
    return value.trim().toLowerCase() === 'back()';
}

function isExitCommand(value: string): boolean {
    return value.trim().toLowerCase() === 'exit()';
}

async function promptManagedInput(options: {
    message: string;
    defaultValue?: string;
    validate?: (value: string) => true | string;
}): Promise<PromptResult<string>> {
    const input = await inquirer.prompt([{
        type: 'input',
        name: 'value',
        message: options.message,
        default: options.defaultValue ?? '',
        validate: (value: string) => {
            if (isBackCommand(value) || isExitCommand(value)) return true;
            if (!options.validate) return true;
            return options.validate(value);
        }
    }]);

    const value = String(input.value ?? '').trim();
    if (isBackCommand(value)) return { kind: 'back' };
    if (isExitCommand(value)) return { kind: 'exit' };
    return { kind: 'value', value };
}

function runCommandCapture(command: string, args: string[], cwd: string): Promise<{ code: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        let stdout = '';
        let stderr = '';

        child.stdout.on('data', (data: Buffer) => {
            stdout += data.toString();
        });
        child.stderr.on('data', (data: Buffer) => {
            stderr += data.toString();
        });

        child.on('close', (code) => resolve({ code, stdout, stderr }));
        child.on('error', (err) => resolve({ code: null, stdout, stderr: err.message ? `${stderr}\n${err.message}` : stderr }));
    });
}

type FlutterDevice = {
    id: string;
    name: string;
    properties: string;
};

function extractAppCheckToken(text: string): string | null {
    const directMatch = text.match(/allow list.*?:\s*([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})/i);
    if (directMatch?.[1]) {
        return directMatch[1];
    }

    const uuidMatch = text.match(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/i);
    if (!uuidMatch) return null;

    const lower = text.toLowerCase();
    const looksRelevant =
        lower.includes('app check') ||
        lower.includes('appcheck') ||
        lower.includes('debug token') ||
        lower.includes('debug secret') ||
        lower.includes('allow list') ||
        lower.includes('firebaseappcheck') ||
        lower.includes('appcheckprovider') ||
        lower.includes('app_check') ||
        lower.includes('firebase_app_check') ||
        lower.includes('firebase app check');

    return looksRelevant ? uuidMatch[0] : null;
}

async function chooseFlutterDevice(): Promise<string | null> {
    const devices = (await ProcessUtils.getDevices()) as FlutterDevice[];
    if (devices.length === 0) {
        console.log(chalk.red('No Flutter devices were found. Start an emulator/device and try again.'));
        return null;
    }

    if (devices.length === 1) {
        const device = devices[0];
        console.log(chalk.green(`Using Flutter device: ${device.name} (${device.id})`));
        return device.id;
    }

    const { deviceId } = await inquirer.prompt([{
        type: 'list',
        name: 'deviceId',
        message: 'Multiple Flutter devices found. Which one should we use?',
        choices: devices.map(device => ({
            name: `${device.name} (${device.id})`,
            value: device.id
        }))
    }]);

    return deviceId;
}

async function captureFlutterAppCheckToken(projectPath: string): Promise<string | null> {
    const deviceId = await chooseFlutterDevice();
    if (!deviceId) return null;

    console.log(chalk.cyan(`\nLaunching Flutter app on ${deviceId} to capture the App Check debug token...`));
    console.log(chalk.gray('Leave the app running until the token is detected.'));

    return await new Promise<string | null>((resolve) => {
        const child = spawn('flutter', ['run', '-d', deviceId], {
            cwd: projectPath,
            detached: true,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        child.unref();

        let stdoutBuffer = '';
        let stderrBuffer = '';
        let resolved = false;

        const finish = (token: string | null) => {
            if (resolved) return;
            resolved = true;
            clearTimeout(timeout);
            child.stdout.off('data', onStdout);
            child.stderr.off('data', onStderr);
            child.stdout.destroy();
            child.stderr.destroy();
            resolve(token);
        };

        const processBuffer = (buffer: string, chunk: string, write: (text: string) => void) => {
            write(chunk);
            buffer += chunk;

            const immediate = extractAppCheckToken(buffer);
            if (immediate) {
                console.log(chalk.green(`\nCaptured App Check debug token: ${immediate}`));
                finish(immediate);
                return '';
            }

            const lines = buffer.split(/\r?\n/);
            buffer = lines.pop() ?? '';
            for (const rawLine of lines) {
                const token = extractAppCheckToken(rawLine);
                if (token) {
                    console.log(chalk.green(`\nCaptured App Check debug token: ${token}`));
                    finish(token);
                    return '';
                }
            }
            return buffer;
        };

        const onStdout = (data: Buffer) => {
            stdoutBuffer = processBuffer(stdoutBuffer, data.toString(), (text) => process.stdout.write(text));
        };

        const onStderr = (data: Buffer) => {
            stderrBuffer = processBuffer(stderrBuffer, data.toString(), (text) => process.stderr.write(text));
        };

        child.stdout.on('data', onStdout);
        child.stderr.on('data', onStderr);

        child.on('error', (err) => {
            console.log(chalk.red(`\nFailed to launch Flutter app: ${err.message}`));
            finish(null);
        });

        const timeout = setTimeout(() => {
            console.log(chalk.yellow('\nTimed out while waiting for the App Check debug token.'));
            finish(null);
        }, 60 * 1000);
    });
}

function parseKeytoolFingerprints(output: string): { sha1?: string; sha256?: string } {
    const sha1 = output.match(/SHA1:\s*([A-F0-9:]+)/i)?.[1]?.trim();
    const sha256 = output.match(/SHA256:\s*([A-F0-9:]+)/i)?.[1]?.trim();
    return { sha1, sha256 };
}

function resolveAndroidKeystore(projectPath: string): KeystoreInfo | null {
    const keyPropertiesPath = path.join(projectPath, 'android', 'key.properties');
    if (fs.existsSync(keyPropertiesPath)) {
        const raw = fs.readFileSync(keyPropertiesPath, 'utf8');
        const entries = Object.fromEntries(
            raw
                .split(/\r?\n/)
                .map(line => line.trim())
                .filter(line => line && !line.startsWith('#') && line.includes('='))
                .map(line => {
                    const index = line.indexOf('=');
                    return [line.slice(0, index).trim(), line.slice(index + 1).trim()];
                })
        );

        const storeFile = entries.storeFile;
        const alias = entries.keyAlias;
        if (storeFile && alias) {
            const keystorePath = path.isAbsolute(storeFile)
                ? storeFile
                : path.resolve(projectPath, 'android', storeFile);

            if (fs.existsSync(keystorePath)) {
                return {
                    keystorePath,
                    alias,
                    storePassword: entries.storePassword
                };
            }
        }
    }

    const debugKeystorePath = path.join(os.homedir(), '.android', 'debug.keystore');
    if (fs.existsSync(debugKeystorePath)) {
        return {
            keystorePath: debugKeystorePath,
            alias: 'androiddebugkey',
            storePassword: 'android'
        };
    }

    return null;
}

async function showAutoKeytoolFingerprint(projectPath: string): Promise<void> {
    const keystore = resolveAndroidKeystore(projectPath);
    if (!keystore) {
        console.log(chalk.yellow('Could not find an Android keystore automatically, so no SHA-256 fingerprint was printed.'));
        return;
    }

    const args = ['-list', '-v', '-alias', keystore.alias, '-keystore', keystore.keystorePath];
    if (keystore.storePassword) {
        args.push('-storepass', keystore.storePassword);
    }

    console.log(chalk.cyan('\nRunning keytool to extract Android fingerprints...'));
    const result = await runCommandCapture('keytool', args, projectPath);

    if (result.code !== 0) {
        console.log(chalk.red('keytool failed while extracting Android fingerprints.'));
        if (result.stderr.trim()) {
            console.log(chalk.gray(result.stderr.trim()));
        }
        console.log(chalk.gray(`Tried keystore: ${keystore.keystorePath}`));
        console.log(chalk.gray(`Alias: ${keystore.alias}`));
        return;
    }

    const fingerprints = parseKeytoolFingerprints(result.stdout);
    if (fingerprints.sha256) {
        console.log(chalk.green(`Firebase SHA-256 fingerprint: ${fingerprints.sha256}`));
    }
    if (fingerprints.sha1) {
        console.log(chalk.gray(`Firebase SHA-1 fingerprint: ${fingerprints.sha1}`));
    }
    if (!fingerprints.sha1 && !fingerprints.sha256) {
        console.log(chalk.yellow('keytool ran, but no SHA fingerprint was parsed from its output.'));
    }
}

async function promptForTokenAfterRun(existing?: string, detected?: string, autoDetectMissed: boolean = false): Promise<PromptResult<string>> {
    if (detected) {
        const choice = await inquirer.prompt([{
            type: 'list',
            name: 'useDetected',
            message: `Use detected App Check token ${detected}?`,
            choices: [
                { name: 'Use detected token', value: 'use' },
                { name: 'Paste a different token', value: 'paste' },
                { name: 'Skip', value: 'skip' }
            ],
            default: 'use'
        }]);

        if (choice.useDetected === 'use') {
            return { kind: 'value', value: detected };
        }
        if (choice.useDetected === 'skip') {
            return { kind: 'back' };
        }
    }

    if (autoDetectMissed) {
        const continuePrompt = await promptManagedInput({
            message: 'No App Check token was detected automatically. Press Enter to enter it manually:',
            defaultValue: ''
        });
        if (continuePrompt.kind === 'back') return { kind: 'back' };
        if (continuePrompt.kind === 'exit') return { kind: 'exit' };
    }

    const input = await promptManagedInput({
        message: existing
            ? 'Paste the App Check debug token from the app logs, or press Enter to reuse the current token:'
            : 'Paste the App Check debug token from the app logs:',
        defaultValue: existing || '',
        validate: (value: string) => {
            const trimmed = value.trim();
            if (!trimmed && existing) return true;
            return isLikelyUuid(trimmed) ? true : 'Please enter a valid UUID';
        }
    });

    if (input.kind !== 'value') return input;

    const token = input.value.trim();
    if (!token && existing) {
        return { kind: 'value', value: existing };
    }
    return { kind: 'value', value: token };
}

function printInstructions(token: string, framework: FrameworkKind) {
    console.log(chalk.cyan('\nApp Check debug token generated.'));
    console.log(chalk.gray('Add this token in Firebase Console: App Check -> Manage debug tokens -> Add token'));
    console.log(chalk.white(`Token: ${token}`));
    console.log(chalk.gray('\nAlso ensure your Firebase Web API key is in .env (copy from Google Cloud Console).'));

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
    async runDevWorkflow(options: DebugTokenWorkflowOptions): Promise<DebugWorkflowResult> {
        const { projectPath, framework, intelligence } = options;
        const envFile = resolveSharedEnvFile(projectPath);
        const key = resolveDebugKey(framework);
        const existing = getEnvVar(envFile, key);

        let token: string | null = null;

        while (token === null) {
            console.log(chalk.yellow('\nFirebase App Check detected.'));
            const choices = framework === 'flutter'
                ? [
                    { name: 'Skip for now', value: 'skip' },
                    { name: 'Launch app, then enter token', value: 'capture' }
                ]
                : [
                    { name: 'Skip for now', value: 'skip' },
                    { name: 'Enter token manually', value: 'manual' }
                ];

            const answer = await inquirer.prompt([{
                type: 'list',
                name: 'mode',
                message: 'Choose development mode:',
                choices,
                default: 'skip'
            }]);

            if (answer.mode === 'skip') {
                console.log(chalk.gray('Skipping App Check debug setup.'));
                return 'continue';
            }

            if (answer.mode === 'capture') {
                if (framework !== 'flutter') {
                    return 'continue';
                }

                const captured = await captureFlutterAppCheckToken(projectPath);
                const manual = await promptForTokenAfterRun(existing ?? undefined, captured ?? undefined, !captured);
                if (manual.kind === 'back') {
                    console.log(chalk.yellow('Returning to the previous App Check prompt.'));
                    continue;
                }
                if (manual.kind === 'exit') {
                    return 'exit-to-root';
                }
                token = manual.value;
            } else if (answer.mode === 'manual') {
                while (true) {
                    const manual = await promptManagedInput({
                        message: existing
                            ? 'Paste the App Check debug token from the app logs, or press Enter to reuse the current token:'
                            : 'Paste the App Check debug token from the app logs:',
                        defaultValue: existing || '',
                        validate: (value: string) => {
                            const trimmed = value.trim();
                            if (!trimmed && existing) return true;
                            return isLikelyUuid(trimmed) ? true : 'Please enter a valid UUID';
                        }
                    });

                    if (manual.kind === 'back') break;
                    if (manual.kind === 'exit') return 'exit-to-root';

                    token = manual.value.trim() || existing || '';
                    break;
                }
            }
        }

        setEnvVar(envFile, key, token);
        console.log(chalk.green(`Debug token written to ${envFile}`));

        if (framework === 'flutter') {
            await showAutoKeytoolFingerprint(projectPath);
        }

        const browserKey = resolveBrowserKey(framework);
        const existingBrowserKey = getEnvVar(envFile, browserKey);
        while (true) {
            const browserPrompt = await inquirer.prompt([{
                type: 'confirm',
                name: 'setBrowserKey',
                message: 'Add Firebase Web API key to .env now?',
                default: !existingBrowserKey
            }]);

            if (!browserPrompt.setBrowserKey) {
                break;
            }

            const inputKey = await promptManagedInput({
                message: 'Paste the Firebase Web API key (AIza...)',
                validate: (value: string) => isLikelyApiKey(value) ? true : 'API key should start with "AIza"'
            });

            if (inputKey.kind === 'back') {
                continue;
            }
            if (inputKey.kind === 'exit') {
                return 'exit-to-root';
            }

            const apiKeyValue = inputKey.value.trim();
            setEnvVar(envFile, browserKey, apiKeyValue);
            console.log(chalk.green(`Firebase Web API key written to ${envFile}`));
            break;
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
        return 'continue';
    }
};
