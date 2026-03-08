import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const getBoilerplateOptions = async (state: GlobalState): Promise<MenuOption[]> => {
    const projectType = state.project.type;
    const options: MenuOption[] = [];

    if (projectType === 'nextjs' || projectType === 'unknown') {
        options.push(
            { label: '✨ UI Component', value: 'component', action: { type: 'script', handler: 'create-component' } },
            { label: '📄 Next.js Page', value: 'page', action: { type: 'script', handler: 'create-page' } },
            { label: '⚡ API Route', value: 'api', action: { type: 'script', handler: 'create-api-route' } },
            { label: '👮 Admin Route', value: 'admin-route', action: { type: 'script', handler: 'create-admin-route' } },
            { label: '---', value: 'sep1', type: 'separator' },
            { label: '🧪 Create Unit Test (Vitest)', value: 'unit-test', action: { type: 'script', handler: 'create-unit-test' } },
            { label: '🖥️  Create E2E Test (Playwright)', value: 'e2e-test', action: { type: 'script', handler: 'create-e2e-test' } },
            { label: '---', value: 'sep2', type: 'separator' },
            { label: '🚀 Full Stack Feature', value: 'full-stack', action: { type: 'script', handler: 'create-full-stack' } },
            { label: '📦 Add SaaS Package...', value: 'add-package', action: { type: 'script', handler: 'add-package' } },
            { label: '🔒 Admin Generators...', value: 'admin-menu', action: { type: 'navigate', target: 'admin-gen' } }, // TODO: Migrate Admin Menu
            { label: '🔧 Refactor Component', value: 'refactor-comp', action: { type: 'script', handler: 'refactor-comp' } },
            { label: '---', value: 'sep3', type: 'separator' },
            { label: '🗑️  Delete Asset...', value: 'delete-menu', action: { type: 'navigate', target: 'delete-assets' } }
        );
    } else if (projectType === 'flutter') {
        options.push(
            { label: '✨ Flutter Widget', value: 'flutter-widget', disabled: true, description: 'Not implemented' },
            { label: '📄 Screen / Page', value: 'flutter-screen', disabled: true, description: 'Not implemented' },
            { label: '📦 Bloc / Cubit', value: 'flutter-bloc', disabled: true, description: 'Not implemented' },
            { label: '---', value: 'sep1', type: 'separator' },
            { label: '🗑️  Delete Asset...', value: 'delete-menu', action: { type: 'navigate', target: 'delete-assets' } }
        );
    }

    options.push(
        { label: '---', value: 'sep_back', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    );
    return options;
};

export const BoilerplateMenuDef: MenuDefinition = {
    id: 'boilerplates',
    title: '📦 Boilerplates & Components',
    type: 'dynamic',
    options: getBoilerplateOptions
};
