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
exports.getRepositoryPRs = exports.getRepositoryCollaborators = void 0;
const functions = __importStar(require("firebase-functions/v1"));
const admin = __importStar(require("firebase-admin"));
const github_app_1 = require("./github-app");
const runtime_config_1 = require("./runtime-config");
// Ensure initialization
if (!admin.apps.length) {
    admin.initializeApp();
}
const GITHUB_API_URL = 'https://api.github.com';
/**
 * Helper to fetch a GitHub Installation Token securely.
 */
async function getGitHubToken() {
    const appId = (0, runtime_config_1.getRuntimeConfigValue)({
        envNames: ['GITHUB_APP_ID'],
        configPath: ['github', 'app_id'],
    });
    const privateKey = (0, runtime_config_1.getRuntimeConfigValue)({
        envNames: ['GITHUB_APP_PRIVATE_KEY'],
        configPath: ['github', 'app_private_key'],
        normalizeNewlines: true,
    });
    if (!appId || !privateKey) {
        throw new functions.https.HttpsError('failed-precondition', 'GitHub App runtime credentials are not configured.');
    }
    // Support either real newlines or escaped newlines from env
    const jwt = (0, github_app_1.createAppJwt)(appId, privateKey);
    return await (0, github_app_1.getInstallationToken)(jwt);
}
/**
 * Proxy for getting repository collaborators.
 */
exports.getRepositoryCollaborators = functions
    .https.onCall(async (data, context) => {
    // 1. Auth & Role Check (Only Admins/Maintainers can view this via proxy)
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Unauthenticated');
    const role = context.auth.token.role;
    if (role !== 'admin' && role !== 'maintainer') {
        throw new functions.https.HttpsError('permission-denied', 'Admin or maintainer role required.');
    }
    const { owner, repo } = data;
    if (!owner || !repo)
        throw new functions.https.HttpsError('invalid-argument', 'Missing owner or repo.');
    const token = await getGitHubToken();
    if (!token)
        throw new functions.https.HttpsError('failed-precondition', 'GitHub App credentials not configured.');
    try {
        const response = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/collaborators`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (!response.ok) {
            throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`);
        }
        const cols = await response.json();
        return cols;
    }
    catch (error) {
        console.error('GitHub Proxy Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
/**
 * Proxy for getting active Pull Requests.
 */
exports.getRepositoryPRs = functions
    .https.onCall(async (data, context) => {
    if (!context.auth)
        throw new functions.https.HttpsError('unauthenticated', 'Unauthenticated');
    // Staff can view PRs too
    const role = context.auth.token.role;
    if (!['admin', 'maintainer', 'staff'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Authorized role required.');
    }
    const { owner, repo } = data;
    if (!owner || !repo)
        throw new functions.https.HttpsError('invalid-argument', 'Missing owner or repo.');
    const token = await getGitHubToken();
    if (!token)
        throw new functions.https.HttpsError('failed-precondition', 'GitHub App credentials not configured.');
    try {
        const response = await fetch(`${GITHUB_API_URL}/repos/${owner}/${repo}/pulls?state=open`, {
            headers: {
                'Authorization': `Bearer ${token}`,
                'Accept': 'application/vnd.github.v3+json',
                'X-GitHub-Api-Version': '2022-11-28'
            }
        });
        if (!response.ok) {
            throw new Error(`GitHub API returned ${response.status}: ${await response.text()}`);
        }
        const prs = await response.json();
        return prs;
    }
    catch (error) {
        console.error('GitHub Proxy Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
//# sourceMappingURL=github-proxy.js.map