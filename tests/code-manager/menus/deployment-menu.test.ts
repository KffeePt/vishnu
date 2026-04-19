import { describe, expect, it } from 'vitest';

import { getDeploymentMenuOptions } from '../../../codeman/menus/definitions/deployment-menu';

describe('Deployment menu', () => {
    it('shows Firebase Hosting for flutter instead of the Vercel web path', async () => {
        const options = await getDeploymentMenuOptions({
            project: { type: 'flutter' }
        } as any);

        const labels = options.map((option) => option.label);

        expect(labels).toContain('🌐 Deploy Web App (Firebase Hosting)');
        expect(labels).toContain('🤖 Deploy Android App (Google Play) [Coming Soon]');
        expect(labels).toContain('🍎 Deploy iOS App (App Store Connect) [Coming Soon]');
        expect(labels).toContain('🪟 Deploy Windows App (Microsoft Store) [Coming Soon]');
        expect(labels.some((label) => label.includes('Vercel'))).toBe(false);
    });

    it('keeps the Vercel web target for nextjs projects', async () => {
        const options = await getDeploymentMenuOptions({
            project: { type: 'nextjs' }
        } as any);

        const labels = options.map((option) => option.label);

        expect(labels).toContain('🌐 Deploy Web App (Vercel)');
        expect(labels.some((label) => label.includes('Google Play'))).toBe(false);
        expect(labels.some((label) => label.includes('Microsoft Store'))).toBe(false);
    });
});
