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

export class AuthService {
    private static server: http.Server | null = null;
    private static PORT = 3005;

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

    static async login(state: GlobalState): Promise<boolean> {
        // Reload Env Vars to catch any manual changes

        const { createRequire } = await import('module');
        const require = createRequire(import.meta.url);
        require('dotenv').config({ override: true });

        console.log('\n🔐 Awaiting Auth from Firebase...');

        // Pre-emptive port cleanup
        await this.killPort(this.PORT);

        // 1. Initialize Admin SDK if needed
        if (admin.apps.length === 0) {
            try {
                // Try ENV first
                const serviceAccount = process.env.GOOGLE_APPLICATION_CREDENTIALS;
                const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID;

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

        const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || process.env.FIREBASE_PROJECT_ID || 'unknown-project';

        return new Promise((resolve) => {
            // 2. Start Local Server to catch token
            this.server = http.createServer(async (req, res) => {
                const parsedUrl = url.parse(req.url || '', true);

                if (parsedUrl.pathname === '/callback') {
                    const idToken = parsedUrl.query.token as string;

                    if (idToken) {
                        try {
                            const decodedToken = await admin.auth().verifyIdToken(idToken);

                            // Check custom claims
                            console.log('🔎 User Claims:', JSON.stringify(decodedToken, null, 2));
                            const email = decodedToken.email;

                            // STRICT CHECK: Must have 'owner' claim or role, OR match the defined OWNER_EMAIL
                            const ownerEmail = process.env.OWNER_EMAIL;
                            const isOwner = decodedToken.owner === true || (ownerEmail && email === ownerEmail);

                            // Auto-Owner mechanism removed. Strict verification only.

                            if (isOwner) {
                                state.setUser({
                                    email: email || 'unknown',
                                    uid: decodedToken.uid,
                                    isAdmin: true
                                });

                                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                                res.end(`
                                    <html>
                                    <body style="background:#111; color:#eee; font-family:sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; height:100vh;">
                                        <div style="background:#222; padding:40px; border-radius:12px; box-shadow:0 10px 30px rgba(0,0,0,0.5); text-align:center;">
                                            <h1 style="color:#4caf50;">✅ Login Successful</h1>
                                            <p style="color:#888;">CodeMan Authentication</p>
                                            <p>Welcome, <strong>${email}</strong></p>
                                            <p style="color:#888;">You may close this tab and return to the CLI.</p>
                                        </div>
                                    </body>
                                    </html>
                                `);

                                console.log(`✅ Welcome, ${email}`);
                                // Save Auth Timestamp
                                UserConfigManager.setLastAuth(Date.now());

                                this.closeServer();
                                resolve(true);
                            } else {
                                console.log(chalk.red('\n🚫 ACCESS DENIED'));
                                console.log(chalk.gray('------------------------------------------------'));
                                console.log(chalk.white(`User: ${chalk.bold(email)}`));
                                console.log(chalk.yellow(`Status: Not an Owner`));
                                console.log(chalk.gray('------------------------------------------------'));
                                console.log(chalk.cyan(`To fix this, add ${email} to OWNER_EMAIL in .env\n`));

                                res.writeHead(403, { 'Content-Type': 'text/html; charset=utf-8' });

                                const html = `
                                    <html>
                                    <head>
                                        <title>Access Denied - CodeMan</title>
                                        <style>
                                            body { font-family: 'Segoe UI', sans-serif; background: #0f172a; color: #fff; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; }
                                            .card { background: #1e293b; padding: 40px; border-radius: 12px; box-shadow: 0 20px 25px -5px rgba(0,0,0,0.1); text-align: center; border: 1px solid #334155; max-width: 400px; }
                                            h1 { color: #ef4444; margin-top: 0; font-size: 24px; }
                                            p { color: #94a3b8; line-height: 1.5; }
                                            .email { background: #334155; padding: 4px 12px; border-radius: 4px; color: #e2e8f0; font-family: monospace; }
                                        </style>
                                    </head>
                                    <body>
                                        <script>
                                            // CLEAR SESSION COOKIE ON DENIAL
                                            document.cookie = "codeman_session=; max-age=0; path=/; SameSite=Strict";
                                        </script>
                                        <div class="card">
                                            <h1>⛔ Access Denied</h1>
                                            <p>The account <span class="email">${email}</span> is not authorized.</p>
                                            <p>Please contact the project owner or check your <code>.env</code> configuration.</p>
                                        </div>
                                    </body>
                                    </html>
                                `;
                                res.end(html);
                                this.closeServer();
                                resolve(false);
                            }

                        } catch (error) {
                            console.error('Error verifying token:', error);
                            res.writeHead(500);
                            res.end('Authentication failed.');
                            this.closeServer();
                            resolve(false);
                        }
                    } else {
                        // serve client side code to do the login
                    }
                }

                // Serve the Login Page
                if (parsedUrl.pathname === '/') {
                    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                    const clientEnv = {
                        apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || process.env.FIREBASE_API_KEY,
                        authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || process.env.FIREBASE_AUTH_DOMAIN || `${projectId}.firebaseapp.com`,
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
                                const app = initializeApp(firebaseConfig);
                                const auth = getAuth(app);

                                onAuthStateChanged(auth, async (user) => {
                                    if (user && document.cookie.includes('codeman_session=active')) {
                                        const btn = document.getElementById('btn');
                                        if (btn) {
                                            btn.innerText = 'Restoring Session...';
                                            btn.disabled = true;
                                        }
                                        
                                        try {
                                            const token = await user.getIdToken();
                                            // Refresh session cookie (1 hour)
                                            document.cookie = "codeman_session=active; max-age=3600; path=/; SameSite=Strict";
                                            window.location.href = '/callback?token=' + token;
                                        } catch (e) {
                                            console.error("Auto-login failed:", e);
                                            if (btn) {
                                                btn.innerText = 'Sign in with Google';
                                                btn.disabled = false;
                                            }
                                        }
                                    }
                                });
                                
                                window.login = async () => {
                                    const btn = document.getElementById('btn');
                                    btn.innerText = 'Authenticating...';
                                    btn.disabled = true;
                                    
                                    const provider = new GoogleAuthProvider();
                                    // FORCE ACCOUNT SELECTION
                                    provider.setCustomParameters({ prompt: 'select_account' });

                                    try {
                                        const result = await signInWithPopup(auth, provider);
                                        const token = await result.user.getIdToken();
                                        // Set 1-hour session cookie
                                        document.cookie = "codeman_session=active; max-age=3600; path=/; SameSite=Strict";
                                        window.location.href = '/callback?token=' + token;
                                    } catch (error) {
                                        console.error(error);
                                        btn.innerText = 'Try Again';
                                        btn.disabled = false;
                                        document.getElementById('error').innerText = error.message;
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
                                    background: #2563eb;
                                    transform: translateY(-1px);
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
                                <button id="btn" onclick="login()">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M21.35 11.1h-9.17v2.73h6.51c-.33 3.81-3.5 5.44-6.5 5.44C8.36 19.27 5 16.25 5 12c0-4.1 3.2-7.27 7.2-7.27 3.09 0 4.9 1.97 4.9 1.97L19 4.72S16.56 2 12.1 2C6.42 2 2.03 6.8 2.03 12c0 5.05 4.13 10 10.22 10 5.35 0 9.25-3.67 9.25-9.09 0-1.15-.15-1.81-.15-1.81z"/>
                                    </svg>
                                    Sign in with Google
                                </button>
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
