
import { ProjectStrategy } from './interface';
import { MenuNode } from '../core/types';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
import { spawn } from 'child_process';

export class PythonStrategy implements ProjectStrategy {
    type = 'python' as const;

    async detect(rootPath: string): Promise<boolean> {
        return fs.existsSync(path.join(rootPath, 'requirements.txt')) ||
            fs.existsSync(path.join(rootPath, 'pyproject.toml')) ||
            fs.existsSync(path.join(rootPath, 'Pipfile')) ||
            fs.existsSync(path.join(rootPath, 'setup.py'));
    }

    async getGeneratorOptions(): Promise<MenuNode[]> {
        // Placeholder for future Python generators (e.g., Virtual Env setup)
        return [];
    }

    async getTestRunnerMenu(): Promise<MenuNode> {
        return {
            id: 'python-tests',
            render: async () => {
                console.log(chalk.yellow('Python test runner not yet implemented.'));
                await new Promise(r => setTimeout(r, 1000));
                return 'ROOT';
            },
            next: () => 'ROOT'
        };
    }

    async runDevServer(): Promise<void> {
        console.log(chalk.blue('Starting Python App...'));
        // Try to detect main file? strict defaults for now.
        const mainFile = ['main.py', 'app.py', 'index.py'].find(f => fs.existsSync(path.join(process.cwd(), f)));

        if (mainFile) {
            const child = spawn('python', [mainFile], { stdio: 'inherit', shell: true });
            await new Promise<void>((resolve) => {
                child.on('close', () => resolve());
            });
        } else {
            console.log(chalk.red('No main.py/app.py found. manual start required.'));
        }
    }
}
