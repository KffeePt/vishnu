import { MenuDefinition } from '../../schemas/menu-schema';

export const SettingsMenuDef: MenuDefinition = {
    id: 'settings',
    title: '⚙️  Global Settings',
    type: 'static',
    options: [
        {
            label: '⬆️  Update CodeMan',
            value: 'update-codeman',
            action: { type: 'navigate', target: 'update-menu' }
        },
        {
            label: '🔑 Manage Gemini API Keys',
            value: 'sys-gemini',
            action: { type: 'script', handler: 'manageGeminiKeys' }
        },
        { label: '---', value: 'sep_admin', type: 'separator' },
        {
            label: '🔧 Maintenance',
            value: 'maintenance',
            action: { type: 'script', handler: 'enterMaintenance' }
        },
        {
            label: '🚀 Admin Deploy Options',
            value: 'maintenance-deploy',
            action: { type: 'script', handler: 'enterMaintenanceDeploy' }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        {
            label: '⬅️  Back',
            value: 'back',
            action: { type: 'back' }
        }
    ]
};
