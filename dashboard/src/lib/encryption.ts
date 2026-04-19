import crypto from 'crypto';
import bcrypt from 'bcryptjs';

/**
 * Encryption utilities using AES-256-GCM with PBKDF2 key derivation from master password
 */

const ENCRYPTION_ALGORITHM = 'aes-256-gcm';
const KEY_DERIVATION_ITERATIONS = 100000;
const SALT_LENGTH = 32;
const IV_LENGTH = 12; // Standard nonce size for GCM
const KEY_LENGTH = 32; // 256 bits

// Cache for derived keys to improve performance of repeated operations
// Key: "masterPassword|saltBase64", Value: { key: Buffer, timestamp: number }
const keyCache = new Map<string, { key: Buffer; timestamp: number }>();
const CACHE_TTL_MS = 1000 * 60 * 60; // 1 hour

/**
 * Derives encryption key from master password using PBKDF2 with caching
 * @param masterPassword The master password to derive key from
 * @param salt Salt for key derivation (optional, generates random if not provided)
 * @returns Object containing derived key and salt
 */
export function deriveKeyFromPassword(masterPassword: string, salt?: Buffer): { key: Buffer; salt: Buffer } {
  const usedSalt = salt || crypto.randomBytes(SALT_LENGTH);
  const saltBase64 = usedSalt.toString('base64');
  const cacheKey = `${masterPassword}|${saltBase64}`;

  // Check cache if salt was provided (meaning we are decrypting or re-using a specific salt setup)
  if (salt) {
    const cached = keyCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
      return { key: cached.key, salt: usedSalt };
    }
  }

  const key = crypto.pbkdf2Sync(
    masterPassword,
    usedSalt,
    KEY_DERIVATION_ITERATIONS,
    KEY_LENGTH,
    'sha256'
  );

  // Cache the derived key
  keyCache.set(cacheKey, { key, timestamp: Date.now() });

  // Clean up old cache entries periodically (simple probability-based cleanup)
  if (Math.random() < 0.01) {
    const now = Date.now();
    for (const [k, v] of keyCache.entries()) {
      if (now - v.timestamp > CACHE_TTL_MS) keyCache.delete(k);
    }
  }

  return { key, salt: usedSalt };
}

/**
 * Encrypts data using AES-256-GCM with key derived from master password
 * @param data Data to encrypt (string or object that can be JSON.stringify'd)
 * @param masterPassword Password to derive encryption key from
 * @returns Encrypted data with salt and auth tag for decryption
 */
export function encryptData(data: any, masterPassword: string): EncryptedContent {
  const { key, salt } = deriveKeyFromPassword(masterPassword);
  const iv = crypto.randomBytes(IV_LENGTH);

  const cipher = crypto.createCipheriv(ENCRYPTION_ALGORITHM, key, iv);

  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  const encrypted = Buffer.concat([
    cipher.update(dataString, 'utf8'),
    cipher.final()
  ]);

  const authTag = cipher.getAuthTag();

  return {
    encryptedData: encrypted.toString('base64'),
    salt: salt.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64')
  };
}

/**
 * Decrypts data using AES-256-GCM with key derived from master password
 * @param encryptedData Encrypted data object containing encrypted data, salt, iv, and auth tag
 * @param masterPassword Password to derive encryption key from
 * @returns Decrypted data (parsed from JSON if it was an object)
 */
export function decryptData(
  encryptedData: EncryptedContent,
  masterPassword: string
): any {
  const { key } = deriveKeyFromPassword(masterPassword, Buffer.from(encryptedData.salt, 'base64'));
  const iv = Buffer.from(encryptedData.iv, 'base64');

  const decipher = crypto.createDecipheriv(ENCRYPTION_ALGORITHM, key, iv);
  decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'base64'));

  try {
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedData.encryptedData, 'base64')),
      decipher.final()
    ]);

    const result = decrypted.toString('utf8');
    // Try to parse as JSON, fallback to string
    try {
      return JSON.parse(result);
    } catch {
      return result;
    }
  } catch (error) {
    throw new Error('Decryption failed - invalid password or corrupted data');
  }
}

/**
 * SHA-256 hash for data integrity checksums (NOT for passwords).
 * Used by inventory, finances, and volume routes for change-detection hashing.
 * @param data Data to hash
 * @returns Hex-encoded SHA-256 hash
 */
export function sha256Hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Hashes a master password using bcrypt (cost factor 12).
 * This is the ONLY function that should be used for password storage.
 * @param password Password to hash
 * @returns bcrypt hash string
 */
export async function hashMasterPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

/**
 * Verifies if a provided password matches the stored master password hash.
 * Supports bcrypt hashes (A-03 remediation).
 * @param password Password to verify
 * @param hashedPassword Stored bcrypt hash
 * @returns True if password matches hash
 */
export async function verifyMasterPassword(password: string, hashedPassword: string): Promise<boolean> {
  try {
    return await bcrypt.compare(password, hashedPassword);
  } catch (e) {
    return false;
  }
}

/**
 * Defines the structure for encrypted content
 */
export interface EncryptedContent {
  encryptedData: string;
  salt: string;
  iv: string;
  authTag: string;
}

/**
 * Gets the static system key string from environment to be used as a master password
 */
export function getSystemKeyString(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET is not defined');
  return secret;
}

/**
 * Encrypts data using the system-derived key
 * @param data Data to encrypt
 */
export function encryptWithSystemKey(data: any): EncryptedContent {
  return encryptData(data, getSystemKeyString());
}

/**
 * Decrypts data using the system-derived key
 * @param encryptedData Encrypted content
 */
export function decryptWithSystemKey(encryptedData: EncryptedContent): any {
  return decryptData(encryptedData, getSystemKeyString());
}
