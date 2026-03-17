import { MenuDefinition } from '../../schemas/menu-schema';

export const MaintDeployMenuDef: MenuDefinition = {
    id: 'maint-deploy-menu',
    title: '🚀 Admin Deploy Options',
    type: 'static',
    options: [
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
    ]
};
