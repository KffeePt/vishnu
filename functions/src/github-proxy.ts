import * as functions from 'firebase-functions/v1';
import * as admin from 'firebase-admin';
import { createAppJwt, getInstallationToken } from './github-app';
import { getRuntimeConfigValue } from './runtime-config';

// Ensure initialization
if (!admin.apps.length) {
    admin.initializeApp();
}

const GITHUB_API_URL = 'https://api.github.com';

/**
 * Helper to fetch a GitHub Installation Token securely.
 */
async function getGitHubToken(): Promise<string> {
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
        throw new functions.https.HttpsError('failed-precondition', 'GitHub App runtime credentials are not configured.');
    }
    // Support either real newlines or escaped newlines from env
    const jwt = createAppJwt(appId, privateKey);
    return await getInstallationToken(jwt);
}

/**
 * Proxy for getting repository collaborators.
 */
export const getRepositoryCollaborators = functions
    .https.onCall(async (data: any, context: functions.https.CallableContext) => {
        
    // 1. Auth & Role Check (Only Admins/Maintainers can view this via proxy)
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Unauthenticated');
    const role = context.auth.token.role;
    if (role !== 'admin' && role !== 'maintainer') {
        throw new functions.https.HttpsError('permission-denied', 'Admin or maintainer role required.');
    }

    const { owner, repo } = data;
    if (!owner || !repo) throw new functions.https.HttpsError('invalid-argument', 'Missing owner or repo.');

    const token = await getGitHubToken();
    if (!token) throw new functions.https.HttpsError('failed-precondition', 'GitHub App credentials not configured.');

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

    } catch (error: any) {
        console.error('GitHub Proxy Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});

/**
 * Proxy for getting active Pull Requests.
 */
export const getRepositoryPRs = functions
    .https.onCall(async (data: any, context: functions.https.CallableContext) => {
        
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Unauthenticated');
    
    // Staff can view PRs too
    const role = context.auth.token.role;
    if (!['admin', 'maintainer', 'staff'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Authorized role required.');
    }

    const { owner, repo } = data;
    if (!owner || !repo) throw new functions.https.HttpsError('invalid-argument', 'Missing owner or repo.');

    const token = await getGitHubToken();
    if (!token) throw new functions.https.HttpsError('failed-precondition', 'GitHub App credentials not configured.');

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

    } catch (error: any) {
        console.error('GitHub Proxy Error:', error);
        throw new functions.https.HttpsError('internal', error.message);
    }
});
