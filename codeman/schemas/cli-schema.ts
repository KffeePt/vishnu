import { z } from 'zod';

export const MigrationOptionsSchema = z.object({
  targetPath: z.string().min(1, "Path is required"),
  strategy: z.enum(["flat-to-folder", "rename-index"]),
  dryRun: z.boolean().default(false),
});

export type MigrationOptions = z.infer<typeof MigrationOptionsSchema>;

// --- Screen Props Schemas ---

export const DeleteConfirmPropsSchema = z.object({
  pathToDelete: z.string(),
  linkedComponentPath: z.string().nullable().optional(), // Kept for legacy, prefer relatedItems
  relatedItems: z.array(z.object({ path: z.string(), type: z.string() })).optional(),
  isFile: z.boolean(),
  basename: z.string()
});

export type DeleteConfirmProps = z.infer<typeof DeleteConfirmPropsSchema>;

export const FileExplorerOptionsSchema = z.object({
  basePath: z.string(),
  onlyDirectories: z.boolean().optional(),
  allowedExtensions: z.array(z.string()).optional(),
  title: z.string().optional(),
  validationRules: z.object({
    requiredSubfolder: z.string().optional(),
    requiredFile: z.string().optional(),
    requiredExtension: z.string().optional(),
    requiredName: z.string().optional()
  }).optional()
});

export type FileExplorerOptions = z.infer<typeof FileExplorerOptionsSchema>;

// --- Firebase CLI Data Schema ---

export const GlobalConfigSchema = z.object({
  maintenance_mode: z.boolean().default(false),
  allowed_prefixes: z.array(z.string()).default(['test-', 'temp-']),
  max_history_size: z.number().default(50)
});

export const FirebaseCliDataSchema = z.object({
  global_config: GlobalConfigSchema,
  feature_flags: z.record(z.boolean()).default({}),
  last_updated: z.string().datetime().optional()
});

export type FirebaseCliData = z.infer<typeof FirebaseCliDataSchema>;
