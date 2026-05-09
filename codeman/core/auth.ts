import { GlobalState } from './state';
import { UserConfigManager } from '../config/user-config';
import admin from 'firebase-admin';
import * as http from 'http';
import * as url from 'url';
import { exec } from 'child_process';
import open from 'open';
import path from 'path';
import fs from 'fs';
import chalk from 'chalk';
import { AuthTokenStore } from './auth/token-store';
import { callAccessControlFunction } from './auth/access-control-client';
import { clearAllLocalAuthArtifacts, purgeLegacyAuthArtifactsIfNeeded } from './auth-storage-migration';
import { inferRoleFromClaims } from './security/role-verifier';
import { SessionTimerManager } from './session-timers';
import { MAX_BROWSER_SESSION_AGE_MS } from './auth/access-policy';

// Helper to open browser
const openBrowser = async (url: string) => {
    try {
        // Do not wait for the browser process; avoid hanging the CLI
        void open(url, { wait: false, newInstance: true });
    } catch (err) {
        // Fall through to manual instructions below
    }
    console.log(`🔗 If the browser didn't open, visit: ${url}`);
};

export interface AuthOptions {
    serviceAccount?: string;
    projectId?: string;
    apiKey?: string;
    authDomain?: string;
    accessControlProjectId?: string | null;
    roleSource?: 'access-control-preferred' | 'claims-only';
    accessControlOptional?: boolean;
    requiredRoles?: string[];
}

export interface LoginWindowStatus {
    active: boolean;
    startedAt: number | null;
    expiresAt: number | null;
    timeoutMs: number;
    port: number | null;
}

export class AuthService {
    private static server: http.Server | null = null;
    private static PORT = 3005;
    private static currentNonce: string | null = null;
    private static loginWindowStartedAt: number | null = null;
    private static loginWindowPort: number | null = null;

    private static async killPort(port: number) {
        return new Promise<void>((resolve) => {
            // Windows-specific port killing with aggressive /F for Force
            try {
                // Find PID
                exec(`netstat -aon | find ":${port}" | find "LISTENING"`, (err, stdout) => {
                    if (stdout && stdout.trim()) {
                        const parts = stdout.trim().split(/\s+/);
                        const pid = parts[parts.length - 1]; // PID is last column
                        if (pid && /^\d+$/.test(pid)) {
                            // console.log(chalk.gray(`   [Auth] Killing process on port ${port} (PID: ${pid})...`));
                            exec(`taskkill /F /PID ${pid}`, () => {
                                setTimeout(resolve, 1000);
                            });
                        } else {
                            resolve();
                        }
                    } else {
                        resolve();
                    }
                });
            } catch (e) {
                resolve();
            }
        });
    }

    static async login(state: GlobalState, options: AuthOptions = {}): Promise<boolean> {
        if (purgeLegacyAuthArtifactsIfNeeded()) {
            console.log(chalk.yellow('\n🧹 Purged legacy local auth artifacts. Please sign in again.'));
        }

        // Fast-path session restore
        const lastAuth = UserConfigManager.getLastAuth();
        const cachedUser = UserConfigManager.getCachedUser();
        const FIFTEEN_MINUTES = 15 * 60 * 1000;

        // Reload Env Vars to catch any manual changes
        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        require('dotenv').config({ override: true });

        const crypto = await import('crypto');
        this.currentNonce = crypto.randomBytes(32).toString('hex');

        console.log('\n🔐 Awaiting Auth from Firebase...');

        // Pre-emptive port cleanup
        await this.killPort(this.PORT);

        // 1. Initialize Admin SDK if needed (or if we are switching projects)
        const targetProjectId = options.projectId || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
        const availableApps = admin.apps.filter((app): app is admin.app.App => !!app);
        let defaultApp = availableApps.find(app => app.name === '[DEFAULT]') || null;

        if (defaultApp && defaultApp.options.projectId !== targetProjectId) {
            // Delete only the default app so named helper apps (like session timers) stay alive.
            await defaultApp.delete();
            defaultApp = null;
        }

        if (!defaultApp) {
            try {
                // Try Options first, then ENV
                const serviceAccount = options.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
                const projectId = targetProjectId;

                // Explicit Env Vars (Common in Vercel/CI)
                const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
                const privateKey = process.env.FIREBASE_PRIVATE_KEY;

                if (serviceAccount) {
                    // Check if it's a file path or JSON string
                    if (fs.existsSync(serviceAccount)) {
                        admin.initializeApp({
                            credential: admin.credential.cert(serviceAccount),
                            projectId: projectId
                        });
                    } else {
                        // Attempt to parse JSON string directly if not a file
                        try {
                            const sa = JSON.parse(serviceAccount);
                            admin.initializeApp({
                                credential: admin.credential.cert(sa),
                                projectId: projectId
                            });
                        } catch {
                            // Fallback if strict ID usage not required
                            admin.initializeApp({
                                projectId: projectId
                            });
                        }
                    }
                } else if (clientEmail && privateKey) {
                    // Support raw env vars
                    admin.initializeApp({
                        credential: admin.credential.cert({
                            projectId,
                            clientEmail,
                            privateKey: privateKey.replace(/\\n/g, '\n') // Fix newline escaping
                        }),
                        projectId: projectId
                    });
                } else {
                    admin.initializeApp({
                        projectId: projectId,
                        credential: admin.credential.applicationDefault()
                    });
                }
                defaultApp = admin.apps.filter((app): app is admin.app.App => !!app).find(app => app.name === '[DEFAULT]') || null;
            } catch (error) {
                console.error("❌ Failed to initialize Firebase Admin SDK. Check Credentials.");
                // Log strictly for debug
                // console.error(error); 
                return false;
            }
        }

        const apiKey = options.apiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY;
        const projectId = targetProjectId || 'unknown-project';
        const globalReauthAt = SessionTimerManager.getConfig().forcedReauthAt || 0;
        const requiredRolesLabel = Array.isArray(options.requiredRoles) && options.requiredRoles.length > 0
            ? options.requiredRoles.join(' / ')
            : 'any supported role';

        const resolveUserRole = async (decodedToken: admin.auth.DecodedIdToken, idToken: string): Promise<string | null> => {
            const email = decodedToken.email || 'unknown';
            const verdict = inferRoleFromClaims({ claims: decodedToken as any, email });
            const claimsRole = verdict.role === 'none' ? null : verdict.role;
            const requiredRoles = Array.isArray(options.requiredRoles)
                ? options.requiredRoles.map((value) => value.trim()).filter(Boolean)
                : [];
            const isAllowedRole = (candidate: string | null | undefined) => {
                if (!candidate) return false;
                if (requiredRoles.length === 0) return true;
                return requiredRoles.includes(candidate);
            };

            let userRole = claimsRole;
            const roleSource = options.roleSource || 'access-control-preferred';
            const accessControlProjectId = typeof options.accessControlProjectId === 'string'
                ? options.accessControlProjectId.trim()
                : projectId;
            const allowBootstrapFallback = options.accessControlOptional !== false;

            if (roleSource !== 'claims-only' && accessControlProjectId) {
                try {
                    const bootstrap = await callAccessControlFunction<{
                        role?: string;
                    }>({
                        functionName: 'getAccessBootstrap',
                        projectId: accessControlProjectId,
                        idToken,
                        data: {}
                    });

                    if (typeof bootstrap?.role === 'string' && bootstrap.role.trim() && bootstrap.role !== 'none') {
                        userRole = bootstrap.role.trim();
                    } else if (!allowBootstrapFallback) {
                        userRole = null;
                    }
                } catch (err) {
                    const message = (err as Error).message;
                    if (allowBootstrapFallback && claimsRole) {
                        console.log(chalk.yellow(`[Auth] Central access bootstrap unavailable. Using verified token claims for ${email}. (${message})`));
                        userRole = claimsRole;
                    } else {
                        console.log(chalk.red(`[Auth] Central access bootstrap failed: ${message}`));
                        userRole = null;
                    }
                }
            }

            return isAllowedRole(userRole) ? userRole : null;
        };

        // Attempt token restore (and refresh) before opening browser
        const storedIdToken = await AuthTokenStore.getValidIdToken(apiKey, globalReauthAt, {
            maxSessionAgeMs: MAX_BROWSER_SESSION_AGE_MS,
            refreshSkewMs: SessionTimerManager.getConfig().tokenRefreshSkewMs
        });
        if (storedIdToken) {
            try {
                const decodedToken = await admin.auth().verifyIdToken(storedIdToken);
                const userRole = await resolveUserRole(decodedToken, storedIdToken);

                if (userRole) {
                    const email = decodedToken.email || 'unknown';
                    const sessionUser = {
                        email,
                        uid: decodedToken.uid,
                        isAdmin: userRole === 'admin' || userRole === 'owner',
                        role: userRole as any
                    };
                    state.setUser(sessionUser);
                    state.rawIdToken = storedIdToken;
                    UserConfigManager.setLastAuth(Date.now(), sessionUser, { authMode: 'normal' });
                    console.log(chalk.green('\n✅ Session restored from stored token.'));
                    return true;
                }
                clearAllLocalAuthArtifacts();
            } catch {
                clearAllLocalAuthArtifacts();
            }
        } else if (lastAuth && cachedUser && (Date.now() - lastAuth < FIFTEEN_MINUTES)) {
            console.log(chalk.yellow('\n⚠️ Cached session found, but no valid token. Re-authentication required.'));
            clearAllLocalAuthArtifacts();
        }

        this.loginWindowStartedAt = Date.now();
        let timeoutHandle: NodeJS.Timeout | null = null;
        let stopTimerListener: (() => void) | null = null;

        return new Promise<boolean>((resolve) => {
            const scheduleTimeout = () => {
                if (!this.loginWindowStartedAt) return;
                if (timeoutHandle) clearTimeout(timeoutHandle);

                const timeoutMs = SessionTimerManager.getConfig().browserLoginTimeoutMs;
                const elapsed = Date.now() - this.loginWindowStartedAt;
                const remaining = Math.max(0, timeoutMs - elapsed);

                timeoutHandle = setTimeout(() => {
                    if (this.server) {
                        console.log(chalk.red('\n⌛ Auth timed out. No login received.'));
                        console.log(chalk.gray('   Please retry and complete the browser login.'));
                        this.closeServer();
                        resolve(false);
                    }
                }, remaining);
            };

            stopTimerListener = SessionTimerManager.subscribe(() => {
                scheduleTimeout();
            });

            // 2. Start Local Server to catch token
            this.server = http.createServer(async (req, res) => {
                const parsedUrl = url.parse(req.url || '', true);

                if (parsedUrl.pathname === '/callback' && req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        try {
                            const { token: idToken, nonce, refreshToken, expiresAt } = JSON.parse(body);

                            if (!nonce || nonce !== this.currentNonce) {
                                res.writeHead(403, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'CSRF token mismatch or expired' }));
                                this.closeServer();
                                resolve(false);
                                return;
                            }

                            if (idToken) {
                                try {
                                    const decodedToken = await admin.auth().verifyIdToken(idToken);

                                // Check custom claims
                                console.log('🔎 User Claims:', JSON.stringify(decodedToken, null, 2));
                                const email = decodedToken.email || 'unknown';
                                const userRole = await resolveUserRole(decodedToken, idToken);

                                if (userRole) {
                                    if (refreshToken) {
                                        const effectiveExpiresAt = typeof expiresAt === 'number'
                                            ? expiresAt
                                            : (decodedToken.exp ? decodedToken.exp * 1000 : Date.now() + 55 * 60 * 1000);
                                        AuthTokenStore.save({
                                            firebaseIdToken: idToken,
                                            refreshToken,
                                            expiresAt: effectiveExpiresAt,
                                            sessionStartedAt: decodedToken.auth_time ? decodedToken.auth_time * 1000 : Date.now()
                                        });
                                    }

                                    const sessionUser = {
                                        email: email || 'unknown',
                                        uid: decodedToken.uid,
                                        isAdmin: userRole === 'admin' || userRole === 'owner',
                                        role: userRole as any
                                    };
                                    state.setUser(sessionUser);
                                    state.rawIdToken = idToken;

                                    res.writeHead(200, {
                                        'Content-Type': 'application/json',
                                        'Set-Cookie': 'codeman_session=active; max-age=3600; path=/; SameSite=Strict; HttpOnly'
                                    });
                                    res.end(JSON.stringify({ success: true, email }));

                                    console.log(`✅ Welcome, ${email}`);
                                    // Save Auth Timestamp & cache user
                                    UserConfigManager.setLastAuth(Date.now(), sessionUser, { authMode: 'normal' });

                                    this.closeServer();
                                    resolve(true);
                                } else {
                                    console.log(chalk.red('\n🚫 ACCESS DENIED'));
                                    console.log(chalk.gray('------------------------------------------------'));
                                    console.log(chalk.white(`User: ${chalk.bold(email)}`));
                                    console.log(chalk.yellow(`Status: Not Authorized (Requires ${requiredRolesLabel})`));
                                    console.log(chalk.gray('------------------------------------------------'));
                                    console.log(chalk.cyan(`To fix this, assign one of the required roles in that Firebase project and retry login.\n`));

                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Unauthorized Role', email }));
                                    clearAllLocalAuthArtifacts();
                                    this.closeServer();
                                    resolve(false);
                                }

                            } catch (error) {
                                console.error('Error verifying token:', error);
                                res.writeHead(500, { 'Content-Type': 'application/json' });
                                res.end(JSON.stringify({ error: 'Authentication failed' }));
                                this.closeServer();
                                resolve(false);
                            }
                            } // Close if (idToken) {}
                        } catch (error) {
                            res.writeHead(400, { 'Content-Type': 'application/json' });
                            res.end(JSON.stringify({ error: 'Invalid request body' }));
                            this.closeServer();
                            resolve(false);
                        }
                    });
                    return;
                }

                // Serve the Login Page
                if (parsedUrl.pathname === '/') {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    const clientEnv = {
                        apiKey: options.apiKey || process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
                        authDomain: options.authDomain || process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
                        projectId: projectId,
                    };

                    // HTML Template with Premium UI
                    const html = `
                        <!DOCTYPE html>
                        <html>
                        <head>
                            <title>CodeMan Authentication</title>
                            <script type="module">
                                import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-app.js";
                                import { getAuth, GoogleAuthProvider, signInWithPopup, signInWithRedirect, getRedirectResult, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
                                
                                const firebaseConfig = ${JSON.stringify(clientEnv)};
                                const nonce = "${this.currentNonce}";
                                const app = initializeApp(firebaseConfig);
                                const auth = getAuth(app);
                                auth.useDeviceLanguage();

                                const setError = (msg) => {
                                    const el = document.getElementById('error');
                                    if (el) el.innerText = msg || '';
                                };

                                const debugEl = document.getElementById('debug');
                                if (debugEl) {
                                    debugEl.textContent = JSON.stringify(firebaseConfig, null, 2);
                                }

                                const verifyWithServer = async (token, refreshToken, expiresAt) => {
                                    const res = await fetch('/callback', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ token, refreshToken, expiresAt, nonce })
                                    });
                                    const data = await res.json();
                                    
                                    if (res.ok && data.success) {
                                        document.cookie = "codeman_session=active; max-age=3600; path=/; SameSite=Strict; Secure";
                                        document.body.innerHTML = \`
                                            <div class="card" style="text-align:center;">
                                                <h1 style="color:#4caf50;">✅ Login Successful</h1>
                                                <p style="color:#888;">CodeMan Authentication</p>
                                                <p>Welcome, <strong>\${data.email}</strong></p>
                                                <p style="color:#888;">You may close this tab and return to the CLI.</p>
                                            </div>
                                        \`;
                                    } else {
                                        document.cookie = "codeman_session=; max-age=0; path=/; SameSite=Strict; Secure";
                                        throw new Error(data.error || 'Authentication denied by server.');
                                    }
                                };

                                // Redirect fallback (for popup restrictions)
                                try {
                                    const redirectResult = await getRedirectResult(auth);
                                    if (redirectResult?.user) {
                                        const token = await redirectResult.user.getIdToken();
                                        const refreshToken = redirectResult.user.refreshToken || redirectResult.user.stsTokenManager?.refreshToken;
                                        const expiresAt = redirectResult.user.stsTokenManager?.expirationTime;
                                        await verifyWithServer(token, refreshToken, expiresAt);
                                    }
                                } catch (e) {
                                    console.error("Redirect auth failed:", e);
                                    setError(e?.message || String(e));
                                }

                                onAuthStateChanged(auth, async (user) => {
                                    if (user && document.cookie.includes('codeman_session=active')) {
                                        const btn = document.getElementById('btn');
                                        if (btn) {
                                            btn.innerText = 'Restoring Session...';
                                            btn.disabled = true;
                                        }
                                        
                                        try {
                                            const token = await user.getIdToken();
                                            const refreshToken = user.refreshToken || user.stsTokenManager?.refreshToken;
                                            const expiresAt = user.stsTokenManager?.expirationTime;
                                            await verifyWithServer(token, refreshToken, expiresAt);
                                        } catch (e) {
                                            console.error("Auto-login failed:", e);
                                            if (btn) {
                                                btn.innerText = 'Sign in with Google';
                                                btn.disabled = false;
                                            }
                                            setError(e.message);
                                        }
                                    }
                                });
                                
                                window.login = async () => {
                                    const btn = document.getElementById('btn');
                                    btn.innerText = 'Authenticating...';
                                    btn.disabled = true;
                                    
                                    const provider = new GoogleAuthProvider();
                                    provider.setCustomParameters({ prompt: 'select_account' });

                                    try {
                                        const result = await signInWithPopup(auth, provider);
                                        const token = await result.user.getIdToken();
                                        const refreshToken = result.user.refreshToken || result.user.stsTokenManager?.refreshToken;
                                        const expiresAt = result.user.stsTokenManager?.expirationTime;
                                        await verifyWithServer(token, refreshToken, expiresAt);
                                    } catch (error) {
                                        console.error(error);
                                        const code = error?.code || '';
                                        if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment' || code === 'auth/popup-closed-by-user') {
                                            await signInWithRedirect(auth, provider);
                                            return;
                                        }
                                        btn.innerText = 'Sign in with Google';
                                        btn.disabled = false;
                                        setError(error.message || String(error));
                                    }
                                };
                            </script>
                            <script type="module">
                                import { startRegistration, startAuthentication } from 'https://unpkg.com/@simplewebauthn/browser/dist/bundle/index.js';
                                import { getAuth, signInWithCustomToken } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";

                                const functionsBaseUrl = \`https://us-central1-\${firebaseConfig.projectId}.cloudfunctions.net\`;

                                window.registerPasskey = async () => {
                                    const btn = document.getElementById('btn-register');
                                    btn.innerText = 'Registering...';
                                    btn.disabled = true;
                                    const auth = getAuth();
                                    try {
                                        const token = await auth.currentUser.getIdToken();
                                        
                                        // 1. Get options from server
                                        const resp1 = await fetch(\`\${functionsBaseUrl}/generateRegistration\`, {
                                            method: 'POST',
                                            headers: { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' }
                                        });
                                        if (!resp1.ok) throw new Error(await resp1.text());
                                        const options = await resp1.json();

                                        // 2. Client signs challenge
                                        const attResp = await startRegistration(options);

                                        // 3. Send signature to server
                                        const resp2 = await fetch(\`\${functionsBaseUrl}/verifyRegistration\`, {
                                            method: 'POST',
                                            headers: { 'Authorization': \`Bearer \${token}\`, 'Content-Type': 'application/json' },
                                            body: JSON.stringify(attResp)
                                        });
                                        if (!resp2.ok) throw new Error(await resp2.text());
                                        
                                        btn.innerText = 'Passkey Registered!';
                                        btn.style.background = '#10b981';
                                    } catch (e) {
                                        console.error(e);
                                        document.getElementById('error').innerText = e.message;
                                        btn.innerText = 'Register Passkey';
                                        btn.disabled = false;
                                    }
                                };

                                window.loginWithPasskey = async () => {
                                    const btn = document.getElementById('btn-passkey');
                                    btn.innerText = 'Verifying...';
                                    btn.disabled = true;
                                    const auth = getAuth();
                                    
                                    // Get email for non-discoverable flow (simplified for CLI developer use case)
                                    const email = prompt("Enter your email address for this passkey:");
                                    if (!email) {
                                        btn.innerText = 'Sign in with Passkey';
                                        btn.disabled = false;
                                        return;
                                    }

                                    try {
                                        const resp1 = await fetch(\`\${functionsBaseUrl}/generateAuthentication\`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ email })
                                        });
                                        if (!resp1.ok) throw new Error(await resp1.text());
                                        const options = await resp1.json();

                                        const asseResp = await startAuthentication(options);

                                        const resp2 = await fetch(\`\${functionsBaseUrl}/verifyAuthentication\`, {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ ...asseResp, email })
                                        });
                                        if (!resp2.ok) throw new Error(await resp2.text());
                                        
                                        const { customToken } = await resp2.json();
                                        
                                        // Sign into Firebase Auth
                                        const userCredential = await signInWithCustomToken(auth, customToken);
                                        const token = await userCredential.user.getIdToken();
                                        
                                        // Verify with CLI server to complete the flow and close the tab
                                        await window.verifyWithServer(token);
                                        
                                    } catch (e) {
                                        console.error(e);
                                        document.getElementById('error').innerText = e.message;
                                        btn.innerText = 'Sign in with Passkey';
                                        btn.disabled = false;
                                    }
                                };
                            </script>
                            <style>
                                body {
                                    margin: 0;
                                    padding: 0;
                                    font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
                                    background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%);
                                    height: 100vh;
                                    display: flex;
                                    justify-content: center;
                                    align-items: center;
                                    color: #fff;
                                }
                                .card {
                                    background: rgba(30, 41, 59, 0.7);
                                    backdrop-filter: blur(10px);
                                    border: 1px solid rgba(255, 255, 255, 0.1);
                                    padding: 3rem;
                                    border-radius: 1rem;
                                    box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
                                    text-align: center;
                                    max-width: 400px;
                                    width: 100%;
                                    animation: fadein 0.5s ease-out;
                                }
                                h2 {
                                    margin-top: 0;
                                    font-weight: 600;
                                    font-size: 1.8rem;
                                    letter-spacing: -0.025em;
                                }
                                .badge {
                                    display: inline-block;
                                    padding: 0.25rem 0.75rem;
                                    background: rgba(99, 102, 241, 0.2);
                                    color: #818cf8;
                                    border-radius: 9999px;
                                    font-size: 0.875rem;
                                    font-weight: 500;
                                    margin-bottom: 1.5rem;
                                    border: 1px solid rgba(99, 102, 241, 0.3);
                                }
                                button {
                                    background: #3b82f6;
                                    color: white;
                                    font-weight: 600;
                                    padding: 0.75rem 1.5rem;
                                    border-radius: 0.5rem;
                                    border: none;
                                    width: 100%;
                                    cursor: pointer;
                                    transition: all 0.2s;
                                    font-size: 1rem;
                                    display: flex;
                                    align-items: center;
                                    justify-content: center;
                                    gap: 0.5rem;
                                }
                                button:hover {
                                    transform: translateY(-1px);
                                    filter: brightness(1.1);
                                }
                                button:disabled {
                                    opacity: 0.7;
                                    cursor: not-allowed;
                                }
                                .error {
                                    color: #ef4444;
                                    font-size: 0.875rem;
                                    margin-top: 1rem;
                                }
                                @keyframes fadein {
                                    from { opacity: 0; transform: translateY(10px); }
                                    to { opacity: 1; transform: translateY(0); }
                                }
                            </style>
                        </head>
                        <body>
                            <div class="card">
                                <h2>CodeMan Security</h2>
                                <div class="badge">Project: ${projectId}</div>
                                <p style="color: #94a3b8; margin-bottom: 2rem;">
                                    Please authenticate to access the CLI development tools and admin features.
                                </p>
                                <div style="display: flex; flex-direction: column; gap: 1rem;">
                                    <button id="btn" onclick="login()">
                                        Sign in with Google
                                    </button>
                                    <button id="btn-passkey" onclick="loginWithPasskey()" style="background: transparent; color: #fff; border: 1px solid rgba(255,255,255,0.2);">
                                        Sign in with Passkey
                                    </button>
                                    
                                    <div style="margin-top: 1.5rem; padding-top: 1.5rem; border-top: 1px solid rgba(255,255,255,0.1);">
                                        <button id="btn-register" onclick="registerPasskey()" style="background: rgba(255,255,255,0.05); color: #94a3b8; font-size: 0.85rem;">
                                            Register a new Passkey
                                        </button>
                                        <p style="font-size: 0.75rem; color: #64748b; margin-top: 0.5rem;">(Must be signed in with Google first)</p>
                                    </div>
                                </div>
                                <div id="error" class="error"></div>
                                <details class="debug" style="margin-top: 1rem; text-align: left;">
                                    <summary style="cursor: pointer; color: #94a3b8;">Auth Debug</summary>
                                    <pre id="debug" style="white-space: pre-wrap; font-size: 0.75rem; color: #94a3b8;"></pre>
                                </details>
                            </div>
                        </body>
                        </html>
                     `;
                    res.end(html);
                }
            });

            // Error Handler for Port Conflict
            const tryListen = (port: number) => {
                this.PORT = port;
                this.loginWindowPort = port;
                this.server?.listen(this.PORT, async () => {
                    const url = `http://localhost:${this.PORT}`;
                    console.log(`🌍 Opening browser at ${url}...`);
                    await openBrowser(url);
                });
            };

            this.server.on('error', (e: any) => {
                if (e.code === 'EADDRINUSE') {
                    console.error(chalk.red(`\n❌ Port ${this.PORT} is still in use.`));
                    const nextPort = this.PORT + 1;
                    if (nextPort <= 3010) {
                        console.log(chalk.yellow(`Retrying on port ${nextPort}...`));
                        tryListen(nextPort);
                        return;
                    }
                } else {
                    console.error(chalk.red(`\n❌ Server error: ${e.message}`));
                }
                this.closeServer();
                resolve(false);
            });

            tryListen(this.PORT);
            scheduleTimeout();
        }).finally(() => {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            if (stopTimerListener) stopTimerListener();
            this.clearLoginWindow();
        });
    }

    static getLoginWindowStatus(): LoginWindowStatus {
        const startedAt = this.loginWindowStartedAt;
        const timeoutMs = SessionTimerManager.getConfig().browserLoginTimeoutMs;
        const expiresAt = startedAt ? startedAt + timeoutMs : null;
        const active = !!startedAt && !!expiresAt && expiresAt > Date.now();

        return {
            active,
            startedAt,
            expiresAt,
            timeoutMs,
            port: active ? this.loginWindowPort : null
        };
    }

    private static closeServer() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }

    private static clearLoginWindow() {
        this.loginWindowStartedAt = null;
        this.loginWindowPort = null;
    }
}
