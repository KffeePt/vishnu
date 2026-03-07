#!/usr/bin/env node
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.join(__dirname, '..');

// Launch the TUI using npx tsx (safer for Windows/Global)
const cliPath = path.join(projectRoot, 'codeman', 'interactive-cli.ts');

const child = spawn('npx', ['tsx', cliPath], {
    stdio: 'inherit',
    cwd: process.cwd(),
    shell: true, // Required for npx on Windows
    env: { ...process.env, VISHNU_ROOT: projectRoot }
});

child.on('exit', (code) => {
    process.exit(code ?? 0);
});
