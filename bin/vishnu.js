#!/usr/bin/env node
import { execFileSync, spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const updateScript = path.join(projectRoot, 'scripts', 'js', 'update.js');

// Launch the TUI using npx tsx (safer for Windows/Global)
const cliPath = path.join(projectRoot, 'codeman', 'interactive-cli.ts');

const args = process.argv.slice(2);
try {
    execFileSync(process.execPath, [updateScript, '--launch'], {
        cwd: projectRoot,
        stdio: 'inherit'
    });
} catch (error) {
    process.exit(error && typeof error.status === 'number' ? error.status : 1);
}

const child = spawn('npx', ['tsx', cliPath, ...args], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true, // Required for npx on Windows
    env: { ...process.env, VISHNU_ROOT: projectRoot, CODEMAN_FORCE_LAUNCHER: 'true' }
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
