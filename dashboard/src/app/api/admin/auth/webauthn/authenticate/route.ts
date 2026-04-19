import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { randomBytes } from 'crypto';
import {
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from '@simplewebauthn/server';
import { isoBase64URL } from '@simplewebauthn/server/helpers';
import { applyRateLimit } from '@/lib/rate-limiter';
import { computeLookupHash, encryptCredentialBlob, decryptCredentialBlob, EncryptedCredentialBlob } from '@/lib/credential-crypto';
import { getPasskeysForUserCached, invalidatePasskeyCache } from '@/lib/passkeyCache';
import { getMissingPasskeyMessage, getWrongPanelPasskeyMessage, isAdminPanelPasskey } from '@/lib/passkey-panels';

// ─── Shared Passkey Cache Wrapper ─────────────────────────────────────────────
// (Now using centralized lib/passkeyCache.ts)
async function getPasskeysForUser(userId: string): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
  return getPasskeysForUserCached(userId);
}
// ─────────────────────────────────────────────────────────────────────────────

function getRpId(request: NextRequest): string {
  const domain = process.env.NEXT_PUBLIC_DOMAIN;
  if (domain) return domain;
  const host = request.headers.get('host') || '';
  return host.split(':')[0] || 'localhost';
}

function getExpectedOrigin(request: NextRequest): string {
  const origin = request.headers.get('origin');
  if (origin) return origin;
  const host = request.headers.get('host') || 'localhost';
  const proto = host.includes('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

/** GET /api/admin/auth/webauthn/authenticate?userId=... — returns authentication options */
async function getHandler(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 400 });
    }

    const rpID = getRpId(request);

    // Get user's registered passkeys (cached to reduce Firestore reads)
    const passkeydocs = (await getPasskeysForUser(userId)).filter((doc) => isAdminPanelPasskey(doc.data()));

    if (passkeydocs.length === 0) {
      return NextResponse.json({ error: getMissingPasskeyMessage('admin') }, { status: 404 });
    }

    const userPasskeys = passkeydocs.map(doc => {
      const data = doc.data();
      let credentialID = data.credentialID as string;
      let transports = data.transports as AuthenticatorTransport[] | undefined;

      if (data.encryptedBlob && data.iv && data.authTag) {
        try {
          const blob: EncryptedCredentialBlob = {
            encryptedBlob: data.encryptedBlob,
            iv: data.iv,
            authTag: data.authTag
          };
          const decryptedData = decryptCredentialBlob(blob);
          credentialID = decryptedData.credentialID;
          transports = (decryptedData.transports as AuthenticatorTransport[]) || [];
        } catch (err) {
          console.error(`Failed to decrypt blob for passkey ${doc.id} — excluding from allowCredentials`);
          credentialID = undefined!;
        }
      }

      return {
        id: credentialID,
        transports: transports && transports.length > 0 ? transports : undefined,
      };
    }).filter(cred => cred.id !== undefined);

    if (userPasskeys.length === 0) {
      return NextResponse.json({ error: 'Las llaves de acceso en este dispositivo están corruptas o las llaves maestras cambiaron. Por favor, elimina la llave en la configuración y vuelva a registrarla.' }, { status: 400 });
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials: userPasskeys,
      userVerification: 'preferred',
    });

    // Store challenge
    await db.collection('webauthn-challenges').doc(userId).set({
      challenge: options.challenge,
      type: 'authentication',
      expiresAt: new Date(Date.now() + 2 * 60 * 1000),
      createdAt: new Date(),
    });

    return NextResponse.json(options);
  } catch (error: any) {
    console.error('Error getting authentication options:', error);
    return NextResponse.json({ error: 'Failed to get authentication options' }, { status: 500 });
  }
}

/** POST /api/admin/auth/webauthn/authenticate — verifies assertion and creates session */
async function postHandler(request: NextRequest) {
  try {
    const { credential } = await request.json();

    if (!credential || !credential.id || !credential.response) {
      return NextResponse.json({ error: 'Missing required fields: credential with id and response' }, { status: 400 });
    }

    const credentialId = credential.id;

    // Compute lookup hash for the credential
    const lookupHash = computeLookupHash(credentialId);

    // Find the stored passkey by lookupHash (or fallback to plaintext ID for old unscanned passkeys)
    let passkeysSnapshot = await db.collection('passkeys')
      .where('lookupHash', '==', lookupHash)
      .limit(1)
      .get();

    // Fallback if not found via hash (meaning it hasn't been migrated)
    if (passkeysSnapshot.empty) {
      passkeysSnapshot = await db.collection('passkeys')
        .where('credentialID', '==', credentialId)
        .limit(1)
        .get();
    }

    if (passkeysSnapshot.empty) {
      return NextResponse.json({ error: 'Passkey not found' }, { status: 404 });
    }

    const passkeyDoc = passkeysSnapshot.docs[0];
    const passkeyData = passkeyDoc.data();
    const userId = passkeyData.userId;

    if (!isAdminPanelPasskey(passkeyData)) {
      return NextResponse.json({ error: getWrongPanelPasskeyMessage('admin') }, { status: 403 });
    }

    // Cross-account guard: verify the passkey belongs to the requesting user
    const authHeader = request.headers.get('authorization');
    if (authHeader) {
      try {
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);
        if (decodedToken.uid !== userId) {
          return NextResponse.json(
            { error: 'This passkey belongs to a different account' },
            { status: 403 }
          );
        }
      } catch (e) { /* Token verification is optional here — existing flow handles auth */ }
    }

    let credentialPublicKeyObj: Uint8Array;
    let storedCounter: number;
    let transports: AuthenticatorTransport[];

    // Extract crypto fields
    if (passkeyData.encryptedBlob && passkeyData.iv && passkeyData.authTag) {
      try {
        const blob: EncryptedCredentialBlob = {
          encryptedBlob: passkeyData.encryptedBlob,
          iv: passkeyData.iv,
          authTag: passkeyData.authTag
        };
        const decryptedData = decryptCredentialBlob(blob);
        credentialPublicKeyObj = isoBase64URL.toBuffer(decryptedData.credentialPublicKey);
        storedCounter = decryptedData.counter;
        transports = (decryptedData.transports as AuthenticatorTransport[]) || [];
      } catch (err: any) {
        return NextResponse.json({ error: `Internal error: failed to decrypt credential. ${err.message}` }, { status: 500 });
      }
    } else {
      // Fallback to plaintext
      credentialPublicKeyObj = isoBase64URL.toBuffer(passkeyData.credentialPublicKey);
      storedCounter = passkeyData.counter || 0;
      transports = passkeyData.transports || [];
    }

    // Retrieve stored challenge
    const challengeDoc = await db.collection('webauthn-challenges').doc(userId).get();
    if (!challengeDoc.exists) {
      return NextResponse.json({ error: 'No authentication challenge found' }, { status: 401 });
    }

    const challengeData = challengeDoc.data()!;

    // Check expiry
    if (new Date() > challengeData.expiresAt.toDate()) {
      await db.collection('webauthn-challenges').doc(userId).delete();
      return NextResponse.json({ error: 'Authentication challenge expired' }, { status: 401 });
    }

    if (challengeData.type !== 'authentication') {
      return NextResponse.json({ error: 'Invalid challenge type' }, { status: 401 });
    }

    const rpID = getRpId(request);
    const expectedOrigin = getExpectedOrigin(request);

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response: credential,
        expectedChallenge: challengeData.challenge,
        expectedOrigin,
        expectedRPID: rpID,
        credential: {
          id: credentialId, // Must be string id format
          publicKey: new Uint8Array(credentialPublicKeyObj),
          counter: storedCounter,
          transports: transports,
        },
        requireUserVerification: true,
      });
    } catch (err: any) {
      console.error('WebAuthn authentication verification failed:', err);
      // Clean up challenge on failure
      await db.collection('webauthn-challenges').doc(userId).delete();
      return NextResponse.json({ error: `Authentication verification failed: ${err.message}` }, { status: 401 });
    }

    if (!verification.verified) {
      await db.collection('webauthn-challenges').doc(userId).delete();
      return NextResponse.json({ error: 'Authentication verification failed' }, { status: 401 });
    }

    const newCounter = verification.authenticationInfo.newCounter;

    // Monotonic counter check (cloned authenticator detection)
    if (newCounter <= storedCounter && storedCounter !== 0) {
      await db.collection('webauthn-challenges').doc(userId).delete();
      console.warn(`[WebAuthn] Replay attack or cloned authenticator detected! Counter did not increase.`);
      return NextResponse.json({ error: 'Authentication verification failed: invalid authenticator state' }, { status: 401 });
    }

    // Clean up challenge
    await db.collection('webauthn-challenges').doc(userId).delete();

    const updatePayload: Record<string, any> = {
      lastUsed: new Date(),
    };

    // Re-encrypt the blob with the new counter
    if (passkeyData.encryptedBlob && passkeyData.iv && passkeyData.authTag) {
      try {
        const decryptedData = decryptCredentialBlob({
          encryptedBlob: passkeyData.encryptedBlob,
          iv: passkeyData.iv,
          authTag: passkeyData.authTag
        });

        decryptedData.counter = newCounter;

        const encryptedData = encryptCredentialBlob(decryptedData);
        updatePayload.encryptedBlob = encryptedData.encryptedBlob;
        updatePayload.iv = encryptedData.iv;
        updatePayload.authTag = encryptedData.authTag;
      } catch (e) {
        console.error('Failed to update counter in encrypted blob:', e);
      }
    } else {
      updatePayload.counter = newCounter;
    }

    // Update passkey counter and last used time
    await db.collection('passkeys').doc(passkeyDoc.id).update(updatePayload);

    // Invalidate passkey cache so next login reflects the updated counter
    invalidatePasskeyCache(userId);

    // Verify user has admin/owner permissions
    const auth = require('firebase-admin').auth();
    const userRecord = await auth.getUser(userId);
    const customClaims = userRecord.customClaims || {};

    if (customClaims.admin !== true && customClaims.owner !== true) {
      return NextResponse.json({ error: 'User does not have required permissions' }, { status: 403 });
    }

    // Option 3: Device-Bound Key Unwrapping
    // If the passkey has a wrapped master password blob, unwrap it and securely inject it into the session!
    const secret = process.env.NEXTAUTH_SECRET;
    let unwrappedMp = null;
    let encryptedSession = null;
    let encryptedMasterPassword = null;

    if (passkeyData.wrappedMasterPassword && secret) {
      try {
        const { unwrapMasterPassword } = require('@/lib/mp-wrap');
        const { encryptData } = require('@/lib/encryption');

        unwrappedMp = unwrapMasterPassword(passkeyData.wrappedMasterPassword, credentialId, secret);

        // Match the same session structure as validate-master-password/route.ts
        const sessionPayload = {
          createdAt: new Date().toISOString(),
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
          userId,
          role: customClaims.owner ? 'owner' : (customClaims.admin ? 'admin' : 'staff'),
          type: 'master-password-session'
        };

        encryptedSession = encryptData(sessionPayload, unwrappedMp);
      } catch (unwrapErr) {
        console.error('Failed to unwrap MP during passkey login (fallback needed):', unwrapErr);
      }
    }

    // Create session
    const sessionToken = randomBytes(32).toString('hex');
    const expiresAt = require('firebase-admin').firestore.Timestamp.fromMillis(
      Date.now() + 15 * 60 * 1000 // 15 minutes (aligned with standard login)
    );

    if (unwrappedMp && encryptedSession) {
      const { encryptData } = require('@/lib/encryption');
      encryptedMasterPassword = encryptData(unwrappedMp, sessionToken);

      await db.collection('sessions').doc(sessionToken).set({
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
        expiresAt,
        userId,
        authenticatedVia: 'passkey',
        type: 'webauthn-session',
        encryptedData: encryptedSession, // General session metadata
        encryptedMasterPassword, // The actual MP, encrypted with session token
        sentinelMetadata: {
          lastSignalSent: null,
          lastSignalReceived: null,
          codebookVersion: 0,
          signalCount: 0
        }
      });
    } else {
      // Fallback: MP must be provided by user prompt later
      await db.collection('sessions').doc(sessionToken).set({
        createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
        expiresAt,
        userId,
        authenticatedVia: 'passkey',
        type: 'webauthn-session',
        sentinelMetadata: {
          lastSignalSent: null,
          lastSignalReceived: null,
          codebookVersion: 0,
          signalCount: 0
        }
      });
    }

    return NextResponse.json({
      valid: true,
      message: 'Passkey authentication successful',
      sessionToken,
      expiresAt: expiresAt.toDate().toISOString(),
      userId,
      needsMasterPassword: !unwrappedMp, // Tell frontend if vault unlock is still required
      unwrappedMasterPassword: unwrappedMp || undefined
    });
  } catch (error: any) {
    console.error('Error authenticating with passkey:', error);
    return NextResponse.json({ error: 'Failed to authenticate with passkey' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return applyRateLimit(request, getHandler, { type: 'auth', testingMaxRequests: 20, productionMaxRequests: 15 });
}

export async function POST(request: NextRequest) {
  return applyRateLimit(request, postHandler, { type: 'auth', testingMaxRequests: 20, productionMaxRequests: 15 });
}
