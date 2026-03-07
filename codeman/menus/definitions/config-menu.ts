
import { MenuDefinition } from '../../schemas/menu-schema';

export const ConfigMenuDef: MenuDefinition = {
    id: 'config',
    title: '⚙️  Configuration',
    type: 'static',
    options: [
        {
            label: '☁️  Toggle Cloud Features (Firebase)',
            value: 'toggle-cloud',
            action: { type: 'script', handler: 'toggleCloudFeatures' }
        },
        {
            label: '🔥 Setup Firebase Auth (Wizard)',
            value: 'setup-firebase',
            action: { type: 'script', handler: 'setupFirebaseAuth' }
        },
        {
            label: '🚨 Force Toggle Mode',
            value: 'force-toggle-mode',
            action: { type: 'script', handler: 'forceToggleMode' }
        },
        {
            label: '👤 User Management',
            value: 'users',
            action: { type: 'navigate', target: 'user-manager' }
        },
        {
            label: '⚙️  App Settings',
            value: 'settings',
            action: { type: 'navigate', target: 'settings' }
        },
        {
            label: '⬅️  Back',
            value: 'back',
            action: { type: 'back' }
        }
    ]
};
