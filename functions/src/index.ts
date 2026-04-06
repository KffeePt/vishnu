import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import cors = require('cors');

admin.initializeApp();
const db = admin.firestore();

// This should match the origin the request is coming from (e.g. CLI proxy or hosted domain)
const rpName = 'CodeMan CLI';
const rpID = 'localhost'; // For local CLI. In prod, this would be your Firebase Hosting domain.
const expectedOrigin = ['http://localhost:3005', 'https://localhost:3005'];

const corsHandler = cors({ origin: true });

export const generateRegistration = functions.https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    (async () => {
    try {
      if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).send('Unauthorized: No token provided'); return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;
      const email = decodedToken.email || 'user';

      // Ensure user document in passkeys exists or create it
      const userDoc = await db.collection('passkeys').doc(uid).get();
      let userPasskeys: any[] = [];
      if (userDoc.exists) {
        userPasskeys = userDoc.data()?.credentials || [];
      } else {
        await db.collection('passkeys').doc(uid).set({ credentials: [] });
      }

      const options = await generateRegistrationOptions({
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

      res.status(200).json(options); return;
    } catch (error: any) {
      console.error('generateRegistrationOptions error:', error);
      res.status(500).json({ error: error.message }); return;
    }
    })();
  });
});

export const verifyRegistration = functions.https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    (async () => {
    try {
      if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        res.status(401).send('Unauthorized: No token provided'); return;
      }

      const idToken = authHeader.split('Bearer ')[1];
      const decodedToken = await admin.auth().verifyIdToken(idToken);
      const uid = decodedToken.uid;

      const body: any = req.body;

      const userDoc = await db.collection('passkeys').doc(uid).get();
      if (!userDoc.exists) { res.status(400).send('User not found in passkeys'); return; }

      const currentChallenge = userDoc.data()?.currentChallenge;
      if (!currentChallenge) { res.status(400).send('No active registration challenge'); return; }

      let verification;
      try {
        verification = await verifyRegistrationResponse({
          response: body,
          expectedChallenge: currentChallenge,
          expectedOrigin,
          expectedRPID: rpID,
        });
      } catch (error: any) {
        res.status(400).send({ error: error.message }); return;
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

        const existingCredentials = userDoc.data()?.credentials || [];
        existingCredentials.push(newCredential);

        await db.collection('passkeys').doc(uid).set({
          credentials: existingCredentials,
          currentChallenge: admin.firestore.FieldValue.delete()
        }, { merge: true });

        res.status(200).json({ verified: true }); return;
      } else {
        res.status(400).json({ error: 'Verification failed' }); return;
      }
    } catch (error: any) {
      console.error('verifyRegistration error:', error);
      res.status(500).json({ error: error.message }); return;
    }
    })();
  });
});

export const generateAuthentication = functions.https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    (async () => {
    try {
      if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

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
          const userPasskeys = userDoc.exists ? (userDoc.data()?.credentials || []) : [];

          options = await generateAuthenticationOptions({
            rpID,
            allowCredentials: userPasskeys.map((cred: any) => ({
              id: cred.credentialID,
              transports: cred.transports,
            })),
            userVerification: 'preferred',
          });
          
          // Store challenge mapped to uid for verification
          await db.collection('passkeys').doc(uid).set({ currentAuthChallenge: options.challenge }, { merge: true });
      } else {
          // Discoverable Credentials (User selects from list)
          options = await generateAuthenticationOptions({
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

      res.status(200).json(options); return;
    } catch (error: any) {
      console.error('generateAuthentication error:', error);
      res.status(500).json({ error: error.message }); return;
    }
    })();
  });
});

export const verifyAuthentication = functions.https.onRequest((req, res) => {
  corsHandler(req, res, () => {
    (async () => {
    try {
      if (req.method !== 'POST') { res.status(405).send('Method Not Allowed'); return; }

      const body: any = req.body;
      const { email } = body;

      let uid: string;
      let expectedChallenge: string;

      if (email) {
        // We know the user
        const userRecord = await admin.auth().getUserByEmail(email);
        uid = userRecord.uid;
        const userDoc = await db.collection('passkeys').doc(uid).get();
        if (!userDoc.exists) { res.status(400).send('User passkeys not found'); return; }
        expectedChallenge = userDoc.data()?.currentAuthChallenge;
      } else {
        res.status(400).send('Discoverable credentials not fully implemented in this stub yet, please provide email');
        return;
      }

      if (!expectedChallenge) { res.status(400).send('No active auth challenge found.'); return; }

      const userDoc = await db.collection('passkeys').doc(uid).get();
      const userPasskeys = userDoc.data()?.credentials || [];

      // Find the credential the user claims to possess
      const idToFind = body.id;
      const authenticator = userPasskeys.find((cred: any) => cred.credentialID === idToFind);

      if (!authenticator) {
        res.status(400).send('Authenticator not registered with this user'); return;
      }

      let verification;
      try {
        verification = await verifyAuthenticationResponse({
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
      } catch (error: any) {
        res.status(400).send({ error: error.message }); return;
      }

      const { verified, authenticationInfo } = verification;

      if (verified) {
        // Update the authenticator's counter in the DB
        const updatedCredentials = userPasskeys.map((cred: any) => {
          if (cred.credentialID === authenticator.credentialID) {
            return { ...cred, counter: authenticationInfo.newCounter };
          }
          return cred;
        });

        await db.collection('passkeys').doc(uid).set({
          credentials: updatedCredentials,
          currentAuthChallenge: admin.firestore.FieldValue.delete()
        }, { merge: true });

        // IMPORTANT: Mint a Custom Token so the CLI frontend can sign in
        const customToken = await admin.auth().createCustomToken(uid);

        res.status(200).json({ verified: true, customToken }); return;
      } else {
        res.status(400).json({ error: 'Authentication verification failed' }); return;
      }
    } catch (error: any) {
      console.error('verifyAuthentication error:', error);
      res.status(500).json({ error: error.message }); return;
    }
    })();
  });
});

// --- GitHub Proxy & Auth Sync ---
export * from './auth-sync';
export * from './github-proxy';
export * from './github-webhook';
export * from './vishnu-gateway';
export * from './session-presence';

// --- Payments ---
export { paymentWebhook, createPayment, createSubscription } from './payments/webhook-handler';

// --- Support Messaging ---
export { createSupportThread, sendSupportMessage, onSupportMessageCreate } from './support';

// --- Subscriptions ---
export { cancelSubscription, pauseSubscription, reactivateSubscription } from './subscriptions/manager';
export { checkBillingStatus } from './subscriptions/billing-sync';
