/*
  Legacy shim:
  Codeman CLI schemas now live in modules/codeman/schemas/cli-schema.ts.
*/
export {
    DeleteConfirmPropsSchema,
    FileExplorerOptionsSchema,
    FirebaseCliDataSchema,
    GlobalConfigSchema,
    MigrationOptionsSchema
} from '../../modules/codeman/schemas/cli-schema';
export type {
    DeleteConfirmProps,
    FileExplorerOptions,
    FirebaseCliData,
    MigrationOptions
} from '../../modules/codeman/schemas/cli-schema';
