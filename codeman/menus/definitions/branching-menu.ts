import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';

export const BranchingMenuDef: MenuDefinition = {
    id: 'branching-menu',
    title: '🌿 Branch Management',
    type: 'static',
    options: [
        {
            label: '📊 Branch Status Dashboard',
            value: 'branch-status',
            action: { type: 'script', handler: 'branchStatus' }
        },
        {
            label: '🌱 Open New Branch',
            value: 'open-branch',
            action: { type: 'script', handler: 'branchOpen' }
        },
        {
            label: '🔀 Switch Branch',
            value: 'switch-branch',
            action: { type: 'script', handler: 'branchSwitch' }
        },
        { label: '--- PR ---', value: 'sep1', type: 'separator' },
        {
            label: '📤 Submit Pull Request (gt/gh)',
            value: 'submit-pr',
            action: { type: 'script', handler: 'branchSubmitPR' }
        },
        { label: '--- Cleanup ---', value: 'sep2', type: 'separator' },
        {
            label: '🗑️  Remove Branch',
            value: 'remove-branch',
            action: { type: 'script', handler: 'branchRemove' }
        },
        { label: '---', value: 'sep3', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    ]
};
