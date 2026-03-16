import { z } from 'zod';
import chalk from 'chalk';
import { MenuNode } from './types';
import { Input } from '../components/input';
import { AuthService } from './auth';
import { GlobalState } from './state';
import { UserConfigManager } from '../config/user-config';

export const AuthMenu: MenuNode = {
    id: 'AUTH',
    propsSchema: z.void(),
    render: async (_props, state) => {
        const printHeader = async () => {
            const { printCodemanHeader } = await import('../components/header');

            // Assume Standard or try to infer? Welcome is usually context-aware
            await printCodemanHeader('auth');
            console.log('\n');

            const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'Unknown Project';
            const email = process.env.FIREBASE_CLIENT_EMAIL || 'Unknown Email';

            console.log(chalk.cyan(`   Project: ${projectId}`));
            console.log(chalk.cyan(`   Account: ${email}`));
            console.log('\n');

            console.log('🔒 System Access is restricted to verified OWNERS, log in with a valid account.');
        };

        await printHeader();

        while (true) {
            // Google Colors: G=Blue, o=Red, o=Yellow, g=Blue, l=Green, e=Red
            const G = chalk.blue('G');
            const o1 = chalk.red('o');
            const o2 = chalk.yellow('o');
            const g = chalk.blue('g');
            const l = chalk.green('l');
            const e = chalk.red('e');
            const google = `${G}${o1}${o2}${g}${l}${e}`;

            // Auto-trigger login flow (opens browser)

            console.log(`\nLogging in with ${google}`);

            // Clean up restart flag if present
            if (process.env.CODEMAN_RESTART_FROM_MENU) {
                delete process.env.CODEMAN_RESTART_FROM_MENU;
            }

            const success = await AuthService.login(state);

            if (success) {
                // Auto-advance without waiting
                // Explicit clear after successful login
                console.clear();
                process.stdout.write('\x1b[2J\x1b[3J\x1b[H');
                return 'mode-selector';
            } else {
                console.log('\x1b[31m%s\x1b[0m', '\n❌ Login Failed or Access Denied.');
                console.log('🔄 Restarting login flow in...');

                // Countdown
                for (let i = 5; i > 0; i--) {
                    process.stdout.write(`\r\x1b[33m${i}...\x1b[0m`);
                    await new Promise(r => setTimeout(r, 1000));
                }

                printHeader();
                continue;
            }
        }
    },
    next: (result) => {
        if (result === 'mode-selector') return 'ROOT';
        return null; // Exit
    }
};
