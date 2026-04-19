import { describe, expect, it } from 'vitest';

import { inspectReleaseAssetIntegrity } from '../../../codeman/core/integrity';

describe('release integrity helpers', () => {
    it('recognizes a fully signed release asset set', () => {
        const result = inspectReleaseAssetIntegrity([
            'vishnu-installer.exe',
            'vishnu-installer.exe.sha256',
            'vishnu-installer.exe.asc',
            'vishnu-installer.sh',
            'vishnu-installer.sh.sha256',
            'vishnu-installer.sh.asc'
        ]);

        expect(result.installersPresent).toBe(true);
        expect(result.checksumsPresent).toBe(true);
        expect(result.signaturesPresent).toBe(true);
        expect(result.missingAssets).toEqual([]);
    });

    it('reports missing checksum and signature artifacts', () => {
        const result = inspectReleaseAssetIntegrity([
            'vishnu-installer.exe',
            'vishnu-installer.sh'
        ]);

        expect(result.installersPresent).toBe(true);
        expect(result.checksumsPresent).toBe(false);
        expect(result.signaturesPresent).toBe(false);
        expect(result.missingAssets).toEqual(expect.arrayContaining([
            'vishnu-installer.exe.sha256',
            'vishnu-installer.sh.sha256',
            'vishnu-installer.exe.asc',
            'vishnu-installer.sh.asc'
        ]));
    });
});
