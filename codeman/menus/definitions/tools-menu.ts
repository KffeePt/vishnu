import { MenuDefinition } from '../../schemas/menu-schema';

export const ToolsMenuDef: MenuDefinition = {
    id: 'tools-menu',
    title: '🔧 Vishnu Tools',
    type: 'static',
    options: [
        {
            label: '⬆️  Update CodeMan',
            value: 'update-codeman',
            action: { type: 'navigate', target: 'update-menu' }
        },
        { label: '---', value: 'sep_local', type: 'separator' },
        {
            label: '🧪 Run Tests',
            value: 'run-tests',
            action: { type: 'script', handler: 'tools:runTests' }
        },
        {
            label: '🏗️  Run Build',
            value: 'run-build',
            action: { type: 'script', handler: 'tools:runBuild' }
        },
        {
            label: '🗄️  Start Firebase Emulator',
            value: 'run-emulator',
            action: { type: 'script', handler: 'tools:runEmulator' }
        },
        { label: '---', value: 'sep_ops', type: 'separator' },
        {
            label: '👑 Set User Claims (TUI) [New Window]',
            value: 'set-claims',
            action: { type: 'script', handler: 'tools:setClaims' }
        },
        {
            label: '🖥️  Start Dashboard Dev Server [New Window]',
            value: 'dashboard-dev',
            action: { type: 'script', handler: 'tools:startDashboardDev' }
        },
        {
            label: '🔥 Setup Firebase Config (For User Dev Projects)',
            value: 'setup-firebase',
            action: { type: 'script', handler: 'tools:setupFirebase' }
        },
        { label: '---', value: 'sep_deploy', type: 'separator' },
        {
            label: '🧪 Deploy Prep (Local Checks)',
            value: 'deploy-prep',
            action: { type: 'script', handler: 'tools:deployPrep' }
        },
        {
            label: '🌟 Deploy All (TUI + Dashboard + Rules)',
            value: 'deploy-all',
            action: { type: 'script', handler: 'tools:deployAll' }
        },
        {
            label: '📦 Deploy TUI Release (Installers)',
            value: 'deploy-release',
            action: { type: 'script', handler: 'tools:deployRelease' }
        },
        {
            label: '🔒 Deploy Rules (Firestore/Storage/RTDB)',
            value: 'deploy-rules',
            action: { type: 'script', handler: 'tools:deployRules' }
        },
        {
            label: '☁️  Deploy Cloud Functions (API)',
            value: 'deploy-functions',
            action: { type: 'script', handler: 'tools:deployFunctions' }
        },
        { label: '---', value: 'sep_back', type: 'separator' },
        {
            label: '⬅️  Back',
            value: 'back',
            action: { type: 'back' }
        }
    ]
};
