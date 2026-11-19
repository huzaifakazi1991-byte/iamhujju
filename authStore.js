import {
  createCipheriv,
  createHash,
  createDecipheriv,
  randomBytes,
  scryptSync,
  timingSafeEqual,
  randomUUID
} from 'node:crypto';
import { defaultDatabase } from './database.js';

const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_HASH_BYTES = 64;
const DUMMY_SALT = '8d417e16f514d4dfe422051741481f41';
const DUMMY_HASH = scryptSync('invalid-account-password', DUMMY_SALT, PASSWORD_HASH_BYTES);
const CONNECTED_PROVIDERS = new Set(['openrouter']);

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function validEmail(email) {
  return typeof email === 'string' &&
    email.length <= 254 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function validPassword(password) {
  const length = Array.from(password).length;
  return length >= 12 && length <= 128;
}

function publicUser(user) {
  return { id: user.id, email: user.email, tier: user.tier || 'free' };
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function deriveEncryptionKey(secret) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) return null;
  return createHash('sha256')
    .update('iamhujju-api-key-encryption-v1\0')
    .update(secret)
    .digest();
}

function asEncryptedCredential(row) {
  if (!row) return null;
  return {
    version: row.version,
    iv: row.iv,
    authTag: row.auth_tag,
    ciphertext: row.ciphertext,
    updatedAt: row.updated_at,
    lastTestedAt: row.last_tested_at,
    termsAcceptedAt: row.terms_accepted_at
  };
}

function isoDate(value) {
  return value ? new Date(value).toISOString() : null;
}

function createEncryptionHelpers(secret) {
  const encryptionKey = deriveEncryptionKey(secret);

  function encryptCredential(credential, testedAt, termsAcceptedAt = null) {
    if (!encryptionKey) {
      const error = new Error(
        'API_KEY_ENCRYPTION_SECRET must contain at least 32 bytes to store provider keys.'
      );
      error.code = 'API_KEY_ENCRYPTION_NOT_CONFIGURED';
      throw error;
    }

    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', encryptionKey, iv);
    const ciphertext = Buffer.concat([
      cipher.update(credential, 'utf8'),
      cipher.final()
    ]);
    return {
      version: 1,
      iv: iv.toString('base64url'),
      authTag: cipher.getAuthTag().toString('base64url'),
      ciphertext: ciphertext.toString('base64url'),
      updatedAt: new Date().toISOString(),
      lastTestedAt: testedAt,
      termsAcceptedAt
    };
  }

  function decryptCredential(encrypted) {
    if (!encryptionKey) {
      throw new Error('API_KEY_ENCRYPTION_SECRET is not configured on the server.');
    }

    try {
      const decipher = createDecipheriv(
        'aes-256-gcm',
        encryptionKey,
        Buffer.from(encrypted.iv, 'base64url')
      );
      decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
        decipher.final()
      ]).toString('utf8');
    } catch (error) {
      throw new Error('The saved provider key could not be decrypted.', { cause: error });
    }
  }

  return { encryptionKey, encryptCredential, decryptCredential };
}

export function createAccountStore({
  db = defaultDatabase,
  encryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET || ''
} = {}) {
  const { encryptionKey, encryptCredential, decryptCredential } =
    createEncryptionHelpers(encryptionSecret);

  async function getCredential(userId, provider) {
    const result = await db.query(
      `SELECT version, iv, auth_tag, ciphertext, updated_at, last_tested_at, terms_accepted_at
       FROM provider_credentials
       WHERE user_id = $1 AND provider = $2`,
      [userId, provider]
    );
    return asEncryptedCredential(result.rows[0]);
  }

  async function getCredentialStatus(userId, provider) {
    const encrypted = await getCredential(userId, provider);
    return {
      configured: Boolean(encrypted),
      lastTestedAt: isoDate(encrypted?.lastTestedAt),
      updatedAt: isoDate(encrypted?.updatedAt),
      termsAcceptedAt: isoDate(encrypted?.termsAcceptedAt)
    };
  }

  async function saveCredential(userId, provider, credential, testedAt, termsAcceptedAt) {
    const encrypted = encryptCredential(credential, testedAt, termsAcceptedAt);
    await db.query(
      `INSERT INTO provider_credentials
         (user_id, provider, version, iv, auth_tag, ciphertext, updated_at, last_tested_at, terms_accepted_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, provider) DO UPDATE SET
         version = EXCLUDED.version,
         iv = EXCLUDED.iv,
         auth_tag = EXCLUDED.auth_tag,
         ciphertext = EXCLUDED.ciphertext,
         updated_at = EXCLUDED.updated_at,
         last_tested_at = EXCLUDED.last_tested_at,
         terms_accepted_at = EXCLUDED.terms_accepted_at`,
      [
        userId,
        provider,
        encrypted.version,
        encrypted.iv,
        encrypted.authTag,
        encrypted.ciphertext,
        encrypted.updatedAt,
        encrypted.lastTestedAt,
        encrypted.termsAcceptedAt
      ]
    );
    return getCredentialStatus(userId, provider);
  }

  return {
    apiKeysEnabled: Boolean(encryptionKey),

    async register(email, password) {
      if (!validEmail(email)) {
        const error = new Error('Enter a valid email address.');
        error.code = 'INVALID_EMAIL';
        throw error;
      }

      if (typeof password !== 'string' || !validPassword(password)) {
        const error = new Error('Password must be 12-128 characters long.');
        error.code = 'INVALID_PASSWORD';
        throw error;
      }

      const normalizedEmail = normalizeEmail(email);
      const salt = randomBytes(16).toString('hex');
      const passwordHash = scryptSync(password, salt, PASSWORD_HASH_BYTES).toString('hex');
      const user = {
        id: randomUUID(),
        email: normalizedEmail,
        salt,
        passwordHash,
        createdAt: new Date().toISOString()
      };

      try {
        await db.query(
          `INSERT INTO users (id, email, password_salt, password_hash, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, user.email, user.salt, user.passwordHash, user.createdAt]
        );
      } catch (error) {
        if (error.code === '23505') {
          const duplicate = new Error('An account with this email already exists.');
          duplicate.code = 'EMAIL_EXISTS';
          throw duplicate;
        }
        throw error;
      }

      return publicUser(user);
    },

    async authenticate(email, password) {
      if (
        typeof email !== 'string' ||
        typeof password !== 'string' ||
        Array.from(password).length > 128
      ) {
        return null;
      }

      const normalizedEmail = validEmail(email) ? normalizeEmail(email) : '';
      const result = normalizedEmail
        ? await db.query(
          `SELECT id, email, password_salt, password_hash, COALESCE(tier, 'free') AS tier
           FROM users WHERE email = $1`,
          [normalizedEmail]
        )
        : { rows: [] };
      const user = result.rows[0];
      const salt = user?.password_salt || DUMMY_SALT;
      const expectedHash = user
        ? Buffer.from(user.password_hash, 'hex')
        : DUMMY_HASH;
      const actualHash = scryptSync(password, salt, PASSWORD_HASH_BYTES);

      if (
        expectedHash.length !== actualHash.length ||
        !timingSafeEqual(expectedHash, actualHash) ||
        !user
      ) {
        return null;
      }

      return publicUser(user);
    },

    async findOrCreateFederatedUser(email) {
      if (!validEmail(email)) {
        const error = new Error('Enter a valid email address.');
        error.code = 'INVALID_EMAIL';
        throw error;
      }

      const normalizedEmail = normalizeEmail(email);
      const existing = await db.query(
        `SELECT id, email, COALESCE(tier, 'free') AS tier FROM users WHERE email = $1`,
        [normalizedEmail]
      );
      if (existing.rows.length > 0) {
        return publicUser(existing.rows[0]);
      }

      const salt = randomBytes(16).toString('hex');
      const randomPass = randomBytes(32).toString('hex');
      const passwordHash = scryptSync(randomPass, salt, PASSWORD_HASH_BYTES).toString('hex');
      const user = {
        id: randomUUID(),
        email: normalizedEmail,
        salt,
        passwordHash,
        createdAt: new Date().toISOString()
      };

      await db.query(
        `INSERT INTO users (id, email, password_salt, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.email, user.salt, user.passwordHash, user.createdAt]
      );

      return publicUser(user);
    },

    async getApiKey(userId) {
      const encrypted = await getCredential(userId, 'freellmapi');
      return encrypted ? decryptCredential(encrypted) : null;
    },

    getApiKeyStatus(userId) {
      return getCredentialStatus(userId, 'freellmapi');
    },

    async setApiKey(userId, apiKey, testedAt = new Date().toISOString()) {
      return saveCredential(userId, 'freellmapi', apiKey, testedAt);
    },

    async markApiKeyTested(userId, testedAt = new Date().toISOString()) {
      await db.query(
        `UPDATE provider_credentials SET last_tested_at = $2
         WHERE user_id = $1 AND provider = 'freellmapi'`,
        [userId, testedAt]
      );
      const status = await getCredentialStatus(userId, 'freellmapi');
      return status.configured ? status : null;
    },

    async getProviderApiKey(userId, provider) {
      if (!CONNECTED_PROVIDERS.has(provider)) return null;
      const encrypted = await getCredential(userId, provider);
      return encrypted ? decryptCredential(encrypted) : null;
    },

    async getProviderApiKeyStatus(userId, provider) {
      if (!CONNECTED_PROVIDERS.has(provider)) {
        return { configured: false, lastTestedAt: null, updatedAt: null };
      }
      return getCredentialStatus(userId, provider);
    },

    async setProviderApiKey(
      userId,
      provider,
      apiKey,
      testedAt = new Date().toISOString(),
      termsAcceptedAt = null
    ) {
      if (!CONNECTED_PROVIDERS.has(provider)) {
        const error = new Error('This provider is not supported.');
        error.code = 'UNSUPPORTED_PROVIDER';
        throw error;
      }
      return saveCredential(userId, provider, apiKey, testedAt, termsAcceptedAt);
    },

    async markProviderApiKeyTested(
      userId,
      provider,
      testedAt = new Date().toISOString()
    ) {
      if (!CONNECTED_PROVIDERS.has(provider)) return null;
      await db.query(
        `UPDATE provider_credentials SET last_tested_at = $3
         WHERE user_id = $1 AND provider = $2`,
        [userId, provider, testedAt]
      );
      const status = await getCredentialStatus(userId, provider);
      return status.configured ? status : null;
    },

    async revokeProviderApiKey(userId, provider) {
      if (!CONNECTED_PROVIDERS.has(provider)) return false;
      const result = await db.query(
        'DELETE FROM provider_credentials WHERE user_id = $1 AND provider = $2',
        [userId, provider]
      );
      return result.rowCount > 0;
    },

    async revokeApiKey(userId) {
      const result = await db.query(
        `DELETE FROM provider_credentials
         WHERE user_id = $1 AND provider = 'freellmapi'`,
        [userId]
      );
      return result.rowCount > 0;
    },

    async createSession(userId) {
      const token = randomBytes(32).toString('base64url');
      const expiresAt = Date.now() + SESSION_TTL_MS;
      await db.query('DELETE FROM sessions WHERE expires_at <= NOW()');
      await db.query(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
         VALUES ($1, $2, NOW(), $3)`,
        [hashToken(token), userId, new Date(expiresAt).toISOString()]
      );
      return { token, expiresAt };
    },

    async getUserForSession(token) {
      if (typeof token !== 'string' || token.length > 128) return null;
      const result = await db.query(
        `SELECT u.id, u.email, COALESCE(u.tier, 'free') AS tier
         FROM sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = $1 AND s.expires_at > NOW()`,
        [hashToken(token)]
      );
      return result.rows[0] ? publicUser(result.rows[0]) : null;
    },

    async revokeSession(token) {
      if (typeof token !== 'string' || token.length > 128) return;
      await db.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
    }
  };
}

export const sessionMaxAgeSeconds = SESSION_TTL_MS / 1000;
export { deriveEncryptionKey, hashToken };
