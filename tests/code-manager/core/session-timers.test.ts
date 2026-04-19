import { describe, expect, it } from 'vitest';

import { analyzeSessionPresence, inspectTimerValidationIssues } from '../../../codeman/core/session-timers';

describe('session timer validation', () => {
    it('flags non-integer and too-small timer values', () => {
        const issues = inspectTimerValidationIssues({
            projectInactivityMs: 1000.5,
            browserLoginTimeoutMs: 30_000,
            ownerBypassTimeoutMs: '60000' as any,
            tokenRefreshSkewMs: 0,
            forcedReauthAt: -5
        });

        expect(issues.map((issue) => issue.key)).toEqual(
            expect.arrayContaining([
                'projectInactivityMs',
                'browserLoginTimeoutMs',
                'ownerBypassTimeoutMs',
                'tokenRefreshSkewMs',
                'forcedReauthAt'
            ])
        );
    });

    it('accepts whole-number timer values above the minimum', () => {
        const issues = inspectTimerValidationIssues({
            projectInactivityMs: 60_000,
            browserLoginTimeoutMs: 120_000,
            ownerBypassTimeoutMs: 180_000,
            tokenRefreshSkewMs: 60_000,
            forcedReauthAt: 0
        });

        expect(issues).toEqual([]);
    });

    it('filters expired rows and collapses duplicate sessions for one user/project/machine', () => {
        const now = 1_000_000;
        const analysis = analyzeSessionPresence({
            stale: {
                sessionId: 'stale',
                machineId: 'machine-a',
                terminalId: 'terminal-stale',
                uid: 'user-1',
                projectId: 'project-1',
                status: 'expired',
                startedAt: now - 50_000,
                lastSeenAt: now - 50_000,
                expiresAt: now - 1
            },
            older: {
                sessionId: 'older',
                machineId: 'machine-a',
                terminalId: 'terminal-old',
                uid: 'user-1',
                projectId: 'project-1',
                status: 'active',
                startedAt: now - 20_000,
                lastSeenAt: now - 20_000,
                expiresAt: now + 40_000
            },
            newer: {
                sessionId: 'newer',
                machineId: 'machine-a',
                terminalId: 'terminal-new',
                uid: 'user-1',
                projectId: 'project-1',
                status: 'active',
                startedAt: now - 5_000,
                lastSeenAt: now - 5_000,
                expiresAt: now + 55_000
            }
        }, {
            now,
            inactivityMs: 60_000
        });

        expect(analysis.sessions).toHaveLength(1);
        expect(analysis.sessions[0]?.sessionId).toBe('newer');
        expect(analysis.removals.sort()).toEqual(['older', 'stale']);
        expect(analysis.expiredCount).toBe(1);
    });
});
