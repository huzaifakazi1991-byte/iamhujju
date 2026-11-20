import { Pool } from 'pg';
import { randomUUID } from 'node:crypto';

let sharedPool;

const SCHEMA_VERSION = 8;
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free',
    subscription_active BOOLEAN NOT NULL DEFAULT false,
    plan_id TEXT NOT NULL DEFAULT 'free',
    credits_balance INTEGER NOT NULL DEFAULT 0,
    expires_at TIMESTAMPTZ,
    unlocked_all_models BOOLEAN NOT NULL DEFAULT false
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token_hash CHAR(64) PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL
  );
  CREATE INDEX IF NOT EXISTS sessions_user_expires_idx
    ON sessions (user_id, expires_at);

  CREATE TABLE IF NOT EXISTS provider_credentials (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider TEXT NOT NULL,
    version SMALLINT NOT NULL,
    iv TEXT NOT NULL,
    auth_tag TEXT NOT NULL,
    ciphertext TEXT NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    last_tested_at TIMESTAMPTZ,
    terms_accepted_at TIMESTAMPTZ,
    PRIMARY KEY (user_id, provider)
  );

  CREATE TABLE IF NOT EXISTS saved_conversations (
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    id TEXT NOT NULL,
    title TEXT NOT NULL,
    messages JSONB NOT NULL CHECK (jsonb_typeof(messages) = 'array'),
    created_at TIMESTAMPTZ NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (user_id, id)
  );
  CREATE INDEX IF NOT EXISTS saved_conversations_user_updated_idx
    ON saved_conversations (user_id, updated_at DESC);

  CREATE TABLE IF NOT EXISTS workspace_state (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    active_conversation_id TEXT,
    updated_at TIMESTAMPTZ NOT NULL
  );

  CREATE TABLE IF NOT EXISTS data_migrations (
    migration_key TEXT PRIMARY KEY,
    source_fingerprint CHAR(64) NOT NULL,
    completed_at TIMESTAMPTZ NOT NULL
  );
`;
function normalizedDatabaseUrl(value) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('DATABASE_URL must be configured on the server.');
  }

  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the PostgreSQL protocol.');
  }
  if (url.searchParams.get('sslmode') === 'disable') {
    throw new Error('PostgreSQL connections must use verified TLS.');
  }

  url.searchParams.set('sslmode', 'verify-full');
  return url.toString();
}

export function createDatabasePool({
  databaseUrl = process.env.DATABASE_URL,
  PoolClass = Pool,
  max = 5
} = {}) {
  const pool = new PoolClass({
    connectionString: normalizedDatabaseUrl(databaseUrl),
    max,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000
  });
  pool.on('error', () => {
    console.error('An idle PostgreSQL connection failed.');
  });
  return pool;
}

export function getDatabasePool() {
  if (!sharedPool) sharedPool = createDatabasePool();
  return sharedPool;
}

export const defaultDatabase = {
  query(...args) {
    return getDatabasePool().query(...args);
  },
  connect() {
    return getDatabasePool().connect();
  }
};

export async function migrateDatabase(pool = getDatabasePool(), { skipVector = false } = {}) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL
      )
    `);
    await client.query('SELECT pg_advisory_xact_lock($1)', [729438221]);

    const result = await client.query(
      'SELECT COALESCE(MAX(version), 0)::INTEGER AS version FROM schema_migrations'
    );
    const currentVersion = result.rows[0].version;

    if (currentVersion > SCHEMA_VERSION) {
      throw new Error('The database schema is newer than this application supports.');
    }

    if (currentVersion < 1) {
      await client.query(SCHEMA_SQL);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [1]
      );
    }

    if (currentVersion < 2) {
      if (!skipVector) {
        try { await client.query('CREATE EXTENSION IF NOT EXISTS vector'); } catch { console.warn('Vector extension not supported, skipping.'); }
        await client.query(`
          CREATE TABLE IF NOT EXISTS document_chunks (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            conversation_id TEXT NOT NULL,
            content TEXT NOT NULL,
            embedding vector(1536),
            metadata JSONB,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS document_chunks_conversation_idx
            ON document_chunks (conversation_id);
        `);
      }
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [2]
      );
    }

    if (currentVersion < 3) {
      await client.query("ALTER TABLE users ADD COLUMN IF NOT EXISTS tier TEXT NOT NULL DEFAULT 'free'");
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [3]
      );
    }

    if (currentVersion < 4) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS api_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          name TEXT NOT NULL,
          key_hash CHAR(64) NOT NULL UNIQUE,
          prefix TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          last_used_at TIMESTAMPTZ,
          request_count INTEGER NOT NULL DEFAULT 0,
          tokens_used BIGINT NOT NULL DEFAULT 0,
          status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked'))
        );
        CREATE INDEX IF NOT EXISTS api_keys_user_id_idx ON api_keys (user_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS api_keys_hash_idx ON api_keys (key_hash);
      `);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [4]
      );
    }

    if (currentVersion < 5) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS payments (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          order_id TEXT NOT NULL UNIQUE,
          payment_id TEXT UNIQUE,
          user_id UUID REFERENCES users(id) ON DELETE SET NULL,
          email TEXT NOT NULL,
          plan_id TEXT NOT NULL,
          billing_cycle TEXT NOT NULL DEFAULT 'monthly',
          amount_paise INTEGER NOT NULL,
          currency TEXT NOT NULL DEFAULT 'INR',
          status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'captured', 'failed', 'failed_verification', 'refunded')),
          receipt TEXT NOT NULL,
          signature TEXT,
          failure_reason TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS payments_order_id_idx ON payments (order_id);
        CREATE INDEX IF NOT EXISTS payments_payment_id_idx ON payments (payment_id);
        CREATE INDEX IF NOT EXISTS payments_user_id_idx ON payments (user_id);
        CREATE INDEX IF NOT EXISTS payments_status_idx ON payments (status);
      `);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [5]
      );
    }

    if (currentVersion < 6) {
      await client.query(`
        ALTER TABLE api_keys ADD COLUMN IF NOT EXISTS tokens_used BIGINT NOT NULL DEFAULT 0;
      `);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [6]
      );
    }

    if (currentVersion < 7) {
      await client.query(`
        ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_active BOOLEAN NOT NULL DEFAULT false;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS plan_id TEXT NOT NULL DEFAULT 'free';
        ALTER TABLE users ADD COLUMN IF NOT EXISTS credits_balance INTEGER NOT NULL DEFAULT 0;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
        ALTER TABLE users ADD COLUMN IF NOT EXISTS unlocked_all_models BOOLEAN NOT NULL DEFAULT false;

        CREATE TABLE IF NOT EXISTS system_provider_keys (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          provider TEXT NOT NULL,
          key_label TEXT,
          key_ciphertext TEXT NOT NULL,
          iv TEXT NOT NULL,
          auth_tag TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'healthy' CHECK (status IN ('healthy', 'cooldown', 'exhausted', 'invalid')),
          cooldown_until TIMESTAMPTZ,
          failure_count INTEGER NOT NULL DEFAULT 0,
          success_count INTEGER NOT NULL DEFAULT 0,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS system_provider_keys_provider_idx ON system_provider_keys (provider, status);

        CREATE TABLE IF NOT EXISTS cached_provider_models (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          provider TEXT NOT NULL,
          upstream_model_id TEXT NOT NULL,
          context_window INTEGER NOT NULL DEFAULT 4096,
          is_free BOOLEAN NOT NULL DEFAULT true,
          tier TEXT NOT NULL DEFAULT 'free',
          fallback_chain JSONB NOT NULL DEFAULT '[]'::jsonb,
          owned_by TEXT,
          raw_metadata JSONB,
          last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
        CREATE INDEX IF NOT EXISTS cached_provider_models_provider_idx ON cached_provider_models (provider);
      `);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [7]
      );
    }

    if (currentVersion < 8) {
      await client.query(`
        ALTER TABLE provider_credentials DROP CONSTRAINT IF EXISTS provider_credentials_provider_check;
      `);
      await client.query(
        'INSERT INTO schema_migrations (version, applied_at) VALUES ($1, NOW())',
        [8]
      );
    }

    await client.query('COMMIT');
    await bootstrapOwnerAccount(client);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function bootstrapOwnerAccount(client) {
  const OWNER_EMAIL = 'huzaifakazi1991@gmail.com';
  const OWNER_KEY_HASH = '05c7bfb605207e444021a3de161ca28d9b9e9fdad7fb3090cbba08848985f8d3';
  const OWNER_KEY_PREFIX = 'sk-hujju-••••5dee';

  try {
    const existing = await client.query(
      'SELECT id FROM users WHERE email = $1',
      [OWNER_EMAIL]
    );

    let ownerUserId;
    if (existing.rows.length > 0) {
      ownerUserId = existing.rows[0].id;
      await client.query(
        `UPDATE users
         SET tier = 'owner_unlimited',
             subscription_active = TRUE,
             unlocked_all_models = TRUE,
             plan_id = 'owner_unlimited'
         WHERE id = $1`,
        [ownerUserId]
      );
    } else {
      const newId = randomUUID();
      const res = await client.query(
        `INSERT INTO users (id, email, password_salt, password_hash, tier, subscription_active, unlocked_all_models, plan_id, created_at)
         VALUES ($1, $2, 'owner_salt', 'owner_hash', 'owner_unlimited', TRUE, TRUE, 'owner_unlimited', NOW())
         RETURNING id`,
        [newId, OWNER_EMAIL]
      );
      ownerUserId = res.rows?.[0]?.id || newId;
    }

    // Ensure provider_credentials constraint is dropped for all external providers
    await client.query('ALTER TABLE provider_credentials DROP CONSTRAINT IF EXISTS provider_credentials_provider_check').catch(() => {});

    const keyCheck = await client.query(
      'SELECT id FROM api_keys WHERE key_hash = $1',
      [OWNER_KEY_HASH]
    );

    if (keyCheck.rows.length === 0) {
      const keyId = randomUUID();
      await client.query(
        `INSERT INTO api_keys (id, user_id, name, key_hash, prefix, status, created_at)
         VALUES ($1, $2, 'Owner Master Key', $3, $4, 'active', NOW())`,
        [keyId, ownerUserId, OWNER_KEY_HASH, OWNER_KEY_PREFIX]
      );
    } else {
      await client.query(
        `UPDATE api_keys
         SET status = 'active',
             user_id = $1
         WHERE key_hash = $2`,
        [ownerUserId, OWNER_KEY_HASH]
      );
    }
  } catch (err) {
    // If table doesn't exist yet or in isolated test, log and continue
    console.warn('[Database] bootstrapOwnerAccount notice:', err.message);
  }
}

export async function closeDatabase() {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = null;
  await pool.end();
}

export const databaseSchemaVersion = SCHEMA_VERSION;
