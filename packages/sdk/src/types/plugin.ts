import { z } from 'zod';
import { MenuContributionSchema, MenuContribution } from './menu';
import { ScreenContributionSchema, ScreenContribution, ActionContributionSchema, ActionContribution } from './action';

export const DevDojoContributionSchema = z.object({
    category: z.enum(['scripts', 'skills', 'tools', 'agents']),
    label: z.string(),
    action: z.string().optional(),
    screen: z.string().optional(),
});

export type DevDojoContribution = z.infer<typeof DevDojoContributionSchema>;

export const PluginManifestSchema = z.object({
    id: z.string().regex(/^[a-z][a-z0-9-]*$/, 'Plugin ID must be lowercase alphanumeric with hyphens'),
    name: z.string().min(1),
    version: z.string().default('1.0.0'),
    description: z.string().optional(),
    author: z.string().optional(),
    license: z.string().optional(),
    main: z.string().optional(),
    isSystemPlugin: z.boolean().optional(),
    contributes: z.object({
        menus: z.array(MenuContributionSchema).optional(),
        screens: z.array(ScreenContributionSchema).optional(),
        actions: z.array(ActionContributionSchema).optional(),
        devdojo: z.array(DevDojoContributionSchema).optional(),
    }).optional(),
    capabilities: z.array(z.string()).optional(),
    dependencies: z.array(z.string()).optional(),
    menus: z.boolean().default(true),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

export function validatePluginManifest(manifest: unknown): {
    success: true;
    data: PluginManifest;
} | {
    success: false;
    errors: z.ZodError['errors'];
} {
    const result = PluginManifestSchema.safeParse(manifest);
    if (result.success) {
        return { success: true, data: result.data };
    }
    return { success: false, errors: result.error.errors };
}
