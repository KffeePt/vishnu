import { z } from 'zod';

export enum ReloadTier {
    UI = 0,
    MODULE = 1,
    RUNTIME = 2,
    FULL = 3,
}

export const ModuleEntrySchema = z.object({
    path: z.string(),
    dependencies: z.array(z.string()),
    exports: z.array(z.string()),
    loadedAt: z.number(),
    hash: z.string().optional(),
    reloading: z.boolean().default(false),
});

export type ModuleEntry = z.infer<typeof ModuleEntrySchema>;

export const ModuleRegistrySchema = z.object({
    modules: z.record(z.string(), ModuleEntrySchema),
    lastUpdate: z.number(),
});

export type ModuleRegistry = z.infer<typeof ModuleRegistrySchema>;

export const HotReloadEventSchema = z.object({
    type: z.enum(['reload', 'error', 'full-restart']),
    module: z.string(),
    timestamp: z.number(),
    error: z.string().optional(),
    stack: z.string().optional(),
    affectedModules: z.array(z.string()).optional(),
    tier: z.nativeEnum(ReloadTier).optional(),
});

export type HotReloadEvent = z.infer<typeof HotReloadEventSchema>;
