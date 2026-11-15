import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEGACY_ACTIVE_CHAT_STORAGE_KEY,
  LEGACY_CHAT_STORAGE_KEY,
  clearChatState,
  clearLegacyChatState,
  loadChatState,
  loadLegacyChatState
} from './chatStorage.js';

function createStorage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      values.set(key, String(value));
    },
    removeItem(key) {
      values.delete(key);
    },
    values
  };
}

test('legacy account partitions can be read and cleared without touching another account', () => {
  const firstUserKey = `${LEGACY_CHAT_STORAGE_KEY}:user:user-1`;
  const firstActiveKey = `${LEGACY_ACTIVE_CHAT_STORAGE_KEY}:user:user-1`;
  const secondUserKey = `${LEGACY_CHAT_STORAGE_KEY}:user:user-2`;
  const firstChats = [{
    id: 'chat-1',
    title: 'A local conversation',
    messages: [{ role: 'user', content: 'Hello' }]
  }];
  const secondChats = [{
    id: 'chat-2',
    title: 'A separate conversation',
    messages: [{ role: 'user', content: 'Private to another account' }]
  }];
  const storage = createStorage({
    [firstUserKey]: JSON.stringify(firstChats),
    [firstActiveKey]: 'chat-1',
    [secondUserKey]: JSON.stringify(secondChats)
  });

  assert.deepEqual(loadChatState('user-1', storage), {
    chats: firstChats,
    activeChatId: 'chat-1',
    readable: true,
    legacyDataAvailable: false,
    error: ''
  });
  assert.equal(clearChatState('user-1', storage).ok, true);
  assert.deepEqual(loadChatState('user-2', storage).chats, secondChats);
});

test('malformed stored chats are rejected without overwriting the original data', () => {
  const original = JSON.stringify([
    {
      id: 'valid',
      title: 'Keep this conversation',
      messages: [{ role: 'user', content: 'Hello' }]
    },
    { id: 'invalid', title: 'Bad conversation', messages: [{ role: 'tool', content: '<script>' }] }
  ]);
  const storage = createStorage({
    [`${LEGACY_CHAT_STORAGE_KEY}:user:user-1`]: original
  });

  const state = loadChatState('user-1', storage);
  assert.equal(state.chats.length, 1);
  assert.equal(state.chats[0].id, 'valid');
  assert.equal(state.readable, false);
  assert.match(state.error, /left unchanged/);
  assert.equal(
    storage.getItem(`${LEGACY_CHAT_STORAGE_KEY}:user:user-1`),
    original
  );
});

test('unassigned conversations stay untouched until explicitly selected for import', () => {
  const original = JSON.stringify([{
    id: 'legacy',
    title: 'Previously saved',
    messages: [{ role: 'user', content: 'Unassigned history' }]
  }]);
  const storage = createStorage({
    [LEGACY_CHAT_STORAGE_KEY]: original,
    [LEGACY_ACTIVE_CHAT_STORAGE_KEY]: 'legacy'
  });

  const state = loadLegacyChatState(storage);
  assert.equal(state.chats.length, 1);
  assert.equal(state.activeChatId, 'legacy');
  assert.equal(state.readable, true);
  assert.equal(storage.getItem(LEGACY_CHAT_STORAGE_KEY), original);

  assert.equal(clearLegacyChatState(storage).ok, true);
  assert.equal(storage.getItem(LEGACY_CHAT_STORAGE_KEY), null);
});

test('browser storage parse and access failures are reported without throwing', () => {
  const storage = {
    getItem() {
      throw new Error('Storage disabled');
    },
    removeItem() {
      throw new Error('Storage disabled');
    }
  };

  assert.equal(loadChatState('user-1', storage).readable, false);
  assert.equal(loadLegacyChatState(storage).readable, false);
  assert.equal(clearChatState('user-1', storage).ok, false);
  assert.equal(clearLegacyChatState(storage).ok, false);
});
