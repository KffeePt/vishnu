import { AuthService } from '../infra/security/index';
import { EnvSetupManager } from '../infra/config/index';
import { ReleaseManager } from '../infra/scripts/index';
import { SessionLoader } from '../../../../codeman/managers/session-loader';
import { restartCLI } from '../../../../codeman/core/restart';

export { ReleaseManager, SessionLoader, AuthService, EnvSetupManager };

export async function loadSession(projectPath: string) {
    return SessionLoader.load(projectPath);
}

export async function verifyAndSetupEnv(forceValidations = false) {
    return EnvSetupManager.verifyAndSetupEnv(forceValidations);
}

export async function interactiveSetupFirebase() {
    return EnvSetupManager.verifyAndSetupEnv(true);
}

export async function login(state: import('../state/index').GlobalStateLike, options?: import('../infra/security/index').AuthOptions) {
    return AuthService.login(state as any, options);
}

export async function runReleasePipeline() {
    const menuMap = await import('../../../../codeman/config/menu-map');
    return menuMap.runReleasePipeline();
}

export async function runDeployPrepCore() {
    const menuMap = await import('../../../../codeman/config/menu-map');
    return menuMap.runDeployPrepCore();
}

export async function restartCodeman(startNode?: string) {
    return restartCLI(startNode);
}

