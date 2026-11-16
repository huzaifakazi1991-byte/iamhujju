import { useEffect, useMemo, useRef, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import './HomePage.css';

function Icon({ name, size = 20 }) {
  const paths = {
    search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.2 4.2" /></>,
    arrow: <><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></>,
    chevron: <path d="m9 18 6-6-6-6" />,
    chat: <><path d="M20 11.5a7.5 7.5 0 0 1-7.5 7.5H6l-3 2v-5.5A7.5 7.5 0 1 1 20 11.5Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></>,
    grid: <><rect x="3.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="7" rx="1.5" /><rect x="3.5" y="13.5" width="7" height="7" rx="1.5" /><rect x="13.5" y="13.5" width="7" height="7" rx="1.5" /></>,
    refresh: <><path d="M20 7v5h-5" /><path d="M4.6 9a7.5 7.5 0 0 1 12.7-2L20 12" /><path d="M4 17v-5h5" /><path d="M19.4 15a7.5 7.5 0 0 1-12.7 2L4 12" /></>,
    history: <><path d="M3 12a9 9 0 1 0 2.6-6.4L3 8" /><path d="M3 3v5h5" /><path d="M12 7v5l3 2" /></>,
    shield: <><path d="M12 22s8-4 8-11V5l-8-3-8 3v6c0 7 8 11 8 11Z" /><path d="m9 12 2 2 4-4" /></>,
    sparkle: <><path d="m12 3 1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="m19 15 .9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15Z" /></>,
    close: <><path d="m18 6-12 12M6 6l12 12" /></>
  };

  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {paths[name]}
    </svg>
  );
}

function getFeaturedModels(models) {
  const catalog = models.filter(model =>
    model.id !== 'auto' &&
    model.id !== 'fusion' &&
    !/\bslot\b/i.test(model.name || '')
  );
  const featured = [];

  for (const pattern of [
    /gemini/i,
    /gpt-(?:4|5)/i,
    /deepseek/i,
    /qwen/i
  ]) {
    const match = catalog.find(model =>
      pattern.test(`${model.id} ${model.name || ''}`) &&
      !featured.some(item => item.id === model.id)
    );

    if (match) featured.push(match);
  }

  for (const model of catalog) {
    if (featured.length >= 4) break;
    if (!featured.some(item => item.id === model.id)) featured.push(model);
  }

  return featured;
}

function modelInitials(model) {
  const id = (model.sourceId || model.id).toLowerCase();
  if (id.includes('gemini')) return 'G';
  if (id.includes('deepseek')) return 'D';
  if (id.startsWith('gpt-')) return 'GPT';
  if (id.includes('qwen')) return 'Q';
  if (id.includes('glm')) return 'GLM';
  return 'AI';
}

function contextLabel(model) {
  const context = Number(model.context_window || model.context_length);
  if (!Number.isFinite(context) || context <= 0) return null;
  return `${Math.round(context / 1000)}K context`;
}

function ModelCard({ model, onSelect, disabled }) {
  return (
    <button
      className="home-model-card"
      type="button"
      onClick={() => onSelect(model.id)}
      disabled={disabled}
      aria-label={`Start a chat with ${model.name || model.id}`}
    >
      <span className="home-model-card-main">
        <span className="home-model-mark" aria-hidden="true">
          {modelInitials(model)}
        </span>
        <span className="home-model-copy">
          <span className="home-model-source">
            {model.provider === 'openrouter' ? 'OpenRouter' : 'FreeLLMAPI'}
          </span>
          <strong>{model.name || model.id}</strong>
          <span className="home-model-id">{model.sourceId || model.id}</span>
        </span>
      </span>
      {typeof model.description === 'string' && model.description.trim() && (
        <span className="home-model-description">{model.description.trim()}</span>
      )}
      <span className="home-model-card-footer">
        <span className="home-tag">Available</span>
        {contextLabel(model) && <span className="home-model-context">{contextLabel(model)}</span>}
        <Icon name="chevron" size={17} />
      </span>
    </button>
  );
}

function AuthDialog({
  isOpen,
  mode,
  busy,
  error,
  onClose,
  onSubmit,
  onModeChange
}) {
  const dialogRef = useRef(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (isOpen && !dialog.open) dialog.showModal();
    if (!isOpen && dialog.open) dialog.close();
  }, [isOpen]);

  async function submit(event) {
    event.preventDefault();
    const succeeded = await onSubmit({ email, password, confirmation });
    if (succeeded) {
      setPassword('');
      setConfirmation('');
    }
  }

  function close() {
    setPassword('');
    setConfirmation('');
    onClose();
  }

  function changeMode(nextMode) {
    setPassword('');
    setConfirmation('');
    onModeChange(nextMode);
  }

  return (
    <dialog
      className="home-auth-dialog"
      ref={dialogRef}
      aria-labelledby="auth-title"
      onCancel={event => {
        event.preventDefault();
        close();
      }}
      onClick={event => {
        if (event.target === dialogRef.current) close();
      }}
    >
      <form className="home-auth-form" onSubmit={submit}>
        <div className="home-auth-top">
          <span className="home-brand-mark" aria-hidden="true"><span /></span>
          <button
            className="home-auth-close"
            type="button"
            onClick={close}
            aria-label="Close sign in dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <span className="home-eyebrow">IAMHUJJU LOCAL ACCOUNT</span>
        <h2 id="auth-title">{mode === 'signup' ? 'Create your account' : 'Welcome back'}</h2>
        <p>
          {mode === 'signup'
            ? 'Create an account to start using your local AI workspace.'
            : 'Sign in to continue to your AI workspace.'}
        </p>

        <label htmlFor="auth-email">Email address</label>
        <input
          id="auth-email"
          type="email"
          value={email}
          onChange={event => setEmail(event.target.value)}
          autoComplete="email"
          maxLength={254}
          required
          autoFocus
        />

        <label htmlFor="auth-password">Password</label>
        <input
          id="auth-password"
          type="password"
          value={password}
          onChange={event => setPassword(event.target.value)}
          autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
          minLength={mode === 'signup' ? 12 : undefined}
          maxLength={128}
          required
        />

        {mode === 'signup' && (
          <>
            <label htmlFor="auth-confirmation">Confirm password</label>
            <input
              id="auth-confirmation"
              type="password"
              value={confirmation}
              onChange={event => setConfirmation(event.target.value)}
              autoComplete="new-password"
              minLength={12}
              maxLength={128}
              required
            />
          </>
        )}

        {error && <p className="home-auth-error" role="alert">{error}</p>}

        <button className="home-auth-submit" type="submit" disabled={busy}>
          {busy
            ? 'Please wait…'
            : mode === 'signup'
              ? 'Create account'
              : 'Sign in'}
        </button>

        <p className="home-auth-switch">
          {mode === 'signup' ? 'Already have an account?' : 'New to iamhujju?'}
          <button
            type="button"
            onClick={() => changeMode(mode === 'signup' ? 'login' : 'signup')}
          >
            {mode === 'signup' ? 'Sign in' : 'Create account'}
          </button>
        </p>
        <p className="home-auth-note">
          Accounts and conversations are stored in your configured Neon database. Provider keys are encrypted before storage and never returned to the browser.
        </p>
      </form>
    </dialog>
  );
}

function HomePage({
  models,
  modelsLoading,
  connected,
  error,
  selectedModel,
  chatCount,
  authChecking,
  currentUser,
  storageError,
  storageNotice,
  authRestoreError,
  requestedModelId,
  onClearRequestedModel,
  onRetryAuth,
  onAuthenticated,
  onLogout,
  onOpenApiKeys,
  onOpenIntegrations,
  onRefreshModels,
  onOpenChat,
  onOpenModels,
  onOpenSkills,
  onOpenSavedChats
}) {
  const [query, setQuery] = useState('');
  const [authOpen, setAuthOpen] = useState(Boolean(requestedModelId));
  const [authMode, setAuthMode] = useState('login');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pendingModelId, setPendingModelId] = useState(requestedModelId || null);
  const [refreshNotice, setRefreshNotice] = useState('');
  const searchRef = useRef(null);
  const featuredModels = useMemo(() => getFeaturedModels(models), [models]);
  const filteredModels = useMemo(() => {
    const searchTerm = query.trim().toLowerCase();
    if (!searchTerm) return models;

    return models.filter(model =>
      `${model.id} ${model.sourceId || ''} ${model.name || ''} ${model.owned_by || ''}`
        .toLowerCase()
        .includes(searchTerm)
    );
  }, [models, query]);
  const hasSearch = Boolean(query.trim());
  const visibleModels = hasSearch ? filteredModels : featuredModels;

  useEffect(() => {
    if (!refreshNotice) return undefined;
    const timeout = window.setTimeout(() => setRefreshNotice(''), 3500);
    return () => window.clearTimeout(timeout);
  }, [refreshNotice]);

  async function refreshModels() {
    setRefreshNotice('Refreshing model availability…');
    const refreshed = await onRefreshModels();
    setRefreshNotice(
      refreshed
        ? 'Model availability refreshed.'
        : 'Could not refresh model availability. See the gateway status.'
    );
  }

  function openChat(modelId = selectedModel) {
    if (authChecking) return;
    if (!currentUser) {
      setPendingModelId(modelId || selectedModel);
      setAuthMode('login');
      setAuthError('');
      setAuthOpen(true);
      return;
    }

    onOpenChat(modelId);
  }

  async function submitAuth({ email, password, confirmation }) {
    setAuthError('');

    if (authMode === 'signup' && password !== confirmation) {
      setAuthError('Passwords do not match.');
      return false;
    }

    setAuthBusy(true);

    try {
      const response = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(`Account request failed (HTTP ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(result?.error?.message || `Account request failed (HTTP ${response.status}).`);
      }

      setAuthOpen(false);
      setAuthBusy(false);
      setPendingModelId(null);
      setAuthError('');
      onAuthenticated(result.user, pendingModelId);
      return true;
    } catch (requestError) {
      setAuthError(requestError.message || 'Account request failed.');
      return false;
    } finally {
      setAuthBusy(false);
    }
  }

  function submitSearch(event) {
    event.preventDefault();
    onOpenModels(query);
  }

  return (
    <div className="home-page" id="home-top">
      <header className="home-nav">
        <div className="home-nav-inner">
          <button
            className="home-brand"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="iamhujju home"
          >
            <span className="home-brand-mark" aria-hidden="true">
              <span />
            </span>
            <span>iamhujju</span>
          </button>

          <nav className="home-nav-links" aria-label="Main navigation">
            <button
              className="is-current"
              type="button"
              aria-current="page"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Explore
            </button>
            <button type="button" onClick={() => onOpenModels()}>
              Models
            </button>
            <button type="button" onClick={onOpenSkills}>
              Skills
            </button>
            <button
              type="button"
              onClick={() => openChat(selectedModel)}
              disabled={authChecking}
            >
              Chat
            </button>
          </nav>

          <div className="home-nav-tools">
            <span className={`home-connection-pill ${connected ? 'is-online' : ''}`}>
              <span />
              {authChecking
                ? 'Checking account'
                : modelsLoading
                  ? 'Connecting'
                  : connected
                    ? 'Gateway online'
                    : 'Offline'}
            </span>
            {currentUser ? (
              <AccountMenu
                user={currentUser}
                connected={connected}
                modelCount={models.length}
                onLogout={onLogout}
                onOpenApiKeys={onOpenApiKeys}
                onOpenIntegrations={onOpenIntegrations}
              />
            ) : (
              <button
                className="home-sign-in"
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setPendingModelId(null);
                  setAuthOpen(true);
                }}
                disabled={authChecking}
              >
                Sign in
              </button>
            )}
            <button
              className="home-nav-chat"
              type="button"
              onClick={() => openChat(selectedModel)}
              disabled={authChecking}
            >
              <Icon name="chat" size={17} />
              <span>Open chat</span>
            </button>
          </div>
        </div>
      </header>

      {authRestoreError && (
        <div className="home-auth-restore-error" role="alert">
          <span>{authRestoreError}</span>
          <button type="button" onClick={onRetryAuth} disabled={authChecking}>
            {authChecking ? 'Checking…' : 'Retry session check'}
          </button>
        </div>
      )}
      {storageNotice && (
        <div className="home-legacy-notice" role="status">{storageNotice}</div>
      )}

      <main className="home-main">
        <section className="home-hero" aria-labelledby="home-title">
          <div className="home-hero-layout">
            <div className="home-hero-mascot-card" aria-hidden="true">
              <img
                src="/mascot.jpg"
                alt="iamhujju.com - Your AI Companion"
                className="home-hero-mascot-img"
              />
              <div className="home-hero-mascot-glow" />
            </div>
            <div className="home-hero-content">
              <span className="home-eyebrow">
                <Icon name="sparkle" size={15} />
                YOUR FREE AI WORKSPACE
              </span>
              <h1 id="home-title">Start building with AI models</h1>
              <p>Explore live free models directly in your browser. Conversations sync to your cloud account.</p>
            </div>
          </div>

          <form className="home-search" role="search" onSubmit={submitSearch}>
            <label className="sr-only" htmlFor="model-search">
              Search available models
            </label>
            <input
              ref={searchRef}
              id="model-search"
              type="search"
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search models by name or ID..."
              autoComplete="off"
            />
            {query && (
              <button
                className="home-search-clear"
                type="button"
                onClick={() => {
                  setQuery('');
                  searchRef.current?.focus();
                }}
                aria-label="Clear model search"
              >
                <Icon name="close" size={17} />
              </button>
            )}
            <button className="home-search-submit" type="submit" aria-label="Show model search results">
              <Icon name="search" />
            </button>
          </form>

          <div className="home-search-hint">
            <span>Search across</span>
            <strong>{models.length}</strong>
            <span>available models</span>
          </div>
          <span className="home-hero-privacy">
            <Icon name="shield" size={15} />
            Private workspace · Provider keys are encrypted before storage
          </span>
        </section>

        <section className={`home-status-banner ${connected ? 'is-connected' : 'is-disconnected'}`} aria-live="polite">
          <span className="home-status-mark" aria-hidden="true">
            <Icon name={connected ? 'shield' : 'refresh'} size={21} />
          </span>
          <div className="home-status-copy">
            <strong>
              {modelsLoading
                ? 'Connecting to your gateway'
                : connected
                  ? 'Your local model gateway is ready'
                  : 'Gateway connection needs attention'}
            </strong>
            <span>
              {modelsLoading
                ? 'Loading the current available model list.'
                : connected
                  ? `${models.length} models are available. Provider keys are never returned to the browser.`
                  : error || 'Check that FreeLLMAPI is running, then try again.'}
            </span>
          </div>
          {connected ? (
            <button
              type="button"
              onClick={() => openChat(selectedModel)}
              disabled={authChecking}
            >
              Start chatting <Icon name="arrow" size={16} />
            </button>
          ) : (
            <button
              type="button"
              onClick={refreshModels}
              disabled={modelsLoading}
            >
              {modelsLoading ? 'Checking…' : 'Retry connection'}
              {!modelsLoading && <Icon name="refresh" size={16} />}
            </button>
          )}
        </section>

        <section className="home-discovery-grid" aria-label="Explore models and workspace">
          <aside className="home-sidebar" aria-label="Explore navigation">
            <div className="home-sidebar-group">
              <h2 className="home-sidebar-label">Your workspace</h2>
              <button
                className="home-sidebar-link is-current"
                type="button"
                aria-current="page"
                onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              >
                <Icon name="sparkle" size={17} />
                <span>Discover</span>
              </button>
              <button
                className="home-sidebar-link"
                type="button"
                onClick={() => onOpenModels()}
              >
                <Icon name="grid" size={17} />
                <span>Models</span>
              </button>
              <button
                className="home-sidebar-link"
                type="button"
                onClick={() => openChat(selectedModel)}
                disabled={authChecking}
              >
                <Icon name="chat" size={17} />
                <span>Start a conversation</span>
              </button>
              <button
                className="home-sidebar-link"
                type="button"
                onClick={onOpenSavedChats}
              >
                <Icon name="history" size={17} />
                <span>Saved conversations</span>
                {chatCount > 0 && <span className="home-sidebar-count">{chatCount}</span>}
              </button>
              <button
                className="home-sidebar-link"
                type="button"
                onClick={refreshModels}
                disabled={modelsLoading}
              >
                <span className={`home-sidebar-icon ${modelsLoading ? 'is-spinning' : ''}`}>
                  <Icon name="refresh" size={17} />
                </span>
                <span>{modelsLoading ? 'Refreshing…' : 'Refresh availability'}</span>
              </button>
            </div>

            <div className="home-sidebar-group">
              <span className="home-sidebar-label">Account</span>
              {currentUser ? (
                <>
                  <button className="home-sidebar-link" type="button" onClick={onOpenApiKeys}>
                    <Icon name="shield" size={17} />
                    <span>API Keys</span>
                  </button>
                  <button className="home-sidebar-link" type="button" onClick={onOpenIntegrations}>
                    <Icon name="grid" size={17} />
                    <span>Integrations</span>
                  </button>
                </>
              ) : (
                <button
                  className="home-sidebar-link"
                  type="button"
                  onClick={() => {
                    setAuthMode('login');
                    setAuthError('');
                    setPendingModelId(null);
                    setAuthOpen(true);
                  }}
                  disabled={authChecking}
                >
                  <Icon name="shield" size={17} />
                  <span>Sign in</span>
                </button>
              )}
            </div>
          </aside>

          <div className="home-content-grid">
            <section className="home-pane home-models-pane" aria-labelledby="home-models-title">
              <div className="home-pane-heading">
                <div>
                  <h2 id="home-models-title">{hasSearch ? 'Search results' : 'Popular models'}</h2>
                  <p>
                    {hasSearch
                      ? `${filteredModels.length} matching ${filteredModels.length === 1 ? 'model' : 'models'}`
                      : 'Available to use right now'}
                  </p>
                </div>
                <span className="home-heading-icon" aria-hidden="true">
                  <Icon name="grid" size={24} />
                </span>
              </div>

              {modelsLoading && models.length === 0 ? (
                <div className="home-model-list" aria-label="Loading available models">
                  {Array.from({ length: 4 }, (_, index) => (
                    <div className="home-model-skeleton" key={index} />
                  ))}
                </div>
              ) : visibleModels.length > 0 ? (
                <div className="home-model-list">
                  {visibleModels.map(model => (
                    <ModelCard
                      key={model.id}
                      model={model}
                      onSelect={openChat}
                      disabled={authChecking}
                    />
                  ))}
                </div>
              ) : (
                <div className="home-empty-state" role="status">
                  <span>{hasSearch ? 'No models match that search.' : 'No models are available.'}</span>
                  {hasSearch && (
                    <button type="button" onClick={() => setQuery('')}>
                      Clear search
                    </button>
                  )}
                </div>
              )}

              {hasSearch && filteredModels.length > 0 && (
                <p className="home-result-note">
                  Select a result to open it in chat.
                </p>
              )}

              {!hasSearch && models.length > featuredModels.length && (
                <button
                  className="home-more-models"
                  type="button"
                  onClick={() => onOpenModels()}
                >
                  {`More models (${models.length - featuredModels.length})`}
                  <Icon name="arrow" size={17} />
                </button>
              )}
            </section>

            <section className="home-pane home-workspace-pane" aria-labelledby="home-workspace-title">
              <div className="home-pane-heading">
                <div>
                  <h2 id="home-workspace-title">Your workspace</h2>
                  <p>Pick up where your ideas take you.</p>
                </div>
                <span className="home-heading-icon home-heading-icon-teal" aria-hidden="true">
                  <Icon name="sparkle" size={24} />
                </span>
              </div>

              <div className="home-workspace-actions">
                <button
                  className="home-workspace-card"
                  type="button"
                  onClick={() => openChat(selectedModel)}
                  disabled={authChecking}
                >
                  <span className="home-workspace-icon"><Icon name="chat" size={20} /></span>
                  <span className="home-workspace-copy">
                    <strong>Start a conversation</strong>
                    <span>Open chat with your selected model</span>
                  </span>
                  <Icon name="chevron" size={17} />
                </button>
                <button className="home-workspace-card" type="button" onClick={onOpenSavedChats}>
                  <span className="home-workspace-icon"><Icon name="history" size={20} /></span>
                  <span className="home-workspace-copy">
                    <strong>Saved conversations</strong>
                    <span>{chatCount} {chatCount === 1 ? 'conversation' : 'conversations'} on this device</span>
                  </span>
                  <Icon name="chevron" size={17} />
                </button>
                <button className="home-workspace-card" type="button" onClick={() => onOpenModels()}>
                  <span className="home-workspace-icon"><Icon name="grid" size={20} /></span>
                  <span className="home-workspace-copy">
                    <strong>Browse all models</strong>
                    <span>{models.length} models from your gateway</span>
                  </span>
                  <Icon name="chevron" size={17} />
                </button>
                <button
                  className="home-workspace-card"
                  type="button"
                  onClick={refreshModels}
                  disabled={modelsLoading}
                >
                  <span className={`home-workspace-icon ${modelsLoading ? 'is-spinning' : ''}`}>
                    <Icon name="refresh" size={20} />
                  </span>
                  <span className="home-workspace-copy">
                    <strong>{modelsLoading ? 'Refreshing availability…' : 'Refresh availability'}</strong>
                    <span>Check the latest gateway model status</span>
                  </span>
                  <Icon name="chevron" size={17} />
                </button>
              </div>
            </section>
          </div>
        </section>

        <section className="home-next-step" aria-labelledby="home-next-title">
          <div>
            <span className="home-eyebrow">A SIMPLE WORKFLOW</span>
            <h2 id="home-next-title">From model discovery to conversation</h2>
            <p>Choose an available model, open chat, and keep your conversation history in your browser.</p>
          </div>
          <div className="home-next-cards">
            <article>
              <span>01</span>
              <strong>Choose a model</strong>
              <p>Browse live availability from your gateway.</p>
            </article>
            <article>
              <span>02</span>
              <strong>Start chatting</strong>
              <p>Responses stream directly into your conversation.</p>
            </article>
            <article>
              <span>03</span>
              <strong>Return anytime</strong>
              <p>Your saved chats are available from your account through the configured cloud database.</p>
            </article>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <button
          className="home-brand home-footer-brand"
          type="button"
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        >
          <span className="home-brand-mark" aria-hidden="true"><span /></span>
          <span>iamhujju</span>
        </button>
        <span>Local AI workspace · Account-backed cloud conversations</span>
        <button
          className="home-footer-chat"
          type="button"
          onClick={() => openChat(selectedModel)}
          disabled={authChecking}
        >
          Open chat <Icon name="arrow" size={16} />
        </button>
      </footer>
      {storageError && (
        <div className="home-storage-warning" role="alert">
          {storageError}
        </div>
      )}
      {refreshNotice && (
        <div className="home-toast" role="status" aria-live="polite">
          {refreshNotice}
        </div>
      )}
      <AuthDialog
        isOpen={authOpen}
        mode={authMode}
        busy={authBusy}
        error={authError}
        onClose={() => {
          setAuthOpen(false);
          setAuthError('');
          setPendingModelId(null);
          onClearRequestedModel();
        }}
        onSubmit={submitAuth}
        onModeChange={mode => {
          setAuthMode(mode);
          setAuthError('');
        }}
      />
    </div>
  );
}

export default HomePage;
