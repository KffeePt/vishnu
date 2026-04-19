import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import {
    generateRegistrationOptions,
    verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { isoUint8Array, isoBase64URL } from '@simplewebauthn/server/helpers';
import { applyRateLimit } from '@/lib/rate-limiter';
import { computeLookupHash, encryptCredentialBlob, decryptCredentialBlob, EncryptedCredentialBlob } from '@/lib/credential-crypto';
import { getPasskeysForUserCached } from '@/lib/passkeyCache';
import { isCandymanPanelPasskey } from '@/lib/passkey-panels';

const RP_NAME = 'Vishnu Workforce Portal';

function getRpId(request: NextRequest): string {
    const host = request.headers.get('host') || '';
    const domain = process.env.NEXT_PUBLIC_DOMAIN;
    if (domain) return domain;
    return host.split(':')[0] || 'localhost';
}

function getExpectedOrigin(request: NextRequest): string {
    const origin = request.headers.get('origin');
    if (origin) return origin;
    const host = request.headers.get('host') || 'localhost';
    const proto = host.includes('localhost') ? 'http' : 'https';
    return `${proto}://${host}`;
}

/** GET /api/staff/auth/webauthn/register — returns registration options */
async function getHandler(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

        // Allow owner, admin, or staff
        const { isBootstrapOwner } = require('@/lib/ownerBootstrap');
        if (decodedToken.staff !== true && decodedToken.admin !== true && decodedToken.owner !== true && !(await isBootstrapOwner(decodedToken))) {
            return NextResponse.json({ error: 'Forbidden: Staff access required' }, { status: 403 });
        }

        const userId = decodedToken.uid;

        const rpID = getRpId(request);

        // Get existing credentials to exclude them
        const existingDocs = (await getPasskeysForUserCached(userId)).filter((doc) => isCandymanPanelPasskey(doc.data()));

        const excludeCredentials = existingDocs.map(doc => {
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
                    console.error(`Failed to decrypt blob for passkey ${doc.id}`);
                }
            }

            return {
                id: credentialID,
                transports: transports && transports.length > 0 ? transports : undefined,
            };
        }).filter(cred => cred.id !== undefined);

        const options = await generateRegistrationOptions({
            rpName: RP_NAME,
            rpID,
            userName: decodedToken.email || `user-${userId}`,
            userDisplayName: decodedToken.email || `user-${userId}`,
            userID: isoUint8Array.fromUTF8String(userId),
            attestationType: 'none',
            excludeCredentials,
            authenticatorSelection: {
                residentKey: 'required',
                requireResidentKey: true,
                userVerification: 'preferred', // Preferred for broader iOS compat
            },
        });

        // Store challenge in Firestore (TTL 5 min)
        await db.collection('webauthn-challenges').doc(userId).set({
            challenge: options.challenge,
            type: 'registration',
            expiresAt: new Date(Date.now() + 2 * 60 * 1000),
            createdAt: new Date(),
        });

        return NextResponse.json(options);
    } catch (error: any) {
        console.error('Error getting registration options:', error);
        return NextResponse.json({ error: 'Failed to get registration options' }, { status: 500 });
    }
}

/** POST /api/staff/auth/webauthn/register — verifies and stores the new passkey */
async function postHandler(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);

        // Allow owner, admin, or staff
        const { isBootstrapOwner } = require('@/lib/ownerBootstrap');
        if (decodedToken.staff !== true && decodedToken.admin !== true && decodedToken.owner !== true && !(await isBootstrapOwner(decodedToken))) {
            return NextResponse.json({ error: 'Forbidden: Staff access required' }, { status: 403 });
        }

        const userId = decodedToken.uid;

        const { name, credential } = await request.json();

        if (!name || !credential) {
            return NextResponse.json({ error: 'Missing required fields: name, credential' }, { status: 400 });
        }

        // Retrieve stored challenge
        const challengeDoc = await db.collection('webauthn-challenges').doc(userId).get();
        if (!challengeDoc.exists) {
            return NextResponse.json({ error: 'No registration challenge found' }, { status: 400 });
        }

        const challengeData = challengeDoc.data()!;

        if (new Date() > challengeData.expiresAt.toDate()) {
            await db.collection('webauthn-challenges').doc(userId).delete();
            return NextResponse.json({ error: 'Registration challenge expired' }, { status: 400 });
        }

        if (challengeData.type !== 'registration') {
            return NextResponse.json({ error: 'Invalid challenge type' }, { status: 400 });
        }

        const rpID = getRpId(request);
        const expectedOrigin = getExpectedOrigin(request);

        let verification;
        try {
            verification = await verifyRegistrationResponse({
                response: credential,
                expectedChallenge: challengeData.challenge,
                expectedOrigin,
                expectedRPID: rpID,
                requireUserVerification: true,
            });
        } catch (err: any) {
            console.error('WebAuthn registration verification failed:', err);
            return NextResponse.json({ error: `Registration verification failed: ${err.message}` }, { status: 400 });
        }

        if (!verification.verified || !verification.registrationInfo) {
            return NextResponse.json({ error: 'Registration verification failed' }, { status: 400 });
        }

        await db.collection('webauthn-challenges').doc(userId).delete();

        const { credential: cred, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;

        // Store the passkey
        const passkeysRef = db.collection('passkeys');
        const lookupHash = computeLookupHash(cred.id);
        const encryptedData = encryptCredentialBlob({
            credentialID: cred.id,
            credentialPublicKey: isoBase64URL.fromBuffer(cred.publicKey),
            transports: credential.response?.transports || [],
            counter: cred.counter,
        });

        // Option 3: Opportunistic Key Wrapping
        // If the staff is registering a passkey and they already have their MP in the session,
        // wrap it right now for this specific passkey.
        let wrappedMasterPassword = null;
        try {
            const sessionToken = request.headers.get('x-master-password-session');
            if (sessionToken) {
                const sessionDoc = await db.collection('sessions').doc(sessionToken).get();
                if (sessionDoc.exists) {
                    const sessionData = sessionDoc.data()!;
                    if (sessionData.encryptedMasterPassword) {
                        const { decryptData } = require('@/lib/encryption');
                        const mp = decryptData(sessionData.encryptedMasterPassword, sessionToken);
                        if (mp) {
                            const secret = process.env.NEXTAUTH_SECRET;
                            if (secret) {
                                const { wrapMasterPassword } = require('@/lib/mp-wrap');
                                wrappedMasterPassword = wrapMasterPassword(mp, cred.id, secret);
                            }
                        }
                    }
                }
            }
        } catch (err) {
            console.error('Failed to opportunistically wrap MP during staff passkey registration:', err);
        }

        const docPayload: Record<string, any> = {
            userId,
            name,
            isCandyman: true,
            isAdmin: false,
            lookupHash,
            encryptedBlob: encryptedData.encryptedBlob,
            iv: encryptedData.iv,
            authTag: encryptedData.authTag,
            deviceType: credentialDeviceType,
            backedUp: credentialBackedUp,
            createdAt: new Date(),
            lastUsed: new Date(),
            encryptionVersion: 1,
        };

        if (wrappedMasterPassword) {
            docPayload.wrappedMasterPassword = wrappedMasterPassword;
        }

        const docRef = await passkeysRef.add(docPayload);

        return NextResponse.json({
            message: 'Passkey registered successfully',
            id: docRef.id,
        });
    } catch (error: any) {
        console.error('Error registering passkey:', error);
        return NextResponse.json({ error: 'Failed to register passkey' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    return applyRateLimit(request, getHandler, { type: 'auth', testingMaxRequests: 20, productionMaxRequests: 15 });
}

export async function POST(request: NextRequest) {
    return applyRateLimit(request, postHandler, { type: 'auth', testingMaxRequests: 20, productionMaxRequests: 15 });
}
