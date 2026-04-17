function getWorkspaceRoot(): string {
    return process.env.VISHNU_ROOT || process.cwd();
}

async function pause(message: string = 'Press Enter...') {
    const inquirer = (await import('inquirer')).default;
    await inquirer.prompt([{ type: 'input', name: 'c', message }]);
}

export async function runTests() {
    const { ProcessManager } = await import('../../../codeman/backend/infra/process/index');
    const chalk = (await import('chalk')).default;

    console.log(chalk.blue('\n🧪 Running Vishnu tests in a new window...'));
    await ProcessManager.spawnDetachedWindow('Vishnu Tests', 'npm run test & pause', getWorkspaceRoot());

    await pause('Task launched. Press Enter to return to menu...');
}

export async function runBuild() {
    const { ProcessManager } = await import('../../../codeman/backend/infra/process/index');
    const chalk = (await import('chalk')).default;
    const fs = (await import('fs-extra')).default;
    const path = (await import('path')).default;

    const root = getWorkspaceRoot();
    const bunLock = path.join(root, 'bun.lockb');
    const bunLockText = path.join(root, 'bun.lock');
    let useBun = false;

    if (await fs.pathExists(bunLock) || await fs.pathExists(bunLockText)) {
        useBun = true;
    } else {
        const pkgPath = path.join(root, 'package.json');
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

    console.log(chalk.blue(`\n🏗️ Running Vishnu build in a new window... (${useBun ? 'bun' : 'npm'})`));
    await ProcessManager.spawnDetachedWindow('Vishnu Build', buildCmd, root);

    await pause('Task launched. Press Enter to return to menu...');
}

export async function runEmulator() {
    const chalk = (await import('chalk')).default;
    const { spawn } = await import('child_process');
    const path = (await import('path')).default;
    const fs = (await import('fs')).default;

    const root = getWorkspaceRoot();
    const firebaseJson = path.join(root, 'firebase.json');

    if (!fs.existsSync(firebaseJson)) {
        console.log(chalk.red('\n❌ No firebase.json found in project root.'));
        await pause();
        return;
    }

    console.log(chalk.cyan('\n🗄️  Starting Firebase Emulator Suite...'));
    console.log(chalk.gray('  Auth: http://localhost:9099'));
    console.log(chalk.gray('  Firestore: http://localhost:8080'));
    console.log(chalk.gray('  Functions: http://localhost:5001'));
    console.log(chalk.gray('  Emulator UI: http://localhost:4000'));
    console.log(chalk.yellow('\n  Press Ctrl+C to stop.\n'));

    await new Promise<void>((resolve) => {
        const child = spawn('firebase', ['emulators:start'], {
            stdio: 'inherit',
            shell: true,
            cwd: root
        });
        child.on('close', () => resolve());
    });

    await pause();
}

export async function setClaims() {
    const { ProcessManager } = await import('../../../codeman/backend/infra/process/index');
    const path = await import('path');
    const chalk = (await import('chalk')).default;

    console.log(chalk.yellow('\n👑 Opening Set User Claims TUI in a new window...'));
    await ProcessManager.spawnDetachedWindow('Set User Claims', 'npx tsx set-claims.ts', path.join(getWorkspaceRoot(), 'claims'));

    await pause('Task launched. Press Enter to return to menu...');
}

export async function startDashboardDev() {
    const { ProcessManager } = await import('../../../codeman/backend/infra/process/index');
    const path = await import('path');
    const chalk = (await import('chalk')).default;

    console.log(chalk.yellow('\n🖥️  Starting Next.js Dashboard Dev Server in a new window...'));
    await ProcessManager.spawnDetachedWindow('Dashboard Dev Server', 'npm run dev', path.join(getWorkspaceRoot(), 'dashboard'));

    await pause('Task launched. Press Enter to return to menu...');
}

export async function setupFirebase() {
    const chalk = (await import('chalk')).default;
    console.log(chalk.cyan('\n🔥 Starting interactive Firebase setup...'));
    const { EnvSetupManager } = await import('../../../codeman/backend/infra/config/index');
    await EnvSetupManager.verifyAndSetupEnv(true);
}

export async function deployPrep() {
    const chalk = (await import('chalk')).default;
    const { runDeployPrepCore } = await import('../../../codeman/backend/intents/index');

    const ok = await runDeployPrepCore();
    if (!ok) {
        console.log(chalk.red('\n❌ Deploy prep encountered failures. Check logs above.'));
    } else {
        console.log(chalk.green('\n✅ Deploy prep completed successfully.'));
    }

    await pause();
}

export async function deployRelease() {
    const chalk = (await import('chalk')).default;
    const { runReleasePipeline } = await import('../../../codeman/backend/intents/index');

    const success = await runReleasePipeline();
    if (!success) {
        console.log(chalk.red('\n❌ TUI release pipeline did not complete successfully.'));
    }

    await pause();
}

export async function deployRules() {
    const { ReleaseManager } = await import('../../../codeman/backend/infra/scripts/index');

    await ReleaseManager.deployRules(getWorkspaceRoot());
    await pause();
}

export async function deployFunctions() {
    const { ReleaseManager } = await import('../../../codeman/backend/infra/scripts/index');

    await ReleaseManager.deployFunctionsAPI(getWorkspaceRoot());
    await pause();
}

export async function deployAll() {
    const { ReleaseManager } = await import('../../../codeman/backend/infra/scripts/index');
    const chalk = (await import('chalk')).default;
    const { runReleasePipeline } = await import('../../../codeman/backend/intents/index');

    console.log(chalk.magenta.bold('\n🌟 Initiating Full Project Deployment (TUI + Firebase)\n'));
    console.log(chalk.cyan('Step 1: TUI Release Pipeline'));

    const releaseOk = await runReleasePipeline();
    if (!releaseOk) {
        console.log(chalk.red('\n❌ Release pipeline failed or was aborted. Skipping Firebase deploy.'));
        await pause();
        return;
    }

    console.log(chalk.cyan('\nStep 2: Firebase Deployment (Functions + Rules)'));
    await ReleaseManager.deployAllFirebase(getWorkspaceRoot());

    await pause('Deployment complete. Press Enter to return to menu...');
}
