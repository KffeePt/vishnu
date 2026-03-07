import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';

export const CleanMenuDef: MenuDefinition = {
    id: 'clean-menu',
    title: '🧹 Clean Project Utils',
    type: 'static',
    options: [
        {
            label: '🧨 Clean All (Logs, Cache, Lock files)',
            value: 'clean-all-files',
            action: { type: 'script', handler: 'runCleanAllFiles' }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    ]
};
