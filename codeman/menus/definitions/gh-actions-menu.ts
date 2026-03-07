import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';

export const GhActionsMenuDef: MenuDefinition = {
    id: 'gh-actions-menu',
    title: '📊 GitHub Actions Monitor',
    type: 'static',
    options: [
        {
            label: '🔄 View Running Workflows',
            value: 'view-running-workflows',
            action: { type: 'script', handler: 'viewRunningWorkflows' }
        },
        {
            label: '❌ View Recent Failures',
            value: 'view-failed-workflows',
            action: { type: 'script', handler: 'viewFailedWorkflows' }
        },
        {
            label: '📄 View Workflow Output (Logs)',
            value: 'view-workflow-output',
            action: { type: 'script', handler: 'viewWorkflowOutput' }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    ]
};
