import crypto from 'crypto';
import { db } from '@/config/firebase-admin';

/**
 * Server-side utility for device-bound Master Password wrapping.
 *
 * This implements "Option 3": When a user registers a passkey or TOTP (or logs in 
 * with their master password), we wrap the raw master password using a key derived
 * from the UNIQUE credential ID (or TOTP secret) + a server-side secret.
 *
 * On passkey/TOTP login, we use the credential ID to reconstruct the wrapping key,
 * unwrap the master password, and seamlessly encrypt it into their session.
 * 
 * The raw master password is NEVER stored in Firestore.
 * The wrapped master password requires both the credential ID AND the server secret to unwrap.
 */

export interface WrappedMPBlob {
    encryptedBlob: string; // base64
    iv: string;            // base64
    authTag: string;       // base64
}

// -----------------------------------------------------------------------------
// Core Crypto Operations (AES-256-GCM)
// -----------------------------------------------------------------------------

/**
 * Dervies a 32-byte AES-256-GCM key from a binding ID and a server secret.
 * @param bindingId The unique credential ID or TOTP secret
 * @param serverSecret The NEXTAUTH_SECRET or TOTP_ENCRYPTION_KEY
 */
function deriveWrappingKey(bindingId: string, serverSecret: string): Buffer {
    if (!serverSecret) {
        throw new Error('Server secret is required for key derivation.');
    }
    // Use HMAC-SHA256 to derive strictly 32 bytes for AES-256
    return crypto.createHmac('sha256', serverSecret)
        .update(bindingId + ':mp-wrap')
        .digest();
}

/**
 * Wraps the master password using a key derived from the bindingId and serverSecret.
 */
export function wrapMasterPassword(masterPassword: string, bindingId: string, serverSecret: string): WrappedMPBlob {
    const key = deriveWrappingKey(bindingId, serverSecret);
    const iv = crypto.randomBytes(12); // GCM standard nonce size

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    // We only need to encrypt the raw string
    const encrypted = Buffer.concat([cipher.update(masterPassword, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        encryptedBlob: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
    };
}

/**
 * Unwraps the master password using the bindingId and serverSecret.
 */
export function unwrapMasterPassword(blob: WrappedMPBlob, bindingId: string, serverSecret: string): string {
    const key = deriveWrappingKey(bindingId, serverSecret);
    const iv = Buffer.from(blob.iv, 'base64');
    const authTag = Buffer.from(blob.authTag, 'base64');
    const ciphertext = Buffer.from(blob.encryptedBlob, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    try {
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return decrypted.toString('utf8');
    } catch (err: any) {
        throw new Error(`Failed to unwrap master password: ${err.message}`);
    }
}

// -----------------------------------------------------------------------------
// High-Level Firestore Operations
// -----------------------------------------------------------------------------

/**
 * Checks all passkeys for the given user, and wraps the master password for each one
 * that doesn't already have a valid wrapper for this password.
 * (Called during password login or master password change).
 */
export async function wrapForAllPasskeys(masterPassword: string, userId: string): Promise<void> {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) throw new Error('NEXTAUTH_SECRET is missing');

    const passkeysSnapshot = await db.collection('passkeys')
        .where('userId', '==', userId)
        .get();

    if (passkeysSnapshot.empty) return;

    const batch = db.batch();

    for (const doc of passkeysSnapshot.docs) {
        const data = doc.data();
        let credentialId = data.credentialID as string;

        // Handle encrypted credential blobs if they exist
        if (data.encryptedBlob && data.iv && data.authTag) {
            try {
                // Must duplicate decryptCredentialBlob logic partially since we can't easily 
                // circular import from credential-crypto.ts without refactoring it.
                // We'll just grab the plaintext credentialId if available, or if it's new-style,
                // we rely on the decrypted value (we assume it's stored in credentialID for legacy 
                // but the crypto file relies on the blob). We MUST use the exact ID that was registered.
                // To be safe, we use the plaintext one stored on the doc or fall back to decrypting the blob.

                // Let's import the decrypt function inline to avoid circular deps if they occur
                const { decryptCredentialBlob } = require('./credential-crypto');
                const decryptedData = decryptCredentialBlob({
                    encryptedBlob: data.encryptedBlob,
                    iv: data.iv,
                    authTag: data.authTag
                });
                credentialId = decryptedData.credentialID;
            } catch (err) {
                console.warn(`Could not decrypt passkey blob for ${doc.id} during wrap, skipping.`);
                continue;
            }
        }

        if (!credentialId) continue;

        const wrapped = wrapMasterPassword(masterPassword, credentialId, secret);
        batch.update(doc.ref, { wrappedMasterPassword: wrapped });
    }

    await batch.commit();
}

/**
 * Checks if the user has TOTP enabled, and wraps the master password using the TOTP secret.
 * (Called during password login or master password change).
 */
export async function wrapForTotp(masterPassword: string, userId: string): Promise<void> {
    // 1. We need the TOTP encryption key to decrypt the stored secret
    const totpKeyBase = process.env.TOTP_ENCRYPTION_KEY;
    if (!totpKeyBase) throw new Error('[FATAL] TOTP_ENCRYPTION_KEY environment variable is not set.');
    const totpEncryptionKey = crypto.createHash('sha256').update(totpKeyBase).digest();

    const totpDoc = await db.collection('totp-secrets').doc(userId).get();
    if (!totpDoc.exists) return;

    const data = totpDoc.data()!;
    if (!data.verified || !data.encryptedSecret) return;

    // 2. Decrypt the secret
    let plaintextSecret: string;
    try {
        const [ivHex, encHex] = data.encryptedSecret.split(':');
        const iv = Buffer.from(ivHex, 'hex');
        const encrypted = Buffer.from(encHex, 'hex');
        const decipher = crypto.createDecipheriv('aes-256-cbc', totpEncryptionKey, iv);
        plaintextSecret = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
    } catch (err) {
        console.warn('Could not decrypt TOTP secret during wrap, skipping.');
        return;
    }

    // 3. Wrap the MP using the plaintext secret + the base key (as the server secret)
    const wrapped = wrapMasterPassword(masterPassword, plaintextSecret, totpKeyBase);

    await db.collection('totp-secrets').doc(userId).update({
        wrappedMasterPassword: wrapped
    });
}
