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

// Helper to open browser
const openBrowser = async (url: string) => {
    try {
        await open(url);
    } catch (err) {
        console.error('Failed to open browser automatically. Please open:', url);
    }
};

export interface AuthOptions {
    serviceAccount?: string;
    projectId?: string;
    apiKey?: string;
    authDomain?: string;
}

export class AuthService {
    private static server: http.Server | null = null;
    private static PORT = 3005;
    private static currentNonce: string | null = null;

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
        // Fast-path session restore
        const lastAuth = UserConfigManager.getLastAuth();
        const cachedUser = UserConfigManager.getCachedUser();
        const TEN_MINUTES = 10 * 60 * 1000;
        
        // If we are overriding project, we skip cache for now to ensure we auth against the right project
        if (!options.projectId && lastAuth && cachedUser && (Date.now() - lastAuth < TEN_MINUTES)) {
            console.log(chalk.green('\n✅ Session restored from recent authentication.'));
            state.setUser(cachedUser);
            // Refresh timestamp
            UserConfigManager.setLastAuth(Date.now(), cachedUser);
            return true;
        }

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

        if (admin.apps.length > 0 && admin.app().options.projectId !== targetProjectId) {
            // Delete existing app to re-initialize with different credentials if project mismatch
            await admin.app().delete();
        }

        if (admin.apps.length === 0) {
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
            } catch (error) {
                console.error("❌ Failed to initialize Firebase Admin SDK. Check Credentials.");
                // Log strictly for debug
                // console.error(error); 
                return false;
            }
        }

        const projectId = targetProjectId || 'unknown-project';

        return new Promise((resolve) => {
            // 2. Start Local Server to catch token
            this.server = http.createServer(async (req, res) => {
                const parsedUrl = url.parse(req.url || '', true);

                if (parsedUrl.pathname === '/callback' && req.method === 'POST') {
                    let body = '';
                    req.on('data', chunk => body += chunk);
                    req.on('end', async () => {
                        try {
                            const { token: idToken, nonce } = JSON.parse(body);

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
                                const email = decodedToken.email;

                                // STRICT CHECK: Must have 'owner' claim or role, OR match the defined OWNER_EMAIL
                                const ownerEmail = process.env.OWNER_EMAIL;
                                const isOwner = decodedToken.owner === true || (ownerEmail && email === ownerEmail);

                                let userRole = isOwner ? 'admin' : (decodedToken.role || null);

                                // Call verifyAccess Cloud Function to get latest truth
                                try {
                                    const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;
                                    const functionsBaseUrl = `https://us-central1-${projectId}.cloudfunctions.net`;
                                    const cfResp = await fetch(`${functionsBaseUrl}/verifyAccess`, {
                                        method: 'POST',
                                        headers: {
                                            'Authorization': `Bearer ${idToken}`,
                                            'Content-Type': 'application/json'
                                        },
                                        body: JSON.stringify({ data: {} }) // Callable CF format
                                    });
                                    if (cfResp.ok) {
                                        const cfData = await cfResp.json() as any;
                                        if (cfData.result && cfData.result.role) {
                                            userRole = cfData.result.role;
                                        }
                                    } else {
                                        console.log(chalk.yellow(`[Auth] verifyAccess CF returned ${cfResp.status}`));
                                    }
                                } catch (err) {
                                    console.log(chalk.yellow(`[Auth] Failed to call verifyAccess CF: ${(err as Error).message}`));
                                }

                                if (userRole) {
                                    const sessionUser = {
                                        email: email || 'unknown',
                                        uid: decodedToken.uid,
                                        isAdmin: userRole === 'admin' || userRole === 'owner',
                                        role: userRole as any
                                    };
                                    state.setUser(sessionUser);

                                    res.writeHead(200, {
                                        'Content-Type': 'application/json',
                                        'Set-Cookie': 'codeman_session=active; max-age=3600; path=/; SameSite=Strict; HttpOnly'
                                    });
                                    res.end(JSON.stringify({ success: true, email }));

                                    console.log(`✅ Welcome, ${email}`);
                                    // Save Auth Timestamp & cache user
                                    UserConfigManager.setLastAuth(Date.now(), sessionUser);

                                    this.closeServer();
                                    resolve(true);
                                } else {
                                    console.log(chalk.red('\n🚫 ACCESS DENIED'));
                                    console.log(chalk.gray('------------------------------------------------'));
                                    console.log(chalk.white(`User: ${chalk.bold(email)}`));
                                    console.log(chalk.yellow(`Status: Not Authorized (No Role Assigned)`));
                                    console.log(chalk.gray('------------------------------------------------'));
                                    console.log(chalk.cyan(`To fix this, assign a role to this user or add ${email} to OWNER_EMAIL in .env\n`));

                                    res.writeHead(403, { 'Content-Type': 'application/json' });
                                    res.end(JSON.stringify({ error: 'Unauthorized Role', email }));
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
                                import { getAuth, GoogleAuthProvider, signInWithPopup, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.2/firebase-auth.js";
                                
                                const firebaseConfig = ${JSON.stringify(clientEnv)};
                                const nonce = "${this.currentNonce}";
                                const app = initializeApp(firebaseConfig);
                                const auth = getAuth(app);

                                const verifyWithServer = async (token) => {
                                    const res = await fetch('/callback', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({ token, nonce })
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

                                onAuthStateChanged(auth, async (user) => {
                                    if (user && document.cookie.includes('codeman_session=active')) {
                                        const btn = document.getElementById('btn');
                                        if (btn) {
                                            btn.innerText = 'Restoring Session...';
                                            btn.disabled = true;
                                        }
                                        
                                        try {
                                            const token = await user.getIdToken();
                                            await verifyWithServer(token);
                                        } catch (e) {
                                            console.error("Auto-login failed:", e);
                                            if (btn) {
                                                btn.innerText = 'Sign in with Google';
                                                btn.disabled = false;
                                            }
                                            document.getElementById('error').innerText = e.message;
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
                                        await verifyWithServer(token);
                                    } catch (error) {
                                        console.error(error);
                                        btn.innerText = 'Sign in with Google';
                                        btn.disabled = false;
                                        document.getElementById('error').innerText = error.message;
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
                            </div>
                        </body>
                        </html>
                     `;
                    res.end(html);
                }
            });

            // Error Handler for Port Conflict
            this.server.on('error', (e: any) => {
                if (e.code === 'EADDRINUSE') {
                    console.error(chalk.red(`\n❌ Port ${this.PORT} is still in use.`));
                    console.error(chalk.yellow(`Retrying after force kill did not work immediately...`));
                    // Optional: Try one more time recursively or just fail
                } else {
                    console.error(chalk.red(`\n❌ Server error: ${e.message}`));
                }
                this.closeServer();
                resolve(false);
            });

            this.server.listen(this.PORT, async () => {
                const url = `http://localhost:${this.PORT}`;
                console.log(`🌍 Opening browser at ${url}...`);
                await openBrowser(url);
            });
        });
    }

    private static closeServer() {
        if (this.server) {
            this.server.close();
            this.server = null;
        }
    }
}
