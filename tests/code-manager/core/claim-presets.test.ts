import { describe, expect, it } from 'vitest';

import {
    applyClaimPreset,
    buildPresetClaims,
    FIRST_PARTY_CLAIM_PRESETS,
    normalizeClaimsShape,
    stripManagedClaims
} from '../../../codeman/core/claims/presets';

describe('claim presets', () => {
    it('ships first-party presets for transport-style claims and Vishnu roles', () => {
        const ids = FIRST_PARTY_CLAIM_PRESETS.map((preset) => preset.id);
        expect(ids).toEqual(expect.arrayContaining([
            'owner_admin',
            'staff_dispatcher',
            'user_rider',
            'vishnu_owner',
            'nuke_all'
        ]));
    });

    it('replaces managed claim keys while preserving unrelated claims', () => {
        const preset = FIRST_PARTY_CLAIM_PRESETS.find((item) => item.id === 'staff_driver');
        expect(preset).toBeDefined();

        const nextClaims = applyClaimPreset({
            timezone: 'UTC',
            role: 'admin',
            owner: true,
            oprole: ['manager']
        }, preset!);

        expect(nextClaims).toMatchObject({
            timezone: 'UTC',
            role: 'staff',
            owner: false,
            oprole: ['driver']
        });
    });

    it('builds custom presets from role, owner, and oprole inputs', () => {
        const claims = buildPresetClaims({
            role: 'partner',
            owner: 'false',
            opRole: 'service, rep',
            extraClaims: { region: 'mx' }
        });

        expect(normalizeClaimsShape(claims)).toEqual({
            role: 'partner',
            owner: false,
            oprole: ['service', 'rep'],
            region: 'mx'
        });
    });

    it('strips only managed role fields', () => {
        expect(stripManagedClaims({
            role: 'staff',
            owner: false,
            oprole: ['driver'],
            region: 'mx'
        })).toEqual({
            region: 'mx'
        });
    });
});
