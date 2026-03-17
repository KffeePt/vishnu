import { state } from '../core/state';
import { registerScript } from '../core/schema-factory';
import inquirer from 'inquirer';
import chalk from 'chalk';
import * as path from 'path';
import fs from 'fs-extra';
import { FileExplorer } from '../utils/file-explorer';
import { spawn } from 'child_process';
import { GlobalStateManager } from '../managers/global-state-manager';

// Common helper for creating projects
async function baseCreateProject(type: 'nextjs' | 'flutter' | 'python' | 'cpp') {
    console.clear();
    console.log(chalk.blue.bold(`\n🚧 Create New ${type.toUpperCase()} Project\n`));

    const isDirEmpty = async (dirPath: string) => {
        try {
            const items = await fs.readdir(dirPath);
            return items.length === 0;
        } catch {
            return false;
        }
    };

    let projectName = '';
    let projectPath = '';

    // 1. Choose location before asking for slug
    while (!projectPath) {
        const { locationChoice } = await inquirer.prompt([{
            type: 'list',
            name: 'locationChoice',
            message: 'Where should we create the project?',
            choices: [
                { name: 'Use current folder (will remove files if needed)', value: 'current' },
                { name: 'Choose another folder', value: 'other' }
            ]
        }]);

        if (locationChoice === 'current') {
            const currentPath = process.cwd();
            projectName = path.basename(currentPath) || 'project';

            const currentIsEmpty = await isDirEmpty(currentPath);
            if (!currentIsEmpty) {
                const { confirmWipe } = await inquirer.prompt([{
                    type: 'confirm',
                    name: 'confirmWipe',
                    message: `Current folder '${projectName}' is not empty. Delete all files and continue?`,
                    default: false
                }]);

                if (!confirmWipe) {
                    continue; // Go back and let the user choose another folder
                }

                await emptyDirRobust(currentPath);
            }

            projectPath = currentPath;
            break;
        }

        // 2. Ask for Project Name (slug)
        const { projectName: enteredName } = await inquirer.prompt([{
            type: 'input',
            name: 'projectName',
            message: 'Enter Project Name (slug):',
            validate: (input) => /^[a-z0-9-_]+$/.test(input) ? true : 'Use only lowercase letters, numbers, and dashes.'
        }]);
        projectName = enteredName;

        console.log(chalk.gray('\nPreparing to select parent folder...'));
        await new Promise(r => setTimeout(r, 500));

        // 3. Select Parent Directory
        const explorer = new FileExplorer({
            basePath: process.cwd(),
            onlyDirectories: true,
            title: `Select Parent Folder for '${projectName}'`
        });

        const parentPath = await explorer.selectPath();

        if (!parentPath) {
            console.log(chalk.yellow('Creation cancelled.'));
            return;
        }

        projectPath = path.join(parentPath, projectName);

        if (fs.existsSync(projectPath)) {
            console.log(chalk.red(`\n⛔ Error: Directory already exists: ${projectPath}`));
            await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
            return;
        }
    }

    console.log(chalk.green(`\nCreating project at: ${projectPath}`));

    // 3. Execution (Mocked or Real)
    try {
        if (type === 'nextjs') {
            await createNextJs(projectPath);
        } else if (type === 'flutter') {
            await createFlutter(projectPath);
            const { setupFlutterBranding } = await import('../utils/flutter-branding');
            await setupFlutterBranding(projectPath);
        } else {
            // Basic scaffolding for Python/CPP
            await fs.mkdirp(projectPath);
            console.log(chalk.gray(`Created directory structure.`));
        }

        await ensureCodemanGitignore(projectPath);

        console.log(chalk.green.bold('\n✅ Project Created Successfully!'));

        // 3.5 Offer Packages
        let strategy: any = null;
        if (type === 'nextjs') {
            const { NextJsStrategy } = await import('../modes/nextjs');
            strategy = new NextJsStrategy();
        } else if (type === 'flutter') {
            const { FlutterStrategy } = await import('../modes/flutter');
            strategy = new FlutterStrategy();
        }

        if (strategy?.getPackageOptions) {
            const packages = await strategy.getPackageOptions();
            if (packages.length > 0) {
                const { selectedPackages } = await inquirer.prompt([{
                    type: 'checkbox',
                    name: 'selectedPackages',
                    message: 'Select optional SaaS modules to include:',
                    choices: packages.map((p: any) => ({
                        name: `${p.name} - ${p.description}`,
                        short: p.name,
                        value: p
                    }))
                }]);

                for (const pkg of selectedPackages) {
                    console.log(chalk.blue(`Scaffolding module: ${pkg.name}...`));
                    if (type === 'nextjs') await pkg.scaffoldNextJs(projectPath);
                    else if (type === 'flutter') await pkg.scaffoldFlutter(projectPath);
                }
            }
        }

        // 4. Offer to Open
        const { openNow } = await inquirer.prompt([{
            type: 'confirm',
            name: 'openNow',
            message: 'Open this project now?',
            default: true
        }]);

        if (openNow) {
            process.chdir(projectPath);
            state.project.rootPath = projectPath;
            state.setProjectType(type === 'python' || type === 'cpp' ? 'custom' : type); // Strategy auto-detect usually handles this

            // Register as last active
            const manager = new GlobalStateManager();
            manager.setLastActive(projectPath);

            // Trigger Auth Setup Automatically
            const { checkAndSetupAuth } = await import('../core/auth-helper');
            const ok = await checkAndSetupAuth(projectPath);
            if (!ok) {
                console.log(chalk.red('\n🚫 Auth failed. Project access blocked.'));
                state.project.rootPath = '';
                state.setProjectType('unknown');
                state.user = undefined;
                state.authBypass = false;
                state.rawIdToken = undefined;
                return;
            }

            // Exit the create flow and return to root menu with the project opened
            return 'ROOT';
        }

        // If user chose not to open now, still exit the create flow
        return 'ROOT';

    } catch (e: any) {
        console.error(chalk.red(`\nCreation Failed: ${e.message}`));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    }
}

async function emptyDirRobust(dirPath: string): Promise<void> {
    if (!await fs.pathExists(dirPath)) return;

    const entries = await fs.readdir(dirPath);
    const nodeModulesName = 'node_modules';
    const nodeModulesPath = path.join(dirPath, nodeModulesName);

    // Try to delete node_modules first to avoid partial cleanup
    if (entries.includes(nodeModulesName)) {
        await removeNodeModulesRobust(nodeModulesPath);
    }

    // Remove remaining entries
    const remaining = (await fs.readdir(dirPath)).filter(e => e !== nodeModulesName);
    for (const entry of remaining) {
        const fullPath = path.join(dirPath, entry);
        await removePathWithRetries(fullPath, 5);
    }
}

async function removeNodeModulesRobust(targetPath: string): Promise<void> {
    if (!await fs.pathExists(targetPath)) return;

    const tempPath = `${targetPath}.__delete__${Date.now()}`;
    try {
        await fs.move(targetPath, tempPath, { overwrite: true });
        await removePathWithRetries(tempPath, 5);
        return;
    } catch {
        // Fallback to direct removal
    }

    await removePathWithRetries(targetPath, 5);
}

async function removePathWithRetries(targetPath: string, attempts: number): Promise<void> {
    for (let i = 0; i < attempts; i++) {
        try {
            await fs.remove(targetPath);
            return;
        } catch (error: any) {
            if (!await fs.pathExists(targetPath)) return;

            const code = error?.code as string | undefined;
            const retryable = ['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES'].includes(code || '');

            if (process.platform === 'win32' && i === attempts - 1) {
                await runWindowsRmdir(targetPath);
                if (!await fs.pathExists(targetPath)) return;
            }

            if (!retryable || i === attempts - 1) {
                throw error;
            }

            await new Promise(r => setTimeout(r, 400 * (i + 1)));
        }
    }
}

async function runWindowsRmdir(targetPath: string): Promise<void> {
    return new Promise((resolve) => {
        const child = spawn('cmd', ['/c', 'rmdir', '/s', '/q', targetPath], {
            stdio: 'ignore',
            shell: false
        });
        child.on('close', () => resolve());
        child.on('error', () => resolve());
    });
}

async function createNextJs(targetPath: string) {
    console.log(chalk.blue('Running create-next-app with Bun...'));
    const scaffoldTarget = await resolveScaffoldTarget(targetPath);
    // Use bunx create-next-app@latest
    // inherit stdio to let user interact if needed (though we pass flags)
    return new Promise<void>((resolve, reject) => {
        const child = spawn(
            'bunx',
            ['create-next-app@latest', scaffoldTarget.pathArg, '--typescript', '--eslint', '--tailwind', '--no-src-dir', '--app', '--import-alias', '@/*', '--use-bun', '--react-compiler'],
            {
                stdio: 'inherit',
                shell: true,
                cwd: scaffoldTarget.cwd
            }
        );
        child.on('close', (code) => {
            if (code !== 0) {
                reject(new Error(`Process exited with ${code}`));
                return;
            }

            const projectRoot = scaffoldTarget.cwd ?? targetPath;
            const packageLockPath = path.join(projectRoot, 'package-lock.json');
            const bunLockPath = path.join(projectRoot, 'bun.lockb');
            const bunLockTextPath = path.join(projectRoot, 'bun.lock');

            const needsBunInstall = (async () => {
                if (await fs.pathExists(packageLockPath)) return true;
                if (await fs.pathExists(bunLockPath)) return false;
                if (await fs.pathExists(bunLockTextPath)) return false;
                return true;
            })();

            needsBunInstall.then(async (shouldInstall) => {
                if (await fs.pathExists(packageLockPath)) {
                    await fs.remove(packageLockPath);
                }

                if (!shouldInstall) {
                    resolve();
                    return;
                }

                const install = spawn('bun', ['install'], {
                    stdio: 'inherit',
                    shell: true,
                    cwd: projectRoot
                });

                install.on('close', (installCode) => {
                    if (installCode === 0) resolve();
                    else reject(new Error(`bun install exited with ${installCode}`));
                });
            }).catch(err => reject(err));
        });
    });
}

async function createFlutter(targetPath: string) {
    console.log(chalk.blue('Running flutter create...'));
    const scaffoldTarget = await resolveScaffoldTarget(targetPath);
    return new Promise<void>((resolve, reject) => {
        // flutter create path
        const child = spawn('flutter', ['create', scaffoldTarget.pathArg], {
            stdio: 'inherit',
            shell: true,
            cwd: scaffoldTarget.cwd
        });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Process exited with ${code}`));
        });
    });
}

async function resolveScaffoldTarget(targetPath: string): Promise<{ cwd?: string, pathArg: string }> {
    try {
        if (await fs.pathExists(targetPath)) {
            const items = await fs.readdir(targetPath);
            if (items.length === 0) {
                return { cwd: targetPath, pathArg: '.' };
            }
        }
    } catch { }
    return { pathArg: targetPath };
}

async function ensureCodemanGitignore(projectRoot: string) {
    const gitignorePath = path.join(projectRoot, '.gitignore');
    const entries = ['.codeman.lock', '.shiva.lock', '.codeman-registry.json'];
    const bunLock = path.join(projectRoot, 'bun.lock');
    const bunLockb = path.join(projectRoot, 'bun.lockb');
    if (await fs.pathExists(bunLock)) entries.push('bun.lock');
    if (await fs.pathExists(bunLockb)) entries.push('bun.lockb');

    let content = '';
    if (await fs.pathExists(gitignorePath)) {
        content = await fs.readFile(gitignorePath, 'utf8');
    } else {
        await fs.writeFile(gitignorePath, '', 'utf8');
    }

    const normalizePattern = (pattern: string) => {
        let p = pattern.trim().toLowerCase();
        if (!p || p.startsWith('#')) return '';
        if (p.startsWith('./')) p = p.slice(2);
        if (p.startsWith('**/')) p = p.slice(3);
        if (p.startsWith('/')) p = p.slice(1);
        return p;
    };

    const lines = content.split(/\r?\n/);
    const normalizedLines = lines
        .map(line => normalizePattern(line))
        .filter(line => line.length > 0);

    const hasEntry = (entry: string) => {
        const normalizedEntry = entry.toLowerCase();
        return normalizedLines.includes(normalizedEntry);
    };

    const toAppend = entries.filter(e => !hasEntry(e));

    if (toAppend.length === 0) return;

    const needsNewline = content.length > 0 && !content.endsWith('\n');
    const appendText = `${needsNewline ? '\n' : ''}${toAppend.join('\n')}\n`;
    await fs.appendFile(gitignorePath, appendText, 'utf8');
}

// Register Handlers
export const registerCreateHandlers = () => {
    registerScript('createNextJs', async () => await baseCreateProject('nextjs'));
    registerScript('createFlutter', async () => await baseCreateProject('flutter'));
    registerScript('createPython', async () => await baseCreateProject('python'));
    registerScript('createCpp', async () => await baseCreateProject('cpp'));
};
