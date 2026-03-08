import { z } from 'zod';
import { MenuNode } from '../core/types';
import { List } from '../components/list';
import inquirer from 'inquirer';
import * as path from 'path';
import * as fs from 'fs-extra';
import { createSpinner } from '../components/spinner';
import chalk from 'chalk';
import { findRelatedFiles, RelatedItem } from '../utils/related-items';
import { state as globalState } from '../core/state';

// --- MENU 1: SELECTION ---
export const DeleteAssetsMenu: MenuNode = {
    id: 'delete-assets',
    propsSchema: z.void(),
    render: async (_props, state) => {
        const options = [
            { name: '🧩 Component', value: 'component' },
            { name: '📄 Page/Route', value: 'route' },
            { name: '⚡ API Route', value: 'api' },
            { name: '🧪 Unit Test', value: 'unit-test' },
            { name: '🖥️  E2E Test', value: 'e2e-test' },
            { name: '🚀 Full Stack Feature (Smart Delete)', value: 'full-stack' },
            new inquirer.Separator(),
            { name: '⬅️  Back', value: 'back' }
        ];

        const choice = await List('🗑️  Delete Project Assets', options as any);

        if (choice === 'back' || choice === '__BACK__') return 'boilerplates';

        // 1. Run the interactive selection logic
        // This logic modifies the global state with the selection
        if (choice === 'full-stack') {
            const result = await handleFullStackDelete();
            if (!result) return 'delete-assets'; // Cancelled or failed
        } else {
            const result = await handleGenericDelete(choice as any);
            if (!result) return 'delete-assets'; // Cancelled or failed
        }

        // 2. Navigate to Confirmation Menu
        return 'delete-confirmation';
    },
    next: (result) => {
        return result;
    }
};

// --- MENU 2: CONFIRMATION ---
export const DeleteConfirmationMenu: MenuNode = {
    id: 'delete-confirmation',
    propsSchema: z.void(),
    render: async (_props, state) => {
        const context = state.deleteContext;
        if (!context) return 'delete-assets';

        const { target, related } = context;
        const relativeTarget = path.relative(process.cwd(), target);

        console.clear();
        console.log(chalk.bold.red('\n⚠️  DELETE CONFIRMATION\n'));
        console.log(`Target: ${chalk.cyan(relativeTarget)}`);

        if (related && related.length > 0) {
            console.log(chalk.yellow(`\nFound ${related.length} related item(s):`));
            related.forEach((item: any) => {
                console.log(` - [${item.type}] ${chalk.gray(path.relative(process.cwd(), item.path))}`);
            });
        } else {
            console.log(chalk.gray('\nNo related items found.'));
        }
        console.log('');

        const options = [
            { name: '❌ Yes, Delete Target Only', value: 'target' },
            ...(related && related.length > 0 ? [{ name: `🔥 Yes, Delete Target AND ${related.length} Related Items`, value: 'all' }] : []),
            { name: '⬅️  Cancel', value: 'cancel' }
        ];

        const choice = await List('What would you like to do?', options);

        if (choice === 'cancel' || choice === '__BACK__') return 'delete-assets';

        // Execute Delete
        if (choice === 'target') {
            await performDelete(target);
        } else if (choice === 'all') {
            await performDelete(target);
            for (const item of related) {
                await performDelete(item.path);
            }
        }

        // Wait a bit to see result
        await new Promise(r => setTimeout(r, 2000));

        return 'delete-assets';
    },
    next: (result) => {
        return 'delete-assets';
    }
};


// --- HELPERS ---

async function handleGenericDelete(type: 'component' | 'route' | 'api' | 'unit-test' | 'e2e-test'): Promise<boolean> {
    let basePath = '';
    let title = '';

    if (type === 'component') {
        basePath = path.join(process.cwd(), 'components');
        title = 'Select Component to DELETE';
    } else if (type === 'route') {
        basePath = path.join(process.cwd(), 'app');
        title = 'Select Route to DELETE';
    } else if (type === 'api') {
        basePath = path.join(process.cwd(), 'app', 'api');
        title = 'Select API Endpoints to DELETE';
    } else if (type === 'unit-test') {
        basePath = path.join(process.cwd(), 'tests', 'components');
        title = 'Select Unit Test to DELETE';
    } else if (type === 'e2e-test') {
        basePath = path.join(process.cwd(), 'tests', 'e2e');
        title = 'Select E2E Test to DELETE';
    }

    const { FileExplorer } = await import('../utils/file-explorer');
    const explorer = new FileExplorer({ basePath, title });
    const targetPath = await explorer.selectPath();



    if (!targetPath) return false;

    const stat = await fs.stat(targetPath);
    const isFile = stat.isFile();
    const basename = path.basename(targetPath);
    const parentDir = path.dirname(targetPath);

    let pathToDelete = targetPath;

    if (isFile) {
        if (basename === 'page.tsx' || basename === 'route.ts' || basename === 'layout.tsx' || basename === 'loading.tsx') {
            pathToDelete = parentDir;
        }
    }

    const detectedItems = await findRelatedFiles(pathToDelete);
    detectedItems.sort((a, b) => a.type.localeCompare(b.type));

    // Store in State
    globalState.deleteContext = {
        target: pathToDelete,
        related: detectedItems
    };

    return true;
}

async function handleFullStackDelete(): Promise<boolean> {
    const { FileExplorer } = await import('../utils/file-explorer');
    const explorer = new FileExplorer({
        basePath: path.join(process.cwd(), 'components'),
        title: 'Select Primary Component of the Feature'
    });

    const targetPath = await explorer.selectPath();



    if (!targetPath) return false;

    const componentName = path.basename(targetPath);
    const spinner = createSpinner('Scanning for related Full Stack resources...').start();

    const related = await findRelatedFiles(targetPath);
    spinner.stop();

    if (related.length === 0) {
        // console.log(chalk.yellow(`No related pages/APIs found for ${componentName}.`));
        // Still proceed to delete just component
    }

    globalState.deleteContext = {
        target: targetPath,
        related: related
    };

    return true;
}

async function performDelete(target: string) {
    const spinner = createSpinner(`Deleting ${path.basename(target)}...`).start();
    try {
        let routePathToRemove = '';
        const relativePath = path.relative(process.cwd(), target).replace(/\\/g, '/');

        if (relativePath.startsWith('app/')) {
            routePathToRemove = '/' + relativePath.replace(/^app\//, '');
            routePathToRemove = routePathToRemove.replace(/\/[^/]+\.(tsx|ts)$/, '');
        }

        await fs.remove(target);

        if (routePathToRemove) {
            try {
                const { removeRouteFromMiddleware } = await import('../utils/middleware-utils');
                await removeRouteFromMiddleware(routePathToRemove);
            } catch (ignored) { }
        }

        const parentDir = path.dirname(target);
        if (parentDir !== process.cwd() && parentDir.startsWith(process.cwd())) {
            if (await fs.pathExists(parentDir)) {
                const files = await fs.readdir(parentDir);
                if (files.length === 0) {
                    await fs.remove(parentDir);
                }
            }
        }

        spinner.succeed(`Deleted ${path.relative(process.cwd(), target)}`);
    } catch (e: any) {
        spinner.fail(`Failed to delete: ${e.message}`);
    }
}
