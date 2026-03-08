import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { defineSecret } from 'firebase-functions/params';
import { createAppJwt, getInstallationToken, getUserOrgRole } from './github-app';

// Initialize admin app if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}

const GITHUB_APP_ID = defineSecret('GITHUB_APP_ID');
const GITHUB_APP_PRIVATE_KEY = defineSecret('GITHUB_APP_PRIVATE_KEY');

/**
 * Cloud Function: verifyAccess
 * Validates a user's GitHub role (from custom claims) to authorize CLI TUI access.
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
        
        // Custom claims check
        const role = claims.role;

        // Valid roles for TUI access
        if (role === 'admin' || role === 'maintainer' || role === 'staff') {
            return {
                authorized: true,
                role: role,
                message: 'Access Granted'
            };
        }

        return {
            authorized: false,
            role: role || 'none',
            message: 'Insufficient permissions. You must be an admin, maintainer, or staff member.'
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
  .runWith({ secrets: [GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY] })
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
        const appId = GITHUB_APP_ID.value();
        const privateKey = GITHUB_APP_PRIVATE_KEY.value().replace(/\\n/g, '\n');
        
        const jwt = createAppJwt(appId, privateKey);
        const token = await getInstallationToken(jwt);
        
        // We check the user's role in the primary org (KffeePt for Vishnu)
        const ORG_NAME = 'KffeePt';
        const role = await getUserOrgRole(token, ORG_NAME, githubUsername);
        
        let newRole = 'none';

        if (role === 'admin') {
            newRole = 'admin';
        } else if (role === 'member') {
            newRole = 'staff';
        }
        
        // Hardcode fallback for emergency owner account
        if (githubUsername.toLowerCase() === 'santi') {
            newRole = 'owner';
        }

        // Set Custom Claim
        await admin.auth().setCustomUserClaims(uid, { role: newRole });

        return { success: true, newRole };
    } catch (error: any) {
         console.error('Error syncing claims:', error);
         throw new functions.https.HttpsError('internal', 'Error syncing claims.');
    }
});
