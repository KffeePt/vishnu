import { MenuDefinition } from '../../schemas/menu-schema';

export const AIMenuDef: MenuDefinition = {
    id: 'ai-menu',
    title: '🧠 AI & Knowledge Base',
    type: 'static',
    options: [
        {
            label: '🤖 AI Agent / Chat',
            value: 'agent',
            action: { type: 'navigate', target: 'agent-chat' }
        },
        {
            label: '📚 Documentation Manager',
            value: 'docs',
            action: { type: 'navigate', target: 'docs-manager' }
        },
        {
            label: '⬅️  Back',
            value: 'back',
            action: { type: 'back' }
        }
    ]
};
