import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const getDevDojoOptions = async (state: GlobalState): Promise<MenuOption[]> => {
    const projectType = state.project.type;
    const options: MenuOption[] = [];

    options.push({ label: '--- Environment & Run ---', value: 'sep-env', type: 'separator' });
    options.push(
        { label: '🥷  Dev Environment', value: 'dev-dojo-mode', action: { type: 'script', handler: 'dev-dojo-mode' } }
    );
    options.push(
        { label: '🧹 Close Dev Environment', value: 'dev-dojo-close', action: { type: 'script', handler: 'dev-dojo-close' } }
    );

    if (projectType === 'flutter') {
        options.push(
            { label: '🛠️  Dev Ops & Runners', value: 'dev-ops-menu', action: { type: 'navigate', target: 'dev-ops-menu' } }
        );
    }

    if (projectType === 'nextjs') {
        options.push(
            { label: '🌐 Start Dev Server', value: 'dev-server', action: { type: 'script', handler: 'run-dev-server' } }
        );
    }

    options.push(
        { label: '🧪 Open Emulator UI', value: 'open-emulator-ui', action: { type: 'script', handler: 'openEmulatorUI' } }
    );

    options.push({ label: '--- Build, Release & Health ---', value: 'sep-build', type: 'separator' });
    if (projectType === 'flutter') {
        options.push(
            { label: '🏗️  Build & Testing', value: 'build-menu', action: { type: 'navigate', target: 'build-menu' } }
        );
        options.push(
            { label: '🚀 Deployment', value: 'deployment-menu', action: { type: 'navigate', target: 'deployment-menu' } }
        );
        options.push(
            { label: '🎨 Setup App Icon + Splash', value: 'setup-flutter-branding', action: { type: 'script', handler: 'setup-flutter-branding' } },
            { label: '🩺 Flutter Doctor & Tools', value: 'doctor-menu', action: { type: 'navigate', target: 'doctor-menu' } },
            { label: '🧹 Clean Project Utils', value: 'clean-menu', action: { type: 'navigate', target: 'clean-menu' } }
        );
    }

    options.push({ label: '--- Project Tools ---', value: 'sep-project', type: 'separator' });
    options.push(
        { label: '📚 Doc Actions', value: 'doc-actions', action: { type: 'navigate', target: 'doc-actions-menu' } }
    );
    options.push({ label: '🌳 Generate Project Tree', value: 'generate-project-tree', action: { type: 'script', handler: 'generate-project-tree' } });

    options.push(
        { label: '--- Automation & Agents ---', value: 'sep-automation', type: 'separator' },
        { label: '🔮 Invoke Shiva (Singleton)', value: 'shiva', action: { type: 'script', handler: 'run-shiva' } },
        { label: '⚔️  Katana (Custom Singletons)', value: 'katana', action: { type: 'navigate', target: 'katana' } },
        { label: '---', value: 'sep-end', type: 'separator' },
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
