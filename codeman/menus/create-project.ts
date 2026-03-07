import { state } from '../core/state';
import { registerScript } from '../core/schema-factory';
import inquirer from 'inquirer';
import chalk from 'chalk';
import * as path from 'path';
import * as fs from 'fs-extra';
import { FileExplorer } from '../utils/file-explorer';
import { spawn } from 'child_process';
import { GlobalStateManager } from '../managers/global-state-manager';

// Common helper for creating projects
async function baseCreateProject(type: 'nextjs' | 'flutter' | 'python' | 'cpp') {
    console.clear();
    console.log(chalk.blue.bold(`\n🚧 Create New ${type.toUpperCase()} Project\n`));

    // 1. Ask for Project Name
    const { projectName } = await inquirer.prompt([{
        type: 'input',
        name: 'projectName',
        message: 'Enter Project Name (slug):',
        validate: (input) => /^[a-z0-9-_]+$/.test(input) ? true : 'Use only lowercase letters, numbers, and dashes.'
    }]);

    console.log(chalk.gray('\nPreparing to select parent folder...'));
    await new Promise(r => setTimeout(r, 1000));

    // 2. Select Parent Directory
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

    const projectPath = path.join(parentPath, projectName);

    if (fs.existsSync(projectPath)) {
        console.log(chalk.red(`\n⛔ Error: Directory already exists: ${projectPath}`));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
        return;
    }

    console.log(chalk.green(`\nCreating project at: ${projectPath}`));

    // 3. Execution (Mocked or Real)
    try {
        if (type === 'nextjs') {
            await createNextJs(projectPath);
        } else if (type === 'flutter') {
            await createFlutter(projectPath);
        } else {
            // Basic scaffolding for Python/CPP
            await fs.mkdirp(projectPath);
            console.log(chalk.gray(`Created directory structure.`));
        }

        console.log(chalk.green.bold('\n✅ Project Created Successfully!'));

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
            manager.setLastActive(projectPath, projectName);

            // Trigger Auth Setup Automatically
            const { checkAndSetupAuth } = await import('../core/auth-helper');
            await checkAndSetupAuth(projectPath);
        }

    } catch (e: any) {
        console.error(chalk.red(`\nCreation Failed: ${e.message}`));
        await inquirer.prompt([{ type: 'input', name: 'c', message: 'Press Enter...' }]);
    }
}

async function createNextJs(targetPath: string) {
    console.log(chalk.blue('Running create-next-app...'));
    // Use npx create-next-app@latest
    // inherit stdio to let user interact if needed (though we passed flags ideally)
    return new Promise<void>((resolve, reject) => {
        const child = spawn('npx', ['create-next-app@latest', targetPath, '--typescript', '--eslint', '--tailwind', '--no-src-dir', '--app', '--import-alias', '@/*'], {
            stdio: 'inherit',
            shell: true
        });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Process exited with ${code}`));
        });
    });
}

async function createFlutter(targetPath: string) {
    console.log(chalk.blue('Running flutter create...'));
    return new Promise<void>((resolve, reject) => {
        // flutter create path
        const child = spawn('flutter', ['create', targetPath], {
            stdio: 'inherit',
            shell: true
        });
        child.on('close', (code) => {
            if (code === 0) resolve();
            else reject(new Error(`Process exited with ${code}`));
        });
    });
}

// Register Handlers
export const registerCreateHandlers = () => {
    registerScript('createNextJs', async () => await baseCreateProject('nextjs'));
    registerScript('createFlutter', async () => await baseCreateProject('flutter'));
    registerScript('createPython', async () => await baseCreateProject('python'));
    registerScript('createCpp', async () => await baseCreateProject('cpp'));
};
