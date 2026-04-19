export interface DecryptedSignal {
    payload: any;
    timestamp: number;
    codeWord: string;
}

// Base64 to Uint8Array helper
function b64ToArrayBuffer(base64: string): ArrayBuffer {
    const binaryString = window.atob(base64);
    const len = binaryString.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
        bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
}

/**
 * Decrypts a private signal using the Web Crypto API.
 */
export async function decryptSignal(
    wrappedKeyB64: string,
    ivB64: string,
    ciphertextB64: string,
    privateKey: CryptoKey,
    codeWord: string,
    timestamp: number
): Promise<DecryptedSignal> {
    const wrappedKeyBuffer = b64ToArrayBuffer(wrappedKeyB64);
    const iv = b64ToArrayBuffer(ivB64);
    const ciphertext = b64ToArrayBuffer(ciphertextB64);

    // 1. Unwrap the AES-256-GCM key using the RSA-OAEP private key
    // Web Crypto API `unwrapKey` is strict, so we'll decrypt the raw bytes manually instead.
    const rawAesKeyBuffer = await window.crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        privateKey,
        wrappedKeyBuffer
    );

    // 2. Import the raw AES-256-GCM key
    const aesKey = await window.crypto.subtle.importKey(
        'raw',
        rawAesKeyBuffer,
        { name: 'AES-GCM' },
        false,
        ['decrypt']
    );

    // 3. Decrypt the payload
    const decryptedBuffer = await window.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv },
        aesKey,
        ciphertext
    );

    const decoder = new TextDecoder('utf-8');
    const payloadStr = decoder.decode(decryptedBuffer);

    return {
        payload: JSON.parse(payloadStr),
        timestamp,
        codeWord
    };
}

/**
 * Verifies a broadcast signal's HMAC-SHA256 signature and decodes its payload.
 * Uses NEXT_PUBLIC_SENTINEL_BROADCAST_SECRET as the verification key,
 * providing cryptographic defense-in-depth independent of RTDB security rules.
 */
export async function verifyBroadcastSignal(
    payloadB64: string,
    signatureB64: string,
    codeWord: string,
    timestamp: number
): Promise<DecryptedSignal | null> {
    try {
        const secret = process.env.NEXT_PUBLIC_SENTINEL_BROADCAST_SECRET;
        if (!secret) {
            console.error('[FATAL] NEXT_PUBLIC_SENTINEL_BROADCAST_SECRET is not set. Cannot verify broadcast signal.');
            return null;
        }

        // Import the secret as an HMAC-SHA256 key
        const keyMaterial = new TextEncoder().encode(secret);
        const cryptoKey = await window.crypto.subtle.importKey(
            'raw',
            keyMaterial,
            { name: 'HMAC', hash: 'SHA-256' },
            false,
            ['verify']
        );

        // Reconstruct the signed data: payloadB64 + codeWord (must match server signing order)
        const signedData = new TextEncoder().encode(payloadB64 + codeWord);
        const signatureBuffer = b64ToArrayBuffer(signatureB64);

        const isValid = await window.crypto.subtle.verify('HMAC', cryptoKey, signatureBuffer, signedData);
        if (!isValid) {
            console.error('[Sentinel] Broadcast signal HMAC verification failed. Signal rejected.');
            return null;
        }

        const payloadStr = new TextDecoder().decode(b64ToArrayBuffer(payloadB64));
        return {
            payload: JSON.parse(payloadStr),
            timestamp,
            codeWord
        };
    } catch (e) {
        console.error("Failed to verify or parse broadcast signal:", e);
        return null;
    }
}
