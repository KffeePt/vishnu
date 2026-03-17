
import { MenuDefinition } from '../../schemas/menu-schema';

export const CreateProjectMenuDef: MenuDefinition = {
    id: 'create-project',
    title: '🚧 Create a New Project',
    type: 'static',
    options: [
        {
            label: '⚛️  Next.js App',
            value: 'nextjs',
            action: { type: 'script', handler: 'createNextJs' }
        },
        {
            label: '💙 Flutter App',
            value: 'flutter',
            action: { type: 'script', handler: 'createFlutter' }
        },
        {
            label: '⬅️  Back',
            value: 'back',
            action: { type: 'back' }
        }
    ]
};
