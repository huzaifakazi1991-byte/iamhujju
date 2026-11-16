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
    close: <><path d="m18 6-12 12M6 6l12 12" /></>,
    cpu: <><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="9" y="9" width="6" height="6" /><path d="M9 1v3M15 1v3M9 20v3M15 20v3M20 9h3M20 14h3M1 9h3M1 14h3" /></>,
    zap: <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />,
    layers: <><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 17 12 22 22 17" /><polyline points="2 12 12 17 22 12" /></>,
    terminal: <><polyline points="4 17 10 11 4 5" /><line x1="12" y1="19" x2="20" y2="19" /></>,
    code: <><polyline points="16 18 22 12 16 6" /><polyline points="8 6 2 12 8 18" /></>,
    check: <polyline points="20 6 9 17 4 12" />
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
      strokeWidth="1.8"
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
    /qwen/i,
    /llama/i
  ]) {
    const match = catalog.find(model =>
      pattern.test(`${model.id} ${model.name || ''}`) &&
      !featured.some(item => item.id === model.id)
    );

    if (match) featured.push(match);
  }

  for (const model of catalog) {
    if (featured.length >= 6) break;
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
  if (id.includes('llama')) return 'L';
  if (id.includes('mistral')) return 'M';
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
      className="any-model-card"
      type="button"
      onClick={() => onSelect(model.id)}
      disabled={disabled}
      aria-label={`Start a chat with ${model.name || model.id}`}
    >
      <div className="any-model-card-top">
        <span className="any-model-badge" aria-hidden="true">
          {modelInitials(model)}
        </span>
        <div className="any-model-meta">
          <span className="any-model-provider">
            {model.provider === 'openrouter' ? 'OpenRouter' : 'FreeLLMAPI'}
          </span>
          <strong className="any-model-name">{model.name || model.id}</strong>
          <span className="any-model-id">{model.sourceId || model.id}</span>
        </div>
      </div>
      {typeof model.description === 'string' && model.description.trim() && (
        <p className="any-model-desc">{model.description.trim()}</p>
      )}
      <div className="any-model-card-footer">
        <span className="any-status-tag">100% Free</span>
        {contextLabel(model) && (
          <span className="any-context-tag">{contextLabel(model)}</span>
        )}
        <span className="any-card-cta">
          Chat <Icon name="arrow" size={14} />
        </span>
      </div>
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
          <div className="home-brand-mark" aria-hidden="true">
            <img src="/mascot.jpg" alt="iamhujju mascot" className="home-brand-mascot-thumb" />
          </div>
          <button
            className="home-auth-close"
            type="button"
            onClick={close}
            aria-label="Close sign in dialog"
          >
            <Icon name="close" size={18} />
          </button>
        </div>
        <span className="home-eyebrow">IAMHUJJU AI WORKSPACE</span>
        <h2 id="auth-title">{mode === 'signup' ? 'Create your free account' : 'Welcome back'}</h2>
        <p>
          {mode === 'signup'
            ? 'Sign up to unlock instant access to all free AI models without entering API keys.'
            : 'Sign in to access your models and resume your conversations.'}
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
            ? 'Connecting…'
            : mode === 'signup'
              ? 'Get Instant Free Access'
              : 'Sign in to Workspace'}
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
          🔒 Conversations are isolated and stored in your cloud database. Free tier models are ready instantly.
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
  const [activeTab, setActiveTab] = useState('chat');
  const [authOpen, setAuthOpen] = useState(Boolean(requestedModelId));
  const [authMode, setAuthMode] = useState('signup');
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
    setRefreshNotice('Checking latest model availability…');
    const refreshed = await onRefreshModels();
    setRefreshNotice(
      refreshed
        ? 'Model availability updated.'
        : 'Could not refresh model availability. See gateway status.'
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

  function openSignup(modelId = selectedModel) {
    if (authChecking) return;
    if (currentUser) {
      onOpenChat(modelId);
      return;
    }
    setPendingModelId(modelId || selectedModel);
    setAuthMode('signup');
    setAuthError('');
    setAuthOpen(true);
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

  const providers = [
    { name: 'OpenAI', icon: '⚡' },
    { name: 'Anthropic', icon: '🧠' },
    { name: 'Google', icon: '✨' },
    { name: 'DeepSeek', icon: '🐋' },
    { name: 'Meta', icon: '♾️' },
    { name: 'Mistral', icon: '🌪️' },
    { name: 'Qwen', icon: '🌐' },
    { name: 'Cohere', icon: '🔮' },
    { name: 'xAI', icon: '✖️' },
    { name: 'Perplexity', icon: '🔍' }
  ];

  return (
    <div className="any-home" id="home-top">
      {/* Background VFX Glow Orbs */}
      <div className="any-bg-glow glow-top-center" aria-hidden="true" />
      <div className="any-bg-glow glow-left-cyan" aria-hidden="true" />
      <div className="any-bg-glow glow-right-blue" aria-hidden="true" />

      {/* Top Navbar */}
      <header className="any-nav">
        <div className="any-nav-inner">
          <button
            className="any-brand"
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="iamhujju home"
          >
            <div className="any-brand-mascot-ring">
              <img src="/mascot.jpg" alt="iamhujju mascot" className="any-brand-mascot-img" />
            </div>
            <span className="any-brand-text">iamhujju</span>
          </button>

          <nav className="any-nav-links" aria-label="Main navigation">
            <button
              className="is-current"
              type="button"
              aria-current="page"
              onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            >
              Products
            </button>
            <button type="button" onClick={() => onOpenModels()}>
              Models
            </button>
            <button type="button" onClick={onOpenSkills}>
              Skills
            </button>
            <button type="button" onClick={onOpenSavedChats}>
              Saved Chats
            </button>
            <a
              href="https://openrouter.ai/docs"
              target="_blank"
              rel="noreferrer"
              className="any-nav-link-ext"
            >
              Docs
            </a>
          </nav>

          <div className="any-nav-tools">
            <span className={`any-status-pill ${connected ? 'is-online' : ''}`}>
              <span className="any-status-dot" />
              {authChecking
                ? 'Verifying'
                : modelsLoading
                  ? 'Connecting'
                  : connected
                    ? 'Online'
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
                className="any-btn-text"
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
              className="any-btn-glow"
              type="button"
              onClick={() => openChat(selectedModel)}
              disabled={authChecking}
            >
              <span>Open Chat</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </div>
      </header>

      {authRestoreError && (
        <div className="any-alert-bar" role="alert">
          <span>{authRestoreError}</span>
          <button type="button" onClick={onRetryAuth} disabled={authChecking}>
            {authChecking ? 'Retrying…' : 'Retry connection'}
          </button>
        </div>
      )}

      {storageNotice && (
        <div className="any-notice-bar" role="status">{storageNotice}</div>
      )}

      <main className="any-main">
        {/* HERO SECTION */}
        <section className="any-hero" aria-labelledby="hero-title">
          {/* Release announcement pill */}
          <div className="any-announcement-wrapper">
            <button
              type="button"
              className="any-announcement-pill"
              onClick={() => openChat(selectedModel)}
            >
              <span className="any-pill-badge">NEW</span>
              <span className="any-pill-text">
                Gemini 2.5 Flash, DeepSeek R1 & GPT-4o free models now ready
              </span>
              <span className="any-pill-arrow">→</span>
            </button>
          </div>

          {/* Main Hero Header and Headline */}
          <div className="any-hero-grid">
            {/* Mascot Showcase Card (Referencing Image 3 Marked Area) */}
            <div className="any-hero-mascot-card" aria-label="iamhujju AI Companion Mascot">
              <div className="any-mascot-outer-ring">
                <div className="any-mascot-inner-container">
                  <img
                    src="/mascot.jpg"
                    alt="iamhujju mascot - Your AI Companion"
                    className="any-mascot-visual"
                  />
                  <div className="any-mascot-badge">
                    <span className="any-mascot-pulse" />
                    <span>Free AI Engine</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Hero Copy */}
            <div className="any-hero-text">
              <h1 id="hero-title" className="any-hero-title">
                One AI Workspace for <span className="any-gradient-text">every model</span>
              </h1>
              <p className="any-hero-subtitle">
                Build, test, and chat with 400+ models. Free models ready instantly with zero API keys required, smart auto-routing, and account-backed cloud sync.
              </p>

              {/* Hero CTA Buttons */}
              <div className="any-hero-actions">
                <button
                  type="button"
                  className="any-btn-primary"
                  onClick={() => openSignup(selectedModel)}
                >
                  <span>{currentUser ? 'Go to Chat' : 'Get Started Free'}</span>
                  <Icon name="arrow" size={17} />
                </button>
                <button
                  type="button"
                  className="any-btn-secondary"
                  onClick={() => onOpenModels()}
                >
                  <Icon name="grid" size={17} />
                  <span>Browse Models</span>
                </button>
              </div>

              {/* Privacy badge */}
              <div className="any-hero-trust">
                <Icon name="shield" size={15} />
                <span>Zero configuration required · Enterprise encryption · Neon PostgreSQL</span>
              </div>
            </div>
          </div>

          {/* Interactive Preview Section (AnyAPI Style Tabs & Mockup) */}
          <div className="any-preview-container">
            {/* Tab switchers */}
            <div className="any-preview-tabs" role="tablist" aria-label="Feature Previews">
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'chat'}
                className={`any-tab-btn ${activeTab === 'chat' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('chat')}
              >
                <Icon name="chat" size={16} />
                <span>AnyChat</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'routing'}
                className={`any-tab-btn ${activeTab === 'routing' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('routing')}
              >
                <Icon name="zap" size={16} />
                <span>Smart Routing</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'hub'}
                className={`any-tab-btn ${activeTab === 'hub' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('hub')}
              >
                <Icon name="grid" size={16} />
                <span>Model Hub</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'analytics'}
                className={`any-tab-btn ${activeTab === 'analytics' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                <Icon name="cpu" size={16} />
                <span>Logs & Insights</span>
              </button>
            </div>

            {/* Mockup Window */}
            <div className="any-mockup-window" onClick={() => openChat(selectedModel)}>
              {/* Window Header */}
              <div className="any-mockup-chrome">
                <div className="any-chrome-dots">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                </div>
                <div className="any-chrome-title">
                  iamhujju - {activeTab === 'chat' ? 'AnyChat' : activeTab === 'routing' ? 'Smart Router' : activeTab === 'hub' ? 'Model Hub' : 'Analytics & Observability'}
                </div>
                <div className="any-chrome-status">
                  <span className="status-live-dot" />
                  <span>Free Tier · Active</span>
                </div>
              </div>

              {/* Mockup Body Content depending on active tab */}
              <div className="any-mockup-body">
                {activeTab === 'chat' && (
                  <div className="any-mockup-chat-layout">
                    {/* Mockup Sidebar */}
                    <div className="any-mockup-sidebar">
                      <div className="any-sidebar-item is-active">
                        <Icon name="chat" size={16} />
                        <span>Current Session</span>
                      </div>
                      <div className="any-sidebar-item">
                        <Icon name="layers" size={16} />
                        <span>Multi-Model Auto</span>
                      </div>
                      <div className="any-sidebar-item">
                        <Icon name="shield" size={16} />
                        <span>Encrypted Keys</span>
                      </div>
                      <div className="any-sidebar-divider" />
                      <div className="any-sidebar-label">RECENT CONVERSATIONS</div>
                      <div className="any-sidebar-chat-title">Architecting AI Swarms</div>
                      <div className="any-sidebar-chat-title">Fullstack React 19 App</div>
                    </div>

                    {/* Mockup Chat Screen */}
                    <div className="any-mockup-chat-main">
                      <div className="any-mock-msg user">
                        <div className="any-mock-avatar">U</div>
                        <div className="any-mock-bubble">
                          How can I run multiple AI models seamlessly without configuring separate provider billing?
                        </div>
                      </div>

                      <div className="any-mock-msg assistant">
                        <div className="any-mock-avatar ai">
                          <img src="/mascot.jpg" alt="AI mascot" className="any-mock-ai-icon" />
                        </div>
                        <div className="any-mock-bubble">
                          <div className="any-mock-model-pill">
                            <span className="pill-provider">google/gemini-2.5-flash-free</span>
                            <span className="pill-metric">182ms · 1M context · 100% Free</span>
                          </div>
                          <p>
                            With <strong>iamhujju</strong>, you have unified access to over 400 models. Our smart auto-routing instantly connects your prompt to the fastest free provider:
                          </p>
                          <div className="any-mock-code">
                            <code>{`// Free instant multi-model inference\nconst response = await ai.chat.completions.create({\n  model: "auto", // intelligently selects optimal free model\n  messages: [{ role: "user", content: "Optimize this pipeline" }]\n});`}</code>
                          </div>
                        </div>
                      </div>

                      {/* Mockup input box */}
                      <div className="any-mock-input-bar">
                        <input
                          type="text"
                          readOnly
                          value="Ask iamhujju anything across 400+ models..."
                        />
                        <button type="button" className="any-mock-send" aria-label="Send">
                          <Icon name="arrow" size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'routing' && (
                  <div className="any-mockup-routing-layout">
                    <div className="any-routing-grid">
                      <div className="any-routing-card">
                        <div className="card-top">
                          <span className="card-tag active">HEALTHY · 99.98%</span>
                          <span className="card-speed">142ms</span>
                        </div>
                        <h3>Google Gemini 2.5 Flash</h3>
                        <p>High throughput, 1M context tokens, multimodal support.</p>
                      </div>
                      <div className="any-routing-card">
                        <div className="card-top">
                          <span className="card-tag active">HEALTHY · 99.94%</span>
                          <span className="card-speed">198ms</span>
                        </div>
                        <h3>DeepSeek R1 / V3 Free</h3>
                        <p>Advanced chain-of-thought mathematical and coding reasoning.</p>
                      </div>
                      <div className="any-routing-card">
                        <div className="card-top">
                          <span className="card-tag active">HEALTHY · 99.99%</span>
                          <span className="card-speed">165ms</span>
                        </div>
                        <h3>Meta Llama 3.3 70B</h3>
                        <p>Open-weights powerhouse for creative writing and extraction.</p>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'hub' && (
                  <div className="any-mockup-hub-layout">
                    <div className="any-hub-header">
                      <span>400+ Discovered Models · Live Gateway Sync</span>
                      <button type="button" className="any-hub-btn" onClick={() => onOpenModels()}>
                        View Full Catalog →
                      </button>
                    </div>
                    <div className="any-hub-list">
                      {featuredModels.slice(0, 3).map(m => (
                        <div key={m.id} className="any-hub-row">
                          <div className="any-hub-col">
                            <strong>{m.name || m.id}</strong>
                            <span>{m.id}</span>
                          </div>
                          <span className="any-status-tag">Free Tier</span>
                          <span className="any-context-tag">{contextLabel(m) || 'Standard'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'analytics' && (
                  <div className="any-mockup-analytics-layout">
                    <div className="any-analytics-stats">
                      <div className="stat-box">
                        <span className="stat-label">Total Requests</span>
                        <span className="stat-val">12,480</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">Avg Latency</span>
                        <span className="stat-val">174 ms</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">Cache Hit Ratio</span>
                        <span className="stat-val">94.8%</span>
                      </div>
                      <div className="stat-box">
                        <span className="stat-label">Token Cost</span>
                        <span className="stat-val">$0.00 (Free)</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* PROVIDER LOGO TICKER */}
        <section className="any-partners-section">
          <p className="any-partners-title">Powered by leading AI providers</p>
          <div className="any-partners-ticker">
            <div className="any-partners-track">
              {providers.concat(providers).map((p, idx) => (
                <div key={idx} className="any-provider-chip">
                  <span className="provider-icon">{p.icon}</span>
                  <span className="provider-name">{p.name}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* 4 STATS GRID (EXACT ANYAPI LAYOUT) */}
        <section className="any-stats-section">
          <div className="any-stats-grid">
            <div className="any-stat-card">
              <span className="stat-sub">Access every major provider</span>
              <h2 className="stat-number">400+</h2>
              <span className="stat-label">AI Models</span>
            </div>
            <div className="any-stat-card">
              <span className="stat-sub">Start building in seconds</span>
              <h2 className="stat-number">Instant</h2>
              <span className="stat-label">Zero Setup</span>
            </div>
            <div className="any-stat-card">
              <span className="stat-sub">Enterprise grade reliability</span>
              <h2 className="stat-number">99.99%</h2>
              <span className="stat-label">Uptime</span>
            </div>
            <div className="any-stat-card">
              <span className="stat-sub">Intelligent load balancing</span>
              <h2 className="stat-number">Global</h2>
              <span className="stat-label">Smart Routing</span>
            </div>
          </div>
        </section>

        {/* FEATURE SECTION 1: ARCHITECTURE & UNIFIED HUB */}
        <section className="any-feature-section">
          <div className="any-feature-header">
            <span className="any-eyebrow-tag">BUILT FOR THE AI ERA</span>
            <h2>Integrate AI into every part of your stack</h2>
            <p>
              iamhujju goes beyond simple API calls, handles routing for reliability, and optimizes every request.
            </p>
          </div>

          <div className="any-feature-content-split">
            {/* Left Diagram Card */}
            <div className="any-arch-diagram-card">
              <div className="any-arch-center-node">
                <img src="/mascot.jpg" alt="iamhujju core" className="any-arch-core-mascot" />
                <span className="any-arch-core-label">iamhujju</span>
              </div>
              <div className="any-arch-branches">
                <div className="any-arch-branch-item">
                  <span className="branch-icon"><Icon name="code" size={17} /></span>
                  <div className="branch-info">
                    <strong>OpenAI SDK</strong>
                    <span>Drop-in compatible</span>
                  </div>
                </div>
                <div className="any-arch-branch-item">
                  <span className="branch-icon"><Icon name="zap" size={17} /></span>
                  <div className="branch-info">
                    <strong>Auto-routing</strong>
                    <span>400+ models</span>
                  </div>
                </div>
                <div className="any-arch-branch-item">
                  <span className="branch-icon"><Icon name="shield" size={17} /></span>
                  <div className="branch-info">
                    <strong>Unified Accounts</strong>
                    <span>100% Free tier ready</span>
                  </div>
                </div>
                <div className="any-arch-branch-item">
                  <span className="branch-icon"><Icon name="layers" size={17} /></span>
                  <div className="branch-info">
                    <strong>Built-in Skills</strong>
                    <span>Agentic toolkits</span>
                  </div>
                </div>
                <div className="any-arch-branch-item">
                  <span className="branch-icon"><Icon name="terminal" size={17} /></span>
                  <div className="branch-info">
                    <strong>Observability</strong>
                    <span>Full conversation history</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Text Description */}
            <div className="any-feature-text-block">
              <span className="any-tag-pill">UNIFIED API & WORKSPACE</span>
              <h3>Unified Hub for any model</h3>
              <p>
                Access every major AI model through a single, consistent interface. No more juggling multiple SDKs or learning different formats. Just one interface to rule them all.
              </p>
              <ul className="any-feature-checklist">
                <li>
                  <Icon name="check" size={16} />
                  <span>Free models ready instantly upon signing up</span>
                </li>
                <li>
                  <Icon name="check" size={16} />
                  <span>Capped tokens prevent surprise billing or credit rejections</span>
                </li>
                <li>
                  <Icon name="check" size={16} />
                  <span>Bring your own OpenRouter key whenever you want frontier models</span>
                </li>
              </ul>
              <div className="any-feature-actions">
                <button
                  type="button"
                  className="any-btn-primary"
                  onClick={() => onOpenModels()}
                >
                  <span>View Model Hub</span>
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURE SECTION 2: POPULAR MODELS SHOWCASE */}
        <section className="any-models-showcase-section">
          <div className="any-section-head">
            <div>
              <span className="any-eyebrow-tag">FREE & PRO READY</span>
              <h2>Featured Models Ready to Run</h2>
              <p>Explore live models available in your free tier without any setup.</p>
            </div>
            <form className="any-search-inline" onSubmit={submitSearch}>
              <Icon name="search" size={16} />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search models..."
              />
              <button type="submit">Search</button>
            </form>
          </div>

          <div className="any-models-grid">
            {visibleModels.slice(0, 6).map(model => (
              <ModelCard
                key={model.id}
                model={model}
                onSelect={openChat}
                disabled={authChecking}
              />
            ))}
          </div>

          <div className="any-models-footer-cta">
            <button
              type="button"
              className="any-btn-secondary"
              onClick={() => onOpenModels(query)}
            >
              <span>Explore All {models.length} Models</span>
              <Icon name="arrow" size={16} />
            </button>
          </div>
        </section>

        {/* FEATURE SECTION 3: 3 KEY PILLARS */}
        <section className="any-pillars-section">
          <div className="any-pillars-grid">
            <div className="any-pillar-card">
              <div className="pillar-icon-box">
                <Icon name="shield" size={24} />
              </div>
              <h3>Zero Data Retention</h3>
              <p>
                Your prompts, API keys, and private data are never trained on. Storage is isolated to your private Neon PostgreSQL instance.
              </p>
            </div>
            <div className="any-pillar-card">
              <div className="pillar-icon-box">
                <Icon name="zap" size={24} />
              </div>
              <h3>Smart Auto-Routing</h3>
              <p>
                The intelligent auto-router directs your request to the highest-performing available free model with sub-second failover.
              </p>
            </div>
            <div className="any-pillar-card">
              <div className="pillar-icon-box">
                <Icon name="cpu" size={24} />
              </div>
              <h3>Extend with Pro Models</h3>
              <p>
                Start 100% free with 18+ high-speed models. When you need GPT-5 or Claude 3.7 Pro, simply connect your personal provider key.
              </p>
            </div>
          </div>
        </section>

        {/* BOTTOM CALL TO ACTION BANNER */}
        <section className="any-cta-banner">
          <div className="any-cta-inner">
            <div className="any-cta-content">
              <h2>Everything you need to build on ANY model</h2>
              <p>
                Join developers and creators worldwide using iamhujju to chat, build, and test with leading AI models for free.
              </p>
              <div className="any-cta-buttons">
                <button
                  type="button"
                  className="any-btn-primary"
                  onClick={() => openSignup(selectedModel)}
                >
                  <span>Get Started Free</span>
                  <Icon name="arrow" size={17} />
                </button>
                <button
                  type="button"
                  className="any-btn-secondary"
                  onClick={onOpenSkills}
                >
                  <Icon name="sparkle" size={17} />
                  <span>Explore Skills</span>
                </button>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="any-footer">
        <div className="any-footer-inner">
          <div className="any-footer-brand-col">
            <div className="any-brand">
              <div className="any-brand-mascot-ring">
                <img src="/mascot.jpg" alt="iamhujju mascot" className="any-brand-mascot-img" />
              </div>
              <span className="any-brand-text">iamhujju</span>
            </div>
            <p className="any-footer-tagline">
              Your Personal AI Companion · One API & Workspace for every model.
            </p>
            <p className="any-footer-copy">
              © {new Date().getFullYear()} iamhujju.com · All rights reserved.
            </p>
          </div>

          <div className="any-footer-links-grid">
            <div className="footer-col">
              <h4>Workspace</h4>
              <button type="button" onClick={() => openChat(selectedModel)}>Chat</button>
              <button type="button" onClick={() => onOpenModels()}>Models</button>
              <button type="button" onClick={onOpenSkills}>Skills</button>
              <button type="button" onClick={onOpenSavedChats}>Saved Chats</button>
            </div>
            <div className="footer-col">
              <h4>Platform</h4>
              <button type="button" onClick={refreshModels}>Gateway Status</button>
              <button type="button" onClick={onOpenApiKeys}>API Keys</button>
              <button type="button" onClick={onOpenIntegrations}>Integrations</button>
            </div>
            <div className="footer-col">
              <h4>Security</h4>
              <span>Neon PostgreSQL</span>
              <span>AES-256 Key Encryption</span>
              <span>Zero Model Training</span>
            </div>
          </div>
        </div>
      </footer>

      {/* FLOATING ACTION CHAT BUBBLE (ANYAPI STYLE) */}
      <button
        type="button"
        className="any-floating-chat-bubble"
        onClick={() => openChat(selectedModel)}
        aria-label="Open AI Chat Assistant"
        title="Chat with iamhujju AI"
      >
        <img src="/mascot.jpg" alt="iamhujju mascot" className="any-floating-mascot-img" />
        <span className="any-floating-online-dot" />
      </button>

      {/* Storage and Toast Notifications */}
      {storageError && (
        <div className="any-toast-warning" role="alert">
          {storageError}
        </div>
      )}
      {refreshNotice && (
        <div className="any-toast-info" role="status" aria-live="polite">
          {refreshNotice}
        </div>
      )}

      {/* Auth Modal */}
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
