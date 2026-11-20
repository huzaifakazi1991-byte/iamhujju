import assert from 'node:assert/strict';
import { createHash, randomUUID, scryptSync } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { DataType, newDb } from 'pg-mem';
import { createAccountStore } from './authStore.js';
import { migrateDatabase } from './database.js';
import { createConversationStore } from './conversationStore.js';
import { migrateLocalAuthStore } from './migrateLocalData.js';

async function createTestDatabase() {
  const memory = newDb({ noAstCoverageCheck: true });
  memory.public.registerFunction({
    name: 'pg_advisory_xact_lock',
    args: [DataType.integer],
    returns: DataType.integer,
    implementation: () => 0
  });
  memory.public.registerFunction({
    name: 'jsonb_typeof',
    args: [DataType.jsonb],
    returns: DataType.text,
    implementation: value => Array.isArray(value)
      ? 'array'
      : value === null
        ? 'null'
        : typeof value === 'object'
          ? 'object'
          : typeof value
  });
  memory.public.registerFunction({
    name: 'gen_random_uuid',
    args: [],
    returns: DataType.uuid,
    impure: true,
    implementation: () => randomUUID()
  });
  const { Pool } = memory.adapters.createPg();
  const pool = new Pool();
  await migrateDatabase(pool, { skipVector: true });
  return { memory, pool };
}

test('PostgreSQL schema migration is repeatable and records its version', async t => {
  const { pool } = await createTestDatabase();
  t.after(() => pool.end());

  await migrateDatabase(pool);
  const result = await pool.query('SELECT version FROM schema_migrations');
  assert.deepEqual(result.rows.map(row => row.version), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
});

test('account store hashes passwords and sessions and encrypts provider keys', async t => {
  const { pool } = await createTestDatabase();
  t.after(() => pool.end());
  const store = createAccountStore({
    db: pool,
    encryptionSecret: 'unit-test-encryption-secret-long-enough'
  });
  const user = await store.register('User@example.com', 'correct horse battery');
  const session = await store.createSession(user.id);
  const storedSession = await pool.query('SELECT token_hash FROM sessions');
  const storedUser = await pool.query(
    'SELECT password_hash FROM users WHERE id = $1',
    [user.id]
  );
  const apiKey = 'test-provider-key-123456789';

  await store.setProviderApiKey(user.id, 'openrouter', apiKey, undefined, '2026-01-01T00:00:00.000Z');

  const storedCredential = await pool.query(
    `SELECT ciphertext, iv, auth_tag FROM provider_credentials
     WHERE user_id = $1 AND provider = 'openrouter'`,
    [user.id]
  );
  assert.equal(await store.authenticate('user@example.com', 'correct horse battery') !== null, true);
  assert.deepEqual(await store.getUserForSession(session.token), user);
  assert.equal(storedSession.rows[0].token_hash, createHash('sha256').update(session.token).digest('hex'));
  assert.notEqual(storedUser.rows[0].password_hash, 'correct horse battery');
  assert.equal(await store.getProviderApiKey(user.id, 'openrouter'), apiKey);
  assert.equal(storedCredential.rows[0].ciphertext.includes(apiKey), false);
  assert.equal(storedCredential.rows[0].iv.includes(apiKey), false);
  assert.equal(storedCredential.rows[0].auth_tag.includes(apiKey), false);
});

test('provider keys stay disabled without a dedicated encryption secret', async t => {
  const { pool } = await createTestDatabase();
  t.after(() => pool.end());
  const store = createAccountStore({ db: pool, encryptionSecret: '' });
  const user = await store.register('no-key-secret@example.com', 'correct horse battery');

  assert.equal(store.apiKeysEnabled, false);
  await assert.rejects(
    store.setProviderApiKey(user.id, 'openrouter', 'provider-key'),
    error => error.code === 'API_KEY_ENCRYPTION_NOT_CONFIGURED'
  );
  const credentials = await pool.query(
    'SELECT provider FROM provider_credentials WHERE user_id = $1',
    [user.id]
  );
  assert.equal(credentials.rowCount, 0);
});

test('conversation repository keeps each account isolated and imports idempotently', async t => {
  const { pool } = await createTestDatabase();
  t.after(() => pool.end());
  const accounts = createAccountStore({
    db: pool,
    encryptionSecret: 'unit-test-encryption-secret-long-enough'
  });
  const firstUser = await accounts.register('first@example.com', 'correct horse battery');
  const secondUser = await accounts.register('second@example.com', 'another correct password');
  const store = createConversationStore({ db: pool });
  const chat = {
    id: 'chat-1',
    title: 'Private chat',
    messages: [{ role: 'user', content: 'Keep this private' }]
  };

  assert.deepEqual(
    await store.import(firstUser.id, [chat], chat.id),
    { importedCount: 1 }
  );
  await store.import(firstUser.id, [chat], chat.id);
  const importedRows = await pool.query(
    'SELECT id FROM saved_conversations WHERE user_id = $1 AND id = $2',
    [firstUser.id, chat.id]
  );
  assert.equal(importedRows.rowCount, 1);
  await store.save(secondUser.id, { ...chat, title: 'Separate account chat' });

  const firstState = await store.list(firstUser.id);
  const secondState = await store.list(secondUser.id);
  assert.equal(firstState.conversations[0].title, 'Private chat');
  assert.equal(firstState.activeConversationId, chat.id);
  assert.equal(secondState.conversations[0].title, 'Separate account chat');

  assert.equal(await store.delete(firstUser.id, chat.id), true);
  assert.deepEqual(await store.list(firstUser.id), {
    conversations: [],
    activeConversationId: null
  });
  assert.equal((await store.list(secondUser.id)).conversations.length, 1);
});

test('local auth migration backs up source and is idempotent', async t => {
  const { pool } = await createTestDatabase();
  t.after(() => pool.end());
  const directory = mkdtempSync(path.join(os.tmpdir(), 'iamhujju-neon-migration-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const sourcePath = path.join(directory, 'auth-store.json');
  const backupDirectory = path.join(directory, 'backups');
  const userId = randomUUID();
  const password = 'correct horse battery';
  const salt = 'test-salt';
  const authData = {
    users: [{
      id: userId,
      email: 'migrated@example.com',
      salt,
      passwordHash: scryptSync(password, salt, 64).toString('hex'),
      createdAt: new Date().toISOString()
    }],
    sessions: [{
      tokenHash: 'a'.repeat(64),
      userId,
      expiresAt: Date.now() + 60_000
    }]
  };
  const sourceText = JSON.stringify(authData);
  writeFileSync(sourcePath, sourceText);

  const dryRun = await migrateLocalAuthStore({
    db: pool,
    filePath: sourcePath,
    backupDirectory,
    apply: false
  });
  assert.equal(dryRun.status, 'dry-run');
  assert.equal(dryRun.users, 1);

  const migrated = await migrateLocalAuthStore({
    db: pool,
    filePath: sourcePath,
    backupDirectory,
    apply: true
  });
  assert.equal(migrated.status, 'migrated');
  assert.equal(readFileSync(migrated.backupPath, 'utf8'), sourceText);
  assert.equal(readFileSync(sourcePath, 'utf8'), sourceText);
  assert.equal(statSync(migrated.backupPath).isFile(), true);

  const repeat = await migrateLocalAuthStore({
    db: pool,
    filePath: sourcePath,
    backupDirectory,
    apply: true
  });
  assert.equal(repeat.status, 'already-migrated');
  const stored = await pool.query('SELECT id FROM users WHERE id = $1', [userId]);
  assert.equal(stored.rowCount, 1);
});
