import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const getDevDojoOptions = async (state: GlobalState): Promise<MenuOption[]> => {
    const projectType = state.project.type;
    const options: MenuOption[] = [];

    // --- Dynamic Options based on Mode ---

    // 1. Flutter Tools (Dev Ops & Runners) - FIRST
    if (projectType === 'flutter') {
        options.push(
            { label: '🛠️  Dev Ops & Runners', value: 'dev-ops-menu', action: { type: 'navigate', target: 'dev-ops-menu' } },
            { label: '🏗️  Build & Testing', value: 'build-menu', action: { type: 'navigate', target: 'build-menu' } },
            { label: '🎨 Setup App Icon + Splash', value: 'setup-flutter-branding', action: { type: 'script', handler: 'setup-flutter-branding' } }
        );
    }

    // 2. Samurai Mode (Environment) - SECOND
    // Only show if relevant (or always show as a generic runner?)
    options.push(
        { label: '🥷  Dev Environment', value: 'dev-dojo-mode', action: { type: 'script', handler: 'dev-dojo-mode' } }
    );

    options.push({ label: '---', value: 'sep1', type: 'separator' });

    // 3. Dev Server (Next.js Only)
    if (projectType === 'nextjs') {
        options.push({ label: '🌐 Start Dev Server', value: 'dev-server', action: { type: 'script', handler: 'run-dev-server' } });
    }

    // 4. Deployment (Flutter)
    if (projectType === 'flutter') {
        options.push(
            { label: '🚀 Deployment', value: 'deployment-menu', action: { type: 'navigate', target: 'deployment-menu' } }
        );
    }

    // 4. Shiva (Always available)
    options.push({ label: '🔮 Invoke Shiva (Singleton)', value: 'shiva', action: { type: 'script', handler: 'run-shiva' } });

    // 5. Katana (New Custom Scripts) - Universal
    options.push({ label: '⚔️  Katana (Custom Singletons)', value: 'katana', action: { type: 'navigate', target: 'katana' } });

    // 6. Production Tools removed (replaced by Katana)

    if (projectType === 'flutter') {
        options.push(
            { label: '🩺 Flutter Doctor & Tools', value: 'doctor-menu', action: { type: 'navigate', target: 'doctor-menu' } },
            { label: '🧹 Clean Project Utils', value: 'clean-menu', action: { type: 'navigate', target: 'clean-menu' } }
        );
    }

    options.push({ label: '---', value: 'sep2', type: 'separator' });
    options.push({ label: '🌳 Generate Project Tree', value: 'generate-project-tree', action: { type: 'script', handler: 'generate-project-tree' } });

    options.push(
        { label: '---', value: 'sep3', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    );

    return options;
};

export const DevDojoMenuDef: MenuDefinition = {
    id: 'dev-dojo',
    title: '🏯  Dev Dojo (Tools)',
    type: 'dynamic',
    options: getDevDojoOptions
};

// ProdToolsMenuDef removed
