import { MenuDefinition } from '../../schemas/menu-schema';

export const UpdateMenuDef: MenuDefinition = {
    id: 'update-menu',
    title: '🔄 Update CodeMan',
    type: 'static',
    options: [
        {
            label: '🛠️  Update/Repair (Force Pull)',
            value: 'update-repair',
            action: { type: 'script', handler: 'updateRepair' }
        },
        {
            label: '🔄 Sync (Push & Pull)',
            value: 'update-sync',
            action: { type: 'script', handler: 'updateSync' }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        {
            label: '⬅️  Back',
            value: 'back',
            action: { type: 'back' }
        }
    ]
};
