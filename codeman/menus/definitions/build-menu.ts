
import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const BuildMenuDef: MenuDefinition = {
    id: 'build-menu',
    title: '🏗️  Build & Release',
    type: 'static',
    options: [
        {
            label: '🚀 Build All (Release Prep)',
            value: 'build-all',
            action: { type: 'script', handler: 'runBuildAll' }
        },
        {
            label: '🧪 Run All Tests (Comprehensive)',
            value: 'run-tests',
            action: { type: 'script', handler: 'runTests' }
        },
        {
            label: '   🔬 Run Unit Tests Only',
            value: 'run-unit',
            action: { type: 'script', handler: 'runUnitTestsFlutter' }
        },
        {
            label: '   🧩 Run Widget Tests Only',
            value: 'run-widget',
            action: { type: 'script', handler: 'runWidgetTestsFlutter' }
        },
        {
            label: '   📱 Run Patrol Tests Only (Native E2E)',
            value: 'run-patrol',
            action: { type: 'script', handler: 'runPatrolTests' }
        },
        {
            label: '   🎹 Run Maestro Tests Only (No-Code E2E)',
            value: 'run-maestro',
            action: { type: 'script', handler: 'runMaestroTests' }
        },
        {
            label: '   🌐 Run Playwright Tests Only (Web)',
            value: 'run-playwright',
            action: { type: 'script', handler: 'runPlaywrightTests' }
        },
        {
            label: '🚀 Run CI/CD Release (Deploy)',
            value: 'run-release',
            action: { type: 'script', handler: 'runRelease', args: { clear: true } }
        },
        { label: '---', value: 'sep1', type: 'separator' },
        { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
    ]
};
