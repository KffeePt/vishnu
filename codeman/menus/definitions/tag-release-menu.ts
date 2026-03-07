import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';

export const TagReleaseMenuDef: MenuDefinition = {
    id: 'tag-release-menu',
    title: '🏷️  Tag & Release Management',
    type: 'static',
    options: [
        {
            label: '➕ Create Tag/Release (Interactive)',
            value: 'create-tag-release',
            action: { type: 'script', handler: 'createTagRelease' }
        },
        {
            label: '🗑️  Delete Tag/Release',
            value: 'delete-tag-release',
            action: { type: 'script', handler: 'deleteTagRelease' }
        },
        {
            label: '📋 View Tags & Releases',
            value: 'view-release-status',
            action: { type: 'script', handler: 'viewReleaseStatus' }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    ]
};
