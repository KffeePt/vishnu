
import { ProjectStrategy } from './interface';
import { MenuNode } from '../core/types';
import * as fs from 'fs';
import * as path from 'path';
import chalk from 'chalk';
// import { spawn } from 'child_process';

export class CppStrategy implements ProjectStrategy {
    type = 'cpp' as const;

    async detect(rootPath: string): Promise<boolean> {
        return fs.existsSync(path.join(rootPath, 'CMakeLists.txt')) ||
            fs.existsSync(path.join(rootPath, 'Makefile')) ||
            fs.readdirSync(rootPath).some(f => f.endsWith('.cpp') || f.endsWith('.cc'));
    }

    async getGeneratorOptions(): Promise<MenuNode[]> {
        return [];
    }

    async getTestRunnerMenu(): Promise<MenuNode> {
        return {
            id: 'cpp-tests',
            render: async () => {
                console.log(chalk.yellow('C++ test runner not yet implemented.'));
                await new Promise(r => setTimeout(r, 1000));
                return 'ROOT';
            },
            next: () => 'ROOT'
        };
    }

    async runDevServer(): Promise<void> {
        console.log(chalk.blue('Building & Running C++ Project...'));
        // Basic make/cmake assumption
        // In reality, this needs complex build system detection.
        console.log(chalk.yellow('Auto-run for C++ is minimal. Please use typical build commands.'));
    }
}
