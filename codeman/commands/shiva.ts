import chalk from 'chalk';
import { ProcessManager } from '../core/process-manager';
import { List } from '../components/list';

let isStarting = false;

export async function runShivaScript(targetPath?: string): Promise<void> {
    if (isStarting) {
        console.log(chalk.gray('⚠️  Shiva is already starting, please wait...'));
        return;
    }
    isStarting = true;

    try {
        let pathForShiva = targetPath;

        // If no target path provided, ask user via File Explorer
        if (!pathForShiva) {
            const { FileExplorer } = await import('../utils/file-explorer');
            const path = await import('path');

            // Default to current project root or CWD
            const defaultsPath = process.cwd();

            const explorer = new FileExplorer({
                basePath: defaultsPath,
                onlyDirectories: true,
                title: 'Select Folder for Shiva to Monitor'
            });

            // We need to briefly release IO or ensure FileExplorer handles it (it does)
            const selection = await explorer.selectPath();

            if (!selection) {
                console.log(chalk.yellow('Shiva launch cancelled.'));
                return;
            }
            pathForShiva = selection;
        }

        if (!pathForShiva) return; // Should not happen

        // --- Confirmation Step (Using List for mouse support) ---
        // Include rainbow header in the List message to prevent cursor-home overwriting it
        const { getCodemanHeaderString } = await import('../components/header');
        const { io } = await import('../core/io');
        io.enableAlternateScreen();
        io.enableMouse();
        io.clear();

        const headerStr = await getCodemanHeaderString('shiva');
        const listMessage = `${headerStr}\nTarget: ${chalk.cyan(pathForShiva)}`;

        const confirmChoices = [
            { name: '✅ Confirm & Launch', value: 'yes' },
            { name: '📂 Change Target Folder', value: 'change' },
            { name: '❌ Cancel', value: 'cancel' }
        ];

        const confirm = await List(listMessage, confirmChoices);

        if (confirm === 'cancel' || !confirm) {
            io.clear();
            return;
        }

        if (confirm === 'change') {
            const { FileExplorer } = await import('../utils/file-explorer');
            const explorer = new FileExplorer({
                basePath: process.cwd(),
                onlyDirectories: true,
                title: 'Select Folder for Shiva to Monitor'
            });
            const selection = await explorer.selectPath();
            if (!selection) {
                io.clear();
                return;
            }
            pathForShiva = selection;
        }
        // -------------------------

        console.log(chalk.blue(`\n🔮 Invoking Shiva on: ${pathForShiva}`));
        const fs = await import('fs');
        const path = await import('path');
        const windowTitle = `Shiva - ${path.basename(pathForShiva)}`;

        // Create a temporary batch file to guarantee pause execution
        const runnerPath = path.join(pathForShiva, '_shiva_runner.bat');

        // Resolve script path relative to THIS file (codeman/commands/shiva.ts)
        // We want to go to ../singletons/shiva/index.ts
        const { fileURLToPath } = await import('url');
        const currentFile = fileURLToPath(import.meta.url);
        const currentDir = path.dirname(currentFile);

        const scriptPath = path.resolve(currentDir, '../singletons/shiva/index.ts').replace(/\\/g, '/');

        const batContent = `@echo off
title ${windowTitle}
echo Starting Shiva Protocol...
call npx tsx "${scriptPath}" "${pathForShiva}"
echo.
echo --------------------------------------------------------------------------------
echo   SHIVA PROCESS TERMINATED
echo --------------------------------------------------------------------------------
pause
del "%~f0" & exit
`;
        fs.writeFileSync(runnerPath, batContent);

        // Use the centralized singleton spawner to run the bat file
        await ProcessManager.killAndSpawnSingleton(
            windowTitle,
            `"${runnerPath}"`,
            pathForShiva
        );

    } catch (error) {
        // Global Error Handling
        const { ErrorUtil } = await import('../utils/error-util');
        await ErrorUtil.handleError(error, 'Run Shiva Command', false);
    } finally {
        isStarting = false;
    }
}

