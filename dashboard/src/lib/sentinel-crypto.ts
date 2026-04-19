import * as crypto from 'crypto';
import { SentinelAction, Codebook, encodeAction } from './sentinel-wordlist';

export interface EncryptedSignal {
    wrappedKey: string;     // AES key encrypted with recipient's RSA public key (base64)
    iv: string;             // AES IV (base64)
    ciphertext: string;     // Signal payload encrypted with AES key
    timestamp: number;
    codeWord: string;       // The action code word
}

export interface BroadcastSignal {
    payload: string;        // Base64 JSON of the payload
    signature: string;      // HMAC SHA-256 of payload
    timestamp: number;
    codeWord: string;
}

function getBroadcastSecret(): string {
    const broadcastSecret = process.env.SENTINEL_BROADCAST_SECRET;
    if (!broadcastSecret) {
        throw new Error('[FATAL] SENTINEL_BROADCAST_SECRET environment variable is not set.');
    }

    return broadcastSecret;
}

/**
 * Encrypts a private signal for a specific user using their Sentinel RSA public key.
 */
export function encryptSignal(action: SentinelAction, codebook: Codebook, payloadObj: any, recipientPublicKeyPem: string): EncryptedSignal {
    const codeWord = encodeAction(action, codebook);
    const payloadBuffer = Buffer.from(JSON.stringify(payloadObj), 'utf8');

    // Generate random AES-256 key and IV
    const aesKey = crypto.randomBytes(32);
    const iv = crypto.randomBytes(16);

    // Encrypt payload with AES-256-GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
    const encryptedPayload = Buffer.concat([cipher.update(payloadBuffer), cipher.final(), cipher.getAuthTag()]);

    // Wrap the AES key with the recipient's RSA public key
    const wrappedKey = crypto.publicEncrypt(
        {
            key: recipientPublicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256'
        },
        aesKey
    );

    return {
        wrappedKey: wrappedKey.toString('base64'),
        iv: iv.toString('base64'),
        ciphertext: encryptedPayload.toString('base64'),
        timestamp: Date.now(),
        codeWord
    };
}

/**
 * Creates a broadcast signal. Since we can't encrypt with multiple RSA keys easily,
 * we use HMAC to sign a plaintext payload (which shouldn't contain PII, just signals like "sync").
 */
export function createBroadcastSignal(action: SentinelAction, codebook: Codebook, payloadObj: any = {}): BroadcastSignal {
    const codeWord = encodeAction(action, codebook);
    const payloadBase64 = Buffer.from(JSON.stringify(payloadObj)).toString('base64');

    const hmac = crypto.createHmac('sha256', getBroadcastSecret());
    hmac.update(payloadBase64);
    hmac.update(codeWord);
    const signature = hmac.digest('base64');

    return {
        payload: payloadBase64,
        signature,
        timestamp: Date.now(),
        codeWord
    };
}
