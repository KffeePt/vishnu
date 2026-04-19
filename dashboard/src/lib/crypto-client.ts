/**
 * Client-side cryptography utilities using the Web Crypto API.
 * This module MUST only be used in browser contexts (client components).
 * The server NEVER sees raw private keys or master passwords.
 *
 * Architecture:
 *  - RSA-OAEP (2048-bit, SHA-256) for asymmetric encryption of inventory payloads
 *  - AES-256-GCM for wrapping (encrypting) the RSA private key with the master password
 *  - PBKDF2 (SHA-256, 200k iterations) for deriving the AES key from the master password
 */

const RSA_ALGORITHM = {
    name: 'RSA-OAEP',
    modulusLength: 2048,
    publicExponent: new Uint8Array([1, 0, 1]),
    hash: 'SHA-256',
} as const;

const AES_ALGORITHM = 'AES-GCM';
const AES_KEY_LENGTH = 256;
const PBKDF2_ITERATIONS = 200_000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12;

// ─── Helpers ────────────────────────────────────────────────────────────────

function bufferToBase64(buffer: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buffer)));
}

function base64ToBuffer(base64: string): ArrayBuffer {
    const cleaned = base64.replace(/[\s\n\r]/g, '').replace(/-/g, '+').replace(/_/g, '/');
    const padded = cleaned.padEnd(cleaned.length + (4 - cleaned.length % 4) % 4, '=');
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

// ─── RSA Key Generation ──────────────────────────────────────────────────────

/**
 * Generates a new RSA-OAEP 2048-bit keypair.
 */
export async function generateRSAKeyPair(): Promise<CryptoKeyPair> {
    return crypto.subtle.generateKey(RSA_ALGORITHM, true, ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']);
}

// ─── Public Key Export / Import ──────────────────────────────────────────────

/**
 * Exports a CryptoKey public key to a base64-encoded SPKI string.
 * This is safe to store on the server.
 */
export async function exportPublicKey(publicKey: CryptoKey): Promise<string> {
    const spki = await crypto.subtle.exportKey('spki', publicKey);
    return bufferToBase64(spki);
}

/**
 * Returns a short fingerprint for a base64 public key for diagnostic logging.
 */
export async function fingerprintKey(publicKeyBase64: string): Promise<string> {
    const hash = await crypto.subtle.digest('SHA-256', base64ToBuffer(publicKeyBase64));
    return bufferToBase64(hash).substring(0, 12);
}

/**
 * Imports a base64-encoded SPKI public key back to a CryptoKey for encryption.
 */
export async function importPublicKey(base64Spki: string): Promise<CryptoKey> {
    const spki = base64ToBuffer(base64Spki);
    return crypto.subtle.importKey('spki', spki, RSA_ALGORITHM, false, ['encrypt', 'wrapKey']);
}

// ─── Private Key Wrapping / Unwrapping ──────────────────────────────────────

export interface WrappedPrivateKey {
    wrappedKey: string; // base64
    salt: string;       // base64
    iv: string;         // base64
}

/**
 * Derives an AES-256-GCM key from the master password using PBKDF2.
 */
async function deriveAESKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
        'raw',
        enc.encode(password),
        'PBKDF2',
        false,
        ['deriveKey']
    );
    return crypto.subtle.deriveKey(
        {
            name: 'PBKDF2',
            salt: salt.buffer as ArrayBuffer,
            iterations: PBKDF2_ITERATIONS,
            hash: 'SHA-256',
        },
        keyMaterial,
        { name: AES_ALGORITHM, length: AES_KEY_LENGTH },
        false,
        ['wrapKey', 'unwrapKey']
    );
}

/**
 * Wraps (encrypts) an RSA private key using AES-256-GCM derived from the master password.
 * Returns base64-encoded wrappedKey, salt, and iv — safe to store on the server.
 * The raw private key NEVER leaves the browser.
 */
export async function wrapPrivateKey(
    privateKey: CryptoKey,
    masterPassword: string
): Promise<WrappedPrivateKey> {
    const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
    const iv = crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const aesKey = await deriveAESKey(masterPassword, salt);

    const wrappedKey = await crypto.subtle.wrapKey('pkcs8', privateKey, aesKey, {
        name: AES_ALGORITHM,
        iv,
    });

    return {
        wrappedKey: bufferToBase64(wrappedKey),
        salt: bufferToBase64(salt.buffer),
        iv: bufferToBase64(iv.buffer),
    };
}

/**
 * Unwraps (decrypts) a previously wrapped RSA private key using the master password.
 * Throws if the password is wrong or the data is corrupted.
 */
export async function unwrapPrivateKey(
    wrapped: WrappedPrivateKey,
    masterPassword: string
): Promise<CryptoKey> {
    const salt = new Uint8Array(base64ToBuffer(wrapped.salt));
    const iv = new Uint8Array(base64ToBuffer(wrapped.iv));
    const wrappedKeyBuffer = base64ToBuffer(wrapped.wrappedKey);

    const aesKey = await deriveAESKey(masterPassword, salt);

    return crypto.subtle.unwrapKey(
        'pkcs8',
        wrappedKeyBuffer,
        aesKey,
        { name: AES_ALGORITHM, iv },
        RSA_ALGORITHM,
        false,
        ['decrypt', 'unwrapKey']
    );
}

// ─── Encrypt / Decrypt with RSA ──────────────────────────────────────────────

/**
 * Encrypts a plaintext string with the staff member's RSA public key.
 * Returns a base64-encoded ciphertext. Only the holder of the matching
 * private key (the staff member) can decrypt this.
 */
export async function encryptWithPublicKey(
    plaintext: string,
    publicKeyBase64: string
): Promise<string> {
    const publicKey = await importPublicKey(publicKeyBase64);
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'RSA-OAEP' },
        publicKey,
        enc.encode(plaintext)
    );
    return bufferToBase64(ciphertext);
}

/**
 * Decrypts a base64-encoded RSA-OAEP ciphertext using the staff member's private key.
 * The private key must first be unwrapped via unwrapPrivateKey().
 */
export async function decryptWithPrivateKey(
    ciphertextBase64: string,
    privateKey: CryptoKey
): Promise<string> {
    const ciphertext = base64ToBuffer(ciphertextBase64);
    const plaintext = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        ciphertext
    );
    return new TextDecoder().decode(plaintext);
}

// ─── Envelope Encryption (DEK + Dual-Key Wrapping) ──────────────────────────

export interface EnvelopeEncryptedPayload {
    encryptedData: string;   // base64 AES-GCM ciphertext
    iv: string;              // base64 AES-GCM IV
    staffWrappedDEK: string; // base64 RSA-OAEP wrapped DEK (for staff)
    adminWrappedDEK: string; // fallback base64 RSA-OAEP wrapped DEK
    adminWrappedDEKs?: Record<string, string>; // Map of admin UID -> wrapped DEK
    encryptionVersion: 2;
}

/**
 * Generates a random AES-256-GCM Data Encryption Key (DEK).
 */
export async function generateDEK(): Promise<CryptoKey> {
    return crypto.subtle.generateKey(
        { name: 'AES-GCM', length: 256 },
        true, // extractable so we can wrap it
        ['encrypt', 'decrypt', 'wrapKey', 'unwrapKey']
    );
}

/**
 * Encrypts plaintext with an AES-256-GCM DEK.
 */
export async function encryptWithDEK(
    plaintext: string,
    dek: CryptoKey
): Promise<{ encryptedData: string; iv: string }> {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const enc = new TextEncoder();
    const ciphertext = await crypto.subtle.encrypt(
        { name: 'AES-GCM', iv },
        dek,
        enc.encode(plaintext)
    );
    return {
        encryptedData: bufferToBase64(ciphertext),
        iv: bufferToBase64(iv.buffer),
    };
}

/**
 * Decrypts AES-256-GCM ciphertext with a DEK.
 */
export async function decryptWithDEK(
    encryptedData: string,
    iv: string,
    dek: CryptoKey
): Promise<string> {
    const ciphertext = base64ToBuffer(encryptedData);
    const ivBuffer = new Uint8Array(base64ToBuffer(iv));
    const plaintext = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBuffer },
        dek,
        ciphertext
    );
    return new TextDecoder().decode(plaintext);
}

/**
 * Wraps (encrypts) a DEK with an RSA-OAEP public key.
 * Returns base64-encoded wrapped DEK.
 */
export async function wrapDEKWithPublicKey(
    dek: CryptoKey,
    publicKeyBase64: string
): Promise<string> {
    const publicKey = await importPublicKey(publicKeyBase64);
    const wrapped = await crypto.subtle.wrapKey('raw', dek, publicKey, { name: 'RSA-OAEP' });
    return bufferToBase64(wrapped);
}

/**
 * Unwraps (decrypts) a DEK using an RSA-OAEP private key.
 */
export async function unwrapDEKWithPrivateKey(
    wrappedDEKBase64: string,
    privateKey: CryptoKey
): Promise<CryptoKey> {
    const wrappedDEK = base64ToBuffer(wrappedDEKBase64);
    return crypto.subtle.unwrapKey(
        'raw',
        wrappedDEK,
        privateKey,
        { name: 'RSA-OAEP' },
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt', 'unwrapKey']
    );
}

/**
 * Full envelope encrypt: generates a DEK, encrypts the payload with it,
 * then wraps the DEK with BOTH the staff's and all admins' RSA public keys.
 * Neither key holder can read the other's wrapped DEK — but all authorized can decrypt the data.
 */
export async function envelopeEncrypt(
    plaintext: string,
    staffPublicKeyBase64: string,
    adminPublicKeysInfo: { uid: string, publicKey: string }[] | string
): Promise<EnvelopeEncryptedPayload> {
    const dek = await generateDEK();
    const { encryptedData, iv } = await encryptWithDEK(plaintext, dek);

    // Support legacy scalar admin key
    const adminKeys = typeof adminPublicKeysInfo === 'string'
        ? [{ uid: 'legacy', publicKey: adminPublicKeysInfo }]
        : adminPublicKeysInfo;

    const wrapPromises = [wrapDEKWithPublicKey(dek, staffPublicKeyBase64)];
    const adminUids: string[] = [];

    // Queue up all admin key wraps
    for (const admin of adminKeys) {
        wrapPromises.push(wrapDEKWithPublicKey(dek, admin.publicKey));
        adminUids.push(admin.uid);
    }

    const [staffWrappedDEK, ...wrappedAdminDEKs] = await Promise.all(wrapPromises);

    const adminWrappedDEKs: Record<string, string> = {};
    for (let i = 0; i < adminUids.length; i++) {
        adminWrappedDEKs[adminUids[i]] = wrappedAdminDEKs[i];
    }

    return {
        encryptedData,
        iv,
        staffWrappedDEK,
        adminWrappedDEK: wrappedAdminDEKs[0], // fallback for easiest legacy parsing
        adminWrappedDEKs,
        encryptionVersion: 2
    };
}

/**
 * Decrypts an envelope-encrypted payload using the recipient's private key.
 * Pass either staffWrappedDEK or adminWrappedDEK depending on who is decrypting.
 */
export async function envelopeDecrypt(
    payload: EnvelopeEncryptedPayload,
    wrappedDEK: string,
    privateKey: CryptoKey
): Promise<string> {
    const dek = await unwrapDEKWithPrivateKey(wrappedDEK, privateKey);
    return decryptWithDEK(payload.encryptedData, payload.iv, dek);
}
