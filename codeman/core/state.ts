/*
  Legacy shim:
  Global state now lives in packages/platform/src/state/global-state.ts.
*/
export {
    GlobalState,
    state,
    type AgentMemory,
    type AppCheckDetection,
    type ProjectConfig,
    type ProjectDatabase,
    type ProjectDeployment,
    type ProjectIntelligence,
    type ProjectSecurity
} from '@vishnu/platform';
