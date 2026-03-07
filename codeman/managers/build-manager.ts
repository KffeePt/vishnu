
import { spawn, execSync, exec, SpawnOptions } from 'child_process';
import chalk from 'chalk';
import * as path from 'path';
import fs from 'fs-extra';
import { LockManager } from './lock-manager';
import { ProcessUtils } from '../utils/process-utils';
import { GlobalState } from '../core/state';
import * as net from 'net'; // NEW

export class BuildManager {

    private static getLogDir(): string {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const dateFolder = `${year}-${month}-${day}`;

        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const seconds = String(now.getSeconds()).padStart(2, '0');
        const timeFolder = `${hours}-${minutes}-${seconds}`;

        return path.join('logs', 'bats', dateFolder, timeFolder);
    }

    /**
     * Cleans up the .plugin_symlinks directory in ephemeral folders to prevent Error 183.
     */
    private static async cleanWindowsSymlinks(projectRoot: string): Promise<void> {
        const platforms = ['windows', 'linux', 'macos'];
        for (const platform of platforms) {
            const symlinksPath = path.join(projectRoot, platform, 'flutter', 'ephemeral', '.plugin_symlinks');
            if (await fs.pathExists(symlinksPath)) {
                console.log(chalk.yellow(`[CLEANUP] Removing stale ${platform} .plugin_symlinks...`));
                try {
                    await fs.remove(symlinksPath);
                } catch (e: any) {
                    console.log(chalk.gray(`[CLEANUP] Warning: Failed to clean ${platform} symlinks: ${e.message}`));
                }
            }
        }
    }

    public static async runCommand(cmd: string, args: string[], logFile: string, cwd: string, globalLogFile?: string): Promise<boolean> {
        return new Promise((resolve) => {
            const logStream = fs.createWriteStream(logFile, { flags: 'a' });
            const globalLogStream = globalLogFile ? fs.createWriteStream(globalLogFile, { flags: 'a' }) : null;

            console.log(chalk.gray(`   > Logging to: ${logFile}`));

            const child = spawn(cmd, args, {
                cwd,
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe'] // Pipe stdout/stderr
            });

            // Pipe to file AND console AND global log
            child.stdout.on('data', (data) => {
                const s = data.toString();
                process.stdout.write(s);
                logStream.write(s);
                if (globalLogStream) globalLogStream.write(s);
            });

            child.stderr.on('data', (data) => {
                const s = data.toString();
                process.stderr.write(chalk.red(s));
                logStream.write(s);
                if (globalLogStream) globalLogStream.write(s);
            });

            child.on('close', (code) => {
                logStream.end();
                if (globalLogStream) globalLogStream.end();
                resolve(code === 0);
            });
        });
    }

    private static async checkPort(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(1000);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                resolve(false);
            });
            socket.connect(port, '127.0.0.1');
        });
    }

    private static async ensureWebServer(projectRoot: string, logDir: string, globalLog?: string): Promise<any | null> {
        if (await this.checkPort(8081)) {
            console.log(chalk.green('   > Web Server already running on port 8081.'));
            return null; // Already running
        }

        console.log(chalk.yellow('   > Starting Flutter Web Server on port 8081...'));
        const logPath = path.join(logDir, 'web_server.log');
        const logStream = fs.createWriteStream(logPath, { flags: 'a' });
        const globalLogStream = globalLog ? fs.createWriteStream(globalLog, { flags: 'a' }) : null;

        const child = spawn('flutter', ['run', '-d', 'web-server', '--web-port', '8081'], {
            cwd: projectRoot,
            shell: true,
            stdio: ['ignore', 'pipe', 'pipe']
        });

        return new Promise((resolve) => {
            let ready = false;
            // Setup timeout in case it hangs
            const timeout = setTimeout(() => {
                if (!ready) {
                    console.log(chalk.red('   > Web Server startup timed out.'));
                    resolve(null);
                }
            }, 60000);

            child.stdout.on('data', (data) => {
                const s = data.toString();
                logStream.write(s);
                if (globalLogStream) globalLogStream.write(s);
                // Check for readiness
                if (s.includes('served at') || s.includes('localhost:8081')) {
                    if (!ready) {
                        ready = true;
                        clearTimeout(timeout);
                        console.log(chalk.green('   > Web Server Ready!'));
                        resolve(child);
                    }
                }
            });

            child.stderr.on('data', (data) => {
                const s = data.toString();
                logStream.write(s);
                if (globalLogStream) globalLogStream.write(s);
            });
        });
    }

    static async buildAll(projectRoot: string, buildMode: 'debug' | 'profile' | 'release' = 'debug', version?: string): Promise<void> {
        console.log(chalk.cyan(`\n=== Consultorio Build Manager (${buildMode.toUpperCase()}) ===`));

        const logDir = path.join(projectRoot, this.getLogDir());
        await fs.ensureDir(logDir);
        console.log(`Logs: ${logDir}`);

        // 1. Acquire Lock
        if (!await LockManager.acquire(projectRoot, '.build_lock')) {
            console.log(chalk.red('Failed to acquire lock.'));
            return;
        }

        try {
            await ProcessUtils.killProcess('flutter.exe');
            await ProcessUtils.killProcess('dart.exe');
            await ProcessUtils.killProcess('consultorio.exe');

            // 2.5 Clean Windows symlinks to prevent Error 183
            await this.cleanWindowsSymlinks(projectRoot);

            // 3. Build Runner
            console.log(chalk.cyan('\n[0/3] Running Build Runner...'));
            const success0 = await this.runCommand('flutter', ['pub', 'run', 'build_runner', 'build', '--delete-conflicting-outputs'], path.join(logDir, 'build_runner.log'), projectRoot);
            if (!success0) throw new Error('Build Runner Failed');

            // 4. Windows
            console.log(chalk.cyan(`\n[1/3] Building Windows (${buildMode})...`));
            const success1 = await this.runCommand('flutter', ['build', 'windows', `--${buildMode}`], path.join(logDir, 'windows_build.log'), projectRoot);
            if (!success1) console.log(chalk.red('Windows build failed.'));
            else if (buildMode === 'release' && version) {
                await this.compileInstaller(projectRoot, version, logDir);
            }

            // 5. Android
            console.log(chalk.cyan(`\n[2/3] Building Android APK (${buildMode})...`));
            const success2 = await this.runCommand('flutter', ['build', 'apk', `--${buildMode}`], path.join(logDir, 'android_apk_build.log'), projectRoot);
            if (!success2) console.log(chalk.red('Android build failed.'));

            // 6. Web
            console.log(chalk.cyan(`\n[3/5] Building Web (${buildMode})...`));
            const success3 = await this.runCommand('flutter', ['build', 'web', '--no-wasm-dry-run', `--${buildMode}`], path.join(logDir, 'web_build.log'), projectRoot);
            if (!success3) console.log(chalk.red('Web build failed.'));

            // 7. MacOS
            console.log(chalk.cyan(`\n[4/5] Building macOS (${buildMode})...`));
            await this.buildMac(projectRoot, buildMode, logDir);

            // 8. iOS
            console.log(chalk.cyan(`\n[5/5] Building iOS (${buildMode})...`));
            await this.buildIos(projectRoot, buildMode, logDir);

            console.log(chalk.green('\n✅ All tasks finished.'));

        } catch (e: any) {
            console.log(chalk.red(`\n❌ Error: ${e.message}`));
        } finally {
            await LockManager.release(projectRoot, '.build_lock');
        }
    }

    static async compileInstaller(projectRoot: string, version: string, logDir: string): Promise<void> {
        console.log(chalk.cyan('\n📦 Compiling Windows Installer (Inno Setup)...'));
        const issPath = path.join(projectRoot, 'installers/desktop/setup.iss');
        const isccPath = 'C:\\Program Files (x86)\\Inno Setup 6\\ISCC.exe';

        if (!await fs.pathExists(issPath)) {
            console.log(chalk.yellow('⚠️  Skipping installer: setup.iss not found in installers/desktop/'));
            return;
        }

        if (!await fs.pathExists(isccPath)) {
            console.log(chalk.red('❌ Inno Setup Compiler (ISCC) not found at default location.'));
            console.log(chalk.gray(`Checked: ${isccPath}`));
            return;
        }

        // Run ISCC
        // /DMyAppVersion="1.0.0"
        // /O"..." (Output dir is defined in ISS but can be overridden)
        try {
            await this.runCommand(
                `"${isccPath}"`,
                [`/DMyAppVersion="${version}"`, `"${issPath}"`],
                path.join(logDir, 'installer_build.log'),
                projectRoot
            );
            console.log(chalk.green('✅ Installer compiled successfully: build/windows/installer/setup.exe'));
        } catch (e: any) {
            console.log(chalk.red(`Installer compilation failed: ${e.message}`));
        }
    }

    static async runTests(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n=== Consultorio Test Runner (Enhanced) ==='));

        const logDir = path.join(projectRoot, this.getLogDir());
        const logsSubDir = path.join(logDir, 'logs');
        await fs.ensureDir(logsSubDir);

        if (!await LockManager.acquire(projectRoot, '.tests_lock')) return;

        try {
            // Setup
            await ProcessUtils.killProcess('flutter.exe');

            // 1. Emulator/Device Management
            let targetDeviceId = '';
            let targetDeviceName = 'Windows'; // Default fallback

            const device = await this.ensureEmulator(); // Uses interactive prompt if needed
            if (device) {
                targetDeviceId = device.id;
                targetDeviceName = device.name;
            } else {
                console.log(chalk.yellow('   > No mobile device selected. Some tests may fail or skip.'));
            }

            // Firebase Emulators
            console.log(chalk.cyan('\n[Setup] Starting Firebase Emulators...'));
            const emuLog = path.join(logsSubDir, 'emulator_startup.log');
            const emuStream = fs.openSync(emuLog, 'w');

            const emuChild = spawn('firebase', ['emulators:start'], {
                cwd: projectRoot,
                shell: true,
                detached: true,
                stdio: ['ignore', emuStream, emuStream]
            });
            emuChild.unref();

            console.log(chalk.yellow('   > Waiting for emulators (5s)...'));
            await new Promise(r => setTimeout(r, 5000));

            // Test Results Tracker
            const results = {
                unit: { status: 'PENDING', passed: 0, failed: 0, log: 'unit.log' },
                widget: { status: 'PENDING', passed: 0, failed: 0, log: 'widget.log' },
                integration: { status: 'PENDING', passed: 0, failed: 0, log: 'integration.log' },
                patrol: { status: 'PENDING', passed: 0, failed: 0, log: 'patrol.log' },
                maestro: { status: 'PENDING', passed: 0, failed: 0, log: 'maestro.log' },
                playwright: { status: 'PENDING', passed: 0, failed: 0, log: 'playwright.log' }
            };

            // Global Test Log
            const globalTestLog = path.join(projectRoot, 'logs', 'test.log');
            await fs.ensureDir(path.dirname(globalTestLog));
            await fs.writeFile(globalTestLog, `=== Test Run Combined Log: ${new Date().toLocaleString()} ===\n\n`);

            const startTime = Date.now();

            // --- 1. Unit Tests ---
            console.log(chalk.cyan('\n[1/6] Running Unit Tests...'));
            const unitSuccess = await this.runCommand(
                'flutter', ['test', 'test/unit/', '--reporter', 'expanded'],
                path.join(logsSubDir, 'unit.log'), projectRoot,
                globalTestLog
            );
            results.unit.status = unitSuccess ? '✅ PASS' : '❌ FAIL';
            // Simple count parsing could be added here if needed

            // --- 2. Widget Tests ---
            console.log(chalk.cyan('\n[2/6] Running Widget Tests...'));
            const widgetSuccess = await this.runCommand(
                'flutter', ['test', 'test/widget/', '--reporter', 'expanded'],
                path.join(logsSubDir, 'widget.log'), projectRoot,
                globalTestLog
            );
            results.widget.status = widgetSuccess ? '✅ PASS' : '❌ FAIL';

            // --- 3. Integration Tests ---
            console.log(chalk.cyan('\n[3/6] Running Integration Tests...'));
            let integrationCmdArgs = ['test', 'integration_test/app_test.dart'];
            if (targetDeviceId) {
                console.log(chalk.gray(`   > Targeting device: ${targetDeviceId}`));
                integrationCmdArgs.push('-d', targetDeviceId);
            } else if (process.platform === 'win32') {
                console.log(chalk.gray('   > Targeting Windows (fallback)'));
                integrationCmdArgs.push('-d', 'windows');
            }

            const integrationSuccess = await this.runCommand(
                'flutter', integrationCmdArgs,
                path.join(logsSubDir, 'integration.log'), projectRoot,
                globalTestLog
            );
            results.integration.status = integrationSuccess ? '✅ PASS' : '❌ FAIL';

            // --- 4. Patrol Tests ---
            console.log(chalk.cyan('\n[4/6] Running Patrol E2E...'));
            if (targetDeviceId) {
                // Check if patrol is installed
                if (await ProcessUtils.checkCommand('patrol')) {
                    const patrolSuccess = await this.runCommand(
                        'patrol', ['test', '--target', 'test/patrol/', '--device', targetDeviceId],
                        path.join(logsSubDir, 'patrol.log'), projectRoot,
                        globalTestLog
                    );
                    results.patrol.status = patrolSuccess ? '✅ PASS' : '❌ FAIL';
                } else {
                    console.log(chalk.yellow('   > Patrol CLI not found. Skipping.'));
                    results.patrol.status = '⚠️ SKIP';
                }
            } else {
                console.log(chalk.yellow('   > No mobile device for Patrol. Picking Windows/Skipping.'));
                results.patrol.status = '⚠️ SKIP';
            }

            // --- 5. Maestro Tests ---
            console.log(chalk.cyan('\n[5/6] Running Maestro Flows...'));
            if (targetDeviceId) {
                if (await ProcessUtils.checkCommand('maestro')) {
                    const maestroSuccess = await this.runCommand(
                        'maestro', ['test', '.maestro/journeys/'],
                        path.join(logsSubDir, 'maestro.log'), projectRoot,
                        globalTestLog
                    );
                    results.maestro.status = maestroSuccess ? '✅ PASS' : '❌ FAIL';
                } else {
                    console.log(chalk.yellow('   > Maestro CLI not found. Skipping.'));
                    results.maestro.status = '⚠️ SKIP';
                }
            } else {
                results.maestro.status = '⚠️ SKIP';
            }

            // --- 6. Playwright Tests ---
            console.log(chalk.cyan('\n[6/6] Running Playwright (Web)...'));
            const playwrightDir = path.join(projectRoot, 'test', 'playwright');
            if (await fs.pathExists(playwrightDir)) {
                // Ensure dependencies
                await this.ensurePlaywrightDependencies(playwrightDir);

                // Ensure Web Server
                const webServer = await this.ensureWebServer(projectRoot, logsSubDir, globalTestLog);

                const pwSuccess = await this.runCommand(
                    'npx', ['playwright', 'test'],
                    path.join(logsSubDir, 'playwright.log'), playwrightDir,
                    globalTestLog
                );
                results.playwright.status = pwSuccess ? '✅ PASS' : '❌ FAIL';

                if (webServer) {
                    console.log(chalk.yellow('   > Stopping temporary Web Server...'));
                    webServer.kill();
                }
            } else {
                results.playwright.status = '⚠️ SKIP';
            }

            // --- Report Generation ---
            const duration = ((Date.now() - startTime) / 1000).toFixed(1);
            const passedCount = Object.values(results).filter(r => r.status.includes('PASS')).length;
            const failedCount = Object.values(results).filter(r => r.status.includes('FAIL')).length;

            const reportPath = path.join(projectRoot, 'logs', 'tests', 'report.md');
            await fs.ensureDir(path.dirname(reportPath));

            const reportContent = `
# 🧪 Test Report — Consultorio
**Generated**: ${new Date().toLocaleString()}
**Duration**: ${duration}s
**Target Device**: ${targetDeviceName} (${targetDeviceId || 'None'})

## Results Summary
✅ **${passedCount} Passed** · ❌ **${failedCount} Failed**

| # | Layer | Status | Log File |
|---|-------|--------|----------|
| 1 | Unit Tests | ${results.unit.status} | [unit.log](./logs/unit.log) |
| 2 | Widget Tests | ${results.widget.status} | [widget.log](./logs/widget.log) |
| 3 | Integration | ${results.integration.status} | [integration.log](./logs/integration.log) |
| 4 | Patrol (E2E) | ${results.patrol.status} | [patrol.log](./logs/patrol.log) |
| 5 | Maestro (E2E) | ${results.maestro.status} | [maestro.log](./logs/maestro.log) |
| 6 | Playwright | ${results.playwright.status} | [playwright.log](./logs/playwright.log) |

---
*Auto-generated by Codeman TUI*
`;
            await fs.writeFile(reportPath, reportContent.trim());
            console.log(chalk.green(`\n📄 Report generated: ${reportPath}`));

            // --- Generate details.md (structured project index for AI agents) ---
            await this.generateDetailsFile(projectRoot, results);

            // Cleanup
            console.log(chalk.yellow('Stopping Emulators...'));
            await ProcessUtils.killProcess('java.exe', true); // Kill firebase emulators

        } catch (e: any) {
            console.log(chalk.red(e.message));
        } finally {
            await LockManager.release(projectRoot, '.tests_lock');
        }
    }

    static async launchEmulatorInteractive(filter?: 'android' | 'ios'): Promise<void> {
        const inquirer = (await import('inquirer')).default;

        // 1. Check for running emulators first
        console.log(chalk.cyan('Checking for running emulators...'));
        let running = await ProcessUtils.getRunningEmulators();

        // Filter running if needed
        if (filter) {
            if (filter === 'android') {
                running = running.filter(e => !e.id.toLowerCase().includes('ios') && !e.name.toLowerCase().includes('ios'));
            } else if (filter === 'ios') {
                running = running.filter(e => e.id.toLowerCase().includes('ios') || e.name.toLowerCase().includes('ios'));
            }
        }

        if (running.length > 0) {
            console.log(chalk.yellow(`\n⚠️  Found ${running.length} running emulator(s):`));
            running.forEach(e => console.log(chalk.gray(`   - ${e.name} (${e.id})`)));

            const { action } = await inquirer.prompt([{
                type: 'list',
                name: 'action',
                message: 'Choose action:',
                choices: [
                    { name: '✨ Launch New (Ignore Running)', value: 'new' },
                    { name: '💀 Kill Running & Launch New', value: 'kill_launch' },
                    { name: '❌ Cancel', value: 'cancel' }
                ]
            }]);

            if (action === 'cancel') return;
            if (action === 'kill_launch') {
                await ProcessUtils.killAllEmulators();
                await new Promise(r => setTimeout(r, 2000)); // Wait for cleanup
            }
        }

        // 2. Fetch available emulators to launch
        console.log(chalk.cyan('Fetching available emulators...'));
        let emulators = await ProcessUtils.getEmulators();

        if (filter) {
            if (filter === 'android') {
                emulators = emulators.filter(e => !e.id.toLowerCase().includes('ios') && !e.name.toLowerCase().includes('ios'));
            } else if (filter === 'ios') {
                emulators = emulators.filter(e => e.id.toLowerCase().includes('ios') || e.name.toLowerCase().includes('ios') || e.name.toLowerCase().includes('iphone') || e.name.toLowerCase().includes('ipad'));
            }
        }

        if (emulators.length === 0) {
            console.log(chalk.red(`No ${filter || ''} emulators found to launch.`));
            return;
        }

        const choices = emulators.map(e => ({
            name: `${e.name} (${e.id})`,
            value: e.id
        }));

        const { target } = await inquirer.prompt([{
            type: 'list',
            name: 'target',
            message: 'Select Emulator to Launch:',
            choices: [...choices, { name: 'Cancel', value: 'cancel' }]
        }]);

        if (target !== 'cancel') {
            await ProcessUtils.launchEmulator(target);
            console.log(chalk.green(`Launched ${target} in background.`));
        }
    }

    static async killAllRunners(): Promise<void> {
        console.log(chalk.red('Terminating all runners & emulators...'));
        await ProcessUtils.killAllEmulators();

        // Kill App Instances
        if (process.platform === 'win32') {
            await ProcessUtils.killProcess('consultorio.exe', true);
        } else if (process.platform === 'darwin') {
            await ProcessUtils.killProcess('Consultorio', true);
        }

        // Kill Flutter/Dart to stop any detached runners or zombies
        await ProcessUtils.killProcess('flutter', true);
        await ProcessUtils.killProcess('dart', true);
    }

    // Specific Runners
    static async startProcess(projectRoot: string, platform: 'windows' | 'web' | 'android' | 'macos' | 'ios'): Promise<void> {
        console.log(chalk.green(`\n🚀 Starting Flutter on ${platform} in a new terminal...`));

        // Pre-launch Cleanup: Kill previous instances of the APP (not emulators) to prevent locking
        // We kill 'flutter' to stop previous run commands which might be holding locks
        await ProcessUtils.killProcess('flutter', true);
        await ProcessUtils.killProcess('dart', true); // Often dart process holds file locks

        if (platform === 'windows') {
            // specific windows exe
            await ProcessUtils.killProcess('consultorio.exe', true);
        }

        let command = '';
        let args: string[] = [];

        // Construct the flutter command
        const flutterCmd = `flutter run -d ${platform}`;

        if (process.platform === 'win32') {
            // Windows: Use 'start' to open a new cmd window
            // /k keeps the window open, /c closes it after command finishes (but we want to see output)
            // 'start "Title" cmd /k ...'
            command = 'start';
            args = [`"Run ${platform}"`, 'cmd', '/k', `"${flutterCmd}"`];
        } else if (process.platform === 'darwin') {
            // macOS: Use 'open -a Terminal' or AppleScript
            // 'open -a Terminal path' opens a terminal at path, checking if we can pass a command
            // Standard way: create a temporary script or use osascript
            // Simpler: use 'osascript' to tell Terminal to do script
            const script = `tell application "Terminal" to do script "cd \\"${projectRoot}\\" && ${flutterCmd}"`;
            command = 'osascript';
            args = ['-e', script];
        } else {
            // Linux fallback (gnome-terminal, xterm, etc.) - simple spawn for now or TODO
            // Assuming user is mostly Windows/Mac for this request
            console.log(chalk.yellow('Detached terminal not fully supported on this OS yet. Running attached.'));
            command = 'flutter';
            args = ['run', '-d', platform];
        }

        const child = spawn(command, args, {
            cwd: projectRoot,
            stdio: 'ignore', // Detached
            shell: true,
            detached: true
        });

        child.unref();

        await new Promise(r => setTimeout(r, 2000)); // Give it a moment to launch
        console.log(chalk.green('Process launched in background.'));
    }

    // --- Apple Build Scaffolding ---

    static async buildMac(projectRoot: string, buildMode: 'debug' | 'profile' | 'release' = 'release', logDir: string): Promise<boolean> {
        if (process.platform !== 'darwin') {
            console.log(chalk.gray('Skipping macOS build (not on macOS).'));
            return true; // Graceful skip
        }

        console.log(chalk.cyan(`\n🍎 Building macOS (${buildMode})...`));

        // 1. Check Xcode
        try {
            execSync('xcode-select -p', { stdio: 'ignore' });
        } catch {
            console.log(chalk.red('❌ Xcode not found. Skipping macOS build.'));
            return false;
        }

        // 2. Build .app
        const success = await this.runCommand(
            'flutter',
            ['build', 'macos', `--${buildMode}`],
            path.join(logDir, 'macos_build.log'),
            projectRoot
        );

        if (!success) {
            console.log(chalk.red('❌ macOS build failed.'));
            return false;
        }

        // 3. Package as DMG (Optional but good for distribution)
        // Simple hdiutil command for now
        if (buildMode === 'release') {
            console.log(chalk.cyan('📦 Packaging macOS App as DMG...'));
            const appName = 'Consultorio'; // Adjust if needed
            const appPath = path.join(projectRoot, 'build/macos/Build/Products/Release', `${appName}.app`);
            const dmgPath = path.join(projectRoot, 'build/macos/Build/Products/Release', `${appName}.dmg`);

            try {
                // Remove existing
                if (await fs.pathExists(dmgPath)) await fs.remove(dmgPath);

                await this.runCommand(
                    'hdiutil',
                    ['create', '-volname', appName, '-srcfolder', `"${appPath}"`, '-ov', '-format', 'UDZO', `"${dmgPath}"`],
                    path.join(logDir, 'macos_dmg.log'),
                    projectRoot
                );
                console.log(chalk.green(`✅ DMG created: ${dmgPath}`));
            } catch (e) {
                console.log(chalk.yellow(`⚠️  DMG packaging failed (Manual packaging may be required).`));
            }
        }

        return true;
    }

    static async buildIos(projectRoot: string, buildMode: 'debug' | 'profile' | 'release' = 'release', logDir: string): Promise<boolean> {
        if (process.platform !== 'darwin') {
            console.log(chalk.gray('Skipping iOS build (not on macOS).'));
            return true; // Graceful skip
        }

        console.log(chalk.cyan(`\n📱 Building iOS IPA (${buildMode})...`));

        // 1. Check Xcode
        try {
            execSync('xcode-select -p', { stdio: 'ignore' });
        } catch {
            console.log(chalk.red('❌ Xcode not found. Skipping iOS build.'));
            return false;
        }

        // 2. Build IPA used for distribution (AdHoc or AppStore)
        // --no-codesign is useful for CI or when certs aren't set up yet, 
        // but for a real release we usually need signing.
        // We will default to trying with signing, but if it fails, user might need to open Xcode.
        // For scaffolding, we'll assume signing is managed by Xcode.

        const args = ['build', 'ipa', `--${buildMode}`];
        // if (process.env.CI) args.push('--no-codesign'); // Optional check

        const success = await this.runCommand(
            'flutter',
            args,
            path.join(logDir, 'ios_build.log'),
            projectRoot
        );

        if (!success) {
            console.log(chalk.red('❌ iOS build failed. (Check signing in Xcode?)'));
            return false;
        }

        console.log(chalk.green(`✅ iOS IPA built: build/ios/ipa/Consultorio.ipa`));
        return true;
    }

    private static async ensureEmulator(): Promise<{ id: string, name: string } | null> {
        const { ProcessUtils } = await import('../utils/process-utils');
        const chalk = (await import('chalk')).default;
        const inquirer = (await import('inquirer')).default;

        console.log(chalk.cyan('\n[Setup] Checking for running emulators...'));
        const running = await ProcessUtils.getRunningEmulators();

        if (running.length > 0) {
            if (running.length === 1) {
                console.log(chalk.green(`   > Found running emulator: ${running[0].name} (${running[0].id})`));
                return running[0];
            } else {
                // Multiple running - ask user
                const { selectedRunning } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'selectedRunning',
                        message: 'Multiple running emulators found. Which one to use?',
                        choices: running.map(e => ({ name: `${e.name} (${e.id})`, value: e }))
                    }
                ]);
                return selectedRunning;
            }
        }

        console.log(chalk.yellow('   > No running emulators found. Attempting to launch one...'));
        const available = await ProcessUtils.getEmulators();

        if (available.length > 0) {
            let targetEmulator = available[0];

            if (available.length > 1) {
                const { selectedEmulator } = await inquirer.prompt([
                    {
                        type: 'list',
                        name: 'selectedEmulator',
                        message: 'Select an emulator to launch:',
                        choices: available.map(e => ({ name: `${e.name} (${e.id})`, value: e }))
                    }
                ]);
                targetEmulator = selectedEmulator;
            } else {
                console.log(chalk.cyan(`   > Only one emulator found. Launching ${targetEmulator.name}...`));
            }

            console.log(chalk.cyan(`   > Launching ${targetEmulator.name}...`));
            await ProcessUtils.launchEmulator(targetEmulator.id);

            console.log(chalk.yellow('   > Waiting for device to be ready (max 60s)...'));
            let attempts = 0;
            while (attempts < 12) {
                await new Promise(r => setTimeout(r, 5000));
                const current = await ProcessUtils.getRunningEmulators();
                // Match by ID or Name (sometimes ID changes slightly 5554 vs original)
                // But usually we can just find *any* running that matches partially or is new
                // Simplest is to find one that matches the launched ID or Name
                const found = current.find(e => e.id === targetEmulator.id || e.name === targetEmulator.name) || current[0];

                if (found) {
                    console.log(chalk.green(`   > Device ready: ${found.name} (${found.id})`));
                    return found;
                }
                attempts++;
            }
        }

        console.log(chalk.red('   > No emulators available to launch.'));
        return null;
    }

    static async runUnitTests(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n=== Unit Tests ==='));
        await this.runCommand('flutter', ['test', 'test/unit/', '--reporter', 'expanded'], path.join(projectRoot, 'logs/manual/unit_manual.log'), projectRoot);
    }

    static async runWidgetTests(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n=== Widget Tests ==='));
        await this.runCommand('flutter', ['test', 'test/widget/', '--reporter', 'expanded'], path.join(projectRoot, 'logs/manual/widget_manual.log'), projectRoot);
    }

    static async runPatrolTests(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n=== Patrol Tests ==='));
        const device = await this.ensureEmulator();
        if (device) {
            await this.runCommand('patrol', ['test', '--target', 'test/patrol/', '--device', device.id], path.join(projectRoot, 'logs/manual/patrol_manual.log'), projectRoot);
        }
    }

    static async runMaestroTests(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n=== Maestro Tests ==='));
        const device = await this.ensureEmulator();
        if (device) {
            await this.runCommand('maestro', ['test', '.maestro/journeys/'], path.join(projectRoot, 'logs/manual/maestro_manual.log'), projectRoot);
        }
    }

    private static async ensurePlaywrightDependencies(playwrightDir: string): Promise<void> {
        const chalk = (await import('chalk')).default;
        const fs = await import('fs-extra');
        const path = await import('path');

        const nodeModules = path.join(playwrightDir, 'node_modules');
        if (!await fs.pathExists(nodeModules)) {
            console.log(chalk.yellow('   > Playwright dependencies missing. Installing...'));
            await this.runCommand('npm', ['install'], path.join(playwrightDir, 'npm_install.log'), playwrightDir);

            console.log(chalk.yellow('   > Installing Playwright Browsers...'));
            await this.runCommand('npx', ['playwright', 'install'], path.join(playwrightDir, 'pw_install.log'), playwrightDir);
        }
    }

    static async runPlaywrightTests(projectRoot: string): Promise<void> {
        console.log(chalk.cyan('\n=== Playwright Tests ==='));
        const playwrightDir = path.join(projectRoot, 'test', 'playwright');
        await this.ensurePlaywrightDependencies(playwrightDir);
        await this.runCommand('npx', ['playwright', 'test'], path.join(projectRoot, 'logs/manual/playwright_manual.log'), playwrightDir);
    }

    /**
     * Auto-generates `logs/tests/details.md` — a structured project index
     * with line-span references for AI agents to selectively view_file.
     */
    static async generateDetailsFile(
        projectRoot: string,
        testResults?: Record<string, { status: string; passed: number; failed: number; log: string }>
    ): Promise<void> {
        console.log(chalk.cyan('\n📋 Generating details.md (project index)...'));

        const detailsPath = path.join(projectRoot, 'logs', 'tests', 'details.md');
        await fs.ensureDir(path.dirname(detailsPath));

        // Helper: count lines in a file
        const lineCount = async (filePath: string): Promise<number> => {
            try {
                const content = await fs.readFile(filePath, 'utf8');
                return content.split('\n').length;
            } catch { return 0; }
        };

        // Helper: scan a directory for .dart files and return { relativePath, lines }
        const scanDir = async (dir: string, extensions: string[] = ['.dart']): Promise<Array<{ rel: string; lines: number }>> => {
            const results: Array<{ rel: string; lines: number }> = [];
            if (!await fs.pathExists(dir)) return results;

            const walk = async (current: string) => {
                const entries = await fs.readdir(current, { withFileTypes: true });
                for (const entry of entries) {
                    const full = path.join(current, entry.name);
                    if (entry.isDirectory()) {
                        await walk(full);
                    } else if (extensions.some(ext => entry.name.endsWith(ext))) {
                        const lines = await lineCount(full);
                        const rel = path.relative(projectRoot, full).replace(/\\/g, '/');
                        results.push({ rel, lines });
                    }
                }
            };
            await walk(dir);
            return results;
        };

        // Scan key directories
        const coreFiles = await scanDir(path.join(projectRoot, 'lib', 'core'));
        const serviceFiles = await scanDir(path.join(projectRoot, 'lib', 'services'));
        const modelFiles = await scanDir(path.join(projectRoot, 'lib', 'models'));
        const testFiles = await scanDir(path.join(projectRoot, 'test'));
        const integrationFiles = await scanDir(path.join(projectRoot, 'integration_test'));

        // Build markdown
        const now = new Date().toISOString().split('T')[0];

        const buildTable = (files: Array<{ rel: string; lines: number }>) => {
            if (files.length === 0) return '| (none found) | — |\n';
            return files
                .sort((a, b) => a.rel.localeCompare(b.rel))
                .map(f => `| \`${f.rel}\` | L1–L${f.lines} (${f.lines} lines) |`)
                .join('\n');
        };

        let testResultsSection = '';
        if (testResults) {
            const rows = Object.entries(testResults)
                .map(([layer, r]) => `| ${layer} | ${r.status} | \`${r.log}\` |`)
                .join('\n');
            testResultsSection = `
## Latest Test Results
| Layer | Status | Log |
|-------|--------|-----|
${rows}
`;
        }

        const content = `# Consultorio — Project Details Index
> Machine-readable reference for AI agents. Use line ranges to view_file only the sections you need.
> Auto-generated by Codeman on ${now}

---
${testResultsSection}
## Core (lib/core/)
| File | Lines |
|------|-------|
${buildTable(coreFiles)}

## Services (lib/services/)
| File | Lines |
|------|-------|
${buildTable(serviceFiles)}

## Models (lib/models/)
| File | Lines |
|------|-------|
${buildTable(modelFiles)}

## Tests (test/)
| File | Lines |
|------|-------|
${buildTable(testFiles)}

## Integration Tests (integration_test/)
| File | Lines |
|------|-------|
${buildTable(integrationFiles)}

## Testing Strategy
> Tests rely on the **cached Firebase Auth session** on the device/emulator.
> Log in manually before running the test suite. The app will auto-detect the cached session.
> Google Sign-In should be tested manually on a Pixel 8 emulator.

## Analytics Event Taxonomy (English, snake_case)
| Category | Event Name | Params |
|----------|-----------|--------|
| Screen | \`screen_view\` | \`screen_name\` |
| Auth | \`login_success\` | \`method\` |
| Auth | \`login_failed\` | \`method\`, \`error\` |
| Booking | \`appointment_created\` | \`doctor_id\` |
| Booking | \`appointment_cancelled\` | \`appointment_id\` |
| Payment | \`payment_completed\` | \`amount\` |
| Error | \`api_timeout_error\` | \`endpoint\` |
| Error | \`permission_denied\` | \`context\` |

---
*Auto-generated by Codeman TUI*
`;

        await fs.writeFile(detailsPath, content.trim());
        console.log(chalk.green(`📋 details.md generated: ${detailsPath}`));
    }
}
