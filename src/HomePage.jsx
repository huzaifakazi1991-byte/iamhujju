import { useEffect, useMemo, useRef, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import DocsModal from './DocsModal.jsx';
import ContactModal from './ContactModal.jsx';
import AboutModal from './AboutModal.jsx';
import PaymentModal from './PaymentModal.jsx';
import { resolvePlan } from './pricingConfig.js';
import { signInWithGoogle, syncUserProfile } from './firebase.js';
import './HomePage.css';

const CURRENT_YEAR = new Date().getFullYear();

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
    check: <polyline points="20 6 9 17 4 12" />,
    key: <><circle cx="7.5" cy="15.5" r="4.5" /><path d="m10.8 12.2 7.7-7.7M17 6l2 2M15 8l2 2" /></>,
    tool: <><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" /></>,
    users: <><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" /></>,
    chart: <><line x1="18" y1="20" x2="18" y2="10" /><line x1="12" y1="20" x2="12" y2="4" /><line x1="6" y1="20" x2="6" y2="14" /></>,
    credit: <><rect x="1" y="4" width="22" height="16" rx="2" ry="2" /><line x1="1" y1="10" x2="23" y2="10" /></>,
    plus: <><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>,
    minus: <line x1="5" y1="12" x2="19" y2="12" />,
    tag: <><path d="m12 2 8 8-8 8H4V2Z" /><circle cx="8" cy="8" r="2" /></>,
    book: <><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z" /><path d="M6 2v20" /></>,
    info: <><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" /></>,
    bookmark: <path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2Z" />
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

function isFreeModel(model) {
  if (!model) return false;
  return Boolean(
    model.isFree ||
    model.tier === 'free' ||
    model.id?.includes(':free') ||
    model.id === 'huzaifa-kazi-omni' ||
    model.id === 'huzaifa-kazi' ||
    model.id === 'openrouter:openrouter/free' ||
    model.id === 'openrouter:openrouter/auto' ||
    model.id === 'auto'
  );
}

function getFeaturedModels(models) {
  const freeCatalog = models.filter(m =>
    isFreeModel(m) &&
    m.id !== 'auto' &&
    m.id !== 'fusion' &&
    !/\bslot\b/i.test(m.name || '')
  );
  const catalog = freeCatalog.length ? freeCatalog : models.filter(m => m.id !== 'auto' && m.id !== 'fusion');
  const featured = [];

  for (const pattern of [
    /gemini/i,
    /gemma/i,
    /deepseek/i,
    /qwen/i,
    /nemotron|nvidia/i,
    /llama/i,
    /ernie|baidu/i,
    /ling|inclusion/i
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
  const free = isFreeModel(model);
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
            {model.provider === 'openrouter' ? 'OpenRouter' : 'iamhujju Gateway'}
          </span>
          <strong className="any-model-name">{model.name || model.id}</strong>
          <span className="any-model-id">{model.sourceId || model.id}</span>
        </div>
      </div>
      {typeof model.description === 'string' && model.description.trim() && (
        <p className="any-model-desc">{model.description.trim()}</p>
      )}
      <div className="any-model-card-footer">
        <span className={free ? "any-status-tag" : "any-status-tag is-pro"}>
          {free ? '100% Free' : 'BYOK / Pro'}
        </span>
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
  onModeChange,
  onGoogleSignIn
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

        <button
          className="home-auth-google-btn"
          type="button"
          disabled={busy}
          onClick={onGoogleSignIn}
        >
          <svg className="google-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
          </svg>
          Continue with Google
        </button>

        <div className="home-auth-divider">
          <span>or continue with email</span>
        </div>

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
  error: _error,
  selectedModel,
  chatCount: _chatCount,
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
  onOpenSavedChats,
  onOpenPricing,
  onOpenCheckout: propOnOpenCheckout,
  onOpenLiveSupport
}) {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('chat');
  const [expandedFeature, setExpandedFeature] = useState(null);
  const [authOpen, setAuthOpen] = useState(Boolean(requestedModelId));
  const [authMode, setAuthMode] = useState('signup');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [pendingModelId, setPendingModelId] = useState(requestedModelId || null);
  const [refreshNotice, setRefreshNotice] = useState('');
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsTab, setDocsTab] = useState('quickstart');
  const [contactOpen, setContactOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [checkoutPlan, setCheckoutPlan] = useState(null);

  function handleOpenCheckout(plan) {
    if (typeof propOnOpenCheckout === 'function') {
      propOnOpenCheckout(resolvePlan(plan || 'pro'));
      return;
    }
    setCheckoutPlan(resolvePlan(plan || 'pro'));
    setPaymentModalOpen(true);
  }
  const [activeDropdown, setActiveDropdown] = useState(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const dropdownCloseTimeoutRef = useRef(null);
  const navRef = useRef(null);
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

  useEffect(() => {
    function handleClickOutside(event) {
      if (navRef.current && !navRef.current.contains(event.target)) {
        setActiveDropdown(null);
      }
    }
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setActiveDropdown(null);
        setMobileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  useEffect(() => {
    if (mobileMenuOpen) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [mobileMenuOpen]);

  function handleDropdownEnter(menu) {
    if (dropdownCloseTimeoutRef.current) {
      clearTimeout(dropdownCloseTimeoutRef.current);
      dropdownCloseTimeoutRef.current = null;
    }
    setActiveDropdown(menu);
  }

  function handleDropdownLeave() {
    dropdownCloseTimeoutRef.current = setTimeout(() => {
      setActiveDropdown(null);
    }, 180);
  }

  function toggleDropdown(menu) {
    setActiveDropdown(prev => (prev === menu ? null : menu));
  }

  function scrollToSection(id) {
    setActiveDropdown(null);
    setMobileMenuOpen(false);
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

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

  async function handleGoogleSignIn() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const firebaseUser = await signInWithGoogle();
      if (!firebaseUser?.email) {
        throw new Error('Google sign-in did not return an email address.');
      }

      // Sync profile to Cloud Firestore
      await syncUserProfile(firebaseUser);

      // Exchange with backend session
      const response = await fetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: firebaseUser.email,
          uid: firebaseUser.uid,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL
        })
      });

      let result;
      try {
        result = await response.json();
      } catch {
        throw new Error(`Authentication bridge failed (HTTP ${response.status}).`);
      }

      if (!response.ok) {
        throw new Error(result?.error?.message || 'Server session failed.');
      }

      setAuthOpen(false);
      setAuthBusy(false);
      setPendingModelId(null);
      setAuthError('');
      onAuthenticated(result.user, pendingModelId);
    } catch (err) {
      setAuthError(err.message || 'Google sign in failed.');
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
      <header className="any-nav" ref={navRef}>
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
            <span className="any-brand-text">Huzaifa Kazi</span>
          </button>

          <nav className="any-nav-links" aria-label="Main navigation">
            {/* 1. Products Dropdown */}
            <div
              className="any-nav-dropdown-wrapper"
              onMouseEnter={() => handleDropdownEnter('products')}
              onMouseLeave={handleDropdownLeave}
            >
              <button
                className={`any-nav-link-btn ${activeDropdown === 'products' ? 'is-active' : ''}`}
                type="button"
                aria-haspopup="true"
                aria-expanded={activeDropdown === 'products'}
                onClick={() => toggleDropdown('products')}
              >
                <span>Products</span>
                <svg
                  className={`any-nav-chevron ${activeDropdown === 'products' ? 'is-open' : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {activeDropdown === 'products' && (
                <div className="any-dropdown-menu any-dropdown-products" role="menu">
                  <div className="any-dropdown-header">
                    <span className="any-dropdown-eyebrow">PLATFORM & APIS</span>
                  </div>
                  <div className="any-dropdown-grid">
                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => scrollToSection('unified-api-section')}
                    >
                      <div className="dropdown-item-icon icon-cyan">
                        <Icon name="layers" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>Unified API</strong>
                          <span className="dropdown-item-badge">400+ Models</span>
                        </div>
                        <p>One OpenAI-compatible endpoint for every leading LLM</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setActiveDropdown(null);
                        openChat(selectedModel);
                      }}
                    >
                      <div className="dropdown-item-icon icon-blue">
                        <Icon name="chat" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>AnyChat</strong>
                          <span className="dropdown-item-badge badge-active">Playground</span>
                        </div>
                        <p>Compare models side-by-side with live prompt testing</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => scrollToSection('anycli-section')}
                    >
                      <div className="dropdown-item-icon icon-purple">
                        <Icon name="terminal" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>AnyCLI</strong>
                          <span className="dropdown-item-badge">Terminal</span>
                        </div>
                        <p>Run models, test prompts, and manage keys from CLI</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setActiveDropdown(null);
                        onOpenModels();
                      }}
                    >
                      <div className="dropdown-item-icon icon-emerald">
                        <Icon name="grid" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>Model Hub</strong>
                        </div>
                        <p>Explore benchmarks, context windows, and filters</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => scrollToSection('anychat-section')}
                    >
                      <div className="dropdown-item-icon icon-amber">
                        <Icon name="zap" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>Smart Routing</strong>
                        </div>
                        <p>Zero-downtime auto-fallback to free tier providers</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setActiveDropdown(null);
                        if (onOpenLiveSupport) onOpenLiveSupport();
                      }}
                    >
                      <div className="dropdown-item-icon icon-rose">
                        <Icon name="sparkle" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>Huzaifa Kazi AI</strong>
                          <span className="dropdown-item-badge badge-new">AI Companion</span>
                        </div>
                        <p>Live interactive assistant & unified multi-model intelligence</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 2. Pricing */}
            <button
              className="any-nav-link-btn"
              type="button"
              onClick={() => {
                setActiveDropdown(null);
                if (onOpenPricing) {
                  onOpenPricing();
                } else {
                  setDocsTab('pricing');
                  setDocsOpen(true);
                }
              }}
            >
              Pricing
            </button>

            {/* 3. Docs */}
            <button
              className="any-nav-link-btn"
              type="button"
              onClick={() => {
                setActiveDropdown(null);
                setDocsTab('quickstart');
                setDocsOpen(true);
              }}
            >
              Docs
            </button>

            {/* 4. Resources Dropdown */}
            <div
              className="any-nav-dropdown-wrapper"
              onMouseEnter={() => handleDropdownEnter('resources')}
              onMouseLeave={handleDropdownLeave}
            >
              <button
                className={`any-nav-link-btn ${activeDropdown === 'resources' ? 'is-active' : ''}`}
                type="button"
                aria-haspopup="true"
                aria-expanded={activeDropdown === 'resources'}
                onClick={() => toggleDropdown('resources')}
              >
                <span>Resources</span>
                <svg
                  className={`any-nav-chevron ${activeDropdown === 'resources' ? 'is-open' : ''}`}
                  width="12"
                  height="12"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="m6 9 6 6 6-6" />
                </svg>
              </button>

              {activeDropdown === 'resources' && (
                <div className="any-dropdown-menu any-dropdown-resources" role="menu">
                  <div className="any-dropdown-header">
                    <span className="any-dropdown-eyebrow">DEVELOPER RESOURCES</span>
                  </div>
                  <div className="any-dropdown-grid">
                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setActiveDropdown(null);
                        onOpenSkills();
                      }}
                    >
                      <div className="dropdown-item-icon icon-cyan">
                        <Icon name="tool" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>Skills Catalog</strong>
                          <span className="dropdown-item-badge">34+ Skills</span>
                        </div>
                        <p>Curated AI orchestration, tool execution, and agents</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setActiveDropdown(null);
                        onOpenSavedChats();
                      }}
                    >
                      <div className="dropdown-item-icon icon-purple">
                        <Icon name="history" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>Saved Chats</strong>
                          <span className="dropdown-item-badge">Cloud Sync</span>
                        </div>
                        <p>Cross-device chat history synced to Firestore</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setActiveDropdown(null);
                        setDocsTab('quickstart');
                        setDocsOpen(true);
                      }}
                    >
                      <div className="dropdown-item-icon icon-blue">
                        <Icon name="code" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>API Reference & SDKs</strong>
                        </div>
                        <p>Drop-in cURL, Node.js, and Python code examples</p>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="any-dropdown-item"
                      role="menuitem"
                      onClick={() => {
                        setActiveDropdown(null);
                        setDocsTab('cli');
                        setDocsOpen(true);
                      }}
                    >
                      <div className="dropdown-item-icon icon-emerald">
                        <Icon name="terminal" size={18} />
                      </div>
                      <div className="dropdown-item-text">
                        <div className="dropdown-item-title-row">
                          <strong>Terminal CLI Guide</strong>
                        </div>
                        <p>Installation guide and terminal command reference</p>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 5. About */}
            <button
              className="any-nav-link-btn"
              type="button"
              onClick={() => setAboutOpen(true)}
            >
              About
            </button>
          </nav>

          {/* Right Action Tools: Contact Us + Dashboard -> */}
          <div className="any-nav-tools">
            <button
              className="any-nav-contact-btn"
              type="button"
              onClick={() => setContactOpen(true)}
            >
              Contact Us
            </button>

            {currentUser ? (
              <AccountMenu
                user={currentUser}
                connected={connected}
                modelCount={models.length}
                onLogout={onLogout}
                onOpenApiKeys={onOpenApiKeys}
                onOpenIntegrations={onOpenIntegrations}
                onOpenCheckout={handleOpenCheckout}
                onOpenPricing={onOpenPricing || (() => {
                  setDocsTab('pricing');
                  setDocsOpen(true);
                })}
                onOpenSavedChats={onOpenSavedChats}
              />
            ) : null}

            <button
              className="any-btn-dashboard"
              type="button"
              onClick={() => openChat(selectedModel)}
              disabled={authChecking}
            >
              <span>Dashboard</span>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M5 12h14" />
                <path d="m13 6 6 6-6 6" />
              </svg>
            </button>

            {/* Mobile Hamburger Toggle */}
            <button
              className="any-nav-mobile-toggle"
              type="button"
              aria-label="Toggle mobile menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(prev => !prev)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {mobileMenuOpen ? (
                  <path d="M18 6 6 18M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="any-nav-mobile-drawer">
            <div className="mobile-drawer-section">
              <span className="mobile-drawer-label">Models & Workspace</span>
              <button type="button" onClick={() => { setMobileMenuOpen(false); openChat(selectedModel); }}>
                <Icon name="chat" size={18} />
                <span>AnyChat Workspace</span>
              </button>
              <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenModels(); }}>
                <Icon name="grid" size={18} />
                <span>400+ Models Catalog</span>
              </button>
              <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenSkills(); }}>
                <Icon name="cpu" size={18} />
                <span>Skills Catalog</span>
              </button>
              <button type="button" onClick={() => { setMobileMenuOpen(false); onOpenSavedChats(); }}>
                <Icon name="bookmark" size={18} />
                <span>Saved Conversations</span>
              </button>
            </div>

            <div className="mobile-drawer-section">
              <span className="mobile-drawer-label">Products & Architecture</span>
              <button type="button" onClick={() => scrollToSection('unified-api-section')}>
                <Icon name="layers" size={18} />
                <span>Unified API Gateway</span>
              </button>
              <button type="button" onClick={() => scrollToSection('anycli-section')}>
                <Icon name="terminal" size={18} />
                <span>AnyCLI Terminal</span>
              </button>
            </div>

            <div className="mobile-drawer-section">
              <span className="mobile-drawer-label">Pricing & Resources</span>
              <button type="button" onClick={() => {
                setMobileMenuOpen(false);
                if (onOpenPricing) onOpenPricing();
                else { setDocsTab('pricing'); setDocsOpen(true); }
              }}>
                <Icon name="tag" size={18} />
                <span>Transparent Pricing</span>
              </button>
              <button type="button" onClick={() => {
                setMobileMenuOpen(false);
                setDocsTab('quickstart');
                setDocsOpen(true);
              }}>
                <Icon name="book" size={18} />
                <span>Documentation & Guides</span>
              </button>
              <button type="button" onClick={() => {
                setMobileMenuOpen(false);
                setAboutOpen(true);
              }}>
                <Icon name="info" size={18} />
                <span>About Huzaifa Kazi</span>
              </button>
            </div>

            <div className="mobile-drawer-section">
              <span className="mobile-drawer-label">Account & Security</span>
              <button type="button" onClick={() => {
                setMobileMenuOpen(false);
                if (onOpenApiKeys) onOpenApiKeys();
              }}>
                <Icon name="key" size={18} />
                <span>API Keys Dashboard</span>
              </button>
              {onOpenIntegrations && (
                <button type="button" onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenIntegrations();
                }}>
                  <Icon name="settings" size={18} />
                  <span>Integrations</span>
                </button>
              )}
            </div>

            <div className="mobile-drawer-footer">
              <button
                className="any-btn-dashboard mobile-dash-btn"
                type="button"
                onClick={() => { setMobileMenuOpen(false); openChat(selectedModel); }}
              >
                <span>Launch Chat Workspace</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" />
                  <path d="m13 6 6 6-6 6" />
                </svg>
              </button>
              <button
                className="mobile-contact-btn"
                type="button"
                onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }}
              >
                Contact Us
              </button>
            </div>
          </div>
        )}
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
          <div className="any-hero-container">
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
              <div
                className="any-mascot-outer-ring"
                onClick={() => openChat(selectedModel)}
                role="button"
                tabIndex={0}
                onKeyDown={e => { if (e.key === 'Enter') openChat(selectedModel); }}
                title="Click to start chatting with your AI Companion"
              >
                <div className="any-mascot-inner-container">
                  <img
                    src="/iamhujju-mascot.jpg"
                    alt="iamhujju mascot"
                    className="any-mascot-visual"
                  />
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
                <span>AnyChat</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'cli'}
                className={`any-tab-btn ${activeTab === 'cli' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('cli')}
              >
                <span>AnyCLI</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'routing'}
                className={`any-tab-btn ${activeTab === 'routing' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('routing')}
              >
                <span>Smart Routing</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeTab === 'analytics'}
                className={`any-tab-btn ${activeTab === 'analytics' ? 'is-active' : ''}`}
                onClick={() => setActiveTab('analytics')}
              >
                <span>Logs & Analytics</span>
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
                  iamhujju - {activeTab === 'chat' ? 'AnyChat' : activeTab === 'cli' ? 'AnyCLI Terminal' : activeTab === 'routing' ? 'Smart Router' : 'Logs & Analytics'}
                </div>
                <div className="any-chrome-status">
                  <span className="status-live-dot" />
                  <span>Free Tier · Active</span>
                </div>
              </div>

              {/* Mockup Body Content depending on active tab */}
              <div className="any-mockup-body">
                {activeTab === 'chat' && (
                  <div className="any-mockup-anychat-3col">
                    {/* Column 1: Mini Navigation Sidebar */}
                    <div className="anychat-mini-sidebar">
                      <div className="anychat-brand">
                        <span className="anychat-brand-logo">A</span>
                        <strong>AnyAPi</strong>
                      </div>
                      <nav className="anychat-nav-list">
                        <div className="anychat-nav-item" role="button" tabIndex={0} onClick={onOpenApiKeys} style={{ cursor: 'pointer' }}><Icon name="key" size={13} /><span>API Keys</span></div>
                        <div className="anychat-nav-item is-active"><Icon name="chat" size={13} /><span>AnyChat</span></div>
                        <div className="anychat-nav-item"><Icon name="tool" size={13} /><span>Tools</span></div>
                        <div className="anychat-nav-item"><Icon name="grid" size={13} /><span>Model Hub</span></div>
                        <div className="anychat-nav-item"><Icon name="users" size={13} /><span>Team</span></div>
                        <div className="anychat-nav-item"><Icon name="terminal" size={13} /><span>Logs</span></div>
                        <div className="anychat-nav-item"><Icon name="credit" size={13} /><span>Billing</span></div>
                        <div className="anychat-nav-item"><Icon name="chart" size={13} /><span>Usage</span></div>
                      </nav>
                      <div className="anychat-quick-links">
                        <span className="quick-label">Quick Links</span>
                        <div className="anychat-nav-item"><Icon name="code" size={13} /><span>API Docs</span></div>
                      </div>
                    </div>

                    {/* Column 2: Parameters & Configuration Panel */}
                    <div className="anychat-config-panel">
                      <div className="config-panel-top">
                        <div className="config-tabs">
                          <span className="cfg-tab is-active">Configurations</span>
                          <span className="cfg-tab">Chat History</span>
                          <span className="cfg-add">+</span>
                        </div>
                        <div className="config-balance">
                          <span className="balance-symbol">₳</span>
                          <span className="balance-amount">93,218</span>
                          <span className="balance-gear">⚙️</span>
                        </div>
                      </div>

                      <div className="config-field-group">
                        <label className="cfg-label">API Key Source</label>
                        <div className="cfg-select-box">
                          <span>Current UI Session</span>
                          <span className="cfg-chevron">▾</span>
                        </div>
                      </div>

                      <div className="config-field-group">
                        <label className="cfg-label">Model</label>
                        <div className="cfg-select-box model-select-box">
                          <span className="cfg-model-plus">+</span>
                          <span className="cfg-model-val">google/gemini-2.5-flash-lite</span>
                          <span className="cfg-chevron">▾</span>
                        </div>
                      </div>

                      <div className="config-field-group">
                        <label className="cfg-label">Endpoint Type</label>
                        <div className="cfg-select-box">
                          <span className="cfg-mono">/v1/chat/completions</span>
                          <span className="cfg-chevron">▾</span>
                        </div>
                      </div>

                      <div className="config-field-group">
                        <label className="cfg-label">Capabilities</label>
                        <div className="cfg-chips-wrap">
                          <span className="cfg-chip">Vision</span>
                          <span className="cfg-chip">Audio Input</span>
                          <span className="cfg-chip">Video Input</span>
                          <span className="cfg-chip">System Messages</span>
                          <span className="cfg-chip">Native Streaming</span>
                          <span className="cfg-chip">JSON Schema</span>
                        </div>
                      </div>

                      <div className="config-field-group">
                        <label className="cfg-label">Tools</label>
                        <div className="cfg-chips-wrap">
                          <span className="cfg-chip">Function Calling</span>
                          <span className="cfg-chip">Web Search</span>
                        </div>
                      </div>

                      <div className="config-field-group">
                        <label className="cfg-label">Options</label>
                        <div className="cfg-chips-wrap">
                          <span className="cfg-chip">Prompt Caching</span>
                          <span className="cfg-chip">Response Schema</span>
                        </div>
                      </div>

                      <div className="config-field-group">
                        <label className="cfg-label">Playback</label>
                        <div className="cfg-chips-wrap">
                          <span className="cfg-chip">Seed</span>
                          <span className="cfg-chip">Assistant Prefix</span>
                          <span className="cfg-chip">Reasoning</span>
                        </div>
                      </div>
                    </div>

                    {/* Column 3: Live Courtroom Chat Interaction */}
                    <div className="anychat-conversation-area">
                      <div className="conversation-top-bar">
                        <span className="top-model-params">⚙ Model Parameters</span>
                      </div>

                      <div className="conversation-scroll">
                        {/* User Message */}
                        <div className="conv-msg-user">
                          <span className="user-tag-pill">User</span>
                          <div className="user-bubble-content">
                            My friend says pineapple on pizza is a crime. Build my defence as a courtroom lawyer.
                          </div>
                        </div>

                        {/* Assistant Message */}
                        <div className="conv-msg-assistant">
                          <div className="assistant-tag-pill">
                            <span className="asst-role">assistant</span>
                            <span className="asst-model">google/gemini-2.5-flash-lite</span>
                          </div>
                          <div className="assistant-bubble-content">
                            <p>May it please the Tribunal of Taste, esteemed colleagues, and especially, my distinguished opponent, the staunch defender of the orthodox pizza.</p>
                            <p>We stand here today not in a court of law, but in a much more sacred chamber: the chamber of personal culinary preference. My client, the humble, yet often maligned, pineapple topping, stands accused by my friend — the prosecution, if you will — of a grave offense: being a &ldquo;crime&rdquo; on a pizza.</p>
                            <p>I submit to you, Your Honor, that this accusation is not only unfounded but a gross mischaracterization of a culinary delight. I stand before you to dismantle this baseless claim and present the irrefutable defense of pineapple on pizza.</p>
                            <strong>Opening Statement:</strong>
                            <p>Your Honor, the prosecution has painted a picture of anarchy, of gastronomic heresy. They claim the addition of pineapple is an act so egregious it borders on criminal. I say to you, this is an assault on freedom, an attack on innovation, and a betrayal of the very spirit of pizza — a dish born from humble origins and perfected through countless variations! My client, pineapple, is not a criminal; it is a catalyst. It is an enhancer. It is, dare I say, a visionary.</p>
                          </div>
                        </div>
                      </div>

                      {/* Mockup Bottom Input Bar */}
                      <div className="anychat-mockup-input">
                        <input
                          type="text"
                          readOnly
                          placeholder="Type your message here... (Shift+Enter for new line; Alt+R to record)"
                        />
                        <div className="mockup-input-actions">
                          <span className="input-icon-mic">🎙️</span>
                          <button type="button" className="input-send-btn" aria-label="Send">
                            <Icon name="arrow" size={15} />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'cli' && (
                  <div className="any-mockup-cli-layout">
                    <div className="cli-terminal-mock">
                      <div className="cli-terminal-header">
                        <span className="dot dot-red" />
                        <span className="dot dot-yellow" />
                        <span className="dot dot-green" />
                        <span className="cli-title">bash - iamhujju-cli v2.4.0</span>
                      </div>
                      <div className="cli-terminal-body">
                        <p className="cli-line"><span className="cli-prompt">$</span> npx iamhujju chat --model &ldquo;auto&rdquo;</p>
                        <p className="cli-line dim">→ Discovering available models...</p>
                        <p className="cli-line success">✓ Connected to gateway. 435 models ready.</p>
                        <p className="cli-line info">✦ Auto-selected: Google Gemini 2.5 Flash [100% Free Tier]</p>
                        <p className="cli-line dim">→ Latency: 142ms | Context: 1049K tokens</p>
                        <p className="cli-line prompt-text"><span className="cli-prompt">&gt;</span> Build a high-throughput multi-agent API router in Node.js</p>
                        <p className="cli-line stream-response">Streaming response (184 tok/s)...</p>
                        <div className="cli-code-block">
                          <code>{`// Drop-in compatible with OpenAI SDK\nimport OpenAI from 'openai';\nconst client = new OpenAI({\n  baseURL: 'https://iamhujju.com/api/v1',\n  apiKey: 'iamhujju-free-tier'\n});\nconst res = await client.chat.completions.create({\n  model: 'openrouter/free',\n  messages: [{ role: 'user', content: 'Ready' }]\n});`}</code>
                        </div>
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

        {/* FEATURE SECTION 1: UNIFIED API (EXACT ANYAPI IMAGE 1 LAYOUT) */}
        <section className="any-feature-section" id="unified-api-section">
          <div className="any-feature-header">
            <span className="any-eyebrow-tag">BUILT FOR THE AI ERA</span>
            <h2>Integrate AI into every part of your stack</h2>
            <p>
              iamhujju goes beyond simple API calls, handles routing for reliability, and optimizes every request.
            </p>
          </div>

          <div className="any-feature-content-split">
            {/* Left Diagram Card with Animated Fiber-Optic Tree (Image 1) */}
            <div className="any-unified-card-container">
              <div className="any-unified-diagram">
                {/* Brand Hub Node on Left */}
                <div className="any-hub-node-box">
                  <div className="any-hub-logo-mark">
                    <span className="any-hub-a-symbol">A</span>
                  </div>
                </div>

                {/* SVG Glowing Fiber Conduits */}
                <svg className="any-fiber-svg" viewBox="0 0 160 380" fill="none" preserveAspectRatio="none">
                  <path d="M 0 190 C 80 190, 80 38, 160 38" stroke="rgba(0, 242, 254, 0.45)" strokeWidth="2" strokeDasharray="4 4" />
                  <path d="M 0 190 C 80 190, 80 114, 160 114" stroke="rgba(0, 242, 254, 0.55)" strokeWidth="2" />
                  <path d="M 0 190 L 160 190" stroke="rgba(0, 242, 254, 0.75)" strokeWidth="2.5" />
                  <path d="M 0 190 C 80 190, 80 266, 160 266" stroke="rgba(0, 242, 254, 0.55)" strokeWidth="2" />
                  <path d="M 0 190 C 80 190, 80 342, 160 342" stroke="rgba(0, 242, 254, 0.45)" strokeWidth="2" strokeDasharray="4 4" />

                  <circle cx="80" cy="38" r="3.5" fill="#00f2fe" className="pulse-dot" />
                  <circle cx="80" cy="114" r="3.5" fill="#00f2fe" className="pulse-dot" />
                  <circle cx="80" cy="190" r="4" fill="#00f2fe" className="pulse-dot" />
                  <circle cx="80" cy="266" r="3.5" fill="#00f2fe" className="pulse-dot" />
                  <circle cx="80" cy="342" r="3.5" fill="#00f2fe" className="pulse-dot" />
                </svg>

                {/* 5 Feature Cards on Right */}
                <div className="any-fiber-cards-column">
                  <div
                    className={`any-fiber-row ${expandedFeature === 'sdk' ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedFeature(expandedFeature === 'sdk' ? null : 'sdk')}
                  >
                    <div className="row-main">
                      <span className="row-icon"><Icon name="code" size={16} /></span>
                      <div className="row-text">
                        <strong>OpenAI SDK</strong>
                        <span>Drop-in compatible</span>
                      </div>
                      <button type="button" className="row-plus-btn" aria-label="Toggle details">
                        {expandedFeature === 'sdk' ? '−' : '+'}
                      </button>
                    </div>
                    {expandedFeature === 'sdk' && (
                      <div className="row-expanded-detail">
                        <code>import OpenAI from 'openai';<br />const ai = new OpenAI({'{'} baseURL: '/api/v1' {'}'});</code>
                      </div>
                    )}
                  </div>

                  <div
                    className={`any-fiber-row ${expandedFeature === 'routing' ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedFeature(expandedFeature === 'routing' ? null : 'routing')}
                  >
                    <div className="row-main">
                      <span className="row-icon"><Icon name="zap" size={16} /></span>
                      <div className="row-text">
                        <strong>Auto-routing</strong>
                        <span>400+ models</span>
                      </div>
                      <button type="button" className="row-plus-btn" aria-label="Toggle details">
                        {expandedFeature === 'routing' ? '−' : '+'}
                      </button>
                    </div>
                    {expandedFeature === 'routing' && (
                      <div className="row-expanded-detail">
                        <span>Intelligently routes requests to the fastest online model with sub-second failover.</span>
                      </div>
                    )}
                  </div>

                  <div
                    className={`any-fiber-row ${expandedFeature === 'billing' ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedFeature(expandedFeature === 'billing' ? null : 'billing')}
                  >
                    <div className="row-main">
                      <span className="row-icon"><Icon name="credit" size={16} /></span>
                      <div className="row-text">
                        <strong>Unified billing</strong>
                        <span>One invoice</span>
                      </div>
                      <button type="button" className="row-plus-btn" aria-label="Toggle details">
                        {expandedFeature === 'billing' ? '−' : '+'}
                      </button>
                    </div>
                    {expandedFeature === 'billing' && (
                      <div className="row-expanded-detail">
                        <span>100% Free models ready instantly with zero credit cards, plus single BYOK key for Pro.</span>
                      </div>
                    )}
                  </div>

                  <div
                    className={`any-fiber-row ${expandedFeature === 'rag' ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedFeature(expandedFeature === 'rag' ? null : 'rag')}
                  >
                    <div className="row-main">
                      <span className="row-icon"><Icon name="layers" size={16} /></span>
                      <div className="row-text">
                        <strong>Built-in RAG</strong>
                        <span>Vector & retrieval</span>
                      </div>
                      <button type="button" className="row-plus-btn" aria-label="Toggle details">
                        {expandedFeature === 'rag' ? '−' : '+'}
                      </button>
                    </div>
                    {expandedFeature === 'rag' && (
                      <div className="row-expanded-detail">
                        <span>Autonomous skills, PDF upload parsing, and persistent Neon PostgreSQL vector store.</span>
                      </div>
                    )}
                  </div>

                  <div
                    className={`any-fiber-row ${expandedFeature === 'observability' ? 'is-expanded' : ''}`}
                    onClick={() => setExpandedFeature(expandedFeature === 'observability' ? null : 'observability')}
                  >
                    <div className="row-main">
                      <span className="row-icon"><Icon name="chart" size={16} /></span>
                      <div className="row-text">
                        <strong>Observability</strong>
                        <span>Logs & spend</span>
                      </div>
                      <button type="button" className="row-plus-btn" aria-label="Toggle details">
                        {expandedFeature === 'observability' ? '−' : '+'}
                      </button>
                    </div>
                    {expandedFeature === 'observability' && (
                      <div className="row-expanded-detail">
                        <span>Real-time per-request token counters, latency breakdown, and cloud conversation history.</span>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Right Text Block */}
            <div className="any-feature-text-block">
              <span className="any-tag-pill">UNIFIED API</span>
              <h2>Unified API for any model</h2>
              <p>
                Access every major AI model through a single, consistent API. No more juggling multiple SDKs or learning different formats. Just one interface to rule them all.
              </p>
              <span className="any-feature-included-note">Included with all iamhujju plans at no extra cost.</span>
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

        {/* FEATURE SECTION 2: COMPARE & PROTOTYPE (IMAGE 2) */}
        <section className="any-feature-section any-section-reverse" id="anychat-section">
          <div className="any-feature-content-split">
            {/* Left Copy */}
            <div className="any-feature-text-block">
              <span className="any-tag-pill">ANYCHAT</span>
              <h2>Compare and prototype with leading models</h2>
              <p>
                Interactive developer playground to test prompts, compare model outputs side by side, debug responses, and fine-tune your AI integrations in real time before they go live.
              </p>
              <div className="any-feature-actions">
                <button
                  type="button"
                  className="any-btn-primary"
                  onClick={() => openChat(selectedModel)}
                >
                  <span>Open AnyChat</span>
                  <Icon name="arrow" size={16} />
                </button>
              </div>
            </div>

            {/* Right 3D Visual Card (Image 2) */}
            <div className="any-multimodel-card-container">
              <div className="multimodel-glass-board">
                {/* Left Prompt Node */}
                <div className="prompt-node-box">
                  <span className="prompt-chat-icon">💬</span>
                </div>

                {/* 4 Multi-colored Glowing Conduits to 4 Model Columns */}
                <div className="multimodel-columns-grid">
                  <div className="model-col-glass cyan-border">
                    <div className="col-top-icon cyan-bg">✨</div>
                    <span className="col-model-name">Gemini 2.5</span>
                    <div className="col-sample-lines">
                      <span className="sample-line" />
                      <span className="sample-line short" />
                    </div>
                    <div className="col-stat-pill">142ms</div>
                  </div>

                  <div className="model-col-glass green-border">
                    <div className="col-top-icon green-bg">🐋</div>
                    <span className="col-model-name">DeepSeek R1</span>
                    <div className="col-sample-lines">
                      <span className="sample-line" />
                      <span className="sample-line short" />
                    </div>
                    <div className="col-stat-pill">198ms</div>
                  </div>

                  <div className="model-col-glass amber-border">
                    <div className="col-top-icon amber-bg">⚡</div>
                    <span className="col-model-name">GPT-4.1</span>
                    <div className="col-sample-lines">
                      <span className="sample-line" />
                      <span className="sample-line short" />
                    </div>
                    <div className="col-stat-pill">175ms</div>
                  </div>

                  <div className="model-col-glass purple-border">
                    <div className="col-top-icon purple-bg">🧠</div>
                    <span className="col-model-name">Claude 3.7</span>
                    <div className="col-sample-lines">
                      <span className="sample-line" />
                      <span className="sample-line short" />
                    </div>
                    <div className="col-stat-pill">189ms</div>
                  </div>
                </div>

                {/* Converging Green Checkmark Platform */}
                <div className="converge-platform">
                  <div className="converge-check-circle">✓</div>
                  <span className="converge-label">Optimal Response Selected</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* FEATURE SECTION 3: ANYCLI (IMAGE 3) */}
        <section className="any-feature-section" id="anycli-section">
          <div className="any-feature-content-split">
            {/* Left 3D Terminal Card */}
            <div className="any-terminal-card-container">
              <div className="terminal-3d-box">
                <div className="terminal-topbar">
                  <span className="dot dot-red" />
                  <span className="dot dot-yellow" />
                  <span className="dot dot-green" />
                  <span className="terminal-name">iamhujju-cli</span>
                </div>
                <div className="terminal-code-body">
                  <p><span className="t-green">&gt;</span> _</p>
                  <p className="t-cyan">$ npx iamhujju run --auto</p>
                  <p className="t-dim">Connecting gateway... [OK]</p>
                  <p className="t-dim">Selecting lowest latency free tier model...</p>
                  <p className="t-green">✔ Connected: google/gemini-2.5-flash-exp (142ms)</p>
                </div>
                {/* Glowing Emerald Energy Conduit to Result Badge */}
                <div className="terminal-energy-beam" />
                <div className="terminal-result-badge">
                  <span className="result-star">✦</span>
                  <div className="result-lines">
                    <span className="r-line" />
                    <span className="r-line r-short" />
                  </div>
                </div>
              </div>
            </div>

            {/* Right Text Block */}
            <div className="any-feature-text-block">
              <span className="any-tag-pill">ANYCLI</span>
              <h2>Run AI from your terminal</h2>
              <p>
                Powerful command-line interface for managing API keys, testing endpoints, and deploying configurations directly from your terminal.
              </p>
              <div className="any-feature-actions">
                <button
                  type="button"
                  className="any-btn-primary"
                  onClick={() => {
                    setDocsTab('cli');
                    setDocsOpen(true);
                  }}
                >
                  <span>Install AnyCLI</span>
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

        {/* ABOUT & WHY BUILDERS LOVE IAMHUJJU (BENTO GRID & METRICS) */}
        <section className="any-about-home-section" id="about">
          <div className="any-section-header">
            <span className="any-eyebrow">THE FUTURE OF AI INTEGRATION</span>
            <h2>Why builders love iamhujju</h2>
            <p className="any-section-sub">
              One powerful toolkit that handles everything. Ship smarter, scale faster, connect anything.
            </p>
          </div>

          <div className="any-bento-home-grid">
            <div className="any-bento-home-card bento-wide">
              <span className="bento-badge-tag">INFRASTRUCTURE</span>
              <h3>Reliability at Scale</h3>
              <p>APIs should never fail your users. Multi-region routing, automatic fallbacks, and drop-in streaming SDKs keep your flows running smoothly.</p>
              <div className="bento-home-chips">
                <span>Multi-region routing (EU / US / ASIA)</span>
                <span>Automatic fallbacks</span>
                <span>Python & Node.js streaming</span>
              </div>
            </div>

            <div className="any-bento-home-card">
              <span className="bento-badge-tag">CAPABILITIES</span>
              <h3>Advanced Capabilities</h3>
              <p>Finetuned models, Computer Use automation, RAG vector stores, tool calling, and structured JSON.</p>
              <div className="bento-home-chips">
                <span>Finetuned models</span>
                <span>Computer Use</span>
                <span>RAG</span>
              </div>
            </div>

            <div className="any-bento-home-card">
              <span className="bento-badge-tag security-tag">SECURITY</span>
              <h3>Enterprise Security</h3>
              <p>AES-256 encrypted provider keys, isolated Neon PostgreSQL databases, and 100% zero model training.</p>
              <div className="bento-home-chips">
                <span>AES-256</span>
                <span>Neon PostgreSQL</span>
                <span>Zero Training</span>
              </div>
            </div>

            <div className="any-bento-home-card bento-wide">
              <span className="bento-badge-tag future-tag">ROADMAP</span>
              <h3>Future Ready</h3>
              <p>Built for what comes next: Multi-Agent swarms, shared context memory, intelligent auto-routing, and AnyChat Mobile.</p>
              <div className="bento-home-chips">
                <span>🤖 Multi-Agent Systems</span>
                <span>🔄 Shared Context</span>
                <span>⚡ Auto-Routing</span>
                <span>📱 AnyChat Mobile</span>
              </div>
            </div>
          </div>

          {/* AI That Never Sleeps Metric Counters */}
          <div className="any-home-metrics-row">
            <div className="home-metric-card">
              <span className="metric-val">99.9%</span>
              <strong>Service Availability</strong>
              <p>Enterprise reliability every second of the day.</p>
            </div>
            <div className="home-metric-card">
              <span className="metric-val">&lt;50ms</span>
              <strong>Lightning Fast</strong>
              <p>Ultra-low gateway latency for production.</p>
            </div>
            <div className="home-metric-card">
              <span className="metric-val">AES-256</span>
              <strong>Hardware Security</strong>
              <p>Encrypted keys and private DB isolation.</p>
            </div>
            <div className="home-metric-card">
              <span className="metric-val">400+</span>
              <strong>Models Available</strong>
              <p>Every frontier and open weight AI in one API.</p>
            </div>
          </div>

          <div className="any-about-home-cta-row">
            <button
              type="button"
              className="any-about-explore-btn"
              onClick={() => setAboutOpen(true)}
            >
              📖 Explore Full Story & Team
            </button>
          </div>
        </section>

        {/* BOTTOM CALL TO ACTION & PRICING/QUICKSTART CARDS (IMAGE 4) */}
        <section className="any-cta-banner any-cta-landscape">
          <div className="any-cta-inner">
            <div className="any-cta-content">
              <h2>Everything you need to build on ANY model</h2>
              <p className="any-cta-subhead">
                Gateway · Playground · CLI · Analytics · RAG · Agents
              </p>
              <div className="any-cta-buttons">
                <button
                  type="button"
                  className="any-btn-primary"
                  onClick={() => {
                    if (currentUser) {
                      onOpenApiKeys();
                    } else {
                      openSignup(selectedModel);
                    }
                  }}
                >
                  <span>Get free API key</span>
                  <Icon name="arrow" size={17} />
                </button>
                <button
                  type="button"
                  className="any-btn-secondary"
                  onClick={() => {
                    window.location.href = 'mailto:contact@iamhujju.com?subject=iamhujju Enterprise & Sales Inquiry';
                  }}
                >
                  <span>Contact sales</span>
                </button>
              </div>

              {/* Two Bottom Glass Cards from Image 4 */}
              <div className="any-cta-cards-grid">
                <div
                  className="any-cta-glass-card"
                  onClick={() => {
                    if (onOpenPricing) onOpenPricing();
                    else {
                      setDocsTab('pricing');
                      setDocsOpen(true);
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      if (onOpenPricing) onOpenPricing();
                      else {
                        setDocsTab('pricing');
                        setDocsOpen(true);
                      }
                    }
                  }}
                >
                  <span className="cta-card-pill">PRICING ON YOUR TERMS</span>
                  <h3>Pick the plan that fits your scale</h3>
                  <p>Pay-as-you-go, team, and enterprise tiers with transparent per-token pricing across every provider.</p>
                  <span className="cta-card-link">Pricing details →</span>
                </div>
                <div
                  className="any-cta-glass-card"
                  onClick={() => {
                    setDocsTab('quickstart');
                    setDocsOpen(true);
                  }}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => { if (e.key === 'Enter') { setDocsTab('quickstart'); setDocsOpen(true); } }}
                >
                  <span className="cta-card-pill">START BUILDING</span>
                  <h3>Ship your first request in minutes</h3>
                  <p>Drop-in OpenAI-compatible SDK, copy-paste curl, and SDKs for TypeScript, Python, Go, and Rust.</p>
                  <span className="cta-card-link">Quickstart →</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* CONTACT US SECTION */}
        <section className="any-contact-section" id="contact">
          <div className="any-section-header">
            <span className="any-eyebrow">GET IN TOUCH</span>
            <h2>Let's Build Something Smarter, Together</h2>
            <p className="any-section-sub">
              Got a question, idea, or integration challenge? Our team is here to help you connect iamhujju to anywhere.
            </p>
          </div>
          <div className="any-contact-hero-actions">
            <a
              href="https://t.me/+919975649957"
              target="_blank"
              rel="noopener noreferrer"
              className="any-contact-action-pill telegram-pill"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="m22 2-7 20-4-9-9-4Z" />
                <path d="M22 2 11 13" />
              </svg>
              <span>Telegram: +91 99756 49957</span>
            </a>
            <a
              href="mailto:huzaifakazi1991@gmail.com"
              className="any-contact-action-pill email-pill"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="20" height="16" x="2" y="4" rx="2" />
                <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
              </svg>
              <span>Email: huzaifakazi1991@gmail.com</span>
            </a>
            <button
              type="button"
              className="any-contact-action-pill form-pill"
              onClick={() => setContactOpen(true)}
            >
              ✉️ Open Full Contact Form
            </button>
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
              <span className="any-brand-text">Huzaifa Kazi</span>
            </div>
            <p className="any-footer-tagline">
              Your Personal AI Companion · One API & Workspace for every model.
            </p>
            <p className="any-footer-copy">
              © {CURRENT_YEAR} iamhujju.com · All rights reserved.
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
              <button type="button" onClick={() => {
                if (onOpenPricing) onOpenPricing();
                else { setDocsTab('pricing'); setDocsOpen(true); }
              }}>Pricing & Plans</button>
              <button type="button" onClick={() => setAboutOpen(true)}>About iamhujju</button>
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
            <div className="footer-col">
              <h4>Contact</h4>
              <button type="button" onClick={() => setContactOpen(true)}>Contact Form</button>
              <a href="https://t.me/+919975649957" target="_blank" rel="noopener noreferrer">Telegram (+919975649957)</a>
              <a href="mailto:huzaifakazi1991@gmail.com">Email Us</a>
            </div>
          </div>
        </div>
      </footer>

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
        onGoogleSignIn={handleGoogleSignIn}
        onModeChange={mode => {
          setAuthMode(mode);
          setAuthError('');
        }}
      />

      {/* Docs & API Quickstart Modal */}
      <DocsModal
        isOpen={docsOpen}
        onClose={() => setDocsOpen(false)}
        initialTab={docsTab}
        onOpenChat={() => openChat(selectedModel)}
        onOpenApiKeys={onOpenApiKeys}
        onOpenContact={() => setContactOpen(true)}
        currentUser={currentUser}
        onOpenSignup={() => openSignup(selectedModel)}
        onOpenCheckout={handleOpenCheckout}
      />

      {/* AnyAPI Contact Modal */}
      <ContactModal
        isOpen={contactOpen}
        onClose={() => setContactOpen(false)}
        onOpenDocs={(tab) => {
          setDocsTab(tab || 'quickstart');
          setDocsOpen(true);
        }}
      />

      {/* AnyAPI About Modal */}
      <AboutModal
        isOpen={aboutOpen}
        onClose={() => setAboutOpen(false)}
        onStartBuilding={() => openChat(selectedModel)}
        onOpenContact={() => setContactOpen(true)}
        onOpenDocs={(tab) => {
          setDocsTab(tab || 'quickstart');
          setDocsOpen(true);
        }}
      />

      {/* Razorpay & UPI Secure Payment Checkout Modal */}
      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        plan={checkoutPlan}
        currentUser={currentUser}
        onPaymentSuccess={(updatedUser) => {
          if (updatedUser && onAuthenticated) {
            onAuthenticated(updatedUser);
          }
        }}
      />
    </div>
  );
}

export default HomePage;
