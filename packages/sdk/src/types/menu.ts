import { z } from 'zod';

export const MenuContributionSchema = z.object({
    slot: z.string(),
    label: z.string(),
    icon: z.string().optional(),
    screen: z.string().optional(),
    action: z.string().optional(),
    order: z.number().optional(),
    visible: z.object({
        projectTypes: z.array(z.string()).optional(),
        capabilities: z.array(z.string()).optional(),
    }).optional(),
});

export type MenuContribution = z.infer<typeof MenuContributionSchema>;
