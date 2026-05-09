import { describe, expect, it } from 'vitest';

import { getDevDojoOptions } from '../../../codeman/menus/definitions/dev-dojo-menu';

describe('Dev Dojo menu', () => {
    it('groups flutter tools into clearer sections', async () => {
        const options = await getDevDojoOptions({
            project: { type: 'flutter' }
        } as any);

        expect(options.map((option) => option.value)).toEqual(expect.arrayContaining([
            'dev-dojo-mode',
            'dev-ops-menu',
            'build-menu',
            'deployment-menu',
            'doctor-menu',
            'clean-menu',
            'doc-actions',
            'generate-project-tree',
            'shiva',
            'katana'
        ]));

        const separatorLabels = options
            .filter((option) => option.type === 'separator')
            .map((option) => option.label);

        expect(separatorLabels).toEqual(expect.arrayContaining([
            '--- Environment & Run ---',
            '--- Build, Release & Health ---',
            '--- Project Tools ---',
            '--- Automation & Agents ---'
        ]));

        const firstAction = options.find((option) => option.type !== 'separator');
        expect(firstAction?.value).toBe('dev-ops-menu');
    });

    it('keeps nextjs dev server in the environment section', async () => {
        const options = await getDevDojoOptions({
            project: { type: 'nextjs' }
        } as any);

        expect(options.some((option) => option.value === 'dev-server')).toBe(true);
        expect(options.some((option) => option.value === 'deployment-menu')).toBe(false);
    });
});
