import { Pool } from 'pg';

let sharedPool;

const SCHEMA_VERSION = 3;
const SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_salt TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    tier TEXT NOT NULL DEFAULT 'free'
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
    provider TEXT NOT NULL CHECK (provider IN ('freellmapi', 'openrouter')),
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

    await client.query('COMMIT');
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export async function closeDatabase() {
  if (!sharedPool) return;
  const pool = sharedPool;
  sharedPool = null;
  await pool.end();
}

export const databaseSchemaVersion = SCHEMA_VERSION;
