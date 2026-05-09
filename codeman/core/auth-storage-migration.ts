import { AuthTokenStore } from './auth/token-store';
import { state } from './state';
import { UserConfigManager } from '../config/user-config';

const ACCESS_CONTROL_AUTH_STORAGE_VERSION = 'access-control-v1';

export function clearAllLocalAuthArtifacts() {
    AuthTokenStore.clear();
    UserConfigManager.clearAuthState();
    UserConfigManager.setAuthStorageVersion(ACCESS_CONTROL_AUTH_STORAGE_VERSION);
    state.user = undefined;
    state.rawIdToken = undefined;
    state.authBypass = false;
}

export function purgeLegacyAuthArtifactsIfNeeded() {
    if (UserConfigManager.getAuthStorageVersion() === ACCESS_CONTROL_AUTH_STORAGE_VERSION) {
        return false;
    }

    clearAllLocalAuthArtifacts();
    return true;
}

export { ACCESS_CONTROL_AUTH_STORAGE_VERSION };
