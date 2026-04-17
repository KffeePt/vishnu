#!/usr/bin/env node
const path = require('path');
const { spawn } = require('child_process');

// Determine paths from the legacy launcher to the module-backed CLI entry
const projectRoot = path.resolve(__dirname, '..');
const cliScript = path.join(projectRoot, 'modules', 'codeman', 'interactive-cli.ts');

// Use the project's local tsx to ensure version consistency
// On Windows, npm puts binaries in node_modules/.bin/tsx.cmd
const tsxBin = path.join(projectRoot, 'node_modules', '.bin', process.platform === 'win32' ? 'tsx.cmd' : 'tsx');

// Spawn the process
const child = spawn(tsxBin, [cliScript, ...process.argv.slice(2)], {
    stdio: 'inherit',
    cwd: projectRoot, // Run from project root to ensure path resolution works
    shell: true // Helpful for Windows env var expansion
});

child.on('error', (err) => {
    console.error(`Failed to start codeman: ${err.message}`);
    console.error(`Ensure you have run 'npm install' in the project root.`);
    process.exit(1);
});

child.on('exit', (code) => {
    process.exit(code);
});
