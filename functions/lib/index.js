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
var __exportStar = (this && this.__exportStar) || function(m, exports) {
    for (var p in m) if (p !== "default" && !Object.prototype.hasOwnProperty.call(exports, p)) __createBinding(exports, m, p);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkBillingStatus = exports.reactivateSubscription = exports.pauseSubscription = exports.cancelSubscription = exports.onSupportMessageCreate = exports.sendSupportMessage = exports.createSupportThread = exports.createSubscription = exports.createPayment = exports.paymentWebhook = exports.verifyAuthentication = exports.generateAuthentication = exports.verifyRegistration = exports.generateRegistration = void 0;
const functions = __importStar(require("firebase-functions"));
const admin = __importStar(require("firebase-admin"));
const server_1 = require("@simplewebauthn/server");
const cors = require("cors");
admin.initializeApp();
const db = admin.firestore();
// This should match the origin the request is coming from (e.g. CLI proxy or hosted domain)
const rpName = 'CodeMan CLI';
const rpID = 'localhost'; // For local CLI. In prod, this would be your Firebase Hosting domain.
const expectedOrigin = ['http://localhost:3005', 'https://localhost:3005'];
const corsHandler = cors({ origin: true });
exports.generateRegistration = functions.https.onRequest((req, res) => {
    corsHandler(req, res, () => {
        (async () => {
            var _a;
            try {
                if (req.method !== 'POST') {
                    res.status(405).send('Method Not Allowed');
                    return;
                }
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    res.status(401).send('Unauthorized: No token provided');
                    return;
                }
                const idToken = authHeader.split('Bearer ')[1];
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                const uid = decodedToken.uid;
                const email = decodedToken.email || 'user';
                // Ensure user document in passkeys exists or create it
                const userDoc = await db.collection('passkeys').doc(uid).get();
                let userPasskeys = [];
                if (userDoc.exists) {
                    userPasskeys = ((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.credentials) || [];
                }
                else {
                    await db.collection('passkeys').doc(uid).set({ credentials: [] });
                }
                const options = await (0, server_1.generateRegistrationOptions)({
                    rpName,
                    rpID,
                    userID: new Uint8Array(Buffer.from(uid)),
                    userName: email,
                    // Don't prompt users for their authenticator if they've already registered it
                    excludeCredentials: userPasskeys.map((cred) => ({
                        id: cred.credentialID,
                    })),
                    authenticatorSelection: {
                        residentKey: 'required',
                        userVerification: 'preferred',
                    },
                });
                // Temporarily store the challenge in the DB (for verification step)
                await db.collection('passkeys').doc(uid).set({ currentChallenge: options.challenge }, { merge: true });
                res.status(200).json(options);
                return;
            }
            catch (error) {
                console.error('generateRegistrationOptions error:', error);
                res.status(500).json({ error: error.message });
                return;
            }
        })();
    });
});
exports.verifyRegistration = functions.https.onRequest((req, res) => {
    corsHandler(req, res, () => {
        (async () => {
            var _a, _b;
            try {
                if (req.method !== 'POST') {
                    res.status(405).send('Method Not Allowed');
                    return;
                }
                const authHeader = req.headers.authorization;
                if (!authHeader || !authHeader.startsWith('Bearer ')) {
                    res.status(401).send('Unauthorized: No token provided');
                    return;
                }
                const idToken = authHeader.split('Bearer ')[1];
                const decodedToken = await admin.auth().verifyIdToken(idToken);
                const uid = decodedToken.uid;
                const body = req.body;
                const userDoc = await db.collection('passkeys').doc(uid).get();
                if (!userDoc.exists) {
                    res.status(400).send('User not found in passkeys');
                    return;
                }
                const currentChallenge = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.currentChallenge;
                if (!currentChallenge) {
                    res.status(400).send('No active registration challenge');
                    return;
                }
                let verification;
                try {
                    verification = await (0, server_1.verifyRegistrationResponse)({
                        response: body,
                        expectedChallenge: currentChallenge,
                        expectedOrigin,
                        expectedRPID: rpID,
                    });
                }
                catch (error) {
                    res.status(400).send({ error: error.message });
                    return;
                }
                const { verified, registrationInfo } = verification;
                if (verified && registrationInfo) {
                    const { credentialID, credentialPublicKey, counter } = registrationInfo;
                    const newCredential = {
                        credentialID: credentialID,
                        credentialPublicKey: Buffer.from(credentialPublicKey).toString('base64url'),
                        counter,
                        transports: body.response.transports || [],
                    };
                    const existingCredentials = ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.credentials) || [];
                    existingCredentials.push(newCredential);
                    await db.collection('passkeys').doc(uid).set({
                        credentials: existingCredentials,
                        currentChallenge: admin.firestore.FieldValue.delete()
                    }, { merge: true });
                    res.status(200).json({ verified: true });
                    return;
                }
                else {
                    res.status(400).json({ error: 'Verification failed' });
                    return;
                }
            }
            catch (error) {
                console.error('verifyRegistration error:', error);
                res.status(500).json({ error: error.message });
                return;
            }
        })();
    });
});
exports.generateAuthentication = functions.https.onRequest((req, res) => {
    corsHandler(req, res, () => {
        (async () => {
            var _a;
            try {
                if (req.method !== 'POST') {
                    res.status(405).send('Method Not Allowed');
                    return;
                }
                // For authentication, we don't have a token. We need the user to tell us who they are
                // or use Discoverable Credentials (where we don't know who they are yet).
                // If we don't have a specific user in mind (passwordless flow), we generate 
                // options without allowCredentials.
                const { email } = req.body; // Optional: If user typed their email first
                let options;
                if (email) {
                    // If they typed email, find their UID and credentials
                    const userRecord = await admin.auth().getUserByEmail(email);
                    const uid = userRecord.uid;
                    const userDoc = await db.collection('passkeys').doc(uid).get();
                    const userPasskeys = userDoc.exists ? (((_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.credentials) || []) : [];
                    options = await (0, server_1.generateAuthenticationOptions)({
                        rpID,
                        allowCredentials: userPasskeys.map((cred) => ({
                            id: cred.credentialID,
                            transports: cred.transports,
                        })),
                        userVerification: 'preferred',
                    });
                    // Store challenge mapped to uid for verification
                    await db.collection('passkeys').doc(uid).set({ currentAuthChallenge: options.challenge }, { merge: true });
                }
                else {
                    // Discoverable Credentials (User selects from list)
                    options = await (0, server_1.generateAuthenticationOptions)({
                        rpID,
                        userVerification: 'preferred',
                    });
                    // Store globally based on challenge ID itself or a session token... 
                    // For simplicity in CLI, we'll store it in a generic "authChallenges" collection 
                    // because we don't know the UID yet.
                    await db.collection('authChallenges').doc(options.challenge).set({
                        challenge: options.challenge,
                        createdAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
                res.status(200).json(options);
                return;
            }
            catch (error) {
                console.error('generateAuthentication error:', error);
                res.status(500).json({ error: error.message });
                return;
            }
        })();
    });
});
exports.verifyAuthentication = functions.https.onRequest((req, res) => {
    corsHandler(req, res, () => {
        (async () => {
            var _a, _b;
            try {
                if (req.method !== 'POST') {
                    res.status(405).send('Method Not Allowed');
                    return;
                }
                const body = req.body;
                const { email } = body;
                let uid;
                let expectedChallenge;
                if (email) {
                    // We know the user
                    const userRecord = await admin.auth().getUserByEmail(email);
                    uid = userRecord.uid;
                    const userDoc = await db.collection('passkeys').doc(uid).get();
                    if (!userDoc.exists) {
                        res.status(400).send('User passkeys not found');
                        return;
                    }
                    expectedChallenge = (_a = userDoc.data()) === null || _a === void 0 ? void 0 : _a.currentAuthChallenge;
                }
                else {
                    res.status(400).send('Discoverable credentials not fully implemented in this stub yet, please provide email');
                    return;
                }
                if (!expectedChallenge) {
                    res.status(400).send('No active auth challenge found.');
                    return;
                }
                const userDoc = await db.collection('passkeys').doc(uid).get();
                const userPasskeys = ((_b = userDoc.data()) === null || _b === void 0 ? void 0 : _b.credentials) || [];
                // Find the credential the user claims to possess
                const idToFind = body.id;
                const authenticator = userPasskeys.find((cred) => cred.credentialID === idToFind);
                if (!authenticator) {
                    res.status(400).send('Authenticator not registered with this user');
                    return;
                }
                let verification;
                try {
                    verification = await (0, server_1.verifyAuthenticationResponse)({
                        response: body,
                        expectedChallenge,
                        expectedOrigin,
                        expectedRPID: rpID,
                        authenticator: {
                            credentialID: authenticator.credentialID,
                            credentialPublicKey: new Uint8Array(Buffer.from(authenticator.credentialPublicKey, 'base64url')),
                            counter: authenticator.counter,
                            transports: authenticator.transports,
                        },
                    });
                }
                catch (error) {
                    res.status(400).send({ error: error.message });
                    return;
                }
                const { verified, authenticationInfo } = verification;
                if (verified) {
                    // Update the authenticator's counter in the DB
                    const updatedCredentials = userPasskeys.map((cred) => {
                        if (cred.credentialID === authenticator.credentialID) {
                            return Object.assign(Object.assign({}, cred), { counter: authenticationInfo.newCounter });
                        }
                        return cred;
                    });
                    await db.collection('passkeys').doc(uid).set({
                        credentials: updatedCredentials,
                        currentAuthChallenge: admin.firestore.FieldValue.delete()
                    }, { merge: true });
                    // IMPORTANT: Mint a Custom Token so the CLI frontend can sign in
                    const customToken = await admin.auth().createCustomToken(uid);
                    res.status(200).json({ verified: true, customToken });
                    return;
                }
                else {
                    res.status(400).json({ error: 'Authentication verification failed' });
                    return;
                }
            }
            catch (error) {
                console.error('verifyAuthentication error:', error);
                res.status(500).json({ error: error.message });
                return;
            }
        })();
    });
});
// --- GitHub Proxy & Auth Sync ---
__exportStar(require("./auth-sync"), exports);
__exportStar(require("./github-proxy"), exports);
__exportStar(require("./github-webhook"), exports);
// --- Payments ---
var webhook_handler_1 = require("./payments/webhook-handler");
Object.defineProperty(exports, "paymentWebhook", { enumerable: true, get: function () { return webhook_handler_1.paymentWebhook; } });
Object.defineProperty(exports, "createPayment", { enumerable: true, get: function () { return webhook_handler_1.createPayment; } });
Object.defineProperty(exports, "createSubscription", { enumerable: true, get: function () { return webhook_handler_1.createSubscription; } });
// --- Support Messaging ---
var support_1 = require("./support");
Object.defineProperty(exports, "createSupportThread", { enumerable: true, get: function () { return support_1.createSupportThread; } });
Object.defineProperty(exports, "sendSupportMessage", { enumerable: true, get: function () { return support_1.sendSupportMessage; } });
Object.defineProperty(exports, "onSupportMessageCreate", { enumerable: true, get: function () { return support_1.onSupportMessageCreate; } });
// --- Subscriptions ---
var manager_1 = require("./subscriptions/manager");
Object.defineProperty(exports, "cancelSubscription", { enumerable: true, get: function () { return manager_1.cancelSubscription; } });
Object.defineProperty(exports, "pauseSubscription", { enumerable: true, get: function () { return manager_1.pauseSubscription; } });
Object.defineProperty(exports, "reactivateSubscription", { enumerable: true, get: function () { return manager_1.reactivateSubscription; } });
var billing_sync_1 = require("./subscriptions/billing-sync");
Object.defineProperty(exports, "checkBillingStatus", { enumerable: true, get: function () { return billing_sync_1.checkBillingStatus; } });
//# sourceMappingURL=index.js.map