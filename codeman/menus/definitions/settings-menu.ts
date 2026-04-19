import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const SettingsMenuDef: MenuDefinition = {
    id: 'settings',
    title: '⚙️  Global Settings',
    type: 'dynamic',
    options: async (state: GlobalState): Promise<MenuOption[]> => {
        const options: MenuOption[] = [
            {
                label: '⬆️  Update CodeMan',
                value: 'update-codeman',
                action: { type: 'navigate', target: 'update-menu' }
            },
            {
                label: '📦 Update Vishnu Stable Release',
                value: 'update-vishnu-stable',
                action: { type: 'script', handler: 'updateVishnuStable' }
            },
            {
                label: '🔑 Manage Gemini API Keys',
                value: 'sys-gemini',
                action: { type: 'script', handler: 'manageGeminiKeys' }
            },
            {
                label: '⏱️  Global Session Timers (Read Only)',
                value: 'session-timers',
                action: { type: 'script', handler: 'viewSessionTimers' }
            }
        ];

        if (!state.project.rootPath) {
            options.splice(1, 0, {
                label: '🗃️  Open SyncPss',
                value: 'open-syncpss',
                action: { type: 'script', handler: 'openSyncPss' }
            });
        }

        options.push({ label: '---', value: 'sep_admin', type: 'separator' });
        options.push({
            label: '🔧 Maintenance',
            value: 'maintenance',
            action: { type: 'script', handler: 'enterMaintenance' }
        });

        options.push({ label: '---', value: 'sep1', type: 'separator' });
        options.push({
            label: '⬅️  Back',
            value: 'back',
            action: { type: 'script', handler: 'returnToLauncherFromSettings' }
        });

        return options;
    }
};
