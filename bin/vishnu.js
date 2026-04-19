#!/usr/bin/env node
import { execFileSync, spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');
const updateScript = path.join(projectRoot, 'scripts', 'js', 'update.js');

const cliPath = path.join(projectRoot, 'codeman', 'interactive-cli.ts');

function resolveBunCommand() {
    const configured = process.env.BUN_EXE;
    if (configured && fs.existsSync(configured)) {
        return configured;
    }

    const defaultWindowsPath = path.join(os.homedir(), '.bun', 'bin', 'bun.exe');
    if (process.platform === 'win32' && fs.existsSync(defaultWindowsPath)) {
        return defaultWindowsPath;
    }

    return null;
}

const args = process.argv.slice(2);
try {
    execFileSync(process.execPath, [updateScript, '--launch'], {
        cwd: projectRoot,
        stdio: 'inherit'
    });
} catch (error) {
    process.exit(error && typeof error.status === 'number' ? error.status : 1);
}

const bunCommand = resolveBunCommand();
const launchCommand = bunCommand || 'npx';
const launchArgs = bunCommand
    ? ['x', 'tsx', cliPath, ...args]
    : ['tsx', cliPath, ...args];

const child = spawn(launchCommand, launchArgs, {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true, // Required for npx on Windows
    env: { ...process.env, VISHNU_ROOT: projectRoot, CODEMAN_FORCE_LAUNCHER: 'true' }
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
