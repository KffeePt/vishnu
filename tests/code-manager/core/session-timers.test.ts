import { describe, expect, it } from 'vitest';

import { inspectTimerValidationIssues } from '../../../codeman/core/session-timers';

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
});
