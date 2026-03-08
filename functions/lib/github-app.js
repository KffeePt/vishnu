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
exports.createAppJwt = createAppJwt;
exports.getInstallationToken = getInstallationToken;
exports.verifyWebhookSignature = verifyWebhookSignature;
exports.exchangeOAuthCode = exchangeOAuthCode;
exports.getAuthenticatedUser = getAuthenticatedUser;
exports.getUserOrgRole = getUserOrgRole;
const crypto = __importStar(require("crypto"));
const jwt = __importStar(require("jsonwebtoken"));
const GITHUB_API_BASE = "https://api.github.com";
/**
 * Creates a JWT authenticating as the GitHub App.
 */
function createAppJwt(appId, privateKey) {
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
async function getInstallationToken(appJwt) {
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
function verifyWebhookSignature(payload, signature, secret) {
    if (!signature)
        return false;
    const hmac = crypto.createHmac("sha256", secret);
    const digest = "sha256=" + hmac.update(payload).digest("hex");
    return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}
/**
 * Exchanges a GitHub OAuth code for a user access token.
 */
async function exchangeOAuthCode(code, clientId, clientSecret) {
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
async function getAuthenticatedUser(token) {
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
async function getUserOrgRole(token, org, username) {
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
    if (data.state !== "active")
        return null;
    return data.role; // 'admin' or 'member'
}
//# sourceMappingURL=github-app.js.map