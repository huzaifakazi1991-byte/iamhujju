export const LEGACY_CHAT_STORAGE_KEY = 'local-ai-workspace-chats';
export const LEGACY_ACTIVE_CHAT_STORAGE_KEY = 'local-ai-workspace-active-chat';

function storageKeys(ownerId) {
  const partition = ownerId
    ? `user:${encodeURIComponent(String(ownerId))}`
    : 'guest';
  return {
    chats: `${LEGACY_CHAT_STORAGE_KEY}:${partition}`,
    activeChat: `${LEGACY_ACTIVE_CHAT_STORAGE_KEY}:${partition}`
  };
}

function isSavedChat(chat) {
  return Boolean(
    chat &&
    (typeof chat.id === 'string' || typeof chat.id === 'number') &&
    typeof chat.title === 'string' &&
    Array.isArray(chat.messages) &&
    chat.messages.every(message =>
      message &&
      ['system', 'user', 'assistant'].includes(message.role) &&
      (typeof message.content === 'string' || Array.isArray(message.content))
    )
  );
}

function parseChats(serialized) {
  const parsed = serialized ? JSON.parse(serialized) : [];
  if (!Array.isArray(parsed)) {
    return { chats: [], readable: false };
  }
  const chats = parsed.filter(isSavedChat);
  return { chats, readable: chats.length === parsed.length };
}

export function loadChatState(ownerId, storage) {
  try {
    const browserStorage = storage || globalThis.localStorage;
    const keys = storageKeys(ownerId);
    const serialized = browserStorage.getItem(keys.chats);
    const parsed = parseChats(serialized);
    const legacyDataAvailable = Boolean(
      browserStorage.getItem(LEGACY_CHAT_STORAGE_KEY) ||
      browserStorage.getItem(storageKeys(null).chats)
    );

    const hasInvalidChats = !parsed.readable;

    return {
      chats: parsed.chats,
      activeChatId: browserStorage.getItem(keys.activeChat) || null,
      readable: !hasInvalidChats,
      legacyDataAvailable,
      error: hasInvalidChats
        ? 'Some saved conversations could not be read safely. Existing browser data was left unchanged.'
        : ''
    };
  } catch {
    return {
      chats: [],
      activeChatId: null,
      readable: false,
      legacyDataAvailable: false,
      error: 'Browser storage is unavailable or saved data is invalid. Existing data was left unchanged.'
    };
  }
}

export function loadLegacyChatState(storage) {
  try {
    const browserStorage = storage || globalThis.localStorage;
    const guestKeys = storageKeys(null);
    const legacy = parseChats(browserStorage.getItem(LEGACY_CHAT_STORAGE_KEY));
    const guest = parseChats(browserStorage.getItem(guestKeys.chats));
    const chats = [...new Map(
      [...guest.chats, ...legacy.chats].map(chat => [String(chat.id), chat])
    ).values()];
    const readable = legacy.readable && guest.readable;
    const activeChatId =
      browserStorage.getItem(guestKeys.activeChat) ||
      browserStorage.getItem(LEGACY_ACTIVE_CHAT_STORAGE_KEY) ||
      null;
    return {
      chats,
      activeChatId,
      readable,
      error: readable
        ? ''
        : 'Some older conversations could not be read safely. Existing browser data was left unchanged.'
    };
  } catch {
    return {
      chats: [],
      activeChatId: null,
      readable: false,
      error: 'Browser storage is unavailable or saved data is invalid. Existing data was left unchanged.'
    };
  }
}

export function clearChatState(ownerId, storage) {
  try {
    const browserStorage = storage || globalThis.localStorage;
    const keys = storageKeys(ownerId);
    browserStorage.removeItem(keys.chats);
    browserStorage.removeItem(keys.activeChat);
    return { ok: true, error: '' };
  } catch {
    return {
      ok: false,
      error: 'Could not remove the imported browser copy. It is still available in this browser.'
    };
  }
}

export function clearLegacyChatState(storage) {
  try {
    const browserStorage = storage || globalThis.localStorage;
    const guestKeys = storageKeys(null);
    browserStorage.removeItem(LEGACY_CHAT_STORAGE_KEY);
    browserStorage.removeItem(LEGACY_ACTIVE_CHAT_STORAGE_KEY);
    browserStorage.removeItem(guestKeys.chats);
    browserStorage.removeItem(guestKeys.activeChat);
    return { ok: true, error: '' };
  } catch {
    return {
      ok: false,
      error: 'Could not remove the imported browser copy. It is still available in this browser.'
    };
  }
}
