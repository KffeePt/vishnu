
import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';
import * as fs from 'fs-extra';
import * as path from 'path';
import { spawn } from 'child_process';
import chalk from 'chalk';
import { registerScript } from '../../core/schema-factory';

registerScript('runBatsScript', async (args: any) => {
    const { script, projectRoot, isBat } = args;
    const batsDir = path.join(projectRoot, 'bats');
    console.log(chalk.yellow(`\n🚀 Executing ${script}...`));
    const scriptPath = path.join(batsDir, script);

    const command = isBat ? scriptPath : 'powershell';
    const argsArray = isBat ? [] : ['-ExecutionPolicy', 'Bypass', '-File', scriptPath];

    return new Promise<void>((resolve) => {
        const child = spawn(command, argsArray, {
            cwd: projectRoot,
            stdio: 'inherit',
            shell: true
        });

        child.on('close', (code) => {
            console.log(chalk.gray(`\nProcess exited with code ${code}`));
            console.log(chalk.dim('Press any key to continue...'));
            process.stdin.setRawMode(true);
            process.stdin.resume();
            process.stdin.once('data', () => {
                process.stdin.setRawMode(false);
                resolve();
            });
        });
    });
});

async function getBatsOptions(s: GlobalState): Promise<MenuOption[]> {
    const options: MenuOption[] = [];
    const projectRoot = s.project.rootPath;

    if (!projectRoot) {
        return [{ label: '❌ No active project', value: 'back', action: { type: 'back' } }];
    }

    const batsDir = path.join(projectRoot, 'bats');
    if (!await fs.pathExists(batsDir)) {
        return [{ label: '❌ No bats directory found', value: 'back', action: { type: 'back' } }];
    }

    const files = await fs.readdir(batsDir);
    const scripts = files.filter(f => f.endsWith('.bat') || f.endsWith('.ps1'));

    if (scripts.length === 0) {
        options.push({ label: 'No scripts found in /bats', value: 'none', action: { type: 'back' } });
    } else {
        for (const script of scripts) {
            const isBat = script.endsWith('.bat');
            const icon = isBat ? '🦇' : '⚡';
            options.push({
                label: `${icon} ${script}`,
                value: `run-${script}`,
                action: {
                    type: 'script',
                    handler: 'runBatsScript',
                    args: { script, projectRoot, isBat }
                }
            });
        }
    }

    options.push({ label: '---', value: 'sep_bats', type: 'separator' });
    options.push({ label: '🔙 Back', value: 'back', action: { type: 'back' } });

    return options;
}

export const BatsMenuDef: MenuDefinition = {
    id: 'bats-menu',
    title: '🦇 Bats Scripts',
    type: 'dynamic',
    options: getBatsOptions
};
