import * as crypto from "crypto";
import * as jwt from "jsonwebtoken";

const GITHUB_API_BASE = "https://api.github.com";

/**
 * Creates a JWT authenticating as the GitHub App.
 */
export function createAppJwt(appId: string, privateKey: string): string {
    const now = Math.floor(Date.now() / 1000);
    const payload = {
        iat: now - 60, // Issued at time, 60 seconds in the past to allow for clock drift
        exp: now + (10 * 60), // JWT expiration time (10 minute maximum)
        iss: appId, // GitHub App's identifier
    };

    return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

/**
 * Gets an Installation Access Token for the GitHub App.
 */
export async function getInstallationToken(appJwt: string): Promise<string> {
    // 1. Get installations for this app
    const instResponse = await fetch(`${GITHUB_API_BASE}/app/installations`, {
        headers: {
            "Authorization": `Bearer ${appJwt}`,
            "Accept": "application/vnd.github.v3+json",
        },
    });

    if (!instResponse.ok) {
        throw new Error(`Failed to fetch installations: ${await instResponse.text()}`);
    }

    const installations = await instResponse.json();
    if (!installations || installations.length === 0) {
        throw new Error("No installations found for this GitHub App.");
    }

    // We assume single-org usage, so we just take the first installation.
    const installationId = installations[0].id;

    // 2. Create an installation access token
    const tokenResponse = await fetch(`${GITHUB_API_BASE}/app/installations/${installationId}/access_tokens`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${appJwt}`,
            "Accept": "application/vnd.github.v3+json",
        },
    });

    if (!tokenResponse.ok) {
        throw new Error(`Failed to create installation token: ${await tokenResponse.text()}`);
    }

    const tokenData = await tokenResponse.json();
    return tokenData.token;
}

/**
 * Verifies a GitHub Webhook signature.
 */
export function verifyWebhookSignature(payload: string, signature: string, secret: string): boolean {
    if (!signature) return false;
    const hmac = crypto.createHmac("sha256", secret);
    const digest = "sha256=" + hmac.update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

/**
 * Exchanges a GitHub OAuth code for a user access token.
 */
export async function exchangeOAuthCode(code: string, clientId: string, clientSecret: string): Promise<string> {
    const response = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        body: JSON.stringify({
            client_id: clientId,
            client_secret: clientSecret,
            code,
        }),
    });

    if (!response.ok) {
        throw new Error(`Failed to exchange OAuth code: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.error) {
        throw new Error(`OAuth error: ${data.error_description || data.error}`);
    }

    return data.access_token;
}

/**
 * Gets the authenticated user's profile from an OAuth token.
 */
export async function getAuthenticatedUser(token: string): Promise<any> {
    const response = await fetch(`${GITHUB_API_BASE}/user`, {
        headers: {
            "Authorization": `Bearer ${token}`,
            "Accept": "application/vnd.github.v3+json",
        },
    });

    if (!response.ok) {
        throw new Error(`Failed to fetch user profile: ${await response.text()}`);
    }

    return await response.json();
}

/**
 * Gets a user's role in a specific GitHub organization.
 * Returns 'admin', 'member', or null if not a member.
 */
export async function getUserOrgRole(token: string, org: string, username: string): Promise<string | null> {
    const response = await fetch(`${GITHUB_API_BASE}/orgs/${org}/memberships/${username}`, {
        headers: {
            "Authorization": `Bearer ${token}`, // Usually better to use Installation Token for this if the user token lacks org:read
            "Accept": "application/vnd.github.v3+json",
        },
    });

    if (response.status === 404) {
        return null; // Not a member
    }

    if (!response.ok) {
        throw new Error(`Failed to fetch org membership: ${await response.text()}`);
    }

    const data = await response.json();
    if (data.state !== "active") return null;
    return data.role; // 'admin' or 'member'
}
