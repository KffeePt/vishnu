import { MenuDefinition, MenuOption } from '../../schemas/menu-schema';
import { GlobalState } from '../../core/state';

export const MaintenanceMenuDef: MenuDefinition = {
    id: 'maintenance-menu',
    title: '🔧 Maintenance & Admin',
    type: 'dynamic',
    options: async (state: GlobalState) => {
        const { SessionTimerManager } = await import('../../core/session-timers');
        if (!SessionTimerManager.hasActiveOwnerSession()) {
            return [
                { label: '⚠️  Owner session required', value: 'sep_notice', type: 'separator' },
                { label: '⬅️  Back', value: 'back', action: { type: 'back' } }
            ];
        }

        const opts: MenuOption[] = [];

        opts.push({ label: '--- Release & Deploy (Admin) ---', value: 'sep1', type: 'separator' });
        opts.push({
            label: '🚀 Admin Deploy Options',
            value: 'maint-deploy',
            action: { type: 'navigate', target: 'maint-deploy-menu' }
        });
        


        opts.push({ label: '--- Local Validation ---', value: 'sep_local', type: 'separator' });
        opts.push({
            label: '🧪 Run Tests',
            value: 'run-tests',
            action: { type: 'script', handler: 'maintRunTests' }
        });
        opts.push({
            label: '🏗️  Run Build',
            value: 'run-build',
            action: { type: 'script', handler: 'maintRunBuild' }
        });
        opts.push({
            label: '🗄️  Start Firebase Emulator',
            value: 'run-emulator',
            action: { type: 'script', handler: 'maintRunEmulator' }
        });


        opts.push({ label: '--- Project Ops ---', value: 'sep2', type: 'separator' });
        opts.push({
            label: '🌿 Branch Management',
            value: 'branching-menu',
            action: { type: 'navigate', target: 'branching-menu' }
        });
        

        opts.push({ label: '--- Admin Tools ---', value: 'sep3', type: 'separator' });
        opts.push({
            label: '👑 Set User Claims (TUI) [New Window]',
            value: 'set-claims',
            action: { type: 'script', handler: 'maintSetClaims' }
        });
        opts.push({
            label: '🖥️  Start Dashboard Dev Server [New Window]',
            value: 'dashboard-dev',
            action: { type: 'script', handler: 'maintDashboardDev' }
        });
        opts.push({
            label: '🔥 Setup Firebase Config (For User Dev Projects)',
            value: 'setup-firebase',
            action: { type: 'script', handler: 'maintSetupFirebase' }
        });
        opts.push({
            label: '⏱️  Edit Global Session Timers',
            value: 'edit-session-timers',
            action: { type: 'script', handler: 'manageSessionTimers' }
        });

        opts.push({ label: '---', value: 'sep4', type: 'separator' });
        opts.push({ label: '⬅️  Back', value: 'back', action: { type: 'back' } });

        return opts;
    }
};
