import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import chalk from 'chalk';
import { GlobalState } from '../../core/state';

export const JobsMenuDef: MenuDefinition = {
    id: 'jobs',
    title: async () => chalk.cyan.bold('\n🚀 Cloud Jobs (Vishnu API)\n') + chalk.dim('Trigger builds and scaffolds via the centralized backend.\n'),
    type: 'static',
    options: [
        {
            label: '🏗️ Trigger Build',
            value: 'job-build',
            action: { type: 'script', handler: 'triggerApiBuild' }
        },
        {
            label: '✨ Scaffold Project',
            value: 'job-scaffold',
            action: { type: 'script', handler: 'triggerApiScaffold' }
        },
        {
            label: '📋 List Active Jobs',
            value: 'job-list',
            action: { type: 'script', handler: 'listApiJobs' }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        {
            label: '🔙 Back to Main Menu',
            value: 'back',
            action: { type: 'navigate', target: 'ROOT' }
        }
    ]
};
