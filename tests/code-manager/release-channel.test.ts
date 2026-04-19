import { describe, expect, it } from 'vitest';

import {
    compareVersions,
    isInstallerVersionCompatible,
    isStableReleaseTag,
    resolveLatestStableTag
} from '../../scripts/js/release-channel.js';

describe('release channel helpers', () => {
    it('identifies stable release tags only', () => {
        expect(isStableReleaseTag('v3.0.0')).toBe(true);
        expect(isStableReleaseTag('v3.0.0-beta.1')).toBe(false);
        expect(isStableReleaseTag('main')).toBe(false);
    });

    it('resolves the newest stable tag while ignoring prereleases', () => {
        const result = resolveLatestStableTag([
            'v2.0.0-alpha.1',
            'v1.9.9',
            'v2.0.0-beta.2',
            'v2.0.0',
            'v1.10.0'
        ]);

        expect(result).toBe('v2.0.0');
    });

    it('compares semantic versions numerically', () => {
        expect(compareVersions('3.0.0', '2.10.9')).toBe(1);
        expect(compareVersions('v3.0.0', '3.0.0')).toBe(0);
        expect(compareVersions('1.2.9', '1.10.0')).toBe(-1);
    });

    it('enforces the minimum installer version gate', () => {
        expect(isInstallerVersionCompatible('3.0.0', '3.0.0')).toBe(true);
        expect(isInstallerVersionCompatible('3.1.0', '3.0.0')).toBe(true);
        expect(isInstallerVersionCompatible('2.9.9', '3.0.0')).toBe(false);
    });
});
