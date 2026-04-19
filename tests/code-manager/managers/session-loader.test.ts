import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../codeman/core/session-timers', () => ({
    SessionTimerManager: {
        startPresence: vi.fn()
    }
}));

import { SessionTimerManager } from '../../../codeman/core/session-timers';
import { awaitPresenceRegistration } from '../../../codeman/managers/session-loader';

describe('session loader presence registration', () => {
    it('returns null when presence registration takes too long', async () => {
        vi.mocked(SessionTimerManager.startPresence).mockImplementation(
            () => new Promise(() => { }) as any
        );

        await expect(
            awaitPresenceRegistration({ projectPath: 'C:/demo/project' }, 25)
        ).resolves.toBeNull();
    });

    it('returns the presence record when registration finishes in time', async () => {
        const presence = {
            sessionId: 'terminal-1',
            status: 'active'
        };
        vi.mocked(SessionTimerManager.startPresence).mockResolvedValue(presence as any);

        await expect(
            awaitPresenceRegistration({ projectPath: 'C:/demo/project' }, 1000)
        ).resolves.toEqual(presence);
    });
});
