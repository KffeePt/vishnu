import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { createAppJwt, getInstallationToken, getUserOrgRole } from './github-app';
import { getRuntimeConfigValue } from './runtime-config';

// Initialize admin app if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

type AccessRole =
    | 'owner'
    | 'admin'
    | 'maintainer'
    | 'staff'
    | 'dev'
    | 'projectManager'
    | 'senior'
    | 'junior'
    | 'partner'
    | 'user';

function inferAccessRole(claims: Record<string, any>): AccessRole | null {
    if (claims.owner === true || claims.owner === 'master' || claims.role === 'owner') {
        return 'owner';
    }
    if (claims.admin === true || claims.role === 'admin') {
        return 'admin';
    }
    if (claims.role === 'maintainer') {
        return 'maintainer';
    }
    if (claims.staff === true || claims.role === 'staff') {
        return 'staff';
    }
    if (claims.dev === true || claims.role === 'dev') {
        return 'dev';
    }

    const role = typeof claims.role === 'string' ? claims.role.trim() : '';
    if (role === 'projectManager' || role === 'senior' || role === 'junior' || role === 'partner' || role === 'user') {
        return role;
    }

    return null;
}

function buildManagedClaimsForRole(role: AccessRole | null): Record<string, unknown> {
    switch (role) {
        case 'owner':
            return { role: 'owner', owner: true, admin: true, user: true };
        case 'admin':
            return { role: 'admin', admin: true, user: true };
        case 'maintainer':
            return { role: 'maintainer', user: true };
        case 'staff':
            return { role: 'staff', staff: true, user: true };
        case 'dev':
            return { role: 'dev', dev: true, user: true };
        case 'projectManager':
        case 'senior':
        case 'junior':
        case 'partner':
        case 'user':
            return { role, user: true };
        default:
            return {};
    }
}

function stripManagedClaims(claims: Record<string, any>): Record<string, any> {
    const next = { ...claims };
    for (const key of [
        'role',
        'owner',
        'admin',
        'maintainer',
        'staff',
        'dev',
        'user'
    ]) {
        delete next[key];
    }
    return next;
}

/**
 * Cloud Function: verifyAccess
 * Validates a user's current access claims to authorize Codeman/Vishnu tooling access.
 */
export const verifyAccess = functions.https.onCall(async (data: any, context: functions.https.CallableContext) => {
    // 1. Ensure user is authenticated via Firebase Auth
    if (!context.auth) {
        throw new functions.https.HttpsError(
            'unauthenticated',
            'Must be logged in to verify access.'
        );
    }

    const uid = context.auth.uid;

    try {
        // 2. Retrieve user record
        const userRecord = await admin.auth().getUser(uid);
        const claims = userRecord.customClaims || {};
        const role = inferAccessRole(claims);

        if (role) {
            return {
                authorized: true,
                role,
                claims,
                message: 'Access granted.'
            };
        }

        return {
            authorized: false,
            role: 'none',
            claims,
            message: 'Insufficient permissions. No supported Vishnu access role is assigned.'
        };

    } catch (error: any) {
        console.error(`Error verifying access for UID ${uid}:`, error);
        throw new functions.https.HttpsError('internal', 'Error verifying user access.');
    }
});

/**
 * Cloud Function: syncClaims
 * Concept: Triggered when a user logs in (or periodically) to sync their GitHub 
 * organization/repository role to Firebase Auth Custom Claims.
 * Note: Requires GitHub App/PAT integration logic (omitted or stubbed here).
 */
export const syncClaims = functions
  .https.onCall(async (data: any, context: functions.https.CallableContext) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in.');
    }

    const uid = context.auth.uid;
    const githubUsername = data.githubUsername; // Expected to be provided or linked

    if (!githubUsername) {
         throw new functions.https.HttpsError('invalid-argument', 'Missing GitHub Username');
    }

    try {
        const appId = getRuntimeConfigValue({
            envNames: ['GITHUB_APP_ID'],
            configPath: ['github', 'app_id'],
        });
        const privateKey = getRuntimeConfigValue({
            envNames: ['GITHUB_APP_PRIVATE_KEY'],
            configPath: ['github', 'app_private_key'],
            normalizeNewlines: true,
        });
        if (!appId || !privateKey) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                'GitHub App runtime credentials are not configured.'
            );
        }
        
        const jwt = createAppJwt(appId, privateKey);
        const token = await getInstallationToken(jwt);
        
        // We check the user's role in the primary org (KffeePt for Vishnu)
        const ORG_NAME = 'KffeePt';
        const role = await getUserOrgRole(token, ORG_NAME, githubUsername);
        
        let newRole: AccessRole | null = null;

        if (role === 'admin') {
            newRole = 'admin';
        } else if (role === 'member') {
            newRole = 'staff';
        }
        
        // Hardcode fallback for emergency owner account
        if (githubUsername.toLowerCase() === 'santi') {
            newRole = 'owner';
        }

        const userRecord = await admin.auth().getUser(uid);
        const preservedClaims = stripManagedClaims(userRecord.customClaims || {});
        await admin.auth().setCustomUserClaims(uid, {
            ...preservedClaims,
            ...buildManagedClaimsForRole(newRole)
        });

        return { success: true, newRole: newRole || 'none' };
    } catch (error: any) {
         console.error('Error syncing claims:', error);
         throw new functions.https.HttpsError('internal', 'Error syncing claims.');
    }
});
