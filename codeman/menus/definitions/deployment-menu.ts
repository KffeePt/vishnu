import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const DeploymentMenuDef: MenuDefinition = {
    id: 'deployment-menu',
    title: '🚀 Deployment & Release Center',
    type: 'static',
    options: [
        {
            label: '🚀 Run Full Deployment (Build All + Release + Deploy)',
            value: 'run-release',
            action: { type: 'script', handler: 'runRelease', args: { clear: true } }
        },
        { label: '--- Platform Specific Deployments ---', value: 'sep1', type: 'separator' },
        {
            label: '📱 Deploy APK (Android) -> Release',
            value: 'deploy-android',
            action: { type: 'script', handler: 'deployAndroid' }
        },
        {
            label: '🖥️  Deploy Windows (Setup.exe) -> Release',
            value: 'deploy-windows',
            action: { type: 'script', handler: 'deployWindows' }
        },
        {
            label: '🍎 Deploy Mac (DMG) -> Release',
            value: 'deploy-mac',
            action: { type: 'script', handler: 'deployMac' },
            disabled: () => process.platform !== 'darwin'
        },
        {
            label: '📲 Deploy iOS (IPA) -> Release',
            value: 'deploy-ios',
            action: { type: 'script', handler: 'deployIos' },
            disabled: () => process.platform !== 'darwin'
        },
        {
            label: '🌐 Deploy Web (Firebase Hosting)',
            value: 'deploy-web',
            action: { type: 'script', handler: 'deployWebOnly' }
        },
        { label: '--- Management & Monitoring ---', value: 'sep2', type: 'separator' },
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
        { label: '---', value: 'sep3', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    ]
};
