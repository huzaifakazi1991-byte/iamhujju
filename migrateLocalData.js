import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  chmodSync
} from 'node:fs';
import path from 'node:path';

const MIGRATION_KEY = 'auth-store-json-v1';

function parseLegacyStore(filePath) {
  if (!existsSync(filePath)) return null;
  let state;
  try {
    state = JSON.parse(readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error('The local account store is not valid JSON.', { cause: error });
  }
  if (
    !state ||
    !Array.isArray(state.users) ||
    !Array.isArray(state.sessions)
  ) {
    throw new Error('The local account store has an invalid format.');
  }

  for (const user of state.users) {
    if (
      typeof user.id !== 'string' ||
      typeof user.email !== 'string' ||
      typeof user.salt !== 'string' ||
      typeof user.passwordHash !== 'string'
    ) {
      throw new Error('The local account store contains an invalid user record.');
    }
  }
  for (const session of state.sessions) {
    if (
      typeof session.tokenHash !== 'string' ||
      typeof session.userId !== 'string' ||
      !Number.isFinite(session.expiresAt)
    ) {
      throw new Error('The local account store contains an invalid session record.');
    }
  }

  return state;
}

function countCredentials(users) {
  return users.reduce((count, user) =>
    count + Number(Boolean(user.apiKey)) +
      Object.keys(user.providerKeys || {}).length, 0);
}

function legacyEncryptionKey(secret) {
  if (typeof secret !== 'string' || !secret) return null;
  return createHash('sha256')
    .update('iamhujju-api-key-encryption-v1\0')
    .update(secret)
    .digest();
}

function decryptCredential(encrypted, secrets) {
  for (const secret of secrets) {
    const key = legacyEncryptionKey(secret);
    if (!key) continue;
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(encrypted.iv, 'base64url'));
      decipher.setAuthTag(Buffer.from(encrypted.authTag, 'base64url'));
      return Buffer.concat([
        decipher.update(Buffer.from(encrypted.ciphertext, 'base64url')),
        decipher.final()
      ]).toString('utf8');
    } catch {
      continue;
    }
  }
  throw new Error(
    'A saved provider key could not be decrypted. Configure the correct explicit legacy encryption secret; source data was not changed.'
  );
}

function encryptCredential(plaintext, secret, legacyCredential) {
  if (typeof secret !== 'string' || Buffer.byteLength(secret) < 32) {
    throw new Error(
      'Set API_KEY_ENCRYPTION_SECRET to at least 32 bytes before migrating provider keys.'
    );
  }
  const key = legacyEncryptionKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final()
  ]);
  return {
    version: 1,
    iv: iv.toString('base64url'),
    authTag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
    updatedAt: legacyCredential.updatedAt || new Date().toISOString(),
    lastTestedAt: legacyCredential.lastTestedAt || null,
    termsAcceptedAt: legacyCredential.termsAcceptedAt || null
  };
}

function encryptedRecords(users, currentSecret, legacySecret) {
  const secrets = [currentSecret, legacySecret].filter(Boolean);
  const records = [];
  for (const user of users) {
    if (user.apiKey) {
      const plaintext = decryptCredential(user.apiKey, secrets);
      records.push({
        userId: user.id,
        provider: 'freellmapi',
        credential: encryptCredential(plaintext, currentSecret, user.apiKey)
      });
    }
    for (const [provider, value] of Object.entries(user.providerKeys || {})) {
      if (!['openrouter'].includes(provider)) {
        throw new Error('The local account store contains an unsupported provider key.');
      }
      const plaintext = decryptCredential(value, secrets);
      records.push({
        userId: user.id,
        provider,
        credential: encryptCredential(plaintext, currentSecret, value)
      });
    }
  }
  return records;
}

function createBackup(filePath, backupDirectory) {
  mkdirSync(backupDirectory, { recursive: true, mode: 0o700 });
  const suffix = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomBytes(4).toString('hex')}`;
  const backupPath = path.join(backupDirectory, `auth-store-${suffix}.json`);
  copyFileSync(filePath, backupPath, 1);
  try {
    chmodSync(backupPath, 0o600);
  } catch {
    // Windows ACLs inherit from the containing directory.
  }
  return backupPath;
}

export async function migrateLocalAuthStore({
  db,
  filePath = path.join(process.cwd(), '.data', 'auth-store.json'),
  backupDirectory = path.join(process.cwd(), '.data', 'backups'),
  encryptionSecret = process.env.API_KEY_ENCRYPTION_SECRET || '',
  legacyEncryptionSecret = process.env.LEGACY_API_KEY_ENCRYPTION_SECRET || '',
  apply = false
}) {
  const state = parseLegacyStore(filePath);
  if (!state) return { status: 'not-found', users: 0, sessions: 0, credentials: 0 };

  const sourceBytes = readFileSync(filePath);
  const sourceFingerprint = createHash('sha256').update(sourceBytes).digest('hex');
  const summary = {
    status: apply ? 'migrated' : 'dry-run',
    users: state.users.length,
    sessions: state.sessions.filter(session => session.expiresAt > Date.now()).length,
    credentials: countCredentials(state.users),
    sourceFingerprint
  };
  if (!apply) return summary;

  const credentials = encryptedRecords(
    state.users,
    encryptionSecret,
    legacyEncryptionSecret
  );
  const backupPath = createBackup(filePath, backupDirectory);
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const previous = await client.query(
      'SELECT source_fingerprint FROM data_migrations WHERE migration_key = $1 FOR UPDATE',
      [MIGRATION_KEY]
    );
    if (previous.rowCount) {
      if (previous.rows[0].source_fingerprint.trim() !== sourceFingerprint) {
        throw new Error(
          'A different local account store was already migrated. Resolve it explicitly before retrying.'
        );
      }
      await client.query('ROLLBACK');
      return { ...summary, status: 'already-migrated', backupPath };
    }

    for (const user of state.users) {
      await client.query(
        `INSERT INTO users (id, email, password_salt, password_hash, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [user.id, user.email.trim().toLowerCase(), user.salt, user.passwordHash, user.createdAt]
      );
    }
    for (const session of state.sessions) {
      if (session.expiresAt <= Date.now()) continue;
      await client.query(
        `INSERT INTO sessions (token_hash, user_id, created_at, expires_at)
         VALUES ($1, $2, NOW(), $3)`,
        [
          session.tokenHash,
          session.userId,
          new Date(session.expiresAt).toISOString()
        ]
      );
    }
    for (const { userId, provider, credential } of credentials) {
      await client.query(
        `INSERT INTO provider_credentials
           (user_id, provider, version, iv, auth_tag, ciphertext, updated_at, last_tested_at, terms_accepted_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          userId,
          provider,
          credential.version,
          credential.iv,
          credential.authTag,
          credential.ciphertext,
          credential.updatedAt,
          credential.lastTestedAt,
          credential.termsAcceptedAt
        ]
      );
    }
    await client.query(
      `INSERT INTO data_migrations (migration_key, source_fingerprint, completed_at)
       VALUES ($1, $2, NOW())`,
      [MIGRATION_KEY, sourceFingerprint]
    );
    await client.query('COMMIT');
    return { ...summary, backupPath };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
