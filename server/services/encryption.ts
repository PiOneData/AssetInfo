import crypto from 'crypto';

/**
 * Encryption service for sensitive data (e.g., IdP client secrets)
 * Uses AES-256-GCM encryption with environment-based key
 */

// Encryption algorithm
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // Initialization vector length
const AUTH_TAG_LENGTH = 16; // Authentication tag length
const SALT_LENGTH = 64; // Salt length for key derivation

/**
 * Get encryption key from environment
 * Falls back to a default key for development (NOT for production)
 */
function getEncryptionKey(): string {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('ENCRYPTION_KEY environment variable is required in production');
    }

    // Development fallback - NOT SECURE, only for local development
    console.warn('WARNING: Using default encryption key. Set ENCRYPTION_KEY env var for production!');
    return 'dev-only-key-change-in-production-32chars!!';
  }

  return key;
}

/**
 * Derive a 256-bit key from the environment key using PBKDF2
 */
function deriveKey(salt: Buffer): Buffer {
  const envKey = getEncryptionKey();
  return crypto.pbkdf2Sync(envKey, salt, 100000, 32, 'sha256');
}

/**
 * Encrypt a plaintext string
 * Returns base64-encoded encrypted data with format: salt:iv:authTag:ciphertext
 */
export function encrypt(plaintext: string): string {
  if (!plaintext) {
    return '';
  }

  try {
    // Generate random salt and IV
    const salt = crypto.randomBytes(SALT_LENGTH);
    const iv = crypto.randomBytes(IV_LENGTH);

    // Derive key from environment key + salt
    const key = deriveKey(salt);

    // Create cipher
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // Encrypt
    let encrypted = cipher.update(plaintext, 'utf8', 'base64');
    encrypted += cipher.final('base64');

    // Get authentication tag
    const authTag = cipher.getAuthTag();

    // Combine salt:iv:authTag:ciphertext
    const combined = `${salt.toString('base64')}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted}`;

    return combined;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('Failed to encrypt data');
  }
}

/**
 * Decrypt an encrypted string
 * Expects format: salt:iv:authTag:ciphertext (base64-encoded)
 */
export function decrypt(encryptedData: string): string {
  if (!encryptedData) {
    return '';
  }

  try {
    // Split components
    const parts = encryptedData.split(':');
    if (parts.length !== 4) {
      throw new Error('Invalid encrypted data format');
    }

    const [saltB64, ivB64, authTagB64, ciphertext] = parts;

    // Decode from base64
    const salt = Buffer.from(saltB64, 'base64');
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(authTagB64, 'base64');

    // Derive key from environment key + salt
    const key = deriveKey(salt);

    // Create decipher
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // Decrypt
    let decrypted = decipher.update(ciphertext, 'base64', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('Failed to decrypt data');
  }
}

/**
 * Hash a string using SHA-256 (for OAuth tokens)
 * Returns hex-encoded hash
 */
export function hash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Generate a random secure token
 */
export function generateSecureToken(length: number = 32): string {
  return crypto.randomBytes(length).toString('hex');
}

/**
 * Validate encryption key strength
 */
export function validateEncryptionKey(): { valid: boolean; message: string } {
  const key = process.env.ENCRYPTION_KEY;

  if (!key) {
    return {
      valid: false,
      message: 'ENCRYPTION_KEY environment variable not set'
    };
  }

  if (key.length < 32) {
    return {
      valid: false,
      message: 'ENCRYPTION_KEY must be at least 32 characters long'
    };
  }

  // Check for common weak keys
  const weakKeys = ['password', '12345678', 'secret', 'changeme', 'dev-only-key'];
  if (weakKeys.some(weak => key.toLowerCase().includes(weak))) {
    return {
      valid: false,
      message: 'ENCRYPTION_KEY appears to be weak or default'
    };
  }

  return {
    valid: true,
    message: 'Encryption key is valid'
  };
}
