import { useMemo, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import './SavedChatsPage.css';

function messageCount(chat) {
  return chat.messages.length;
}

export default function SavedChatsPage({
  chats,
  activeChatId,
  currentUser,
  connected,
  modelCount,
  loading,
  storageError,
  storageNotice,
  legacyImportNotice,
  legacyDataAvailable,
  storageWritable,
  onOpenChat,
  onStartChat,
  onImportLegacy,
  onDeleteChat,
  onClearChats,
  onOpenHome,
  onOpenModels,
  onOpenSkills,
  onOpenApiKeys,
  onOpenIntegrations,
  onOpenPricing,
  onLogout
}) {
  const [query, setQuery] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const filteredChats = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return chats;
    return chats.filter(chat =>
      `${chat.title} ${chat.messages.map(message => message.content).join(' ')}`
        .toLowerCase()
        .includes(term)
    );
  }, [chats, query]);

  return (
    <div className="saved-chats-page">
      <header className="saved-chats-nav">
        <button className="saved-chats-brand" type="button" onClick={onOpenHome}>
          <span aria-hidden="true">R</span>
          Ratnagiri_Enterprenuers
        </button>
        <nav aria-label="Main navigation">
          <button type="button" onClick={onOpenHome}>Explore</button>
          <button type="button" onClick={() => onOpenModels()}>Models</button>
          <button type="button" onClick={onOpenSkills}>Skills</button>
          <button type="button" className="is-current" aria-current="page">Saved Chats</button>
          <button type="button" onClick={onStartChat}>
            Chat
          </button>
        </nav>
        {currentUser && (
          <AccountMenu
            user={currentUser}
            connected={connected}
            modelCount={modelCount}
            onLogout={onLogout}
            onOpenApiKeys={onOpenApiKeys}
            onOpenIntegrations={onOpenIntegrations}
            onOpenPricing={onOpenPricing}
          />
        )}
      </header>

      <main className="saved-chats-main">
        <div className="saved-chats-heading">
          <div>
            <p className="saved-chats-eyebrow">ACCOUNT STORAGE</p>
            <h1>Saved conversations</h1>
            <p>Your conversations are saved to your iamhujju account on the configured cloud database.</p>
          </div>
          {(chats.length > 0 || storageError) && (
            <button
              className="saved-chats-clear"
              type="button"
              disabled={loading}
              onClick={() => setConfirmClear(value => !value)}
            >
              {storageError ? 'Clear local chat data' : 'Clear all'}
            </button>
          )}
        </div>

        {storageError && (
          <p className="saved-chats-warning" role="alert">{storageError}</p>
        )}
        {storageNotice && (
          <p className="saved-chats-notice" role="status">{storageNotice}</p>
        )}
        {legacyDataAvailable && (
          <div className="saved-chats-notice" role="group" aria-label="Import older browser conversations">
            <p>Older browser conversations are not linked to an account yet.</p>
            <button
              className="saved-chats-open"
              type="button"
              onClick={onImportLegacy}
              disabled={loading}
            >
              Import older browser chats to this account
            </button>
          </div>
        )}
        {legacyImportNotice && (
          <p className="saved-chats-notice" role="status">{legacyImportNotice}</p>
        )}

        <div className="saved-chats-toolbar">
          <label htmlFor="saved-chat-search">Search conversations</label>
          <input
            id="saved-chat-search"
            type="search"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Search titles and messages"
          />
          <span>{filteredChats.length} of {chats.length}</span>
        </div>

        {confirmClear && (
          <div className="saved-chats-confirm" role="group" aria-label="Confirm clearing conversations">
            <p>
              {storageError
                ? 'Clear all saved conversation data for this account? This cannot be undone.'
                : `Delete all ${chats.length} saved conversations from this account?`}
            </p>
            <button
              type="button"
              className="saved-chats-delete"
              disabled={loading}
              onClick={() => {
                onClearChats();
                setConfirmClear(false);
              }}
            >
              Confirm clear all
            </button>
            <button type="button" onClick={() => setConfirmClear(false)}>Cancel</button>
          </div>
        )}

        {filteredChats.length ? (
          <div className="saved-chats-list">
            {filteredChats.map(chat => (
              <article className="saved-chat-row" key={chat.id}>
                <div className="saved-chat-copy">
                  <strong>{chat.title || 'New conversation'}</strong>
                  <span>
                    {messageCount(chat)} {messageCount(chat) === 1 ? 'message' : 'messages'}
                    {String(chat.id) === String(activeChatId) ? ' · Current conversation' : ''}
                  </span>
                </div>
                {confirmDeleteId === String(chat.id) ? (
                  <div className="saved-chat-confirm-actions">
                    <span>Delete this conversation?</span>
                    <button
                      type="button"
                      className="saved-chats-delete"
                      disabled={loading || !storageWritable}
                      onClick={() => {
                        onDeleteChat(chat.id);
                        setConfirmDeleteId(null);
                      }}
                    >
                      Delete
                    </button>
                    <button type="button" onClick={() => setConfirmDeleteId(null)}>Cancel</button>
                  </div>
                ) : (
                  <div className="saved-chat-actions">
                    <button
                      className="saved-chats-open"
                      type="button"
                      disabled={loading}
                      onClick={() => onOpenChat(chat)}
                    >
                      Open chat
                    </button>
                    <button
                      className="saved-chats-delete"
                      type="button"
                      disabled={loading || !storageWritable}
                      aria-label={`Delete ${chat.title || 'conversation'}`}
                      onClick={() => setConfirmDeleteId(String(chat.id))}
                    >
                      Delete
                    </button>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="saved-chats-empty" role="status">
            <strong>{chats.length ? 'No conversations match that search.' : 'No saved conversations yet.'}</strong>
            <p>
              {chats.length
                ? 'Try another title or phrase from a message.'
                : 'Start a chat and it will be saved to your account automatically.'}
            </p>
            {chats.length === 0 && (
              <button type="button" className="saved-chats-open" onClick={onOpenHome}>
                Explore models
              </button>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
