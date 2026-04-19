import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/config/firebase-admin';
import { TOTP, Secret } from 'otpauth';
import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { getTotpStatusCached } from '@/lib/totpCache';

// Derive a 32-byte AES key from the env var using SHA-256
function getTotpEncryptionKey(): Buffer {
const secret = process.env.TOTP_ENCRYPTION_KEY || 'vishnu-totp-default-key-change-in-prod';
    return createHash('sha256').update(secret).digest();
}

function encryptSecret(plaintext: string): string {
    const key = getTotpEncryptionKey();
    const iv = randomBytes(16);
    const cipher = createCipheriv('aes-256-cbc', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decryptSecret(ciphertext: string): string {
    const key = getTotpEncryptionKey();
    const [ivHex, encHex] = ciphertext.split(':');
    const iv = Buffer.from(ivHex, 'hex');
    const encrypted = Buffer.from(encHex, 'hex');
    const decipher = createDecipheriv('aes-256-cbc', key, iv);
    return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

/** GET /api/staff/auth/totp/setup — check if TOTP is enabled for the user */
export async function GET(request: NextRequest) {
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

        const totpData = await getTotpStatusCached(userId);
        if (!totpData.exists) {
            return NextResponse.json({ enabled: false });
        }

        if (!totpData.verified) {
            // Unverified — return secret so client can resume setup
            try {
                const secretBase32 = decryptSecret(totpData.encryptedSecret!);
                const totp = new TOTP({
      issuer: 'Vishnu Workforce Portal',
                    label: decodedToken.email || `user-${userId}`,
                    algorithm: 'SHA1',
                    digits: 6,
                    period: 30,
                    secret: Secret.fromBase32(secretBase32),
                });

                return NextResponse.json({
                    enabled: false,
                    pendingSetup: true,
                    qrCodeUri: totp.toString(),
                    secret: secretBase32,
                });
            } catch (err) {
                console.error('Error decrypting pending TOTP secret:', err);
                return NextResponse.json({ enabled: false });
            }
        }

        return NextResponse.json({ enabled: true });
    } catch (error: any) {
        console.error('Error checking TOTP status:', error);
        return NextResponse.json({ error: 'Failed to check TOTP status' }, { status: 500 });
    }
}

/** POST /api/staff/auth/totp/setup — generate a new TOTP secret and return QR code URI */
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

        // Generate a new TOTP secret
        const secret = new Secret({ size: 20 });
        const secretBase32 = secret.base32;

        const totp = new TOTP({
      issuer: 'Vishnu Workforce Portal',
            label: decodedToken.email || `user-${userId}`,
            algorithm: 'SHA1',
            digits: 6,
            period: 30,
            secret,
        });

        const qrCodeUri = totp.toString(); // otpauth:// URI

        // Store encrypted secret (unverified until user confirms)
        await db.collection('totp-secrets').doc(userId).set({
            encryptedSecret: encryptSecret(secretBase32),
            verified: false,
            createdAt: new Date(),
            updatedAt: new Date(),
        });

        return NextResponse.json({
            qrCodeUri,
            secret: secretBase32, // Also return for manual entry
        });
    } catch (error: any) {
        console.error('Error setting up TOTP:', error);
        return NextResponse.json({ error: 'Failed to set up authenticator' }, { status: 500 });
    }
}

/** DELETE /api/staff/auth/totp/setup — remove TOTP for the user */
export async function DELETE(request: NextRequest) {
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

        await db.collection('totp-secrets').doc(userId).delete();

        return NextResponse.json({ message: 'Authenticator removed successfully' });
    } catch (error: any) {
        console.error('Error removing TOTP:', error);
        return NextResponse.json({ error: 'Failed to remove authenticator' }, { status: 500 });
    }
}
