import { describe, expect, it } from 'vitest';

import { MainMenuDef } from '../../../codeman/menus/definitions/main-menu';

describe('Main menu launcher options', () => {
    it('shows Open Dashboard above Settings in launcher mode', async () => {
        const getOptions = MainMenuDef.options as (state: any) => Promise<Array<{ value: string; action?: { handler?: string } }>>;
        const options = await getOptions({ project: { rootPath: '' } } as any);
        const values = options.map((option) => option.value);

        expect(values).toContain('open-dashboard');
        expect(values.indexOf('open-dashboard')).toBeLessThan(values.indexOf('settings'));
        expect(options.find((option) => option.value === 'open-dashboard')?.action?.handler).toBe('openDashboard');
    });
});
