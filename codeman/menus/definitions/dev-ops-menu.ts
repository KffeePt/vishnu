
import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';

export const DevOpsMenuDef: MenuDefinition = {
    id: 'dev-ops-menu',
    title: '🛠️  Dev Ops & Runners',
    type: 'dynamic',
    options: async () => {
        const options: MenuOption[] = [];

        // 1. Android & iOS Emulators
        options.push(
            {
                label: '🤖 Launch Android Emulator',
                value: 'launch-emulator',
                action: { type: 'script', handler: 'launchEmulator' }
            },
            {
                label: '📲 Launch iOS Simulator',
                value: 'launch-ios-simulator',
                action: { type: 'script', handler: 'launchIosSimulator' }
            },
            {
                label: '🤖 Run Android App',
                value: 'run-android',
                action: { type: 'script', handler: 'runAndroid' }
            }
        );

        options.push({ label: '---', value: 'sep1', type: 'separator' });

        // 2. Desktop & iOS
        options.push(
            {
                label: '🪟  Run Windows App',
                value: 'run-windows',
                action: { type: 'script', handler: 'runWindows' }
            },
            {
                label: '🍎 Run macOS App',
                value: 'run-macos',
                action: { type: 'script', handler: 'runMac' }
            },
            {
                label: '📱 Run iOS App',
                value: 'run-ios',
                action: { type: 'script', handler: 'runIos' }
            }
        );

        options.push({ label: '---', value: 'sep2', type: 'separator' });

        // 3. Web
        options.push(
            {
                label: '🌐 Run Web App',
                value: 'run-web',
                action: { type: 'script', handler: 'runWeb' }
            },
            {
                label: '👤 Project Claims',
                value: 'project-set-claims',
                action: { type: 'script', handler: 'project-set-claims' }
            },
            {
                label: '🔐 Manage Secrets',
                value: 'manage-secrets',
                action: { type: 'script', handler: 'manage-secrets' }
            }
        );

        options.push(
            { label: '---', value: 'sep3', type: 'separator' },
            {
                label: '🏗️  Build & Testing',
                value: 'build-menu',
                action: { type: 'navigate', target: 'build-menu' }
            },
            {
                label: '💀 Kill All (Emulators & Instances)',
                value: 'kill-all-runners',
                action: { type: 'script', handler: 'killAllRunners' }
            },
            {
                label: '🚀 Deployment Options',
                value: 'deployment-menu',
                action: { type: 'navigate', target: 'deployment-menu' }
            },
            { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
        );

        return options;
    }
};
