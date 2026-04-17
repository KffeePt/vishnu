export type { MenuId, MenuNode } from '@vishnu/platform';
export type {
    MenuAction,
    MenuActionType,
    MenuDefinition,
    MenuOption
} from '../../schemas/menu-schema';

export interface ProcessService {
    spawnDetachedWindow(title: string, command: string, cwd: string): Promise<void>;
}

export interface SessionService {
    load(projectPath: string): Promise<boolean>;
}

export interface ReleaseService {
    deployRules(projectRoot: string): Promise<void>;
    deployFunctionsAPI(projectRoot: string): Promise<void>;
    deployAllFirebase(projectRoot: string): Promise<void>;
}

export interface AuthServiceContract {
    login(state: unknown, options?: unknown): Promise<boolean>;
}

