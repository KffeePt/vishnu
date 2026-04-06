import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../codeman/core/session-timers', () => ({
    SessionTimerManager: {
        hasActiveOwnerSession: vi.fn(() => false)
    }
}));

import { SettingsMenuDef } from '../../../codeman/menus/definitions/settings-menu';

describe('Settings menu launcher integration', () => {
    it('shows syncpss only on the launcher', async () => {
        const getOptions = SettingsMenuDef.options as (state: any) => Promise<Array<{ value: string }>>;
        const launcherOptions = await getOptions({ project: { rootPath: '' } });
        const projectOptions = await getOptions({ project: { rootPath: 'C:/demo/project' } });

        expect(launcherOptions.some((option) => option.value === 'syncpss-wsl')).toBe(true);
        expect(projectOptions.some((option) => option.value === 'syncpss-wsl')).toBe(false);
    });
});
