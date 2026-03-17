import { z } from 'zod';

export const ScreenContributionSchema = z.object({
    id: z.string(),
    entry: z.string(),
    title: z.string().optional(),
});

export type ScreenContribution = z.infer<typeof ScreenContributionSchema>;

export const ActionContributionSchema = z.object({
    id: z.string(),
    handler: z.string(),
    label: z.string().optional(),
});

export type ActionContribution = z.infer<typeof ActionContributionSchema>;
