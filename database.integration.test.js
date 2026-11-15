import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import dotenv from 'dotenv';
import test from 'node:test';
import { createAccountStore } from './authStore.js';
import { createDatabasePool, migrateDatabase } from './database.js';
import { createConversationStore } from './conversationStore.js';

dotenv.config({ quiet: true });

const databaseTestUrl = process.env.DATABASE_TEST_URL || '';
const skipReason = databaseTestUrl
  ? false
  : 'Set DATABASE_TEST_URL to a separate disposable Neon test database.';

test('Neon database stores account, session, and conversation data', {
  skip: skipReason
}, async t => {
  if (process.env.DATABASE_URL) {
    const testTarget = new URL(databaseTestUrl);
    const applicationTarget = new URL(process.env.DATABASE_URL);
    if (
      testTarget.hostname === applicationTarget.hostname &&
      testTarget.pathname === applicationTarget.pathname
    ) {
      throw new Error('DATABASE_TEST_URL must target a database separate from DATABASE_URL.');
    }
  }

  const pool = createDatabasePool({ databaseUrl: databaseTestUrl });
  let userId;
  t.after(async () => {
    if (userId) await pool.query('DELETE FROM users WHERE id = $1', [userId]);
    await pool.end();
  });
  await migrateDatabase(pool);
  const accounts = createAccountStore({
    db: pool,
    encryptionSecret: 'integration-test-secret-not-used-for-provider-keys'
  });
  const conversations = createConversationStore({ db: pool });
  const user = await accounts.register(
    `db-test-${randomUUID()}@example.invalid`,
    'test-only-password-123'
  );
  userId = user.id;

  const session = await accounts.createSession(user.id);
  assert.deepEqual(await accounts.getUserForSession(session.token), user);

  const conversation = {
    id: randomUUID(),
    title: 'Neon integration test',
    messages: [{ role: 'user', content: 'This is disposable test data.' }]
  };
  await conversations.save(user.id, conversation, conversation.id);
  const state = await conversations.list(user.id);
  assert.deepEqual(state.conversations[0].messages, conversation.messages);
  assert.equal(state.activeConversationId, conversation.id);
});
