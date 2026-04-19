"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncClaims = exports.verifyAccess = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const params_1 = require("firebase-functions/params");
const github_app_1 = require("./github-app");
// Initialize admin app if not already initialized
if (!admin.apps.length) {
    admin.initializeApp();
}
const GITHUB_APP_ID = (0, params_1.defineSecret)('GITHUB_APP_ID');
const GITHUB_APP_PRIVATE_KEY = (0, params_1.defineSecret)('GITHUB_APP_PRIVATE_KEY');
function inferAccessRole(claims) {
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
function buildManagedClaimsForRole(role) {
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
function stripManagedClaims(claims) {
    const next = Object.assign({}, claims);
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
exports.verifyAccess = functions.https.onCall(async (data, context) => {
    // 1. Ensure user is authenticated via Firebase Auth
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Must be logged in to verify access.');
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
    }
    catch (error) {
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
exports.syncClaims = functions
    .runWith({ secrets: [GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY] })
    .https.onCall(async (data, context) => {
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
        const jwt = (0, github_app_1.createAppJwt)(appId, privateKey);
        const token = await (0, github_app_1.getInstallationToken)(jwt);
        // We check the user's role in the primary org (KffeePt for Vishnu)
        const ORG_NAME = 'KffeePt';
        const role = await (0, github_app_1.getUserOrgRole)(token, ORG_NAME, githubUsername);
        let newRole = null;
        if (role === 'admin') {
            newRole = 'admin';
        }
        else if (role === 'member') {
            newRole = 'staff';
        }
        // Hardcode fallback for emergency owner account
        if (githubUsername.toLowerCase() === 'santi') {
            newRole = 'owner';
        }
        const userRecord = await admin.auth().getUser(uid);
        const preservedClaims = stripManagedClaims(userRecord.customClaims || {});
        await admin.auth().setCustomUserClaims(uid, Object.assign(Object.assign({}, preservedClaims), buildManagedClaimsForRole(newRole)));
        return { success: true, newRole: newRole || 'none' };
    }
    catch (error) {
        console.error('Error syncing claims:', error);
        throw new functions.https.HttpsError('internal', 'Error syncing claims.');
    }
});
//# sourceMappingURL=auth-sync.js.map