
import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';
import { getCodemanHeaderString } from '../../components/header';
import * as path from 'path';
import chalk from 'chalk';

async function getLauncherOptions(s: GlobalState): Promise<MenuOption[]> {
    const { GlobalStateManager } = await import('../../managers/global-state-manager');
    const manager = new GlobalStateManager();
    const last = manager.getLastActive();

    const options: MenuOption[] = [];

    // 1. Resume Last Session
    if (last && last.path) {
        options.push({
            label: `⏩ Resume Last Session (${chalk.dim(path.basename(last.path))})`,
            value: 'resume-session',
            action: { type: 'script', handler: 'resumeSession' }
        });
        options.push({ label: '---', value: 'sep1', type: 'separator' });
    }

    // 2. Current Folder (Requested Position)
    options.push({
        label: `👉 Use Current Folder (${path.basename(process.cwd())})`,
        value: 'current',
        action: { type: 'script', handler: 'useCurrentFolder' }
    });

    // 3. Open / Create
    options.push(
        {
            label: '📂 Open Existing Project (Folder)',
            value: 'open-project',
            action: { type: 'script', handler: 'openProject' }
        },
        {
            label: '🚧 Create a new project',
            value: 'create-project',
            action: { type: 'navigate', target: 'create-project' }
        },
        { label: '---', value: 'sep2', type: 'separator' },
        {
            label: '⚙️  Settings',
            value: 'settings',
            action: { type: 'navigate', target: 'settings' }
        },
    );

    // 4. System
    options.push(
        {
            label: '🔄 Restart CLI',
            value: 'restart',
            action: { type: 'script', handler: 'restartCLI' }
        },
        {
            label: '❌ Exit',
            value: 'exit',
            action: { type: 'script', handler: 'exitCLI' }
        }
    );

    return options;
}

async function getProjectOptions(s: GlobalState): Promise<MenuOption[]> {
    const options: MenuOption[] = [];

    // 1. Dev Dojo (Samurai Mode)
    options.push({
        label: '🏯 Dev Dojo (Samurai Mode)',
        value: 'dev-dojo',
        action: { type: 'navigate', target: 'dev-dojo' }
    });

    options.push({
        label: '📦 Boilerplates',
        value: 'boilerplates',
        action: { type: 'navigate', target: 'boilerplates' }
    });

    // Inject Tests if Next.js
    if (s.project.type === 'nextjs') {
        options.push({
            label: '🧪 Tests',
            value: 'nextjs-tests',
            action: { type: 'navigate', target: 'nextjs-tests' }
        });
    }

    options.push({
        label: '🤖 AI Suite',
        value: 'ai-tools',
        action: { type: 'navigate', target: 'ai' }
    });

    options.push({
        label: '🚀 Cloud Jobs (API)',
        value: 'cloud-jobs',
        action: { type: 'navigate', target: 'jobs' }
    });

    options.push({
        label: '⚙️  Config',
        value: 'config',
        action: { type: 'navigate', target: 'config' }
    });

    // Check for Bats Scripts
    const { default: fs } = await import('fs-extra');
    const { default: path } = await import('path');
    const batsPath = path.join(s.project.rootPath, 'bats');
    if (await fs.pathExists(batsPath)) {
        options.push({
            label: '🦇 Bats Scripts',
            value: 'bats-menu',
            action: { type: 'navigate', target: 'bats-menu' }
        });
    }

    options.push({
        label: '🔄 Restart Session',
        value: 'restart-session',
        action: { type: 'script', handler: 'restartSession' }
    });

    options.push({ label: '---', value: 'sep_proj', type: 'separator' });

    options.push({
        label: '🏃 Close Project / Back to Launcher',
        value: 'close-project',
        action: { type: 'script', handler: 'closeProject' }
    });

    return options;
}

async function getDynamicMainMenuOptions(s: GlobalState): Promise<MenuOption[]> {
    if (s.project.type === 'unknown' || !s.project.rootPath) {
        return getLauncherOptions(s);
    }
    return getProjectOptions(s);
}

export const MainMenuDef: MenuDefinition = {
    id: 'ROOT',
    title: async (s) => {
        const type = s.project.type === 'nextjs' ? 'nextjs'
            : s.project.type === 'flutter' ? 'flutter'
                : s.project.type === 'unknown' ? 'welcome' // Launcher
                    : 'custom';
        return await getCodemanHeaderString(type as any);
    },
    type: 'dynamic',
    options: getDynamicMainMenuOptions
};
