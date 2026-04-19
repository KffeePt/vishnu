import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { TOTP, Secret } from 'otpauth';
import { createDecipheriv, createHash, randomBytes } from 'crypto';
import { getTotpStatusCached } from '@/lib/totpCache';

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
 * POST /api/staff/auth/totp/verify
 * Body: { code: string, mode: 'enroll' | 'authenticate' }
 */
export async function POST(request: NextRequest) {
    try {
        const authHeader = request.headers.get('authorization');
        if (!authHeader?.startsWith('Bearer ')) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const token = authHeader.split('Bearer ')[1];
        const decodedToken = await require('firebase-admin').auth().verifyIdToken(token);
        const { isBootstrapOwner } = require('@/lib/ownerBootstrap');
        if (decodedToken.staff !== true && decodedToken.admin !== true && decodedToken.owner !== true && !(await isBootstrapOwner(decodedToken))) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const userId = decodedToken.uid;
        const { code, mode } = await request.json();

        if (!code || typeof code !== 'string') {
            return NextResponse.json({ error: 'Missing code' }, { status: 400 });
        }
        if (mode !== 'enroll' && mode !== 'authenticate') {
            return NextResponse.json({ error: 'Invalid mode — must be enroll or authenticate' }, { status: 400 });
        }

        const totpData = await getTotpStatusCached(userId);
        if (!totpData.exists) {
            return NextResponse.json({ error: 'No authenticator set up for this user' }, { status: 404 });
        }

        if (mode === 'authenticate' && !totpData.verified) {
            return NextResponse.json({ error: 'Authenticator setup not completed' }, { status: 400 });
        }

        const secretBase32 = decryptSecret(totpData.encryptedSecret!);
        const totp = new TOTP({
      issuer: 'Vishnu Workforce Portal',
            label: decodedToken.email || `user-${userId}`,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret: Secret.fromBase32(secretBase32),
        });

        const delta = totp.validate({ token: code.replace(/\s/g, ''), window: 1 });
        if (delta === null) {
            return NextResponse.json({ error: 'Invalid or expired code' }, { status: 401 });
        }

        if (mode === 'enroll') {
            await db.collection('totp-secrets').doc(userId).update({
                verified: true,
                verifiedAt: new Date(),
                updatedAt: new Date(),
            });

            // Option 3: If staff is enrolling TOTP and already has their MP unlocked (e.g. they are in the dash),
            // wrap it right now so their next login is seamless.
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
                                const { wrapForTotp } = require('@/lib/mp-wrap');
                                await wrapForTotp(mp, userId);
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Failed to opportunistically wrap MP during TOTP enroll:', err);
            }

            return NextResponse.json({ verified: true });
        }

        // Option 3: Device-Bound Key Unwrapping for TOTP
    const baseSecret = process.env.TOTP_ENCRYPTION_KEY || 'vishnu-totp-default-key-change-in-prod';
        let unwrappedMp = null;
        let encryptedSession = null;
        let encryptedMasterPassword = null;

        if (totpData.wrappedMasterPassword) {
            try {
                const { unwrapMasterPassword } = require('@/lib/mp-wrap');
                const { encryptData } = require('@/lib/encryption');

                unwrappedMp = unwrapMasterPassword(totpData.wrappedMasterPassword, secretBase32, baseSecret);

                // Match the same session structure
                const sessionPayload = {
                    createdAt: new Date().toISOString(),
                    expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
                    userId,
                    role: decodedToken.staff ? 'staff' : (decodedToken.admin ? 'admin' : 'owner'),
                    type: 'master-password-session'
                };

                encryptedSession = encryptData(sessionPayload, unwrappedMp);
            } catch (unwrapErr) {
                console.error('Failed to unwrap MP during staff TOTP login (fallback needed):', unwrapErr);
            }
        }

        // mode === 'authenticate' — create session
        const sessionToken = randomBytes(32).toString('hex');
        const expiresAt = require('firebase-admin').firestore.Timestamp.fromMillis(
            Date.now() + 30 * 60 * 1000 // 30 minutes
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
                role: decodedToken.staff ? 'staff' : (decodedToken.admin ? 'admin' : 'owner'),
                encryptedData: encryptedSession,
                encryptedMasterPassword,
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
                role: decodedToken.staff ? 'staff' : (decodedToken.admin ? 'admin' : 'owner'),
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
