import { useEffect, useMemo, useRef, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import DocsModal from './DocsModal.jsx';
import ContactModal from './ContactModal.jsx';
import AboutModal from './AboutModal.jsx';
import LiveSupportWidget from './LiveSupportWidget.jsx';
import { signInWithGoogle, syncUserProfile } from './firebase.js';
import './HomePage.css';

export default function HomePage({
  models = [],
  modelsLoading = false,
  connected = true,
  error = '',
  selectedModel = 'auto',
  chatCount = 0,
  authChecking = false,
  currentUser = null,
  storageError = '',
  storageNotice = '',
  authRestoreError = '',
  requestedModelId = null,
  initialAuthOpen = false,
  onClearRequestedModel = () => {},
  onRetryAuth = () => {},
  onAuthenticated = () => {},
  onLogout = () => {},
  onOpenApiKeys = () => {},
  onOpenIntegrations = () => {},
  onRefreshModels = () => {},
  onOpenChat = () => {},
  onOpenModels = () => {},
  onOpenSkills = () => {},
  onOpenSavedChats = () => {},
}) {
  // Navigation & Menu States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);

  // Modals
  const [authOpen, setAuthOpen] = useState(initialAuthOpen);
  const [authMode, setAuthMode] = useState('login'); // 'login' | 'signup'
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [pendingModelId, setPendingModelId] = useState(null);

  const [contactOpen, setContactOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [docsOpen, setDocsOpen] = useState(false);
  const [docsTab, setDocsTab] = useState('quickstart');

  // Interactive Showcase Tab (Hero macOS window)
  const [activeHeroTab, setActiveHeroTab] = useState('chat'); // 'chat' | 'arena' | 'routing' | 'analytics'

  // Featured Models Category Filter
  const [activeCategory, setActiveCategory] = useState('all'); // 'all' | 'reasoning' | 'coding' | 'free'

  const navRef = useRef(null);

  // Sync /login in URL with auth modal
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (authOpen) {
      if (window.location.pathname !== '/login') {
        window.history.pushState({}, '', '/login');
      }
    } else {
      if (window.location.pathname === '/login') {
        window.history.pushState({}, '', '/');
      }
    }
  }, [authOpen]);

  // Click outside listener for mega-menus
  useEffect(() => {
    function handleClickOutside(e) {
      if (navRef.current && !navRef.current.contains(e.target)) {
        setOpenDropdown(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Card mouse-tracking radial spotlight effect
  function handleSpotlightMove(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  }

  // Handle open auth modal
  function openLogin(modelId = null) {
    setAuthMode('login');
    setAuthError('');
    setPendingModelId(modelId);
    setAuthOpen(true);
    setMobileMenuOpen(false);
  }

  function openSignup(modelId = null) {
    setAuthMode('signup');
    setAuthError('');
    setPendingModelId(modelId);
    setAuthOpen(true);
    setMobileMenuOpen(false);
  }

  // Smooth internal scroll or navigate
  function handleInternalNav(e, hash) {
    e.preventDefault();
    setMobileMenuOpen(false);
    setOpenDropdown(null);
    const target = document.querySelector(hash);
    if (target) {
      target.scrollIntoView({ behavior: 'smooth' });
    }
  }

  // Model ID lookup helper
  function resolveModelId(slug, fallback) {
    if (!models || !models.length) return fallback;
    const match = models.find(m => m.id && m.id.toLowerCase().includes(slug.toLowerCase()));
    return match ? match.id : fallback;
  }

  // Handle opening chat for a specific model
  function handleLaunchModel(slug, fallback) {
    const modelId = resolveModelId(slug, fallback);
    onOpenChat(modelId);
  }

  // Firebase Email Authentication
  async function handleEmailAuth(e) {
    e.preventDefault();
    const email = authEmail.trim();
    const password = authPassword.trim();
    if (!email || !password) {
      setAuthError('Please provide an email and password.');
      return;
    }
    setAuthBusy(true);
    setAuthError('');
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
        throw new Error(`Authentication request failed (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(result?.error?.message || `Authentication failed (HTTP ${response.status}).`);
      }
      setAuthOpen(false);
      setAuthBusy(false);
      setAuthEmail('');
      setAuthPassword('');
      onAuthenticated(result.user, pendingModelId);
    } catch (err) {
      setAuthError(err?.message || 'Authentication failed. Please check credentials.');
    } finally {
      setAuthBusy(false);
    }
  }

  // Firebase Google One-Click Authentication
  async function handleGoogleAuth() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const firebaseUser = await signInWithGoogle();
      if (!firebaseUser?.email) {
        throw new Error('Google sign-in did not return a valid email address.');
      }
      await syncUserProfile(firebaseUser);
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
        throw new Error(`Backend session bridge failed (HTTP ${response.status}).`);
      }
      if (!response.ok) {
        throw new Error(result?.error?.message || 'Backend session creation failed.');
      }
      setAuthOpen(false);
      setAuthBusy(false);
      onAuthenticated(result.user, pendingModelId);
    } catch (err) {
      setAuthError(err?.message || 'Google authentication was cancelled or failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  // Featured Models Data
  const featuredModelsList = useMemo(() => [
    {
      id: 'grok-4.7',
      slug: 'grok',
      fallback: 'x-ai/grok-2-1212',
      provider: 'xAI',
      providerClass: 'bg-white/10 text-white',
      name: 'Grok 4.7',
      category: 'reasoning',
      context: '128k Context',
      badge: '● Online Ready',
      desc: 'Real-time web awareness with unfiltered logical deduction and deep knowledge synthesis.'
    },
    {
      id: 'claude-3.7-sonnet',
      slug: 'claude-3.7',
      fallback: 'anthropic/claude-3.7-sonnet',
      provider: 'Anthropic',
      providerClass: 'bg-amber-500/10 text-amber-300',
      name: 'Claude 3.7 Sonnet',
      category: 'coding reasoning',
      context: '200k Context',
      badge: '● Online Ready',
      desc: 'Hybrid reasoning model with elite coding benchmarks and extended thinking depth.'
    },
    {
      id: 'deepseek-r1',
      slug: 'deepseek-r1',
      fallback: 'deepseek/deepseek-r1',
      provider: 'DeepSeek',
      providerClass: 'bg-blue-500/10 text-blue-400',
      name: 'DeepSeek R1',
      category: 'free reasoning',
      context: 'Free Tier Ready',
      badge: '● 100% Free',
      desc: 'State-of-the-art open-weights reasoning model with explicit chain-of-thought verification.'
    },
    {
      id: 'gemini-2.5-flash',
      slug: 'gemini',
      fallback: 'google/gemini-2.5-flash',
      provider: 'Google',
      providerClass: 'bg-blue-600/10 text-[#38bdf8]',
      name: 'Gemini 2.5 Flash',
      category: 'free coding',
      context: '1,000,000 Context',
      badge: '● 100% Free',
      desc: 'Ultra-fast multimodal processing with monumental context window for massive codebases.'
    },
    {
      id: 'gpt-4o',
      slug: 'gpt-4o',
      fallback: 'openai/gpt-4o',
      provider: 'OpenAI',
      providerClass: 'bg-white/10 text-white',
      name: 'GPT-4o',
      category: 'coding reasoning',
      context: '128k Context',
      badge: '● Online Ready',
      desc: 'Omni-modal flagship intelligence with superior multilingual fluency and JSON output speed.'
    },
    {
      id: 'qwen-2.5-coder',
      slug: 'qwen',
      fallback: 'qwen/qwen-2.5-coder-32b-instruct',
      provider: 'Qwen',
      providerClass: 'bg-emerald-500/10 text-emerald-400',
      name: 'Qwen 2.5 Coder',
      category: 'free coding',
      context: '128k Context',
      badge: '● 100% Free',
      desc: 'Specialized code generation, diff analysis, and unit test synthesizer built on 5.5T tokens.'
    }
  ], []);

  const filteredModels = useMemo(() => {
    if (activeCategory === 'all') return featuredModelsList;
    return featuredModelsList.filter(m => m.category.includes(activeCategory));
  }, [activeCategory, featuredModelsList]);

  return (
    <div className="any-landing-root">
      
      {/* ==============================================================
           1. TOP NAVBAR WITH RICH MEGA-MENUS & MOBILE DRAWER
           ============================================================== */}
      <header className="any-nav-header" ref={navRef}>
        <div className="any-nav-container">
          
          {/* Brand Logo */}
          <button
            type="button"
            className="any-nav-brand-group"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          >
            <div className="any-nav-logo-ring">
              <div className="any-nav-logo-inner">
                <svg className="any-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/>
                  <path d="M18 10v2a6 6 0 0 1-12 0v-2"/>
                  <circle cx="12" cy="14" r="1"/>
                  <path d="M12 15v5"/>
                  <path d="M8 20h8"/>
                </svg>
              </div>
            </div>
            <div className="any-brand-name-stack">
              <span className="any-brand-name">iamhujju</span>
              <span className="any-brand-sub">AI Workspace</span>
            </div>
          </button>

          {/* Desktop Navigation Mega-Menus */}
          <nav className="any-desktop-menu">
            
            {/* Models Menu */}
            <div className="any-menu-item">
              <button
                type="button"
                className={`any-menu-trigger ${openDropdown === 'models' ? 'is-active' : ''}`}
                onClick={() => setOpenDropdown(prev => prev === 'models' ? null : 'models')}
              >
                <span>Models</span>
                <svg className="any-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {openDropdown === 'models' && (
                <div className="any-mega-dropdown">
                  <div className="any-dropdown-header">
                    <span className="any-dropdown-eyebrow">FLAGSHIP MODEL FLEET</span>
                  </div>
                  <button
                    type="button"
                    className="any-dropdown-row"
                    onClick={() => { setOpenDropdown(null); onOpenModels(); }}
                  >
                    <div className="any-row-icon cyan-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">400+ Active Models</div>
                      <div className="any-row-desc">DeepSeek R1, GPT-4o, Claude 3.7 & Grok</div>
                    </div>
                  </button>
                  <button
                    type="button"
                    className="any-dropdown-row"
                    onClick={() => { setOpenDropdown(null); setActiveCategory('free'); const el = document.getElementById('models'); el?.scrollIntoView({ behavior: 'smooth' }); }}
                  >
                    <div className="any-row-icon emerald-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">100% Free Tier Models</div>
                      <div className="any-row-desc">No API keys required, ready instantly</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            {/* Products Menu */}
            <div className="any-menu-item">
              <button
                type="button"
                className={`any-menu-trigger ${openDropdown === 'products' ? 'is-active' : ''}`}
                onClick={() => setOpenDropdown(prev => prev === 'products' ? null : 'products')}
              >
                <span>Products</span>
                <svg className="any-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>
              {openDropdown === 'products' && (
                <div className="any-mega-dropdown">
                  <button
                    type="button"
                    className="any-dropdown-row"
                    onClick={() => { setOpenDropdown(null); onOpenChat(selectedModel); }}
                  >
                    <div className="any-row-icon cyan-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 9h6"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">AnyChat Studio</div>
                      <div className="any-row-desc">Next-gen multi-turn conversation suite</div>
                    </div>
                  </button>
                  <a
                    href="#arena"
                    className="any-dropdown-row"
                    onClick={e => handleInternalNav(e, '#arena')}
                  >
                    <div className="any-row-icon violet-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Multi-Model Arena</div>
                      <div className="any-row-desc">Compare model outputs side-by-side</div>
                    </div>
                  </a>
                  <button
                    type="button"
                    className="any-dropdown-row"
                    onClick={() => { setOpenDropdown(null); onOpenSkills(); }}
                  >
                    <div className="any-row-icon amber-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Skills Catalog</div>
                      <div className="any-row-desc">Browse agent capabilities & extensions</div>
                    </div>
                  </button>
                </div>
              )}
            </div>

            <a href="#pricing" className="any-menu-link" onClick={e => handleInternalNav(e, '#pricing')}>Pricing</a>
            <button type="button" className="any-menu-link" onClick={() => { setDocsTab('quickstart'); setDocsOpen(true); }}>Docs</button>
            <a href="#security" className="any-menu-link" onClick={e => handleInternalNav(e, '#security')}>Security</a>
            <button type="button" className="any-menu-link" onClick={() => setAboutOpen(true)}>About</button>
          </nav>

          {/* Right Action Tools */}
          <div className="any-nav-actions">
            <button
              type="button"
              className="any-nav-contact-ghost"
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
              />
            ) : (
              <button
                type="button"
                className="any-nav-login-ghost"
                onClick={() => openLogin()}
              >
                Log In
              </button>
            )}

            <button
              type="button"
              className="any-btn-workspace-cta"
              onClick={() => onOpenChat(selectedModel)}
              disabled={authChecking}
            >
              <span>Open Workspace</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>

            {/* Mobile Hamburger Toggle Button */}
            <button
              type="button"
              className="any-nav-mobile-toggle"
              aria-label="Toggle mobile menu"
              aria-expanded={mobileMenuOpen}
              onClick={() => setMobileMenuOpen(prev => !prev)}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                {mobileMenuOpen ? (
                  <path d="M18 6 6 18M6 6l12 12" />
                ) : (
                  <path d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
          </div>

        </div>

        {/* Mobile Navigation Slide-Down Drawer */}
        {mobileMenuOpen && (
          <div className="any-nav-mobile-drawer">
            <div className="mobile-drawer-col">
              <span className="mobile-drawer-eyebrow">Products</span>
              <button type="button" className="mobile-drawer-link" onClick={() => { setMobileMenuOpen(false); onOpenChat(selectedModel); }}>
                AnyChat Studio
              </button>
              <button type="button" className="mobile-drawer-link" onClick={() => { setMobileMenuOpen(false); onOpenModels(); }}>
                Model Hub (400+ Models)
              </button>
              <button type="button" className="mobile-drawer-link" onClick={() => { setMobileMenuOpen(false); onOpenSkills(); }}>
                Skills Catalog
              </button>
            </div>

            <div className="mobile-drawer-col">
              <span className="mobile-drawer-eyebrow">Navigation</span>
              <a href="#pricing" className="mobile-drawer-link" onClick={e => handleInternalNav(e, '#pricing')}>
                Pricing
              </a>
              <button type="button" className="mobile-drawer-link" onClick={() => { setMobileMenuOpen(false); setDocsTab('quickstart'); setDocsOpen(true); }}>
                Docs
              </button>
              <a href="#security" className="mobile-drawer-link" onClick={e => handleInternalNav(e, '#security')}>
                Enterprise Security
              </a>
              <button type="button" className="mobile-drawer-link" onClick={() => { setMobileMenuOpen(false); setAboutOpen(true); }}>
                About
              </button>
            </div>

            <div className="mobile-drawer-footer">
              <button
                type="button"
                className="mobile-drawer-contact-btn"
                onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }}
              >
                Contact Support
              </button>
              {!currentUser ? (
                <button
                  type="button"
                  className="mobile-drawer-login-btn"
                  onClick={() => openLogin()}
                >
                  Log In
                </button>
              ) : null}
              <button
                type="button"
                className="any-btn-workspace-cta mobile-full-cta"
                onClick={() => { setMobileMenuOpen(false); onOpenChat(selectedModel); }}
              >
                Open Workspace →
              </button>
            </div>
          </div>
        )}
      </header>


      {/* ==============================================================
           2. HERO SECTION + DUAL CTAs
           ============================================================== */}
      <section className="any-hero-section">
        <div className="any-section-inner text-center">
          
          {/* Announcement Pill */}
          <div
            className="any-announcement-pill"
            role="button"
            tabIndex={0}
            onClick={() => onOpenChat('deepseek/deepseek-r1')}
            onKeyDown={e => { if (e.key === 'Enter') onOpenChat('deepseek/deepseek-r1'); }}
          >
            <span className="any-pill-pulse-dot"></span>
            <span className="any-pill-text">New: GPT-4o, Claude 3.7 & DeepSeek R1 free tier live</span>
            <svg className="any-pill-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
          </div>

          {/* Hero Headline */}
          <h1 className="any-hero-h1">
            One AI Workspace for <br className="hidden-mobile" />
            <span className="any-gradient-headline">400+ Frontier Models</span>
          </h1>

          {/* Hero Subtitle */}
          <p className="any-hero-sub">
            Your intelligent AI companion. Seamlessly chat, test, compare, and auto-route between the world's most powerful models in one blazing-fast workspace. Zero API key hassle.
          </p>

          {/* Dual Hero Call To Actions */}
          <div className="any-hero-actions">
            <button
              type="button"
              className="any-btn-primary glow-cyan"
              onClick={() => onOpenChat(selectedModel)}
            >
              <span>Start for free</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
            </button>
            <button
              type="button"
              className="any-btn-secondary"
              onClick={() => onOpenModels()}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/></svg>
              <span>Explore 400+ Models</span>
            </button>
          </div>

          {/* Trust Badges */}
          <div className="any-hero-trust-row">
            <span className="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg> No credit card required</span>
            <span className="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg> Free tier models ready instantly</span>
            <span className="trust-item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M20 6 9 17l-5-5"/></svg> Enterprise AES-256 cloud sync</span>
          </div>

          {/* ==============================================================
               INTERACTIVE FEATURE SWITCHER (HERO MACOS WINDOW)
               ============================================================== */}
          <div className="any-showcase-container" id="workspace">
            
            {/* Pill Tab Bar */}
            <div className="any-pill-tabs-bar">
              <button
                type="button"
                className={`any-tab-btn ${activeHeroTab === 'chat' ? 'is-active' : ''}`}
                onClick={() => setActiveHeroTab('chat')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                <span>AI Workspace</span>
              </button>

              <button
                type="button"
                className={`any-tab-btn ${activeHeroTab === 'arena' ? 'is-active' : ''}`}
                onClick={() => setActiveHeroTab('arena')}
              >
                <svg className="violet-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/></svg>
                <span>Side-by-Side Compare</span>
              </button>

              <button
                type="button"
                className={`any-tab-btn ${activeHeroTab === 'routing' ? 'is-active' : ''}`}
                onClick={() => setActiveHeroTab('routing')}
              >
                <svg className="emerald-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>Smart Auto-Routing</span>
              </button>

              <button
                type="button"
                className={`any-tab-btn ${activeHeroTab === 'analytics' ? 'is-active' : ''}`}
                onClick={() => setActiveHeroTab('analytics')}
              >
                <svg className="cyan-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" x2="18" y1="20" y2="10"/><line x1="12" x2="12" y1="20" y2="4"/><line x1="6" x2="6" y1="20" y2="14"/></svg>
                <span>Usage & Telemetry</span>
              </button>
            </div>

            {/* macOS Window Frame */}
            <div
              className="spotlight-card any-window-frame"
              onMouseMove={handleSpotlightMove}
            >
              {/* Chrome Header */}
              <div className="any-window-chrome">
                <div className="any-chrome-dots">
                  <span className="dot dot-red"></span>
                  <span className="dot dot-yellow"></span>
                  <span className="dot dot-green"></span>
                  <span className="chrome-title">iamhujju-workspace v2.4 // interactive preview</span>
                </div>
                <div className="any-chrome-status">
                  <span className="status-ping"></span>
                  <span>412 Models Ready</span>
                </div>
              </div>

              {/* Tab Panel 1: AI Workspace */}
              {activeHeroTab === 'chat' && (
                <div className="any-tab-panel">
                  <div className="chat-demo-stack">
                    <div className="chat-user-row">
                      <div className="chat-user-avatar">U</div>
                      <div className="chat-user-msg">
                        Synthesize an ultra-low latency hybrid caching layer in TypeScript with memory fallbacks.
                      </div>
                    </div>
                    <div className="chat-asst-row">
                      <div className="chat-asst-avatar">AI</div>
                      <div className="chat-asst-box">
                        <div className="chat-asst-meta">
                          <span className="meta-cyan">Claude 3.7 Sonnet · 94 t/s · 114ms TTFT</span>
                          <span className="meta-emerald">Status: 200 OK</span>
                        </div>
                        <pre className="chat-code-block"><code><span className="c-cyan">export class</span> TieredCache&lt;T&gt; &#123;
  <span className="c-muted">// L1: Fast In-Memory Map | L2: Redis Persistence</span>
  <span className="c-cyan">private</span> memory = <span className="c-cyan">new</span> Map&lt;string, &#123; val: T; exp: number &#125;&gt;();
  
  <span className="c-cyan">async</span> get(key: string): Promise&lt;T | null&gt; &#123;
    <span className="c-violet">const</span> cached = <span className="c-cyan">this</span>.memory.get(key);
    <span className="c-violet">if</span> (cached &amp;&amp; cached.exp &gt; Date.now()) <span className="c-emerald">return</span> cached.val;
    <span className="c-emerald">return await this</span>.hydrateFromL2(key);
  &#125;
&#125;</code></pre>
                      </div>
                    </div>
                  </div>
                  <div className="chat-footer-bar">
                    <span>Model: <strong className="text-white">Claude 3.7 Sonnet</strong> (200k Context)</span>
                    <button
                      type="button"
                      className="any-link-cta"
                      onClick={() => onOpenChat('anthropic/claude-3.7-sonnet')}
                    >
                      Open in Full Studio →
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Panel 2: Side-by-Side Compare */}
              {activeHeroTab === 'arena' && (
                <div className="any-tab-panel">
                  <div className="arena-split-grid">
                    <div className="arena-card">
                      <div className="arena-header">
                        <span className="text-cyan">DeepSeek R1 (Reasoning)</span>
                        <span className="text-slate">142 t/s · $0.00 / free</span>
                      </div>
                      <div className="arena-thought">&lt;thought&gt; Breaking down asymptotic complexity of lock-free queue... &lt;/thought&gt;</div>
                      <p className="arena-body">The lock-free queue relies on atomic Compare-And-Swap (CAS) pointers to achieve zero contention across CPU cores.</p>
                    </div>
                    <div className="arena-card">
                      <div className="arena-header">
                        <span className="text-violet">GPT-4o (Multimodal)</span>
                        <span className="text-slate">118 t/s · 98ms</span>
                      </div>
                      <p className="arena-body">Here is the concise implementation using atomic pointers with standard memory reclamation barriers.</p>
                    </div>
                  </div>
                  <div className="chat-footer-bar">
                    <span>Multi-Model Arena Active</span>
                    <button type="button" className="any-link-cta" onClick={() => onOpenChat('deepseek/deepseek-r1')}>
                      Launch Arena Session →
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Panel 3: Smart Auto-Routing */}
              {activeHeroTab === 'routing' && (
                <div className="any-tab-panel">
                  <div className="routing-stack">
                    <div className="routing-subtitle">Dynamic Gateway Policy: Auto-Failover & Latency Optimizer</div>
                    <div className="routing-row row-active">
                      <span className="routing-dot dot-emerald"></span>
                      <span>[Primary Route] Claude 3.7 Sonnet (EU-Frankfurt) · Latency: 92ms · Healthy</span>
                    </div>
                    <div className="routing-row row-standby">
                      <span className="routing-dot dot-slate"></span>
                      <span>[Failover 1] DeepSeek R1 (US-East) · Hot Standby · Zero Rate Limit Lock</span>
                    </div>
                    <div className="routing-row row-standby">
                      <span className="routing-dot dot-slate"></span>
                      <span>[Failover 2] Gemini 2.5 Flash · 1,000,000 Token Buffer Ready</span>
                    </div>
                  </div>
                  <div className="chat-footer-bar">
                    <span>Automated Failover Guard (400+ Routes)</span>
                    <button type="button" className="any-link-cta" onClick={() => onOpenChat(selectedModel)}>
                      Test Live Router →
                    </button>
                  </div>
                </div>
              )}

              {/* Tab Panel 4: Usage & Telemetry */}
              {activeHeroTab === 'analytics' && (
                <div className="any-tab-panel">
                  <div className="analytics-quad-grid">
                    <div className="stat-tile">
                      <div className="stat-label">Total Requests</div>
                      <div className="stat-val text-white">1,482,910</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-label">Avg Response Time</div>
                      <div className="stat-val text-cyan">94ms</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-label">Tokens Generated</div>
                      <div className="stat-val text-emerald">842.1M</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-label">Fleet Availability</div>
                      <div className="stat-val text-violet">99.99%</div>
                    </div>
                  </div>
                  <div className="chat-footer-bar">
                    <span>Account-Backed Neon PostgreSQL Cloud Sync</span>
                    <button type="button" className="any-link-cta" onClick={() => onOpenChat(selectedModel)}>
                      View Your Usage →
                    </button>
                  </div>
                </div>
              )}

            </div>
          </div>

        </div>
      </section>


      {/* ==============================================================
           3. INFINITE LOGO MARQUEE: LEADING AI PROVIDERS
           ============================================================== */}
      <section className="any-marquee-section">
        <div className="any-marquee-eyebrow">
          POWERED BY 400+ LEADING AI PROVIDERS & OPEN-SOURCE FRONTIER LABS
        </div>

        <div className="mask-marquee">
          <div className="animate-marquee-strip">
            
            {/* Loop Strip A */}
            <div className="marquee-group">
              <span className="marquee-item"><svg className="provider-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V18h-2v-1.07A6 6 0 0 1 6.07 12H7a5 5 0 0 0 4 4.9V12H9v-2h2V7.1A5 5 0 0 0 7 12H6.07A6 6 0 0 1 11 6.07V5h2v1.07A6 6 0 0 1 17.93 12H17a5 5 0 0 0-4-4.9V10h2v2h-2v4.9A5 5 0 0 0 17 12h.93A6 6 0 0 1 13 16.93z"/></svg> OpenAI</span>
              <span className="marquee-item"><svg className="provider-icon amber-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg> Anthropic</span>
              <span className="marquee-item"><svg className="provider-icon blue-fill" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Google DeepMind</span>
              <span className="marquee-item"><svg className="provider-icon blue-fill" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-7.07 17.07L12 12l7.07 7.07A10 10 0 0 0 12 2z"/></svg> DeepSeek</span>
              <span className="marquee-item"><svg className="provider-icon text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> xAI Grok</span>
              <span className="marquee-item"><svg className="provider-icon cyan-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg> Meta LLaMA</span>
              <span className="marquee-item"><svg className="provider-icon orange-fill" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 2 22 22 22"/></svg> Mistral AI</span>
              <span className="marquee-item"><svg className="provider-icon teal-fill" viewBox="0 0 24 24" fill="currentColor"><rect width="18" height="18" x="3" y="3" rx="2"/></svg> Perplexity</span>
              <span className="marquee-item"><svg className="provider-icon emerald-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg> Qwen (Alibaba)</span>
            </div>

            {/* Loop Strip B (Seamless repeat) */}
            <div className="marquee-group">
              <span className="marquee-item"><svg className="provider-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 14.93V18h-2v-1.07A6 6 0 0 1 6.07 12H7a5 5 0 0 0 4 4.9V12H9v-2h2V7.1A5 5 0 0 0 7 12H6.07A6 6 0 0 1 11 6.07V5h2v1.07A6 6 0 0 1 17.93 12H17a5 5 0 0 0-4-4.9V10h2v2h-2v4.9A5 5 0 0 0 17 12h.93A6 6 0 0 1 13 16.93z"/></svg> OpenAI</span>
              <span className="marquee-item"><svg className="provider-icon amber-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg> Anthropic</span>
              <span className="marquee-item"><svg className="provider-icon blue-fill" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg> Google DeepMind</span>
              <span className="marquee-item"><svg className="provider-icon blue-fill" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 0 0-7.07 17.07L12 12l7.07 7.07A10 10 0 0 0 12 2z"/></svg> DeepSeek</span>
              <span className="marquee-item"><svg className="provider-icon text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg> xAI Grok</span>
              <span className="marquee-item"><svg className="provider-icon cyan-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="8"/></svg> Meta LLaMA</span>
              <span className="marquee-item"><svg className="provider-icon orange-fill" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 2 22 22 22"/></svg> Mistral AI</span>
              <span className="marquee-item"><svg className="provider-icon teal-fill" viewBox="0 0 24 24" fill="currentColor"><rect width="18" height="18" x="3" y="3" rx="2"/></svg> Perplexity</span>
              <span className="marquee-item"><svg className="provider-icon emerald-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="12" r="10"/></svg> Qwen (Alibaba)</span>
            </div>

          </div>
        </div>
      </section>


      {/* ==============================================================
           4. FOUR-COLUMN KEY METRICS STRIP
           ============================================================== */}
      <section className="any-metrics-section">
        <div className="any-section-inner">
          <div className="metrics-quad-grid">
            
            <div className="spotlight-card metric-card" onMouseMove={handleSpotlightMove}>
              <div className="metric-number text-white">400+</div>
              <div className="metric-label">Frontier & Open Models</div>
            </div>

            <div className="spotlight-card metric-card" onMouseMove={handleSpotlightMove}>
              <div className="metric-number text-cyan">Instant</div>
              <div className="metric-label">Zero-Key Workspace Setup</div>
            </div>

            <div className="spotlight-card metric-card" onMouseMove={handleSpotlightMove}>
              <div className="metric-number text-emerald">99.99%</div>
              <div className="metric-label">Multi-Region Uptime</div>
            </div>

            <div className="spotlight-card metric-card" onMouseMove={handleSpotlightMove}>
              <div className="metric-number text-violet">&lt;110ms</div>
              <div className="metric-label">Global Average TTFT</div>
            </div>

          </div>
        </div>
      </section>


      {/* ==============================================================
           5. BENTO / SPLIT PRODUCT SHOWCASE: "EVERYTHING IN ONE AI WORKSPACE"
           ============================================================== */}
      <section className="any-bento-section" id="arena">
        <div className="any-section-inner">
          
          <div className="any-section-head text-center">
            <span className="any-eyebrow">ENGINEERED FOR SCALE</span>
            <h2 className="any-h2">Everything in one AI workspace</h2>
            <p className="any-subhead">
              No more juggling multiple subscriptions or tab switching. Compare answers, automate complex prompts, and switch models on the fly.
            </p>
          </div>

          <div className="bento-layout-grid">
            
            {/* Wide Bento Card */}
            <div className="spotlight-card bento-card bento-wide" onMouseMove={handleSpotlightMove}>
              <div>
                <div className="bento-badge cyan-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  <span>UNIFIED GATEWAY & PLAYGROUND</span>
                </div>
                <h3 className="bento-title">One subscription for every model on earth</h3>
                <p className="bento-desc">
                  Access GPT-4o, Claude 3.7 Sonnet, DeepSeek R1, Grok, and Gemini without managing separate API accounts or token limits.
                </p>
              </div>

              <div className="bento-mockup-box">
                <div className="bento-mockup-header">
                  <span>Auto-Router Status</span>
                  <span className="text-emerald">Optimal: Route #492 (Claude 3.7)</span>
                </div>
                <div className="bento-mockup-stats">
                  <div className="mockup-stat"><strong className="text-white">0ms</strong><span>Switching Lag</span></div>
                  <div className="mockup-stat"><strong className="text-white">100%</strong><span>Failover Guard</span></div>
                  <div className="mockup-stat"><strong className="text-white">AES-256</strong><span>End-to-End Vault</span></div>
                </div>
              </div>
            </div>

            {/* Arena Bento Card */}
            <div className="spotlight-card bento-card" onMouseMove={handleSpotlightMove}>
              <div>
                <div className="bento-badge violet-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/></svg>
                  <span>REAL-TIME ARENA</span>
                </div>
                <h3 className="bento-title">Side-by-Side Model Arena</h3>
                <p className="bento-desc">
                  Broadcast prompts to 2, 3, or 4 models in parallel. Pinpoint hallucinations, verify reasoning, and pick the best answer.
                </p>
              </div>

              <div className="bento-arena-preview">
                <div className="arena-preview-header">
                  <span>DeepSeek vs Claude 3.7</span>
                  <span className="text-cyan">Diff: 99.4% Match</span>
                </div>
                <div className="arena-progress-bar">
                  <div className="arena-progress-fill"></div>
                </div>
              </div>
            </div>

          </div>

        </div>
      </section>


      {/* ==============================================================
           6. ENTERPRISE PRIVACY & SECURITY SECTION
           ============================================================== */}
      <section className="any-security-section" id="security">
        <div className="any-section-inner">
          
          <div className="any-section-head text-center">
            <span className="any-eyebrow emerald-eyebrow">ZERO DATA LEAKAGE</span>
            <h2 className="any-h2">Your data stays private & strictly yours</h2>
            <p className="any-subhead">
              Built with enterprise-grade isolation. Your prompts and private conversations are never logged or used to train frontier models.
            </p>
          </div>

          <div className="security-tri-grid">
            
            <div className="spotlight-card security-card" onMouseMove={handleSpotlightMove}>
              <div className="sec-icon-box bg-emerald-dim text-emerald">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="11" x="3" y="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              </div>
              <h3 className="sec-card-title">Private by Default</h3>
              <p className="sec-card-desc">
                Strict Zero-Data-Retention policies with all upstream providers. Zero model training on any prompt you submit.
              </p>
            </div>

            <div className="spotlight-card security-card" onMouseMove={handleSpotlightMove}>
              <div className="sec-icon-box bg-cyan-dim text-cyan">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/><path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/></svg>
              </div>
              <h3 className="sec-card-title">Neon PostgreSQL Sync</h3>
              <p className="sec-card-desc">
                Your conversations and saved chats are encrypted with AES-256 and stored in an isolated, serverless PostgreSQL cloud instance.
              </p>
            </div>

            <div className="spotlight-card security-card" onMouseMove={handleSpotlightMove}>
              <div className="sec-icon-box bg-violet-dim text-violet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/></svg>
              </div>
              <h3 className="sec-card-title">Drop-in OpenAI API</h3>
              <p className="sec-card-desc">
                Use your favorite coding extensions (Cursor, VS Code, Claude Code) with iamhujju simply by swapping the base URL.
              </p>
            </div>

          </div>

        </div>
      </section>


      {/* ==============================================================
           7. FILTERABLE FEATURED MODELS GRID
           ============================================================== */}
      <section className="any-models-section" id="models">
        <div className="any-section-inner">
          
          <div className="models-header-row">
            <div>
              <span className="any-eyebrow">FLAGSHIP MODEL FLEET</span>
              <h2 className="any-h2">Featured Models</h2>
              <p className="any-subhead">
                Instantly switch between leading frontier models and hyper-efficient open-weights engines.
              </p>
            </div>

            {/* Filter Pills */}
            <div className="model-filter-pills">
              <button
                type="button"
                className={`filter-pill ${activeCategory === 'all' ? 'is-active' : ''}`}
                onClick={() => setActiveCategory('all')}
              >
                All Models (400+)
              </button>
              <button
                type="button"
                className={`filter-pill ${activeCategory === 'reasoning' ? 'is-active' : ''}`}
                onClick={() => setActiveCategory('reasoning')}
              >
                Reasoning & Math
              </button>
              <button
                type="button"
                className={`filter-pill ${activeCategory === 'coding' ? 'is-active' : ''}`}
                onClick={() => setActiveCategory('coding')}
              >
                Coding & Agentic
              </button>
              <button
                type="button"
                className={`filter-pill ${activeCategory === 'free' ? 'is-active' : ''}`}
                onClick={() => setActiveCategory('free')}
              >
                100% Free Tier
              </button>
            </div>
          </div>

          {/* Filtered Grid */}
          <div className="models-cards-grid">
            {filteredModels.map(model => (
              <div
                key={model.id}
                className="spotlight-card model-card"
                onMouseMove={handleSpotlightMove}
              >
                <div className="model-card-top">
                  <div className="model-card-tags">
                    <span className={`provider-badge ${model.providerClass}`}>{model.provider}</span>
                    <span className="context-badge">{model.context}</span>
                  </div>
                  <h3 className="model-title">{model.name}</h3>
                  <p className="model-desc">{model.desc}</p>
                </div>

                <div className="model-card-bottom">
                  <span className="model-status-pill text-emerald">{model.badge}</span>
                  <button
                    type="button"
                    className="model-chat-btn"
                    onClick={() => handleLaunchModel(model.slug, model.fallback)}
                  >
                    Chat Now →
                  </button>
                </div>
              </div>
            ))}
          </div>

        </div>
      </section>


      {/* ==============================================================
           8. BOTTOM CONVERSION BANNER & DUAL ACTION CARDS
           ============================================================== */}
      <section className="any-cta-section" id="pricing">
        <div className="any-section-inner">
          
          <div className="spotlight-card cosmic-cta-banner" onMouseMove={handleSpotlightMove}>
            <h2 className="cta-headline">Everything you need to build on ANY model</h2>
            <p className="cta-subhead">
              Gateway · Multi-Model Arena · CLI · Analytics · Auto-Routing · Enterprise Security
            </p>

            <div className="cta-btn-group">
              <button
                type="button"
                className="any-btn-primary glow-cyan"
                onClick={() => onOpenChat(selectedModel)}
              >
                <span>Get free API key / Start Chat</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
              <button
                type="button"
                className="any-btn-secondary"
                onClick={() => setContactOpen(true)}
              >
                Contact Support & Sales
              </button>
            </div>

            {/* Two Bottom Action Cards */}
            <div className="cta-bottom-split-cards">
              <div
                className="cta-glass-card"
                role="button"
                tabIndex={0}
                onClick={() => { setDocsTab('pricing'); setDocsOpen(true); }}
                onKeyDown={e => { if (e.key === 'Enter') { setDocsTab('pricing'); setDocsOpen(true); } }}
              >
                <span className="card-mini-eyebrow text-cyan">PRICING ON YOUR TERMS</span>
                <h3 className="card-mini-title">Pick the plan that fits your scale</h3>
                <p className="card-mini-desc">Generous free tier forever with zero credit card, or pay-as-you-go Pro upgrades.</p>
              </div>

              <div
                className="cta-glass-card"
                role="button"
                tabIndex={0}
                onClick={() => { setDocsTab('quickstart'); setDocsOpen(true); }}
                onKeyDown={e => { if (e.key === 'Enter') { setDocsTab('quickstart'); setDocsOpen(true); } }}
              >
                <span className="card-mini-eyebrow text-emerald">START BUILDING IN 60s</span>
                <h3 className="card-mini-title">Ship your first request in minutes</h3>
                <p className="card-mini-desc">Compatible with the official OpenAI Node & Python SDKs via standard drop-in base URL.</p>
              </div>
            </div>

          </div>

        </div>
      </section>


      {/* ==============================================================
           9. COMPREHENSIVE FOOTER
           ============================================================== */}
      <footer className="any-footer-root" id="about">
        <div className="any-section-inner">
          
          <div className="footer-columns-grid">
            
            <div className="footer-brand-col">
              <div className="footer-brand-row">
                <div className="any-nav-logo-ring">
                  <div className="any-nav-logo-inner">
                    <svg className="any-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><path d="M18 10v2a6 6 0 0 1-12 0v-2"/><circle cx="12" cy="14" r="1"/><path d="M12 15v5"/><path d="M8 20h8"/></svg>
                  </div>
                </div>
                <span className="footer-brand-title">iamhujju</span>
              </div>
              <p className="footer-brand-desc">
                One unified workspace for 400+ frontier and open AI models. Built for creators, engineers, researchers, and everyday power users.
              </p>
              <div className="footer-status-indicator">
                <span className="status-ping"></span>
                <span>All Systems Operational (412 Models)</span>
              </div>
            </div>

            <div className="footer-nav-col">
              <h4>Products</h4>
              <ul>
                <li><button type="button" onClick={() => onOpenChat(selectedModel)}>AnyChat Studio</button></li>
                <li><a href="#arena" onClick={e => handleInternalNav(e, '#arena')}>Multi-Model Arena</a></li>
                <li><a href="#workspace" onClick={e => handleInternalNav(e, '#workspace')}>Auto-Router</a></li>
                <li><button type="button" onClick={() => onOpenModels()}>Model Hub (400+)</button></li>
                <li><button type="button" onClick={() => onOpenSkills()}>Skills Catalog</button></li>
              </ul>
            </div>

            <div className="footer-nav-col">
              <h4>Top Models</h4>
              <ul>
                <li><button type="button" onClick={() => handleLaunchModel('claude-3.7', 'anthropic/claude-3.7-sonnet')}>Claude 3.7 Sonnet</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('deepseek-r1', 'deepseek/deepseek-r1')}>DeepSeek R1</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('gpt-4o', 'openai/gpt-4o')}>GPT-4o</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('gemini', 'google/gemini-2.5-flash')}>Gemini 2.5 Flash</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('grok', 'x-ai/grok-2-1212')}>Grok 4.7</button></li>
              </ul>
            </div>

            <div className="footer-nav-col" id="contact">
              <h4>Support & Legal</h4>
              <ul>
                <li><a href="mailto:huzaifakazi1991@gmail.com">huzaifakazi1991@gmail.com</a></li>
                <li><a href="https://t.me/+919975649957" target="_blank" rel="noopener noreferrer">Telegram Support</a></li>
                <li><a href="#security" onClick={e => handleInternalNav(e, '#security')}>Enterprise Security</a></li>
                <li><button type="button" onClick={() => setContactOpen(true)}>Contact Form</button></li>
              </ul>
            </div>

          </div>

          <div className="footer-bottom-bar">
            <span>© 2026 iamhujju.com — All rights reserved.</span>
            <div className="footer-bottom-links">
              <a href="#security" onClick={e => handleInternalNav(e, '#security')}>Terms of Service</a>
              <a href="#security" onClick={e => handleInternalNav(e, '#security')}>Privacy Policy</a>
              <a href="#security" onClick={e => handleInternalNav(e, '#security')}>Status</a>
            </div>
          </div>

        </div>
      </footer>


      {/* ==============================================================
           10. BUILT-IN MODALS & AI SUPPORT COPILOT WIDGET
           ============================================================== */}

      {/* Auth Modal (Firebase Google One-Click + Email/Password) */}
      {authOpen && (
        <div className="any-modal-backdrop" onClick={() => setAuthOpen(false)}>
          <div className="any-auth-dialog spotlight-card" onClick={e => e.stopPropagation()} onMouseMove={handleSpotlightMove}>
            <div className="any-auth-header">
              <div className="any-auth-brand">
                <div className="any-nav-logo-ring">
                  <div className="any-nav-logo-inner">
                    <svg className="any-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M12 2a4 4 0 0 1 4 4v1a4 4 0 0 1-4 4 4 4 0 0 1-4-4V6a4 4 0 0 1 4-4z"/><path d="M18 10v2a6 6 0 0 1-12 0v-2"/><circle cx="12" cy="14" r="1"/><path d="M12 15v5"/><path d="M8 20h8"/></svg>
                  </div>
                </div>
                <div>
                  <span className="any-auth-eyebrow">IAMHUJJU AI WORKSPACE</span>
                  <h3 className="any-auth-title">{authMode === 'signup' ? 'Create your account' : 'Welcome back'}</h3>
                </div>
              </div>
              <button type="button" className="any-modal-close" onClick={() => setAuthOpen(false)} aria-label="Close dialog">✕</button>
            </div>

            <p className="any-auth-sub">
              {authMode === 'signup'
                ? 'Sign up to unlock 400+ models, persistent cloud history, and high-speed auto-routing.'
                : 'Sign in to access your models, saved prompts, and cloud conversations.'}
            </p>

            {/* Google One-Click Auth Button */}
            <button
              type="button"
              className="any-google-btn"
              onClick={handleGoogleAuth}
              disabled={authBusy}
            >
              <svg width="18" height="18" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              <span>{authBusy ? 'Connecting...' : 'Continue with Google'}</span>
            </button>

            <div className="any-auth-divider">
              <span>OR CONTINUE WITH EMAIL</span>
            </div>

            <form onSubmit={handleEmailAuth} className="any-auth-form">
              <label>
                <span>Email address</span>
                <input
                  type="email"
                  value={authEmail}
                  onChange={e => setAuthEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  disabled={authBusy}
                />
              </label>

              <label>
                <span>Password</span>
                <input
                  type="password"
                  value={authPassword}
                  onChange={e => setAuthPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  disabled={authBusy}
                />
              </label>

              {authError && <div className="any-auth-error">{authError}</div>}

              <button type="submit" className="any-auth-submit-btn" disabled={authBusy}>
                {authBusy ? 'Authenticating...' : (authMode === 'signup' ? 'Create Account' : 'Sign in to Workspace')}
              </button>
            </form>

            <div className="any-auth-toggle-mode">
              {authMode === 'signup' ? (
                <>Already have an account? <button type="button" onClick={() => setAuthMode('login')}>Sign in</button></>
              ) : (
                <>New to iamhujju? <button type="button" onClick={() => setAuthMode('signup')}>Create account</button></>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactOpen && (
        <ContactModal
          onClose={() => setContactOpen(false)}
          onOpenChat={() => onOpenChat(selectedModel)}
        />
      )}

      {/* About Modal */}
      {aboutOpen && (
        <AboutModal
          onClose={() => setAboutOpen(false)}
          onOpenChat={() => onOpenChat(selectedModel)}
          onOpenModels={onOpenModels}
          modelsCount={models.length}
        />
      )}

      {/* Docs Modal */}
      {docsOpen && (
        <DocsModal
          initialTab={docsTab}
          onClose={() => setDocsOpen(false)}
          onOpenChat={() => onOpenChat(selectedModel)}
          onOpenModels={onOpenModels}
        />
      )}

      {/* Floating Live AI Support Copilot */}
      <LiveSupportWidget
        models={models}
        connected={connected}
        currentUser={currentUser}
        onOpenChat={onOpenChat}
        onOpenModels={onOpenModels}
        onOpenSkills={onOpenSkills}
        onOpenSavedChats={onOpenSavedChats}
        onOpenLogin={() => openLogin()}
      />

    </div>
  );
}
