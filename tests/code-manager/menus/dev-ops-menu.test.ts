import { describe, expect, it } from 'vitest';

import { DevOpsMenuDef } from '../../../codeman/menus/definitions/dev-ops-menu';

describe('Dev Ops & Runners menu', () => {
    it('links back into build/testing and deployment flows', async () => {
        const options = typeof DevOpsMenuDef.options === 'function'
            ? await DevOpsMenuDef.options({} as any)
            : DevOpsMenuDef.options;

        const values = options.map((option) => option.value);

        expect(values).toContain('build-menu');
        expect(values).toContain('deployment-menu');
        expect(values.indexOf('deployment-menu')).toBeGreaterThan(values.indexOf('kill-all-runners'));
    });
});
