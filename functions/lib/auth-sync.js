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
/**
 * Cloud Function: verifyAccess
 * Validates a user's GitHub role (from custom claims) to authorize CLI TUI access.
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
        let newRole = 'none';
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
        // Set Custom Claim
        await admin.auth().setCustomUserClaims(uid, { role: newRole });
        return { success: true, newRole };
    }
    catch (error) {
        console.error('Error syncing claims:', error);
        throw new functions.https.HttpsError('internal', 'Error syncing claims.');
    }
});
//# sourceMappingURL=auth-sync.js.map