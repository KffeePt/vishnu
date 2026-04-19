import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { adminAuthMiddleware } from '@/middleware/adminAuthMiddleware';
import { TOTP, Secret } from 'otpauth';
import { createDecipheriv, createHash, randomBytes } from 'crypto';

function getTotpEncryptionKey(): Buffer {
const secret = process.env.TOTP_ENCRYPTION_KEY || 'vishnu-totp-default-key-change-in-prod';
    return createHash('sha256').update(secret).digest();
}

function decryptSecret(ciphertext: string): string {
    const key = getTotpEncryptionKey();
    const [ivHex, encHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/**
 * POST /api/admin/auth/totp/verify
 * Body: { code: string, mode: 'enroll' | 'authenticate' }
 *
 * 'enroll' — verifies code during setup, marks secret as verified
 * 'authenticate' — verifies code and creates a session
 */
export async function POST(request: NextRequest) {
    try {
        const authResult = await adminAuthMiddleware(request);
        if (authResult) return authResult;

        const authHeader = request.headers.get('authorization')!;
        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);
        const userId = decodedToken.uid;

        const { code, mode } = await request.json();

        if (!code || typeof code !== 'string') {
            return NextResponse.json({ error: 'Missing code' }, { status: 400 });
        }
        if (mode !== 'enroll' && mode !== 'authenticate') {
            return NextResponse.json({ error: 'Invalid mode — must be enroll or authenticate' }, { status: 400 });
        }

        // Retrieve stored TOTP secret
        const totpDoc = await db.collection('totp-secrets').doc(userId).get();
        if (!totpDoc.exists) {
            return NextResponse.json({ error: 'No authenticator set up for this user' }, { status: 404 });
        }

        const totpData = totpDoc.data()!;

        // For authentication mode, require the secret to be verified (enrolled)
        if (mode === 'authenticate' && !totpData.verified) {
            return NextResponse.json({ error: 'Authenticator setup not completed' }, { status: 400 });
        }

        // Decrypt and reconstruct TOTP
        const secretBase32 = decryptSecret(totpData.encryptedSecret);
        const totp = new TOTP({
      issuer: 'Vishnu Control Center',
            label: decodedToken.email || `user-${userId}`,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: Secret.fromBase32(secretBase32),
        });

        // Validate with ±1 window (allows 30s clock drift)
        const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
        if (delta === null) {
            return NextResponse.json({ error: 'Invalid or expired code — please try again' }, { status: 401 });
        }

        if (mode === 'enroll') {
            // Mark as verified
            await db.collection('totp-secrets').doc(userId).update({
                verified: true,
                verifiedAt: new Date(),
                updatedAt: new Date(),
            });
            return NextResponse.json({ verified: true });
        }

        // mode === 'authenticate' — create a session
        const userRecord = await require('firebase-admin').auth().getUser(userId);
        const customClaims = userRecord.customClaims || {};
        if (customClaims.admin !== true && customClaims.owner !== true) {
            return NextResponse.json({ error: 'User does not have required permissions' }, { status: 403 });
        }

        // Option 3: Device-Bound Key Unwrapping for TOTP
        // If the TOTP doc has a wrapped master password blob, unwrap it using the decrypted TOTP secret
    const baseSecret = process.env.TOTP_ENCRYPTION_KEY || 'vishnu-totp-default-key-change-in-prod';
        let unwrappedMp = null;
        let encryptedSession = null;
        let encryptedMasterPassword = null;

        if (totpData.wrappedMasterPassword) {
            try {
                const { unwrapMasterPassword } = require('@/lib/mp-wrap');
                const { encryptData } = require('@/lib/encryption');

                // secretBase32 is the plaintext TOTP secret decoded earlier in this file
                unwrappedMp = unwrapMasterPassword(totpData.wrappedMasterPassword, secretBase32, baseSecret);

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
                console.error('Failed to unwrap MP during TOTP login (fallback needed):', unwrapErr);
            }
        }

        let sessionToken = randomBytes(32).toString('hex');
        try {
            const existingSessionToken = request.headers.get('x-master-password-session');
            if (existingSessionToken) {
                const sessionDoc = await db.collection('sessions').doc(existingSessionToken).get();
                if (sessionDoc.exists) {
                    const sessionData = sessionDoc.data()!;
                    if (sessionData.encryptedMasterPassword) {
                        const { decryptData } = require('@/lib/encryption');
                        const mp = decryptData(sessionData.encryptedMasterPassword, existingSessionToken);
                        // If we successfully decrypted an MP from an existing session,
                        // we should use that session token and potentially update unwrappedMp
                        sessionToken = existingSessionToken;
                        unwrappedMp = mp; // Use the MP from the existing session
                    }
                }
            }
        } catch (e) {
            console.error('Error trying to retrieve existing session for opportunistic MP unwrapping:', e);
            // Continue with a new session token if retrieval fails
        }

        const expiresAt = require('firebase-admin').firestore.Timestamp.fromMillis(
            Date.now() + 30 * 60 * 1000 // 30 minutes (aligned with standard login)
        );

        if (unwrappedMp && encryptedSession) {
            const { encryptData } = require('@/lib/encryption');
            encryptedMasterPassword = encryptData(unwrappedMp, sessionToken);

            await db.collection('sessions').doc(sessionToken).set({
                createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
                expiresAt,
                userId,
                authenticatedVia: 'totp',
                type: 'totp-session',
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
            // Fallback: MP will be requested
            await db.collection('sessions').doc(sessionToken).set({
                createdAt: require('firebase-admin').firestore.FieldValue.serverTimestamp(),
                expiresAt,
                userId,
                authenticatedVia: 'totp',
                type: 'totp-session',
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
            sessionToken,
            expiresAt: expiresAt.toDate().toISOString(),
            userId,
            needsMasterPassword: !unwrappedMp, // Tell frontend if vault unlock is still required
            unwrappedMasterPassword: unwrappedMp || undefined
        });
    } catch (error: any) {
        console.error('Error verifying TOTP:', error);
        return NextResponse.json({ error: 'Failed to verify code' }, { status: 500 });
    }
}
