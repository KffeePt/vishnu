
import { registerScript } from '../core/schema-factory';
import { state } from '../core/state';
import chalk from 'chalk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

import { registerCreateHandlers } from '../menus/create-project';

// Re-export definitions for Registry
export { MainMenuDef } from '../menus/definitions/main-menu';
export { ConfigMenuDef } from '../menus/definitions/config-menu';
export { CreateProjectMenuDef } from '../menus/definitions/create-project-menu';
export { JobsMenuDef } from '../menus/definitions/jobs-menu';

// Placeholder for Tests
import { MenuDefinition } from '../schemas/menu-schema';
export const NextJsTestsMenuDef: MenuDefinition = {
    id: 'nextjs-tests',
    title: '🧪 Next.js Tests',
    type: 'static',
    options: [
        { label: 'Run Unit Tests', value: 'test-unit', action: { type: 'script', handler: 'runUnitTests' } },
        { label: 'Run E2E Tests', value: 'test-e2e', action: { type: 'script', handler: 'runE2ETests' } },
        { label: '👈 Back', value: 'back', action: { type: 'back' } }
    ]
};

export const AdminGenMenuDef: MenuDefinition = {
    id: 'admin-gen',
    title: '🔒 Admin Generators',
    type: 'static',
    options: [
        { label: '📄 Admin Page Route', value: 'admin-page', action: { type: 'script', handler: 'createAdminPageRoute' } },
        { label: '⚡ Admin API Route', value: 'admin-api', action: { type: 'script', handler: 'createAdminApiRoute' } },
        { label: '🚀 Full Stack Admin Feature', value: 'full-stack-admin', action: { type: 'script', handler: 'createFullStackAdmin' } },
        { label: '👈 Back', value: 'back', action: { type: 'back' } }
    ]
};

export { AIMenuDef } from '../menus/definitions/ai-menu';
export { BoilerplateMenuDef } from '../menus/definitions/boilerplates-menu';
export { DevDojoMenuDef } from '../menus/definitions/dev-dojo-menu';
export { BuildMenuDef } from '../menus/definitions/build-menu';
export { DevOpsMenuDef } from '../menus/definitions/dev-ops-menu';
export { SettingsMenuDef } from '../menus/definitions/settings-menu';
export { UpdateMenuDef } from '../menus/definitions/update-menu';
export { MaintenanceMenuDef } from '../menus/definitions/maintenance-menu';
export { BranchingMenuDef } from '../menus/definitions/branching-menu';
export { DocActionsMenuDef } from '../menus/definitions/doc-actions-menu';

// Export Definitions
// (Duplicate exports removed)

// Register Create Handlers early
registerCreateHandlers();

// Register Settings Menu
import { SettingsMenuDef } from '../menus/definitions/settings-menu';
import { UpdateMenuDef } from '../menus/definitions/update-menu';
import { createSchemaMenu } from '../core/schema-factory';
import { registry } from '../core/registry';
import { JobsMenuDef } from '../menus/definitions/jobs-menu';
import { DocActionsMenuDef } from '../menus/definitions/doc-actions-menu';

registry.register(createSchemaMenu(SettingsMenuDef));
registry.register(createSchemaMenu(UpdateMenuDef));
registry.register(createSchemaMenu(NextJsTestsMenuDef));
registry.register(createSchemaMenu(AdminGenMenuDef));
registry.register(createSchemaMenu(JobsMenuDef));
registry.register(createSchemaMenu(DocActionsMenuDef));
import { MaintenanceMenuDef } from '../menus/definitions/maintenance-menu';
import { BranchingMenuDef } from '../menus/definitions/branching-menu';
import { MaintDeployMenuDef } from '../menus/definitions/maint-deploy-menu';
registry.register(createSchemaMenu(MaintenanceMenuDef));
registry.register(createSchemaMenu(BranchingMenuDef));
registry.register(createSchemaMenu(MaintDeployMenuDef));

import { BatsMenuDef } from '../menus/definitions/bats-menu';
registry.register(createSchemaMenu(BatsMenuDef));

// import { BuildMenuDef } from '../menus/definitions/build-menu';
// registry.register(createSchemaMenu(BuildMenuDef));

import { DevOpsMenuDef } from '../menus/definitions/dev-ops-menu';
registry.register(createSchemaMenu(DevOpsMenuDef));

// Register Legacy Menus
import { DeleteAssetsMenu, DeleteConfirmationMenu } from '../menus/delete-assets';
registry.register(DeleteAssetsMenu);
registry.register(DeleteConfirmationMenu);

// Register User Manager
import { UserManager, UserActionMenu } from '../core/users-manager';
registry.register(UserManager);
registry.register(UserActionMenu);

// --- Script Handlers ---

registerScript('restartCLI', async () => {
    state.shouldRestart = true;
    state.restartTargetNode = 'ROOT'; // Clean restart to Launcher
});

registerScript('toggleCloudFeatures', async () => {
    const configPath = path.join(process.cwd(), '.codeman.json');
    let config: any = {};
    if (fs.existsSync(configPath)) {
        try {
            config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
        } catch { }
    }

    const current = config.cloud_features === true;
    // Toggle
    config.cloud_features = !current;

    fs.writeFileSync(configPath, JSON.stringify(config, null, 2));

    const status = config.cloud_features ? 'ENABLED' : 'DISABLED';
    const color = config.cloud_features ? chalk.green : chalk.red;

    console.log(color(`\nCloud features (Firebase) are now ${status}.`));

    if (config.cloud_features) {
        console.log(chalk.gray('Run "Restart CLI" to trigger setup wizard if needed.'));
    }
    await new Promise(r => setTimeout(r, 2000));
});

registerScript('updateRepair', async () => {
    const { spawn } = await import('child_process');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('\n🛠️  Repairing CodeMan (Force Pull/Reset)...'));
    const rootDir = process.cwd();
    console.log(chalk.gray(`Target: ${rootDir}`));
    try {
        const { execSync } = await import('child_process');
        const remote = execSync('git remote get-url origin', { cwd: rootDir, stdio: 'pipe' }).toString().trim();
        if (remote) {
            console.log(chalk.gray(`Remote: ${remote}`));
            if (remote.startsWith('https://')) {
                console.log(chalk.yellow('Note: Remote is HTTPS. SSH remotes are supported if configured.'));
            }
        }
    } catch { }

    const run = (cmd: string, args: string[]) => new Promise<boolean>((resolve) => {
        const child = spawn(cmd, args, { stdio: 'inherit', shell: true, cwd: rootDir });
        child.on('close', (code) => resolve(code === 0));
    });

    console.log(chalk.blue('Fetching...'));
    await run('git', ['fetch', '--all']);
    console.log(chalk.blue('Resetting...'));
    console.log(chalk.blue('Resetting...'));
    await run('git', ['reset', '--hard', 'origin/main']);
    console.log(chalk.blue('Cleaning untracked files...'));
    await run('git', ['clean', '-fd']); // Ensure it's a true "Incoming/Force" state
    console.log(chalk.blue('Pulling...'));
    const success = await run('git', ['pull']);

    if (success) {
        console.log(chalk.green('\n✅ Repair successful! Restarting CodeMan automatically...'));
        await new Promise(r => setTimeout(r, 2000));
        state.shouldRestart = true;
        state.restartTargetNode = 'ROOT';
        return; // Break and trigger restart via engine
    } else {
        console.log(chalk.red('\n❌ Repair failed.'));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
        return 'settings'; // Or 'update-menu'
    }
});

registerScript('updateSync', async () => {
    const { spawn } = await import('child_process');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('\n🔄 Syncing CodeMan (Push & Pull)...'));
    const rootDir = process.cwd();
    console.log(chalk.gray(`Target: ${rootDir}`));
    try {
        const { execSync } = await import('child_process');
        const remote = execSync('git remote get-url origin', { cwd: rootDir, stdio: 'pipe' }).toString().trim();
        if (remote) {
            console.log(chalk.gray(`Remote: ${remote}`));
            if (remote.startsWith('https://')) {
                console.log(chalk.yellow('Note: Remote is HTTPS. SSH remotes are supported if configured.'));
            }
        }
    } catch { }

    const run = (cmd: string, args: string[]) => new Promise<boolean>((resolve) => {
        const child = spawn(cmd, args, { stdio: 'inherit', shell: true, cwd: rootDir });
        child.on('close', (code) => resolve(code === 0));
    });

    console.log(chalk.blue('Adding changes...'));
    await run('git', ['add', '.']);
    const timestamp = new Date().toLocaleString();
    const message = `Update: Codeman CLI push [${timestamp}]`;
    console.log(chalk.blue('Committing...'));
    // Quote the message for shell: true
    await run('git', ['commit', '-m', `"${message}"`]);
    console.log(chalk.blue('Pushing (Forcing to overwrite remote)...'));
    const pushed = await run('git', ['push', '--force']);

    if (pushed) {
        console.log(chalk.blue('Pulling (keeping local changes on conflict)...'));
        // Pull with strategy to favor local changes (ours) in case of conflict
        // Note: In a pull/merge, "ours" is the current branch (local).
        const pulled = await run('git', ['pull', '--strategy-option', 'ours']);
        if (pulled) {
            console.log(chalk.green('\n✅ Sync successful! Restarting CodeMan automatically...'));
            await new Promise(r => setTimeout(r, 2000));
            state.shouldRestart = true;
            state.restartTargetNode = 'ROOT';
            return;
        } else {
            console.log(chalk.red('\n❌ Pull failed (Push worked).'));
        }
    } else {
        console.log(chalk.red('\n❌ Push failed. Aborting pull.'));
    }

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'settings';
});

// --- Helper: Auth & Env Detection ---
// Now imported from core/auth-helper to share with create-project

registerScript('setupFirebaseAuth', async () => {
    const { EnvSetupManager } = await import('../managers/env-setup');
    await EnvSetupManager.verifyAndSetupEnv(true); // Force validation
});

// --- Specific Handlers Updates ---

registerScript('useCurrentFolder', async () => {
    const { SessionLoader } = await import('../managers/session-loader');
    const success = await SessionLoader.load(process.cwd());
    if (success) {
        return 'ROOT';
    }
    return 'ROOT';
});

registerScript('closeProject', async () => {
    state.project.rootPath = '';
    state.setProjectType('unknown');
});

registerScript('exitCLI', async () => {
    process.exit(0);
});

registerScript('restartSession', async () => {
    console.log(chalk.yellow('\n🔄 Reloading Project Session...'));
    await new Promise(r => setTimeout(r, 500));

    if (state.project.rootPath) {
        // Re-run critical setup checks
        const { checkAndSetupAuth } = await import('../core/auth-helper');
        const ok = await checkAndSetupAuth(state.project.rootPath);
        if (!ok) {
            state.project.rootPath = '';
            state.setProjectType('unknown');
            state.user = undefined;
            state.authBypass = false;
            state.rawIdToken = undefined;
            return 'ROOT';
        }
    }
    return 'ROOT';
});

registerScript('resumeSession', async () => {
    console.log(chalk.blue('\nAttempting to resume last session...'));
    const { GlobalStateManager } = await import('../managers/global-state-manager');
    const manager = new GlobalStateManager();
    const last = manager.getLastActive();

    if (last && last.path) {
        const { SessionLoader } = await import('../managers/session-loader');
        const success = await SessionLoader.load(last.path);
        if (success) {


            return 'ROOT';
        }
    } else {
        console.log(chalk.yellow('\n⚠️  No previous session found.'));
        await new Promise(r => setTimeout(r, 1000));
    }
});

registerScript('openProject', async () => {
    try {
        const { FileExplorer } = await import('../utils/file-explorer');
        const os = await import('os');
        const path = await import('path');
        const fs = await import('fs-extra');
        const { ErrorUtil } = await import('../utils/error-util');

        const startPath = process.cwd();

        const explorer = new FileExplorer({
            basePath: startPath,
            onlyDirectories: true,
            title: 'Select Project Folder'
        });

        const newPath = await explorer.selectPath();
        if (newPath) {
            const { SessionLoader } = await import('../managers/session-loader');
            const success = await SessionLoader.load(newPath);
            if (success) {
                return 'ROOT';
            }
        }
    } catch (error: any) {
        const { ErrorUtil } = await import('../utils/error-util');
        await ErrorUtil.handleError(error, 'Open Project Wizard');
    }
});

// Force Toggle Mode Handler
registerScript('forceToggleMode', async () => {
    const inquirer = (await import('inquirer')).default;

    console.clear();
    const { mode } = await inquirer.prompt([{
        type: 'list',
        name: 'mode',
        message: '🔧 Force Toggle Mode (Manual Context Switch)',
        choices: [
            { name: '🔥 Next.js (Web)', value: 'nextjs' },
            { name: '💙 Flutter (Mobile)', value: 'flutter' },
            { name: '🐍 Python/Other (Custom)', value: 'custom' },
        ]
    }]);

    const { state } = await import('../core/state');
    state.setProjectType(mode);
    return 'ROOT';
});

// --- Boilerplate Handlers ---
registerScript('create-component', async () => {
    const { handleCreateComponent } = await import('../commands/boilerplate');
    await handleCreateComponent();
    return 'boilerplates';
});

registerScript('create-page', async () => {
    const { createPage } = await import('../commands/boilerplate');
    await createPage();
    return 'boilerplates';
});

registerScript('create-api-route', async () => {
    const { createApiRoute } = await import('../commands/boilerplate');
    await createApiRoute();
    return 'boilerplates';
});

registerScript('create-admin-route', async () => {
    const { createAdminRoute } = await import('../commands/boilerplate');
    await createAdminRoute();
    return 'boilerplates';
});

registerScript('create-unit-test', async () => {
    const { createUnitTest } = await import('../commands/boilerplate');
    const { state } = await import('../core/state');
    await createUnitTest(state.project);
    return 'boilerplates';
});

registerScript('create-e2e-test', async () => {
    const { createE2ETest } = await import('../commands/boilerplate');
    const { state } = await import('../core/state');
    await createE2ETest(state.project);
    return 'boilerplates';
});

registerScript('create-full-stack', async () => {
    const { createFullStackStandardFeature } = await import('../commands/boilerplate');
    await createFullStackStandardFeature(null);
    return 'boilerplates';
});

registerScript('manage-shadcn', async () => {
    const { manageShadcnRegistry } = await import('../commands/boilerplate');
    await manageShadcnRegistry();
    return 'boilerplates';
});

registerScript('create-flutter-widget', async () => {
    const { createFlutterWidget } = await import('../commands/boilerplate');
    await createFlutterWidget();
    return 'boilerplates';
});

registerScript('create-flutter-widget-part', async () => {
    const { createFlutterWidgetPart } = await import('../commands/boilerplate');
    await createFlutterWidgetPart();
    return 'boilerplates';
});

registerScript('create-flutter-screen', async () => {
    const { createFlutterScreen } = await import('../commands/boilerplate');
    await createFlutterScreen();
    return 'boilerplates';
});

registerScript('create-flutter-feature', async () => {
    const { createFlutterFeature } = await import('../commands/boilerplate');
    await createFlutterFeature();
    return 'boilerplates';
});

registerScript('create-flutter-state', async () => {
    const { createFlutterState } = await import('../commands/boilerplate');
    await createFlutterState();
    return 'boilerplates';
});

// --- Dev Dojo Handlers ---
registerScript('run-dev-server', async () => {
    const { runDevServer } = await import('../commands/dev-server');
    await runDevServer();
    return 'dev-dojo';
});

registerScript('setup-flutter-branding', async () => {
    const { setupFlutterBranding } = await import('../utils/flutter-branding');
    const { state } = await import('../core/state');
    await setupFlutterBranding(state.project.rootPath);
    return 'dev-dojo';
});

registerScript('run-shiva', async () => {
    const { runShivaScript } = await import('../commands/shiva');
    const { state } = await import('../core/state');
    const target = state.project.rootPath;
    await runShivaScript(target);
    return 'dev-dojo';
});

registerScript('doc-actions', async () => {
    const { runDocActions } = await import('../menus/interactive/doc-actions');
    await runDocActions();
    return 'doc-actions-menu';
});

registerScript('doc-open-pending', async () => {
    const { openPendingIndex } = await import('../menus/interactive/doc-actions');
    await openPendingIndex();
    return 'doc-actions-menu';
});

registerScript('doc-show-recent', async () => {
    const { showRecentDocs } = await import('../menus/interactive/doc-actions');
    await showRecentDocs();
    return 'doc-actions-menu';
});

registerScript('doc-manage', async () => {
    const { manageDocNodes } = await import('../menus/interactive/doc-actions');
    await manageDocNodes();
    return 'doc-actions-menu';
});

registerScript('doc-activity-panel', async () => {
    const { runDocActivityPanel } = await import('../menus/interactive/doc-actions');
    await runDocActivityPanel();
    return 'doc-actions-menu';
});

registerScript('dev-dojo-mode', async () => {
    const chalk = (await import('chalk')).default;
    const { ProcessManager } = await import('../core/process-manager');
    const { ProcessUtils } = await import('../utils/process-utils');
    const { state } = await import('../core/state');
    const path = await import('path');
    const fs = await import('fs');
    const { runDevServer } = await import('../commands/dev-server');

    console.log(chalk.magenta('\n🥷  Entering SAMURAI MODE (Dev Environment)...'));

    const projectRoot = state.project.rootPath;
    const projectType = state.project.type;
    if (projectType === 'nextjs') {
        // 1. Launch Firebase Emulators (if configured)
        const firebaseJsonPath = path.join(projectRoot, 'firebase.json');
        if (fs.existsSync(firebaseJsonPath)) {
            console.log(chalk.blue('🔥 Launching Firebase Emulators...'));
            await ProcessManager.spawnDetachedWindow('Firebase Emulators', 'firebase emulators:start', projectRoot);
        } else {
            console.log(chalk.gray('ℹ️  No firebase.json found. Skipping Emulators.'));
        }

        // 2. Launch Next.js Dev Server
        console.log(chalk.blue('🌐 Launching Next.js Dev Server...'));
        try {
            const current = process.cwd();
            if (current !== projectRoot) {
                process.chdir(projectRoot);
            }
            await runDevServer();
        } catch (e: any) {
            console.log(chalk.red(`Failed to start dev server: ${e?.message || e}`));
        }

        // 3. Run Shiva (The AI)
        console.log(chalk.magenta('🔮 Summoning Shiva...'));
        const { runShivaScript } = await import('../commands/shiva');
        await runShivaScript(projectRoot);

        return 'dev-dojo';
    }

    // 1. Launch Firebase Emulators
    const firebaseJsonPath = path.join(projectRoot, 'firebase.json');
    if (fs.existsSync(firebaseJsonPath)) {
        console.log(chalk.blue('🔥 Launching Firebase Emulators...'));
        await ProcessManager.spawnDetachedWindow('Firebase Emulators', 'firebase emulators:start', projectRoot);
    } else {
        console.log(chalk.gray('ℹ️  No firebase.json found. Skipping Emulators.'));
    }

    // 2. Launch Android Emulator
    console.log(chalk.blue('📱 Checking Android Emulator...'));
    const runningEmulators = await ProcessUtils.getRunningEmulators();
    const runningAndroid = runningEmulators.filter(e => !e.id.toLowerCase().includes('ios') && !e.name.toLowerCase().includes('ios'));

    if (runningAndroid.length === 0) {
        console.log(chalk.gray('   > No running Android emulators. checking available...'));
        const available = await ProcessUtils.getEmulators();
        const availableAndroid = available.filter(e => !e.id.toLowerCase().includes('ios'));

        if (availableAndroid.length > 0) {
            console.log(chalk.green(`   > Launching ${availableAndroid[0].name}...`));
            ProcessUtils.launchEmulator(availableAndroid[0].id); // Don't await fully if it hangs, but launchEmulator has unref
        } else {
            console.log(chalk.yellow('   > No Android AVDs found. Skipping.'));
        }
    } else {
        console.log(chalk.green(`   > Emulator already running: ${runningAndroid[0].name}`));
    }

    // Give emulator a moment to start process
    await new Promise(r => setTimeout(r, 2000));

    // 3. Launch Flutter Web Server
    console.log(chalk.blue('🌐 Launching Flutter Web Server (Port 8081)...'));
    // We check if port is busy first using ProcessManager (optional, but good practice)
    const isBusy = await ProcessManager.isPortOccupied(8081);
    if (!isBusy) {
        await ProcessManager.spawnDetachedWindow(
            'Flutter Web Server',
            'flutter run -d web-server --web-port=8081',
            projectRoot
        );
    } else {
        console.log(chalk.yellow('   > Port 8081 busy. Assuming Web Server running.'));
    }

    // 4. Run Shiva (The AI)
    console.log(chalk.magenta('🔮 Summoning Shiva...'));
    const { runShivaScript } = await import('../commands/shiva');
    await runShivaScript(projectRoot);

    return 'dev-dojo';
});

registerScript('dev-dojo-close', async () => {
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;
    const { state } = await import('../core/state');
    const { ProcessManager } = await import('../core/process-manager');
    const { ProcessUtils } = await import('../utils/process-utils');

    console.log(chalk.yellow('\n🧹 Closing Dev Environment...'));
    const projectType = state.project.type;

    if (projectType === 'nextjs') {
        await ProcessManager.killByTitle('Firebase Emulators');
        await ProcessManager.killByTitle('Triada Dev Server');
    } else if (projectType === 'flutter') {
        await ProcessManager.killByTitle('Firebase Emulators');
        await ProcessManager.killByTitle('Flutter Web Server');
        await ProcessUtils.killAllEmulators();
    } else {
        await ProcessManager.killByTitle('Firebase Emulators');
        await ProcessManager.killByTitle('Triada Dev Server');
        await ProcessManager.killByTitle('Flutter Web Server');
    }

    console.log(chalk.green('✅ Close command sent.'));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
    return 'dev-dojo';
});

registerScript('openEmulatorUI', async () => {
    const chalk = (await import('chalk')).default;
    const path = await import('path');
    const fs = await import('fs');
    const open = (await import('open')).default;
    const inquirer = (await import('inquirer')).default;
    const { state } = await import('../core/state');

    const projectRoot = state.project.rootPath || process.cwd();
    const firebaseJsonPath = path.join(projectRoot, 'firebase.json');
    let port = 4000;

    if (fs.existsSync(firebaseJsonPath)) {
        try {
            const content = fs.readFileSync(firebaseJsonPath, 'utf-8');
            const config = JSON.parse(content);
            const uiPort = config?.emulators?.ui?.port;
            if (typeof uiPort === 'number') {
                port = uiPort;
            }
        } catch { }
    }

    const url = `http://127.0.0.1:${port}`;
    console.log(chalk.cyan(`Opening Emulator UI: ${url}`));
    try {
        void open(url, { wait: false, newInstance: true });
    } catch {
        console.log(chalk.yellow('Could not auto-open browser. Please open the URL manually.'));
    }

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
    return 'dev-dojo';
});

registerScript('generate-project-tree', async () => {
    const { generateProjectTree } = await import('../commands/project-tree');
    const { state } = await import('../core/state');
    await generateProjectTree(state.project.rootPath);
    const inquirer = (await import('inquirer')).default;
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'dev-dojo';
});

registerScript('run-build', async () => {
    const { spawn } = await import('child_process');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('Starting Build...'));
    await new Promise<void>((resolve) => {
        const child = spawn('npm', ['run', 'build'], { stdio: 'inherit', shell: true });
        child.on('close', () => {
            console.log(chalk.green('Build process finished.'));
            resolve();
        });
    });
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'dev-dojo';
});

registerScript('run-lint', async () => {
    const { spawn } = await import('child_process');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('Running Linter...'));
    await new Promise<void>((resolve) => {
        const child = spawn('npm', ['run', 'lint'], { stdio: 'inherit', shell: true });
        child.on('close', () => {
            console.log(chalk.green('Lint process finished.'));
            resolve();
        });
    });
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'dev-dojo';
});

registerScript('refactor-comp', async () => {
    const { handleInteractiveRefactor } = await import('../commands/refactor-component');
    await handleInteractiveRefactor();
    return 'boilerplates';
});

// --- Test Runners ---
registerScript('runUnitTests', async () => {
    const { spawn } = await import('child_process');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('Running Unit Tests (Vitest)...'));
    await new Promise<void>((resolve) => {
        const child = spawn('npm', ['run', 'test'], { stdio: 'inherit', shell: true });
        child.on('close', () => {
            console.log(chalk.green('Unit tests finished.'));
            resolve();
        });
    });
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'nextjs-tests';
});

registerScript('runE2ETests', async () => {
    const { spawn } = await import('child_process');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('Running E2E Tests (Playwright)...'));
    await new Promise<void>((resolve) => {
        const child = spawn('npx', ['playwright', 'test'], { stdio: 'inherit', shell: true });
        child.on('close', () => {
            console.log(chalk.green('E2E tests finished.'));
            resolve();
        });
    });
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'nextjs-tests';
});

// --- Admin Generators ---
registerScript('createAdminPageRoute', async () => {
    const { createAdminPageRoute } = await import('../commands/boilerplate');
    const { state } = await import('../core/state');
    await createAdminPageRoute(state.project);
    return 'admin-gen';
});

registerScript('createAdminApiRoute', async () => {
    const { createAdminApiRoute } = await import('../commands/boilerplate');
    const { state } = await import('../core/state');
    await createAdminApiRoute(state.project);
    return 'admin-gen';
});

registerScript('createFullStackAdmin', async () => {
    const { createFullStackAdminFeature } = await import('../commands/boilerplate');
    const { state } = await import('../core/state');
    await createFullStackAdminFeature(state.project);
    return 'admin-gen';
});

// --- Katana Handler ---
import { MenuOption } from '../schemas/menu-schema';

export const KatanaMenuDef: MenuDefinition = {
    id: 'katana',
    title: '⚔️  Katana (Custom Singletons)',
    type: 'dynamic',
    options: async (state) => {
        const { KatanaManager } = await import('../managers/katana-manager');
        const chalk = (await import('chalk')).default;
        const mode = state.project.type === 'unknown' ? 'global' : state.project.type;

        const scripts = await KatanaManager.listScripts(mode);
        const singletons = await KatanaManager.listSingletons();

        const options: MenuOption[] = [];

        // 1. Compiler (Placeholder)
        options.push({ label: '--- Compiler ---', value: 'sep_compiler', type: 'separator' });
        options.push({ label: '🏗️  Compiler Tools (Coming Soon)', value: 'compiler_placeholder', disabled: true });

        // 2. Singletons
        options.push({ label: '--- Singletons (Persistent Tools) ---', value: 'sep_singletons', type: 'separator' });
        if (singletons.length > 0) {
            singletons.forEach(s => {
                options.push({
                    label: `🔮 ${s.name}`,
                    value: `run_singleton_${s.name}`,
                    action: { type: 'script', handler: 'runKatanaSingleton', args: { path: s.path } }
                });
            });
        } else {
            options.push({ label: 'No singletons found in ~/.vishnu/singletons', value: 'no_singletons', disabled: true });
        }

        // 3. Scripts
        options.push({ label: '--- Scripts (Quick Tasks) ---', value: 'sep_scripts', type: 'separator' });
        if (scripts.length > 0) {
            scripts.forEach(s => {
                options.push({
                    label: `📜 ${s.name} (${chalk.gray(s.mode)})`,
                    value: `run_${s.name}`,
                    action: { type: 'script', handler: 'runKatanaScript', args: { path: s.path } }
                });
            });
        } else {
            options.push({ label: 'No scripts found.', value: 'none', disabled: true });
        }

        options.push({ label: '---', value: 'sep_actions', type: 'separator' });
        options.push({ label: '➕ Create New Script', value: 'create-script', action: { type: 'script', handler: 'createKatanaScript' } });
        options.push({ label: '⬅️  Back', value: 'back', action: { type: 'back' } });

        return options;
    }
};

registry.register(createSchemaMenu(KatanaMenuDef));

registerScript('runKatanaSingleton', async (args: any) => {
    if (args && args.path) {
        const { KatanaManager } = await import('../managers/katana-manager');
        const inquirer = (await import('inquirer')).default;

        await KatanaManager.runSingleton(args.path);

        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    }
    return 'katana';
});

registerScript('runKatanaScript', async (args: any) => {
    if (args && args.path) {
        const { KatanaManager } = await import('../managers/katana-manager');
        const chalk = (await import('chalk')).default;
        const inquirer = (await import('inquirer')).default;

        await KatanaManager.runScript(args.path);

        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    }
    return 'katana';
});

registerScript('createKatanaScript', async () => {
    const inquirer = (await import('inquirer')).default;
    const { KatanaManager } = await import('../managers/katana-manager');
    const { state } = await import('../core/state');

    const mode = state.project.type === 'unknown' ? 'global' : state.project.type;

    const answers = await inquirer.prompt([
        {
            type: 'input',
            name: 'name',
            message: 'Name your script (e.g. my-task):',
            validate: (input) => input.length > 0 ? true : 'Name cannot be empty'
        },
        {
            type: 'list',
            name: 'type',
            message: 'Script Type:',
            choices: [
                { name: 'Batch (.bat) - Windows', value: '.bat' },
                { name: 'Node.js (.js)', value: '.js' },
                { name: 'TypeScript (.ts)', value: '.ts' },
                { name: 'Python (.py)', value: '.py' },
                { name: 'Shell (.sh) - Linux/Mac', value: '.sh' }
            ]
        },
        {
            type: 'editor',
            name: 'content',
            message: 'Edit Script Content (Close editor to save):',
            default: (ans) => {
                if (ans.type === '.bat') return '@echo off\necho Hello Katana';
                if (ans.type === '.js') return 'console.log("Hello Katana");';
                if (ans.type === '.ts') return 'console.log("Hello Katana");';
                if (ans.type === '.py') return 'print("Hello Katana")';
                return '#!/bin/bash\necho "Hello Katana"';
            }
        }
    ]);

    await KatanaManager.createScript(mode, answers.name, answers.content, answers.type);
    console.log(chalk.green(`\n✅ Script '${answers.name}' created in ${mode} mode!`));
    await new Promise(r => setTimeout(r, 1000));
    return 'katana';
});

// --- Gemini Manager Handler ---
registerScript('manageGeminiKeys', async () => {
    const { manageGeminiKeys } = await import('../menus/interactive/gemini-interactive');
    await manageGeminiKeys();
    return 'settings';
});

// --- Build Manager Handlers ---
registerScript('runBuildAll', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');
    
    // Spawn detached CLI command to build all without blocking TUI
    await ProcessManager.spawnDetachedWindow('Release Prep / Build All', 'codeman --run-build-all', state.project.rootPath);
    return 'build-menu';
});

registerScript('runTests', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');
    
    // Spawn detached terminal
    await ProcessManager.spawnDetachedWindow('Full Test Suite', 'codeman --run-tests', state.project.rootPath);
    return 'build-menu';
});

registerScript('runUnitTestsFlutter', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');

    await ProcessManager.spawnDetachedWindow('Unit Tests', 'codeman --run-unit-tests-flutter', state.project.rootPath);
    return 'build-menu';
});

registerScript('runWidgetTestsFlutter', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');

    await ProcessManager.spawnDetachedWindow('Widget Tests', 'codeman --run-widget-tests-flutter', state.project.rootPath);
    return 'build-menu';
});

registerScript('runPatrolTests', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');

    await ProcessManager.spawnDetachedWindow('Patrol Tests', 'codeman --run-patrol-tests', state.project.rootPath);
    return 'build-menu';
});

registerScript('runMaestroTests', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');

    await ProcessManager.spawnDetachedWindow('Maestro Tests', 'codeman --run-maestro-tests', state.project.rootPath);
    return 'build-menu';
});

registerScript('runPlaywrightTests', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');

    await ProcessManager.spawnDetachedWindow('Playwright Tests', 'codeman --run-e2e', state.project.rootPath);
    return 'build-menu';
});

registerScript('launchEmulator', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    await BuildManager.launchEmulatorInteractive('android');
    return 'dev-ops-menu';
});

registerScript('launchIosSimulator', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    await BuildManager.launchEmulatorInteractive('ios');
    return 'dev-ops-menu';
});

registerScript('killAllRunners', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const inquirer = (await import('inquirer')).default;
    await BuildManager.killAllRunners();
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'dev-ops-menu';
});

registerScript('runWindows', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    await BuildManager.startProcess(state.project.rootPath, 'windows');
    // await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]); // Detached -> no wait
    return 'dev-ops-menu';
});

registerScript('runWeb', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    await BuildManager.startProcess(state.project.rootPath, 'web');
    // await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]); // Detached -> no wait
    return 'dev-ops-menu';
});

registerScript('runMac', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { state } = await import('../core/state');
    // const inquirer = (await import('inquirer')).default; // Detached
    await BuildManager.startProcess(state.project.rootPath, 'macos');
    return 'dev-ops-menu';
});

registerScript('runIos', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { state } = await import('../core/state');
    // const inquirer = (await import('inquirer')).default; // Detached
    await BuildManager.startProcess(state.project.rootPath, 'ios');
    return 'dev-ops-menu';
});

registerScript('runAndroid', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { ProcessUtils } = await import('../utils/process-utils');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;

    console.log(chalk.cyan('Checking for connected Android devices...'));
    const devices = await ProcessUtils.getDevices();

    // Filter for Android devices or emulators
    // Note: getDevices returns ALL connected.
    const androidDevices = devices.filter(d =>
        d.properties.toLowerCase().includes('android') ||
        d.id.startsWith('emulator-') ||
        d.name.toLowerCase().includes('gphone')
    );

    let targetId = null;

    if (androidDevices.length === 1) {
        targetId = androidDevices[0].id;
        console.log(chalk.green(`\n✅ Auto-detected device: ${androidDevices[0].name} (${targetId})`));
        // Small delay to ensure user sees this
        await new Promise(r => setTimeout(r, 1000));
    } else if (androidDevices.length > 1) {
        const { selection } = await inquirer.prompt([{
            type: 'list',
            name: 'selection',
            message: 'Multiple devices found. Select target:',
            choices: androidDevices.map(d => ({ name: `${d.name} (${d.id})`, value: d.id }))
        }]);
        targetId = selection;
    }

    if (!targetId) {
        console.log(chalk.yellow('\n⚠️  No running Android devices found.'));
        const { action } = await inquirer.prompt([{
            type: 'list',
            name: 'action',
            message: 'Action:',
            choices: [
                { name: '🚀 Launch Emulator', value: 'launch' },
                { name: '❌ Cancel', value: 'cancel' }
            ]
        }]);

        if (action === 'launch') {
            // Updated to use the smart interactive launcher
            await BuildManager.launchEmulatorInteractive('android');
            // We can't automatically run after this because launch is detached/async and takes time.
            console.log(chalk.blue('Please run "Run Android App" again once the emulator is ready.'));
            await new Promise(r => setTimeout(r, 2000));
            return 'dev-ops-menu';
        } else {
            return 'dev-ops-menu';
        }
    }

    // Launch with specific ID
    await BuildManager.startProcess(state.project.rootPath, targetId); // This logic handles specific ID run
    return 'dev-ops-menu';
});

import { DeploymentMenuDef } from '../menus/definitions/deployment-menu';
registry.register(createSchemaMenu(DeploymentMenuDef));

import { TagReleaseMenuDef } from '../menus/definitions/tag-release-menu';
registry.register(createSchemaMenu(TagReleaseMenuDef));

import { GhActionsMenuDef } from '../menus/definitions/gh-actions-menu';
registry.register(createSchemaMenu(GhActionsMenuDef));

// --- Deployment Handlers ---

registerScript('deployAndroid', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;

    // Build APK
    await BuildManager.buildAll(state.project.rootPath, 'release'); // This builds everything, maybe overkill if just want APK?
    // Actually buildAll is "Release Prep". If we just want component deploy, we might need granular builds.
    // For now, let's just run apk build command directly or add specific build methods.
    // BuildManager already has startProcess but that is 'run'.
    // Let's use runCommand from BuildManager if we can, or just spawn.
    // Better: BuildManager.buildAndroid(...) - we technically have buildAll doing it. 
    // Let's just use buildAll for now to be safe, or if we want faster, we need to extract methods in BuildManager.
    // Given the prompt, let's stick to calling the buildAll for consistency or granular if easy.
    // actually, let's just call the specific build command here for speed.
    // But we need to upload to release... which release? The "current" one?
    // Usually you deploy a specific version. 
    // This granular "Deploy APK" implies "Build & Upload to LATEST release" or "Build & Release one artifact"?
    // Let's assume it triggers the standard release flow but just for this artifact? 
    // actually, "Deploy APK" in menu usually means "Install to device" or "Upload to Distribution"?
    // The menu says "Deploy APK (Android) -> Release". So it means upload to GH Release.
    // We need a version.

    // Let's simplify: These granular options might be complex without a "current release context".
    // Let's make them wrappers around runRelease with preset flags?
    // Or just "build and upload to LATEST tag"?

    console.log('Feature coming soon: Granular Deploy. Please use "Run Full Deployment" for now.');
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'deployment-menu';
});

registerScript('deployWindows', async () => {
    console.log('Feature coming soon: Granular Deploy. Please use "Run Full Deployment" for now.');
    const inquirer = (await import('inquirer')).default;
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'deployment-menu';
});

registerScript('deployMac', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    // We can call buildMac
    await BuildManager.buildMac(state.project.rootPath, 'release', 'logs/manual');
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'deployment-menu';
});

registerScript('deployIos', async () => {
    const { BuildManager } = await import('../managers/build-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    await BuildManager.buildIos(state.project.rootPath, 'release', 'logs/manual');
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'deployment-menu';
});

registerScript('deployWebOnly', async () => {
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;
    console.log(chalk.cyan('\n🌐 Dashboard deploys automatically via Vercel on git push.'));
    console.log(chalk.gray('  Visit https://vercel.com/dashboard to manage deployments.'));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'deployment-menu';
});

// --- Tag & Release Handlers ---

registerScript('createTagRelease', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');
    await ProcessManager.spawnDetachedWindow('Release & Tag Flow', 'codeman --run-release-flow', state.project.rootPath);
    return 'tag-release-menu';
});

registerScript('deleteTagRelease', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;

    const { version } = await inquirer.prompt([{ type: 'input', name: 'version', message: 'Tag to delete (e.g. v1.0.0):' }]);
    const { confirm } = await inquirer.prompt([{ type: 'confirm', name: 'confirm', message: `Really delete ${version} (local+remote+release)?` }]);

    if (confirm) {
        await ReleaseManager.deleteTag(state.project.rootPath, version);
    }
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'tag-release-menu';
});

registerScript('viewReleaseStatus', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;

    await ReleaseManager.listTags(state.project.rootPath);
    await ReleaseManager.listReleases(state.project.rootPath);

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'tag-release-menu';
});

// --- GitHub Actions Handlers ---

registerScript('viewRunningWorkflows', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    await ReleaseManager.viewGhRunningWorkflows(state.project.rootPath);
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'gh-actions-menu';
});

registerScript('viewFailedWorkflows', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    await ReleaseManager.viewGhFailedWorkflows(state.project.rootPath);
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'gh-actions-menu';
});

registerScript('viewWorkflowOutput', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    await ReleaseManager.viewGhWorkflowOutput(state.project.rootPath);
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'gh-actions-menu';
});


import { DoctorMenuDef } from '../menus/definitions/doctor-menu';
registry.register(createSchemaMenu(DoctorMenuDef));

// --- Doctor Handlers ---

registerScript('runDoctorBasic', async () => {
    const { BuildManager } = await import('../managers/build-manager'); // Using BuildManager helper or just spawn
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;

    console.log(chalk.cyan('\n🩺 Running Flutter Doctor...'));
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve) => {
        const child = spawn('flutter', ['doctor'], { stdio: 'inherit', shell: true, cwd: state.project.rootPath });
        child.on('close', () => resolve());
    });

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'doctor-menu';
});

registerScript('runDoctorVerbose', async () => {
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;

    console.log(chalk.cyan('\n🔬 Running Flutter Doctor (-v)...'));
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve) => {
        const child = spawn('flutter', ['doctor', '-v'], { stdio: 'inherit', shell: true, cwd: state.project.rootPath });
        child.on('close', () => resolve());
    });

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'doctor-menu';
});

registerScript('runDoctorLicenses', async () => {
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;

    console.log(chalk.cyan('\n📜 Checking Android Licenses...'));
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve) => {
        const child = spawn('flutter', ['doctor', '--android-licenses'], { stdio: 'inherit', shell: true, cwd: state.project.rootPath });
        child.on('close', () => resolve());
    });

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'doctor-menu';
});

registerScript('runFlutterClean', async () => {
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;

    console.log(chalk.yellow('\n🧹 Running Flutter Clean...'));
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve) => {
        const child = spawn('flutter', ['clean'], { stdio: 'inherit', shell: true, cwd: state.project.rootPath });
        child.on('close', () => resolve());
    });

    console.log(chalk.green('Clean complete.'));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'doctor-menu';
});

registerScript('runFlutterPubGet', async () => {
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;

    console.log(chalk.cyan('\n📥 Running Flutter Pub Get...'));
    const { spawn } = await import('child_process');
    await new Promise<void>((resolve) => {
        const child = spawn('flutter', ['pub', 'get'], { stdio: 'inherit', shell: true, cwd: state.project.rootPath });
        child.on('close', () => resolve());
    });

    console.log(chalk.green('Dependencies retrieved.'));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'doctor-menu';
});



import { CleanMenuDef } from '../menus/definitions/clean-menu';
registry.register(createSchemaMenu(CleanMenuDef));

// --- Clean Handlers ---

registerScript('runCleanAllFiles', async () => {
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;
    const fs = (await import('fs-extra')).default;
    const path = (await import('path')).default;

    console.log(chalk.yellow('\n🧹 Identifying files to clean...'));
    const root = state.project.rootPath;

    // Patterns to match on ROOT only
    // .txt, .log, .cache, .lock files
    const files = await fs.readdir(root);
    const toDelete: string[] = [];

    for (const file of files) {
        const fullPath = path.join(root, file);
        const stat = await fs.stat(fullPath);

        if (stat.isFile()) {
            if (file.endsWith('.txt') ||
                file.endsWith('.log') ||
                file.endsWith('.cache') ||
                file.includes('.lock') || // Matches .codeman.lock, package-lock.json, etc. 
                file === '.DS_Store') {

                // Safety check: Don't delete critical files if they happen to match?
                // package-lock.json / pubspec.lock ARE lock files. User said "and .lock files".
                // usually "clean project" implies removing these to regenerate.
                // .codeman.lock might be active? If active, we shouldn't delete, or we might crash?
                // But user wants to clean.
                toDelete.push(file);
            }
        }
    }

    if (toDelete.length === 0) {
        console.log(chalk.green('No matching files found to clean.'));
    } else {
        console.log(chalk.red('Found the following files to delete:'));
        toDelete.forEach(f => console.log(` - ${f}`));

        const { confirm } = await inquirer.prompt([{
            type: 'confirm',
            name: 'confirm',
            message: 'Are you sure you want to delete these files?',
            default: false
        }]);

        if (confirm) {
            for (const file of toDelete) {
                await fs.remove(path.join(root, file));
                console.log(chalk.gray(`Deleted ${file}`));
            }
            console.log(chalk.green('Clean complete.'));
        } else {
            console.log(chalk.yellow('Operation cancelled.'));
        }
    }

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'clean-menu';
});

async function detectNodeRunner(projectRoot: string): Promise<'npm' | 'bun'> {
    const pkgPath = path.join(projectRoot, 'package.json');
    const bunLock = path.join(projectRoot, 'bun.lock');
    const bunLockb = path.join(projectRoot, 'bun.lockb');

    if (fs.existsSync(bunLock) || fs.existsSync(bunLockb)) return 'bun';

    if (fs.existsSync(pkgPath)) {
        try {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('bun@')) {
                return 'bun';
            }
        } catch { }
    }

    return 'npm';
}

async function runNodeScript(projectRoot: string, scriptName: string): Promise<boolean> {
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.log(chalk.gray(`(No package.json found. Skipping ${scriptName}.)`));
        return true;
    }

    let pkg: any = {};
    try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
        console.log(chalk.yellow(`Could not parse package.json. Skipping ${scriptName}.`));
        return true;
    }

    if (!pkg.scripts || !pkg.scripts[scriptName]) {
        console.log(chalk.gray(`(No "${scriptName}" script found. Skipping.)`));
        return true;
    }

    const runner = await detectNodeRunner(projectRoot);
    console.log(chalk.cyan(`Running "${scriptName}" using ${runner}...`));

    const { spawn } = await import('child_process');
    return new Promise<boolean>((resolve) => {
        const child = spawn(runner, ['run', scriptName], {
            cwd: projectRoot,
            shell: true,
            stdio: 'inherit'
        });
        child.on('close', (code) => resolve(code === 0));
    });
}

async function runReleaseTests(projectRoot: string, projectType: string): Promise<boolean> {
    if (projectType === 'flutter') {
        const { BuildManager } = await import('../managers/build-manager');
        return await BuildManager.runTests(projectRoot);
    }

    return await runNodeScript(projectRoot, 'test');
}

async function runReleaseBuild(projectRoot: string, projectType: string): Promise<boolean> {
    if (projectType === 'flutter') {
        const { BuildManager } = await import('../managers/build-manager');
        await BuildManager.buildAll(projectRoot, 'release');
        return true;
    }

    // Prefer "build", fallback to "build:verify"
    const pkgPath = path.join(projectRoot, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        console.log(chalk.gray('(No package.json found. Skipping build.)'));
        return true;
    }

    let pkg: any = {};
    try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch {
        console.log(chalk.yellow('Could not parse package.json. Skipping build.'));
        return true;
    }

    if (pkg.scripts?.build) {
        return await runNodeScript(projectRoot, 'build');
    }

    if (pkg.scripts?.['build:verify']) {
        return await runNodeScript(projectRoot, 'build:verify');
    }

    console.log(chalk.gray('(No build script found. Skipping.)'));
    return true;
}

export async function runReleasePipeline(): Promise<boolean> {
    const { ReleaseManager } = await import('../managers/release-manager');
    const { state } = await import('../core/state');
    const inquirer = (await import('inquirer')).default;
    const { ProcessUtils } = await import('../utils/process-utils');
    const { exec } = await import('child_process');
    const projectRoot = state.project.rootPath || process.cwd();
    const projectType = state.project.type;

    console.clear();
    console.log(chalk.magenta('🚀 CI/CD Release Pipeline Initiated'));

    const getGhReleaseTags = async (): Promise<string[]> => {
        const hasGh = await ProcessUtils.checkCommand('gh');
        if (!hasGh) return [];

        const stdout = await new Promise<string>((resolve, reject) => {
            exec('gh release list --limit 200 --json tagName --jq ".[].tagName"', { cwd: projectRoot }, (err, out) => {
                if (err) return reject(err);
                resolve(out || '');
            });
        }).catch(() => '');

        return stdout.split(/\r?\n/).map(t => t.trim()).filter(Boolean);
    };

    const getLatestStableVersion = (tags: string[]): string | null => {
        const versions = tags
            .map((tag) => {
                const match = /^v(\d+)\.(\d+)\.(\d+)$/.exec(tag);
                if (!match) return null;
                return {
                    value: `${match[1]}.${match[2]}.${match[3]}`,
                    parts: [Number(match[1]), Number(match[2]), Number(match[3])]
                };
            })
            .filter(Boolean) as { value: string; parts: number[] }[];

        if (versions.length === 0) return null;
        versions.sort((a, b) => a.parts[0] - b.parts[0] || a.parts[1] - b.parts[1] || a.parts[2] - b.parts[2]);
        return versions[versions.length - 1].value;
    };

    const getNextPrereleaseIteration = (tags: string[], baseVersion: string, stage: 'alpha' | 'beta'): number => {
        const escaped = baseVersion.replace(/\./g, '\\.');
        const regex = new RegExp(`^v${escaped}-${stage}\\.(\\d+)$`);
        const numbers = tags
            .map(tag => {
                const match = regex.exec(tag);
                return match ? Number.parseInt(match[1], 10) : null;
            })
            .filter((n): n is number => typeof n === 'number' && !Number.isNaN(n));

        if (numbers.length === 0) return 1;
        return Math.max(...numbers) + 1;
    };

    const releaseTags = await getGhReleaseTags();
    const latestStable = getLatestStableVersion(releaseTags);
    const exampleVersion = latestStable ?? '1.0.0';

    // 1. Ask for Base Version
    const { baseVersionInput } = await inquirer.prompt([{
        type: 'input',
        name: 'baseVersionInput',
        message: latestStable
            ? `Enter Base Version (e.g., ${exampleVersion}) or leave blank for latest:`
            : `Enter Base Version (e.g., ${exampleVersion}):`,
        validate: (input: string) => {
            const trimmed = input.trim();
            if (trimmed === '') {
                return latestStable ? true : 'No existing releases found. Enter X.Y.Z';
            }
            return /^v?\d+\.\d+\.\d+$/.test(trimmed) ? true : 'Invalid format. Use X.Y.Z';
        }
    }]);

    // 2. Ask for Stage
    const { stage } = await inquirer.prompt([{
        type: 'list',
        name: 'stage',
        message: 'Select Release Stage:',
        choices: [
            { name: 'Alpha (Internal Test)', value: 'alpha' },
            { name: 'Beta (User Test)', value: 'beta' },
            { name: 'Production (Release)', value: 'prod' }
        ]
    }]);

    const cleanedBase = (baseVersionInput.trim() === '' ? latestStable : baseVersionInput.trim()) || exampleVersion;
    const baseVersion = cleanedBase.startsWith('v') ? cleanedBase.slice(1) : cleanedBase;

    let tag = `v${baseVersion}`;
    let pubspecVersion = baseVersion;

    if (stage !== 'prod') {
        const nextIteration = getNextPrereleaseIteration(releaseTags, baseVersion, stage as 'alpha' | 'beta');
        const { iterationRaw } = await inquirer.prompt([{
            type: 'input',
            name: 'iterationRaw',
            message: `Enter ${stage} iteration number (e.g. ${nextIteration}):`,
            default: String(nextIteration),
            validate: (input: string) => /^[1-9]\d*$/.test(input.trim()) ? true : 'Enter a positive integer'
        }]);
        const iteration = Number.parseInt(iterationRaw.trim(), 10);
        tag += `-${stage}.${iteration}`;
        pubspecVersion += `+${stage === 'alpha' ? 100 : 200}${iteration.toString().padStart(2, '0')}`;
    }

    // 3. Confirm Details
    console.log(chalk.cyan('\nSummary:'));
    console.log(`- Project: ${projectType.toUpperCase()}`);
    console.log(`- Base Version: ${pubspecVersion}`);
    console.log(`- Tag: ${tag}`);

    const { confirm } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirm',
        message: 'Proceed with build, tests, and tag?',
        default: true
    }]);

    if (!confirm) {
        console.log(chalk.yellow('Aborted.'));
        await new Promise(r => setTimeout(r, 800));
        return false;
    }

    try {
        if (projectType === 'flutter') {
            await ReleaseManager.setVersion(projectRoot, pubspecVersion);
        } else {
            console.log(chalk.gray('(Node version bump not implemented; relying on git tag)'));
        }

        const tagSuccess = await ReleaseManager.gitCommitAndTag(projectRoot, tag);
        if (!tagSuccess) return false;

        console.log(chalk.cyan('\nStep 1: Tests'));
        const testsOk = await runReleaseTests(projectRoot, projectType);
        if (!testsOk) {
            console.log(chalk.red('\n❌ Tests failed. Aborting release.'));
            return false;
        }

        console.log(chalk.cyan('\nStep 2: Build'));
        const buildOk = await runReleaseBuild(projectRoot, projectType);
        if (!buildOk) {
            console.log(chalk.red('\n❌ Build failed. Aborting release.'));
            return false;
        }

        console.log(chalk.cyan('\nStep 3: GitHub Release'));
        const ghSuccess = await ReleaseManager.createGhRelease(projectRoot, tag);
        if (!ghSuccess) {
            console.log(chalk.red('\n❌ GitHub Release failed.'));
            return false;
        }

        await ReleaseManager.uploadArtifacts(projectRoot, tag);

        console.log(chalk.green('\n🎉 CI/CD Pipeline Completed Successfully!'));
        return true;

    } catch (e: any) {
        console.log(chalk.red(`\n❌ Pipeline Failed: ${e?.message || e}`));
        if (e?.stack) console.log(chalk.gray(e.stack));
        return false;
    }
}

export async function doRunRelease() {
    const inquirer = (await import('inquirer')).default;
    const success = await runReleasePipeline();
    if (!success) {
        console.log(chalk.red('\nRelease pipeline did not complete successfully.'));
    }
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'deployment-menu';
}

export async function runDeployPrepCore(): Promise<boolean> {
    const chalk = (await import('chalk')).default;
    const root = process.cwd();
    const results: Array<{ label: string; ok: boolean }> = [];

    const runStep = async (label: string, fn: () => Promise<boolean>) => {
        console.log(chalk.cyan(`\n${label}`));
        try {
            const ok = await fn();
            results.push({ label, ok });
            if (!ok) {
                console.log(chalk.red(`  ❌ ${label} failed.`));
            } else {
                console.log(chalk.green(`  ✅ ${label} complete.`));
            }
        } catch (e: any) {
            results.push({ label, ok: false });
            console.log(chalk.red(`  ❌ ${label} crashed: ${e?.message || e}`));
            if (e?.stack) console.log(chalk.gray(e.stack));
        }
    };

    await runStep('Core: Lint', async () => await runNodeScript(root, 'lint'));
    await runStep('Core: Tests', async () => await runNodeScript(root, 'test'));
    await runStep('Core: Build Verify', async () => await runNodeScript(root, 'build:verify'));

    const dashboardRoot = path.join(root, 'dashboard');
    if (fs.existsSync(path.join(dashboardRoot, 'package.json'))) {
        await runStep('Dashboard: Lint', async () => await runNodeScript(dashboardRoot, 'lint'));
        await runStep('Dashboard: Build', async () => await runNodeScript(dashboardRoot, 'build'));
    } else {
        console.log(chalk.gray('\n(Dashboard package.json not found. Skipping dashboard checks.)'));
    }

    console.log(chalk.cyan('\nPrep Summary:'));
    results.forEach(r => {
        console.log(`${r.ok ? '✅' : '❌'} ${r.label}`);
    });

    return results.every(r => r.ok);
}

registerScript('runRelease', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const { state } = await import('../core/state');

    const root = state.project.rootPath || process.cwd();
    await ProcessManager.spawnDetachedWindow('CI/CD Release', 'codeman --run-release', root);
    return 'deployment-menu';
});

// --- API Cloud Jobs Handlers ---

registerScript('triggerApiBuild', async () => {
    const { JobsManager } = await import('../managers/jobs-manager');
    return await JobsManager.triggerBuild();
});

registerScript('triggerApiScaffold', async () => {
    const { JobsManager } = await import('../managers/jobs-manager');
    return await JobsManager.triggerScaffold();
});

registerScript('listApiJobs', async () => {
    const { JobsManager } = await import('../managers/jobs-manager');
    return await JobsManager.listJobs();
});

// --- Maintenance Deploy Logic Handlers ---
registerScript('maintDeployAll', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;
    console.log(chalk.magenta.bold('\n🌟 Initiating Full Project Deployment (TUI + Firebase)\n'));
    
    // Next, launch the interactive TUI Release process
    // which builds CodeMan Windows/Mac/Linux and uploads GH Release
    console.log(chalk.cyan('Step 1: TUI Release Pipeline'));
    const releaseOk = await runReleasePipeline();
    if (!releaseOk) {
        console.log(chalk.red('\n❌ Release pipeline failed or was aborted. Skipping Firebase deploy.'));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
        return 'maint-deploy-menu';
    }
    
    console.log(chalk.cyan('\nStep 2: Firebase Deployment (Functions + Rules)'));
    await ReleaseManager.deployAllFirebase(process.cwd());
    
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Deployment Complete. Press Enter...' }]);
    return 'maint-deploy-menu';
});

registerScript('maintDeployRelease', doRunRelease);


registerScript('maintDeployRules', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const inquirer = (await import('inquirer')).default;
    await ReleaseManager.deployRules(process.cwd());
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'maint-deploy-menu';
});

registerScript('maintDeployDash', async () => {
    const { ReleaseManager } = await import('../managers/release-manager');
    const inquirer = (await import('inquirer')).default;
    await ReleaseManager.deployFunctionsAPI(process.cwd());
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'maint-deploy-menu';
});

// (Deprecated/Removed Run CI and Run Deploy stubs from main maintenance menu)

registerScript('maintSetupFirebase', async () => {
    const chalk = (await import('chalk')).default;
    console.log(chalk.cyan('Starting Interactive Firebase Setup...'));
    const envManagerImport = await import('../managers/env-setup');
    const EnvSetupManager = envManagerImport.EnvSetupManager as any;
    await EnvSetupManager.interactiveSetup();
    return 'maintenance-menu';
});

registerScript('maintRunEmulator', async () => {
    const chalk = (await import('chalk')).default;
    const { spawn } = await import('child_process');
    const inquirer = (await import('inquirer')).default;
    const path = (await import('path')).default;
    const fs = (await import('fs')).default;

    const root = process.cwd();
    const firebaseJson = path.join(root, 'firebase.json');

    if (!fs.existsSync(firebaseJson)) {
        console.log(chalk.red('\n❌ No firebase.json found in project root.'));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
        return 'maintenance-menu';
    }

    console.log(chalk.cyan('\n🗄️  Starting Firebase Emulator Suite...'));
    console.log(chalk.gray('  Auth: http://localhost:9099'));
    console.log(chalk.gray('  Firestore: http://localhost:8080'));
    console.log(chalk.gray('  Functions: http://localhost:5001'));
    console.log(chalk.gray('  Emulator UI: http://localhost:4000'));
    console.log(chalk.yellow('\n  Press Ctrl+C to stop.\n'));

    await new Promise<void>((resolve) => {
        const child = spawn('firebase', ['emulators:start'], {
            stdio: 'inherit', shell: true, cwd: root
        });
        child.on('close', () => resolve());
    });

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'maintenance-menu';
});

registerScript('maintRunE2E', async () => {
    const chalk = (await import('chalk')).default;
    const { spawn } = await import('child_process');
    const inquirer = (await import('inquirer')).default;
    const path = (await import('path')).default;

    const dashboardDir = path.join(process.cwd(), 'dashboard');
    console.log(chalk.cyan('\n🎭 Running Playwright E2E Tests...'));
    console.log(chalk.gray(`  Target: ${dashboardDir}\n`));

    await new Promise<void>((resolve) => {
        const child = spawn('npx', ['playwright', 'test'], {
            stdio: 'inherit', shell: true, cwd: dashboardDir
        });
        child.on('close', () => resolve());
    });

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'maintenance-menu';
});

// --- New Maintenance Options ---
registerScript('maintSetClaims', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const path = await import('path');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('\n👑 Opening Set User Claims TUI in a new window...'));
    await ProcessManager.spawnDetachedWindow('Set User Claims', 'npx tsx set-claims.ts', path.join(process.cwd(), 'claims'));
    
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Task launched. Press Enter to return to menu...' }]);
    return 'maintenance-menu';
});

registerScript('maintDashboardDev', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const path = await import('path');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.yellow('\n🖥️  Starting Next.js Dashboard Dev Server in a new window...'));
    await ProcessManager.spawnDetachedWindow('Dashboard Dev Server', 'npm run dev', path.join(process.cwd(), 'dashboard'));
    
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Task launched. Press Enter to return to menu...' }]);
    return 'maintenance-menu';
});

registerScript('maintAddSecret', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.magenta('\n🔑 Opening Add Firebase Secret flow in a new window...'));
    
    // Use PowerShell to securely prompt for the secret and pipe it to the firebase CLI
    const psCommand = `powershell -NoProfile -Command "$Name = Read-Host 'Enter Secret Name (e.g. GITHUB_APP_ID)'; $Value = Read-Host -AsSecureString 'Enter Secret Value (input hidden)'; $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($Value); $PlainText = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR); Write-Host 'Setting secret...'; $PlainText | firebase functions:secrets:set $Name; [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR); Write-Host 'Done! Press Enter to close window.'; Read-Host"`;
    
    await ProcessManager.spawnDetachedWindow('Add Firebase Secret', psCommand, process.cwd());
    
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Task launched. Press Enter to return to menu...' }]);
    return 'maintenance-menu';
});

registerScript('maintRunTests', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;

    console.log(chalk.blue('\n🧪 Running workspace tests in a new window...'));
    // Ensure the window stays open after tests complete so the user can see the results
    await ProcessManager.spawnDetachedWindow('Workspace Tests', 'npm run test & pause', process.cwd());
    
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Task launched. Press Enter to return to menu...' }]);
    return 'maintenance-menu';
});

registerScript('maintRunBuild', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    const chalk = (await import('chalk')).default;
    const inquirer = (await import('inquirer')).default;
    const fs = (await import('fs-extra')).default;
    const path = (await import('path')).default;

    const cwd = process.cwd();
    const bunLock = path.join(cwd, 'bun.lockb');
    const bunLockText = path.join(cwd, 'bun.lock');
    let useBun = false;

    if (await fs.pathExists(bunLock) || await fs.pathExists(bunLockText)) {
        useBun = true;
    } else {
        const pkgPath = path.join(cwd, 'package.json');
        if (await fs.pathExists(pkgPath)) {
            try {
                const pkg = JSON.parse(await fs.readFile(pkgPath, 'utf8'));
                if (typeof pkg.packageManager === 'string' && pkg.packageManager.startsWith('bun@')) {
                    useBun = true;
                }
            } catch { }
        }
    }

    const buildCmd = useBun ? 'bun run build & pause' : 'npm run build & pause';

    console.log(chalk.blue(`\n🏗️ Running workspace build in a new window... (${useBun ? 'bun' : 'npm'})`));
    await ProcessManager.spawnDetachedWindow('Workspace Build', buildCmd, cwd);
    
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Task launched. Press Enter to return to menu...' }]);
    return 'maintenance-menu';
});

// --- Branching Logic Handlers ---
registerScript('branchStatus', async () => {
    const { GitBranchManager } = await import('../managers/git-branch-manager');
    const status = await GitBranchManager.getStatus(process.cwd());
    
    console.log('\n' + chalk.bold.bgBlue(' 📊 BRANCH STATUS DASHBOARD ') + '\n');
    console.log(`${chalk.bold('Current Branch:')} ${chalk.cyan(status.currentBranch)}`);
    console.log(`${chalk.bold('Commits:')}        ${chalk.green(`+${status.commitsAhead}`)} / ${chalk.red(`-${status.commitsBehind}`)} (vs upstream/main)`);
    console.log(`${chalk.bold('Uncommitted:')}    ${status.changedFiles} files (${chalk.green(`+${status.insertions}`)} ${chalk.red(`-${status.deletions}`)})`);
    console.log(`${chalk.bold('Repo:')}           ${status.repoUrl}\n`);
    
    if (status.activePRs.length > 0) {
        console.log(chalk.bold.underline('Active PRs:'));
        for (const pr of status.activePRs) {
            console.log(`  #${pr.number} [${pr.state}] ${pr.title}`);
            console.log(`  🔗 ${chalk.gray(pr.url)}`);
        }
    } else {
        console.log(chalk.gray('No active pull requests for this branch.'));
    }

    console.log('');
    const inquirer = (await import('inquirer')).default;
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
    return 'branching-menu';
});

registerScript('branchOpen', async () => {
    const { GitBranchManager } = await import('../managers/git-branch-manager');
    const inquirer = (await import('inquirer')).default;
    const { type } = await inquirer.prompt([{
        type: 'list',
        name: 'type',
        message: 'Branch type:',
        choices: ['feature/', 'fix/', 'chore/', 'refactor/', 'none (custom)']
    }]);

    const { name } = await inquirer.prompt([{
        type: 'input',
        name: 'name',
        message: 'Enter branch name (without prefix):',
        validate: input => input.trim() !== ''
    }]);

    const prefix = type === 'none (custom)' ? '' : type;
    const branchName = `${prefix}${name.trim().replace(/\s+/g, '-')}`;

    await GitBranchManager.openBranch(process.cwd(), branchName);
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'branching-menu';
});

registerScript('branchSwitch', async () => {
    const { GitBranchManager } = await import('../managers/git-branch-manager');
    const inquirer = (await import('inquirer')).default;
    const branches = await GitBranchManager.listBranches(process.cwd());
    
    if (branches.length === 0) {
        console.log(chalk.yellow('No other branches found.'));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
        return 'branching-menu';
    }

    const { target } = await inquirer.prompt([{
        type: 'list',
        name: 'target',
        message: 'Select branch to switch to:',
        choices: branches
    }]);

    await GitBranchManager.switchBranch(process.cwd(), target);
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'branching-menu';
});

registerScript('branchSubmitPR', async () => {
    const { GitBranchManager } = await import('../managers/git-branch-manager');
    const inquirer = (await import('inquirer')).default;
    
    const { title } = await inquirer.prompt([{
        type: 'input',
        name: 'title',
        message: 'PR Title (leave empty to auto-fill):'
    }]);

    const { draft } = await inquirer.prompt([{
        type: 'confirm',
        name: 'draft',
        message: 'Create as Draft/WIP?',
        default: false
    }]);

    await GitBranchManager.submitPR(process.cwd(), title.trim() || undefined, undefined, draft);
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'branching-menu';
});

registerScript('branchRemove', async () => {
    const { GitBranchManager } = await import('../managers/git-branch-manager');
    const inquirer = (await import('inquirer')).default;
    const branches = await GitBranchManager.listBranches(process.cwd());
    const current = await GitBranchManager.getCurrentBranch(process.cwd());

    const deletable = branches.filter(b => b !== current && b !== 'main' && b !== 'master');
    if (deletable.length === 0) {
        console.log(chalk.gray('No safe branches available to delete.'));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
        return 'branching-menu';
    }

    const { target } = await inquirer.prompt([{
        type: 'list',
        name: 'target',
        message: 'Select branch to delete:',
        choices: deletable
    }]);

    const { remote } = await inquirer.prompt([{
        type: 'confirm',
        name: 'remote',
        message: 'Delete remote branch origin/' + target + ' as well?',
        default: false
    }]);

    await GitBranchManager.removeBranch(process.cwd(), target, remote);
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'branching-menu';
});

async function requireMaintenanceAccess(): Promise<boolean> {
    const { AuthService } = await import('../core/auth');
    const { state } = await import('../core/state');
    const chalk = (await import('chalk')).default;
    const path = (await import('path')).default;

    console.log(chalk.magenta('\n🔒 Verifying Administrative Access...'));
    
    // Force Auth against Vishnu Project
    const vishnuRoot = process.env.VISHNU_ROOT || process.cwd();
    const claimsPath = path.join(vishnuRoot, 'claims');

    // Switch context to Vishnu Root for Maintenance
    process.chdir(vishnuRoot);
    state.project.rootPath = vishnuRoot;
    
    const vishnuAuth = {
        projectId: 'vishnu-b65bd',
        apiKey: 'AIzaSyCSntkOv0yMAAF2CduDvl638EsdMN6xU1U',
        authDomain: 'vishnu-b65bd.firebaseapp.com',
        serviceAccount: path.join(claimsPath, 'admin-sdk.json')
    };

    const success = await AuthService.login(state, vishnuAuth);

    if (success && state.user?.isAdmin) {
        state.project.rootPath = vishnuRoot;
        state.setProjectType('custom');
        return true;
    }

    return false;
}

registerScript('enterMaintenance', async () => {
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;
    const ok = await requireMaintenanceAccess();
    if (ok) return 'maintenance-menu';

    console.error(chalk.red('\n🚫 Unauthorized. Maintenance tools are restricted to Owners/Admins of the Vishnu project.'));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
    return 'settings';
});

registerScript('enterMaintenanceDeploy', async () => {
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;
    const ok = await requireMaintenanceAccess();
    if (ok) return 'maint-deploy-menu';

    console.error(chalk.red('\n🚫 Unauthorized. Maintenance tools are restricted to Owners/Admins of the Vishnu project.'));
    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter to return...' }]);
    return 'settings';
});

registerScript('maintDeployPrep', async () => {
    const inquirer = (await import('inquirer')).default;
    const chalk = (await import('chalk')).default;

    const ok = await runDeployPrepCore();
    if (!ok) {
        console.log(chalk.red('\n❌ Deploy prep encountered failures. Check logs above.'));
    } else {
        console.log(chalk.green('\n✅ Deploy prep completed successfully.'));
    }

    await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    return 'maint-deploy-menu';
});

registerScript('maintDeployPrepWindow', async () => {
    const { ProcessManager } = await import('../core/process-manager');
    await ProcessManager.spawnDetachedWindow(
        'Vishnu Deploy Prep',
        'codeman --run-maint-deploy-prep',
        process.cwd()
    );
    return 'maint-deploy-menu';
});
