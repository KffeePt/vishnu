import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const getDeploymentMenuOptions = async (state: GlobalState): Promise<MenuOption[]> => {
    const projectType = state.project.type;
    const options: MenuOption[] = [
        {
            label: '🚀 Run Release Pipeline (Build + Tag + GitHub Release)',
            value: 'run-release',
            action: { type: 'script', handler: 'runRelease', args: { clear: true } }
        }
    ];

    options.push({ label: '--- Platform Deploy Targets ---', value: 'sep-platforms', type: 'separator' });

    if (projectType === 'flutter') {
        options.push(
            {
                label: '🌐 Deploy Web App (Firebase Hosting)',
                value: 'deploy-web',
                action: { type: 'script', handler: 'deployWebOnly' }
            },
            {
                label: '🤖 Deploy Android App (Google Play) [Coming Soon]',
                value: 'deploy-android',
                action: { type: 'script', handler: 'deployAndroid' }
            },
            {
                label: '🍎 Deploy iOS App (App Store Connect) [Coming Soon]',
                value: 'deploy-ios',
                action: { type: 'script', handler: 'deployIos' }
            },
            {
                label: '🪟 Deploy Windows App (Microsoft Store) [Coming Soon]',
                value: 'deploy-windows',
                action: { type: 'script', handler: 'deployWindows' }
            }
        );
    } else if (projectType === 'nextjs') {
        options.push(
            {
                label: '🌐 Deploy Web App (Vercel)',
                value: 'deploy-web',
                action: { type: 'script', handler: 'deployWebOnly' }
            }
        );
    } else {
        options.push(
            {
                label: '🌐 Deploy Web App (Firebase Hosting)',
                value: 'deploy-web',
                action: { type: 'script', handler: 'deployWebOnly' }
            }
        );
    }

    options.push(
        { label: '--- Management & Monitoring ---', value: 'sep-management', type: 'separator' },
        {
            label: '🏷️  Tag & Release Management',
            value: 'tag-release-menu',
            action: { type: 'navigate', target: 'tag-release-menu' }
        },
        {
            label: '📊 GitHub Actions Monitor',
            value: 'gh-actions-menu',
            action: { type: 'navigate', target: 'gh-actions-menu' }
        },
        {
            label: '🧪 Run All Tests',
            value: 'run-tests-deploy',
            action: { type: 'script', handler: 'runTests' }
        },
        { label: '---', value: 'sep-back', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    );

    return options;
};

export const DeploymentMenuDef: MenuDefinition = {
    id: 'deployment-menu',
    title: '🚀 Deployment & Release Center',
    type: 'dynamic',
    options: getDeploymentMenuOptions
};
