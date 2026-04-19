import crypto from 'crypto';

/**
 * Server-side WebAuthn Credential Encryption & Lookup module.
 * 
 * Uses the existing NEXTAUTH_SECRET to:
 * 1. Generate an HMAC-SHA256 lookup hash (so we never store plaintext credentialIDs in Firestore)
 * 2. AES-256-GCM encrypt the credential blob (credentialID, public key, counter, transports)
 */

interface CredentialBlobData {
    credentialID: string;        // base64url encoded
    credentialPublicKey: string; // base64url encoded
    transports: string[];
    counter: number;
}

export interface EncryptedCredentialBlob {
    encryptedBlob: string; // base64
    iv: string;            // base64
    authTag: string;       // base64
}

// Ensure we have a strictly 32-byte key for AES-256-GCM by deriving it from NEXTAUTH_SECRET via SHA-256
function getCredentialKey(): Buffer {
    const secret = process.env.NEXTAUTH_SECRET;
    if (!secret) {
        throw new Error('NEXTAUTH_SECRET environment variable is missing.');
    }
    return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Computes an HMAC-SHA256 hash of the credential ID.
 * This ensures credential IDs are not stored in plaintext while remaining searchable.
 */
export function computeLookupHash(credentialId: string): string {
    const key = getCredentialKey();
    return crypto.createHmac('sha256', key).update(credentialId).digest('hex');
}

/**
 * Encrypts a credential data blob using AES-256-GCM.
 */
export function encryptCredentialBlob(data: CredentialBlobData): EncryptedCredentialBlob {
    const key = getCredentialKey();
    const iv = crypto.randomBytes(12); // Standard GCM nonce size

    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const jsonStr = JSON.stringify(data);
    const encrypted = Buffer.concat([cipher.update(jsonStr, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return {
        encryptedBlob: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
    };
}

/**
 * Decrypts an AES-256-GCM encrypted credential blob.
 */
export function decryptCredentialBlob(encrypted: EncryptedCredentialBlob): CredentialBlobData {
    const key = getCredentialKey();
    const iv = Buffer.from(encrypted.iv, 'base64');
    const authTag = Buffer.from(encrypted.authTag, 'base64');
    const ciphertext = Buffer.from(encrypted.encryptedBlob, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    try {
        const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
        return JSON.parse(decrypted.toString('utf8')) as CredentialBlobData;
    } catch (err: any) {
        throw new Error(`Failed to decrypt credential blob: ${err.message}`);
    }
}
