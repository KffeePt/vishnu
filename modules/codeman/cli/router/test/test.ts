import { spawn } from 'child_process';
import path from 'path';

export async function runTestCommand(args: string[] = []) {
    const cliPath = path.join(process.cwd(), 'modules', 'codeman', 'interactive-cli.ts');
    return new Promise<number>((resolve) => {
        const child = spawn('npx', ['tsx', cliPath, '--run-tests', ...args], {
            stdio: 'inherit',
            cwd: process.cwd(),
            shell: true
        });
        child.on('close', (code) => resolve(code ?? 0));
    });
}
