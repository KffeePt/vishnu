import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../codeman/core/session-timers', () => ({
    SessionTimerManager: {
        hasActiveOwnerSession: vi.fn(() => false)
    }
}));

import { SettingsMenuDef } from '../../../codeman/menus/definitions/settings-menu';

describe('Settings menu launcher integration', () => {
    it('shows Open SyncPss only on the launcher', async () => {
        const getOptions = SettingsMenuDef.options as (state: any) => Promise<Array<{ value: string }>>;
        const launcherOptions = await getOptions({ project: { rootPath: '' } });
        const projectOptions = await getOptions({ project: { rootPath: 'C:/demo/project' } });

        expect(launcherOptions.some((option) => option.value === 'open-syncpss')).toBe(true);
        expect(projectOptions.some((option) => option.value === 'open-syncpss')).toBe(false);
    });

    it('shows session timers as read only in settings', async () => {
        const getOptions = SettingsMenuDef.options as (state: any) => Promise<Array<{ value: string; action?: { handler?: string } }>>;
        const options = await getOptions({ project: { rootPath: '' } });
        const sessionTimers = options.find((option) => option.value === 'session-timers');
        const back = options.find((option) => option.value === 'back');

        expect(sessionTimers?.action?.handler).toBe('viewSessionTimers');
        expect(back?.action?.handler).toBe('returnToLauncherFromSettings');
    });
});
