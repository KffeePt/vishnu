import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const MaintDeployMenuDef: MenuDefinition = {
    id: 'maint-deploy-menu',
    title: '🚀 Admin Deploy Options',
    type: 'dynamic',
    options: async (_state: GlobalState): Promise<MenuOption[]> => {
        const { SessionTimerManager } = await import('../../core/session-timers');
        if (!SessionTimerManager.hasActiveOwnerSession()) {
            return [
                { label: '⚠️  Owner session required', value: 'sep_notice', type: 'separator' },
                { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
            ];
        }

        return [
            {
                label: '🧪 Deploy Prep (Local Checks) [New Window]',
                value: 'maint-deploy-prep',
                action: { type: 'script', handler: 'maintDeployPrepWindow' }
            },
            {
                label: '🌟 Deploy All (TUI + Dashboard + Rules)',
                value: 'deploy-all',
                action: { type: 'script', handler: 'maintDeployAll' }
            },
            {
                label: '📦 Deploy TUI Release (Installers)',
                value: 'deploy-release',
                action: { type: 'script', handler: 'maintDeployRelease' }
            },
            {
                label: '🔒 Deploy Rules (Firestore/Storage/RTDB)',
                value: 'deploy-rules',
                action: { type: 'script', handler: 'maintDeployRules' }
            },
            {
                label: '☁️  Deploy Cloud Functions (API)',
                value: 'deploy-dash',
                action: { type: 'script', handler: 'maintDeployDash' }
            },
            { label: '---', value: 'sep_back', type: 'separator' },
            { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
        ];
    }
};
