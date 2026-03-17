import { MenuDefinition } from '../../schemas/menu-schema';

export const DocActionsMenuDef: MenuDefinition = {
    id: 'doc-actions-menu',
    title: '📚 Doc Actions',
    type: 'static',
    options: [
        { label: '🧭 Activity Panel', value: 'doc-activity', action: { type: 'script', handler: 'doc-activity-panel' } },
        { label: '📝 Create Doc Node', value: 'doc-create', action: { type: 'script', handler: 'doc-actions' } },
        { label: '🧭 Manage Doc Nodes', value: 'doc-manage', action: { type: 'script', handler: 'doc-manage' } },
        { label: '🗂️ Open Pending Index', value: 'doc-open-pending', action: { type: 'script', handler: 'doc-open-pending' } },
        { label: '🧭 Show Recent Doc Nodes', value: 'doc-show-recent', action: { type: 'script', handler: 'doc-show-recent' } },
        { label: '👈 Back', value: 'back', action: { type: 'back' } }
    ]
};
