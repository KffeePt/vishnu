import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../codeman/core/session-timers', () => ({
    SessionTimerManager: {
        hasActiveOwnerSession: vi.fn(() => false)
    }
}));

import { MaintenanceMenuDef } from '../../../codeman/menus/definitions/maintenance-menu';
import { SessionTimerManager } from '../../../codeman/core/session-timers';

describe('Maintenance menu timer access', () => {
    it('hides timer editing until an owner session is active', async () => {
        const getOptions = MaintenanceMenuDef.options as (state: any) => Promise<Array<{ value: string; action?: { handler?: string } }>>;
        const hasActiveOwnerSession = vi.mocked(SessionTimerManager.hasActiveOwnerSession);

        hasActiveOwnerSession.mockReturnValue(false);
        const lockedOptions = await getOptions({ project: { rootPath: '' } });
        expect(lockedOptions.some((option) => option.value === 'edit-session-timers')).toBe(false);

        hasActiveOwnerSession.mockReturnValue(true);
        const ownerOptions = await getOptions({ project: { rootPath: '' } });
        const editOption = ownerOptions.find((option) => option.value === 'edit-session-timers');

        expect(editOption?.action?.handler).toBe('manageSessionTimers');
        expect(ownerOptions.find((option) => option.value === 'migrate-vishnu-backend')?.action?.handler).toBe('maintMigrateVishnuBackend');
    });
});
