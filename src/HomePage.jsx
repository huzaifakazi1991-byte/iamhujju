import { useEffect, useMemo, useRef, useState, Fragment } from 'react';
import AccountMenu from './AccountMenu.jsx';
import DocsModal from './DocsModal.jsx';
import ContactModal from './ContactModal.jsx';
import AboutModal from './AboutModal.jsx';
import LiveSupportWidget from './LiveSupportWidget.jsx';
import { signInWithGoogle, syncUserProfile } from './firebase.js';
import './HomePage.css';

const pricingFaqs = [
  {
    q: "How does iamhujju intelligent model routing work?",
    a: "iamhujju dynamically evaluates current model latency, provider uptime, and prompt complexity to automatically route your prompt to the fastest, smartest, or most cost-effective model without breaking conversation context."
  },
  {
    q: "Do you markup provider token prices?",
    a: "No. iamhujju provides direct-to-provider routing with zero predatory token markups. You get unlimited access to 100% free tier models (DeepSeek R1, Gemini 2.5 Flash, Qwen 2.5 Coder) at $0, and transparent rates across all 400+ frontier engines."
  },
  {
    q: "Is my prompt data used for model training? (Zero Data Retention guarantee)",
    a: "Absolutely not. Your prompts, completions, and files are never used to train any AI foundation model. You can also toggle Zero Data Retention (ZDR) mode at any time so conversations are not stored in cloud databases."
  },
  {
    q: "How does the Side-by-Side Model Arena work?",
    a: "The Arena submits your single prompt simultaneously across 2 to 4 independent frontier models (e.g. Claude 3.7 Sonnet, DeepSeek R1, GPT-4o, and Gemini 2.5 Pro) and streams their responses in real time side-by-side with token speed, thought traces, and response diffing."
  },
  {
    q: "Can I bring my own OpenAI, Anthropic, or OpenRouter API keys?",
    a: "Yes! iamhujju includes a dedicated client-side BYOK (Bring Your Own Keys) vault encrypted with AES-256 in your browser session so you can route queries through your own provider credentials with zero rate limits."
  }
];

const comparisonCategories = [
  {
    category: "Models & Routing",
    features: [
      { name: "Access to 400+ AI Models", free: "Free Tier Fleet", pro: "Unlimited 400+ Fleet", team: "Unlimited Fleet + Early Access" },
      { name: "Model Auto-Routing & Failover", free: "Standard Failover", pro: "Latency-Optimized Routing", team: "Custom Routing Policies" },
      { name: "Side-by-Side Model Arena", free: "2 Models Parallel", pro: "Up to 4 Models Parallel", team: "Unlimited Parallel Arena" },
      { name: "Extended Thinking Traces", free: "Included (DeepSeek R1)", pro: "Full Hybrid (Claude 3.7 & o3)", team: "Full Hybrid + Custom Budget" }
    ]
  },
  {
    category: "Developer & Integration",
    features: [
      { name: "OpenAI-Compatible Drop-in API", free: "Public Gateway", pro: "Dedicated API Gateway Key", team: "Team API Keys & Quotas" },
      { name: "Rate Limits", free: "60 req / min", pro: "1,000 req / min", team: "Custom / Unlimited" },
      { name: "Maximum Context Window", free: "Up to 1M (Gemini Flash)", pro: "Full 200k / 1M Tokens", team: "Full 1M+ & Dedicated Queue" },
      { name: "Specialized Role Presets (Skills)", free: "Core Presets", pro: "20+ Agent Skills", team: "Custom Squad Skills & Workflows" }
    ]
  },
  {
    category: "Security & Support",
    features: [
      { name: "Zero Data Retention (ZDR) Option", free: "Manual Clear", pro: "1-Click ZDR Toggle", team: "Enterprise ZDR SLA" },
      { name: "Persistent Cloud Firestore Sync", free: "Single Device", pro: "Multi-Device Realtime", team: "Shared Team Workspaces" },
      { name: "Founder & Technical Support", free: "Telegram Community", pro: "Priority Telegram & Email", team: "24/7 Dedicated Founder Hotline" }
    ]
  }
];

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
  // Navigation & Dropdown States
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null); // 'models' | 'products' | 'resources' | null
  const [openFaq, setOpenFaq] = useState(null);

  // Pricing & Billing Toggle
  const [pricingCycle, setPricingCycle] = useState('monthly'); // 'monthly' | 'annual'

  // Docs Section Interactive Active Topic
  const [activeDocsTopic, setActiveDocsTopic] = useState('getting-started');

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

  // Initial Hash / Path auto-scroll for #pricing, #docs, #models, #products, #security
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const path = window.location.pathname;
    const hash = window.location.hash;

    const targetId = path === '/pricing' || hash === '#pricing'
      ? 'pricing'
      : path === '/docs' || hash === '#docs'
      ? 'docs'
      : hash ? hash.replace('#', '') : null;

    if (targetId) {
      const el = document.getElementById(targetId);
      if (el) {
        setTimeout(() => el.scrollIntoView({ behavior: 'smooth' }), 120);
      }
    }
  }, []);

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

  // Card Mouse-tracking Spotlight Glow
  function handleSpotlightMove(e) {
    const card = e.currentTarget;
    const rect = card.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    card.style.setProperty('--mouse-x', `${x}px`);
    card.style.setProperty('--mouse-y', `${y}px`);
  }

  function openLogin(modelId = null) {
    setPendingModelId(modelId);
    setAuthMode('login');
    setAuthError('');
    setAuthOpen(true);
    setMobileMenuOpen(false);
    setOpenDropdown(null);
  }

  function openSignup() {
    setAuthMode('signup');
    setAuthError('');
    setAuthOpen(true);
    setMobileMenuOpen(false);
    setOpenDropdown(null);
  }

  function handleInternalNav(e, target) {
    if (e && e.preventDefault) e.preventDefault();
    setMobileMenuOpen(false);
    setOpenDropdown(null);
    const hash = target.startsWith('#') ? target : `#${target}`;
    const el = document.querySelector(hash);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      const routeMap = {
        '#pricing': '/pricing',
        '#docs': '/docs',
        '#models': '/models',
        '#products': '/',
        '#security': '/'
      };
      const newPath = routeMap[hash] || '/';
      if (window.location.pathname !== newPath && typeof window !== 'undefined') {
        window.history.pushState(null, '', newPath);
      }
    }
  }

  function resolveModel(slug, fallback) {
    if (!models || !models.length) return fallback;
    const match = models.find(m => m.id && m.id.toLowerCase().includes(slug.toLowerCase()));
    return match ? match.id : fallback;
  }

  function handleLaunchModel(slug, fallback) {
    const targetModel = resolveModel(slug, fallback);
    onOpenChat(targetModel);
  }

  // Mega-menu Flagship Models
  const megaMenuModels = useMemo(() => [
    {
      id: 'openai/gpt-4o',
      name: 'OpenAI GPT-4o / o3-mini',
      provider: 'OpenAI',
      badgeClass: 'provider-openai',
      context: '128k',
      tags: ['Reasoning', 'Vision', 'Fast'],
      desc: 'Multimodal flagship with high-speed tool calls.'
    },
    {
      id: 'anthropic/claude-3.7-sonnet',
      name: 'Anthropic Claude 3.7 Sonnet',
      provider: 'Anthropic',
      badgeClass: 'provider-anthropic',
      context: '200k',
      tags: ['Hybrid Reasoning', 'Coding'],
      desc: 'Frontier hybrid reasoning and agentic code synthesizer.'
    },
    {
      id: 'google/gemini-2.5-flash',
      name: 'Google Gemini 2.5 Flash / Pro',
      provider: 'Google',
      badgeClass: 'provider-google',
      context: '1M',
      tags: ['Vision', '1M Context'],
      desc: 'Massive multimodal context with instant streaming.'
    },
    {
      id: 'deepseek/deepseek-r1',
      name: 'DeepSeek R1 / V3',
      provider: 'DeepSeek',
      badgeClass: 'provider-deepseek',
      context: '64k',
      tags: ['Reasoning', '100% Free'],
      desc: 'Open frontier reasoning engine with visible thought chains.'
    },
    {
      id: 'x-ai/grok-4.7',
      name: 'xAI Grok 4.7',
      provider: 'xAI',
      badgeClass: 'provider-xai',
      context: '128k',
      tags: ['Realtime', 'Unfiltered'],
      desc: 'Real-time knowledge retrieval and direct reasoning.'
    },
    {
      id: 'qwen/qwen-2.5-coder-32b',
      name: 'Qwen 2.5 Coder 32B',
      provider: 'Alibaba',
      badgeClass: 'provider-qwen',
      context: '128k',
      tags: ['Coding', '100% Free'],
      desc: 'Specialized code generation, refactoring, and diffs.'
    },
    {
      id: 'meta-llama/llama-3.3-70b-instruct',
      name: 'Meta LLaMA 3.3 70B',
      provider: 'Meta',
      badgeClass: 'provider-meta',
      context: '128k',
      tags: ['Open Weights', 'Fast'],
      desc: 'Industry standard open-weights foundation model.'
    }
  ], []);

  // Featured Models Data for Homepage Grid
  const featuredModelsList = useMemo(() => [
    {
      id: 'deepseek-r1',
      slug: 'deepseek/deepseek-r1',
      fallback: 'openrouter:deepseek/deepseek-r1',
      provider: 'DeepSeek',
      providerClass: 'bg-blue-500/10 text-blue-400',
      name: 'DeepSeek R1',
      category: 'reasoning free',
      context: '64k Context',
      badge: '● 100% Free Tier',
      desc: 'Open-weights frontier reasoning model rivaling OpenAI o1 on math, competitive coding, and complex logic with full thinking traces.'
    },
    {
      id: 'claude-3-7',
      slug: 'claude-3.7-sonnet',
      fallback: 'openrouter:anthropic/claude-3.7-sonnet',
      provider: 'Anthropic',
      providerClass: 'bg-amber-500/10 text-amber-400',
      name: 'Claude 3.7 Sonnet',
      category: 'reasoning coding',
      context: '200k Context',
      badge: '● Flagship Hybrid',
      desc: 'Industry-leading hybrid reasoning architecture. Seamlessly blends instantaneous natural voice with granular extended thought chains.'
    },
    {
      id: 'gpt-4o',
      slug: 'gpt-4o',
      fallback: 'openrouter:openai/gpt-4o',
      provider: 'OpenAI',
      providerClass: 'bg-emerald-500/10 text-emerald-400',
      name: 'GPT-4o (Omni)',
      category: 'coding reasoning',
      context: '128k Context',
      badge: '● Multimodal Pro',
      desc: 'High-speed flagship multimodal engine. Superior real-time reasoning, vision parsing, and structured JSON output.'
    },
    {
      id: 'gemini-2-5-flash',
      slug: 'gemini-2.5-flash',
      fallback: 'openrouter:google/gemini-2.5-flash',
      provider: 'Google',
      providerClass: 'bg-cyan-500/10 text-cyan-400',
      name: 'Gemini 2.5 Flash',
      category: 'free',
      context: '1M Context',
      badge: '● 100% Free Tier',
      desc: 'Breakthrough 1-million token context window. Instant audio, video, code, and document understanding with near-zero latency.'
    },
    {
      id: 'grok-4-7',
      slug: 'grok',
      fallback: 'openrouter:x-ai/grok-2',
      provider: 'xAI',
      providerClass: 'bg-purple-500/10 text-purple-400',
      name: 'Grok 4.7',
      category: 'reasoning',
      context: '128k Context',
      badge: '● High Speed',
      desc: 'Uncensored real-time knowledge retrieval, witty conversational depth, and rapid mathematical synthesis.'
    },
    {
      id: 'qwen-2-5-coder',
      slug: 'qwen-2.5-coder',
      fallback: 'openrouter:qwen/qwen-2.5-coder-32b-instruct',
      provider: 'Qwen',
      providerClass: 'bg-emerald-500/10 text-emerald-400',
      name: 'Qwen 2.5 Coder',
      category: 'free coding',
      context: '128k Context',
      badge: '● 100% Free Tier',
      desc: 'Specialized code generation, diff analysis, and unit test synthesizer built on 5.5T tokens.'
    }
  ], []);

  const filteredModels = useMemo(() => {
    if (activeCategory === 'all') return featuredModelsList;
    return featuredModelsList.filter(m => m.category.includes(activeCategory));
  }, [activeCategory, featuredModelsList]);

  return (
    <div className="any-landing-root">
      
      {/* Background Architectural Dot-Matrix & Hairline Grid */}
      <div className="any-grid-overlay" aria-hidden="true" />

      {/* Multi-Layered Soft Ambient Hero Radial Glow */}
      <div className="hero-ambient-glow" aria-hidden="true" />

      {/* ==============================================================
           1. TOP NAVBAR WITH FROSTED GLASS & RICH MEGA-MENUS
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
            
            {/* 1. Products Mega-Menu */}
            <div className="any-menu-item">
              <button
                type="button"
                className={`any-menu-trigger ${openDropdown === 'products' ? 'is-active' : ''}`}
                onClick={() => setOpenDropdown(prev => prev === 'products' ? null : 'products')}
                aria-expanded={openDropdown === 'products'}
              >
                <span>Products</span>
                <svg className="any-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>

              {openDropdown === 'products' && (
                <div className="any-mega-dropdown">
                  <div className="any-dropdown-header">
                    <span className="any-dropdown-eyebrow">PLATFORM CAPABILITIES</span>
                    <span className="any-dropdown-meta">AnyAPI Architecture</span>
                  </div>

                  <button
                    type="button"
                    className="any-dropdown-row"
                    onClick={() => { setOpenDropdown(null); onOpenChat(selectedModel); }}
                  >
                    <div className="any-row-icon cyan-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 9h6"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title-wrap">
                        <span className="any-row-title">LLM Gateway / Unified API</span>
                        <span className="any-badge-pill popular">Popular</span>
                        <span className="any-badge-pill v2">v2.0</span>
                      </div>
                      <div className="any-row-desc">One endpoint for 400+ foundational AI models with drop-in OpenAI compatibility.</div>
                    </div>
                  </button>

                  <a
                    href="#routing"
                    className="any-dropdown-row"
                    onClick={e => handleInternalNav(e, '#routing')}
                  >
                    <div className="any-row-icon emerald-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Intelligent Model Routing</div>
                      <div className="any-row-desc">Automatic fallback, latency optimization & lowest cost multi-cloud routing.</div>
                    </div>
                  </a>

                  <a
                    href="#arena"
                    className="any-dropdown-row"
                    onClick={e => handleInternalNav(e, '#arena')}
                  >
                    <div className="any-row-icon violet-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Zero Completion Insurance (Arena)</div>
                      <div className="any-row-desc">Guaranteed prompt response SLA with multi-provider real-time battle.</div>
                    </div>
                  </a>

                  <button
                    type="button"
                    className="any-dropdown-row"
                    onClick={() => { setOpenDropdown(null); onOpenSkills(); }}
                  >
                    <div className="any-row-icon blue-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Tool Calling & Specialized Agents</div>
                      <div className="any-row-desc">Standardized function calling, structured JSON output & 20+ role presets.</div>
                    </div>
                  </button>

                  <a
                    href="#studio"
                    className="any-dropdown-row"
                    onClick={e => handleInternalNav(e, '#studio')}
                  >
                    <div className="any-row-icon amber-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Prompt Caching & Companion Studio</div>
                      <div className="any-row-desc">Context caching to reduce cost by up to 90% across Claude & OpenAI.</div>
                    </div>
                  </a>

                  <a
                    href="#security"
                    className="any-dropdown-row"
                    onClick={e => handleInternalNav(e, '#security')}
                  >
                    <div className="any-row-icon red-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Privacy Logging & Compliance</div>
                      <div className="any-row-desc">Zero-data retention logs, AES-256 encrypted Firestore storage & BYOK.</div>
                    </div>
                  </a>
                </div>
              )}
            </div>

            {/* 2. Models Mega-Menu */}
            <div className="any-menu-item">
              <button
                type="button"
                className={`any-menu-trigger ${openDropdown === 'models' ? 'is-active' : ''}`}
                onClick={() => setOpenDropdown(prev => prev === 'models' ? null : 'models')}
                aria-expanded={openDropdown === 'models'}
              >
                <span>Models</span>
                <svg className="any-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>

              {openDropdown === 'models' && (
                <div className="any-mega-dropdown any-mega-dropdown-wide">
                  <div className="any-dropdown-header">
                    <span className="any-dropdown-eyebrow">FLAGSHIP MODEL FLEET</span>
                    <span className="any-dropdown-meta">400+ Frontier & Open Models</span>
                  </div>

                  <div className="mega-models-grid">
                    {megaMenuModels.map(m => (
                      <button
                        key={m.id}
                        type="button"
                        className="mega-model-item"
                        onClick={() => {
                          setOpenDropdown(null);
                          handleLaunchModel(m.id, m.id);
                        }}
                      >
                        <div className="mega-model-top">
                          <span className={`provider-badge ${m.badgeClass}`}>{m.provider}</span>
                          <span className="mega-model-ctx">{m.context}</span>
                        </div>
                        <div className="mega-model-name">{m.name}</div>
                        <div className="mega-model-desc">{m.desc}</div>
                        <div className="mega-model-pills">
                          {m.tags.map(t => (
                            <span key={t} className="mega-pill">{t}</span>
                          ))}
                        </div>
                      </button>
                    ))}
                  </div>

                  <div className="any-dropdown-footer">
                    <button
                      type="button"
                      className="mega-footer-link"
                      onClick={() => {
                        setOpenDropdown(null);
                        onOpenModels();
                      }}
                    >
                      <span>Explore all 400+ models in our interactive directory</span>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* 3. Pricing Anchor Link */}
            <a
              href="#pricing"
              className="any-menu-link"
              onClick={e => handleInternalNav(e, '#pricing')}
            >
              Pricing
            </a>

            {/* 4. Docs Anchor Link */}
            <a
              href="#docs"
              className="any-menu-link"
              onClick={e => handleInternalNav(e, '#docs')}
            >
              Docs
            </a>

            {/* 5. Resources Dropdown */}
            <div className="any-menu-item">
              <button
                type="button"
                className={`any-menu-trigger ${openDropdown === 'resources' ? 'is-active' : ''}`}
                onClick={() => setOpenDropdown(prev => prev === 'resources' ? null : 'resources')}
                aria-expanded={openDropdown === 'resources'}
              >
                <span>Resources</span>
                <svg className="any-menu-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 9 6 6 6-6"/></svg>
              </button>

              {openDropdown === 'resources' && (
                <div className="any-mega-dropdown">
                  <div className="any-dropdown-header">
                    <span className="any-dropdown-eyebrow">DEVELOPER ECOSYSTEM</span>
                    <span className="any-dropdown-meta">Community & Live Telemetry</span>
                  </div>

                  <a
                    href="https://t.me/+919975649957"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="any-dropdown-row"
                    onClick={() => setOpenDropdown(null)}
                  >
                    <div className="any-row-icon cyan-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Community & Telegram</div>
                      <div className="any-row-desc">Direct technical support and announcements via Telegram (+919975649957).</div>
                    </div>
                  </a>

                  <a
                    href="#analytics"
                    className="any-dropdown-row"
                    onClick={e => handleInternalNav(e, '#analytics')}
                  >
                    <div className="any-row-icon emerald-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Platform Status & Telemetry</div>
                      <div className="any-row-desc">Live model availability, latency metrics, and real-time health checks.</div>
                    </div>
                  </a>

                  <button
                    type="button"
                    className="any-dropdown-row"
                    onClick={() => { setOpenDropdown(null); onOpenSkills(); }}
                  >
                    <div className="any-row-icon violet-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">20+ Specialized Agent Skills</div>
                      <div className="any-row-desc">Pre-configured prompts for code review, architecture, and reasoning.</div>
                    </div>
                  </button>

                  <a
                    href="#docs"
                    className="any-dropdown-row"
                    onClick={e => handleInternalNav(e, '#docs')}
                  >
                    <div className="any-row-icon blue-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>
                    </div>
                    <div className="any-row-text">
                      <div className="any-row-title">Integration & SDK Guides</div>
                      <div className="any-row-desc">Drop-in cURL, Python, and JavaScript OpenAI SDK code examples.</div>
                    </div>
                  </a>
                </div>
              )}
            </div>

            {/* 6. About Modal Trigger */}
            <button
              type="button"
              className="any-menu-link"
              onClick={() => setAboutOpen(true)}
            >
              About
            </button>
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
              <span className="mobile-drawer-eyebrow">Products & Platform</span>
              <button
                type="button"
                className="mobile-drawer-link"
                onClick={() => { setMobileMenuOpen(false); onOpenChat(selectedModel); }}
              >
                AnyChat Workspace (/chat)
              </button>
              <button
                type="button"
                className="mobile-drawer-link"
                onClick={() => { setMobileMenuOpen(false); onOpenModels(); }}
              >
                Model Hub (400+ Models)
              </button>
              <a
                href="#arena"
                className="mobile-drawer-link"
                onClick={e => handleInternalNav(e, '#arena')}
              >
                Side-by-Side Model Arena
              </a>
              <a
                href="#routing"
                className="mobile-drawer-link"
                onClick={e => handleInternalNav(e, '#routing')}
              >
                Intelligent Model Routing
              </a>
              <button
                type="button"
                className="mobile-drawer-link"
                onClick={() => { setMobileMenuOpen(false); onOpenSkills(); }}
              >
                20+ Specialized Agent Skills
              </button>

              <span className="mobile-drawer-eyebrow mt-3">Plans & Developer Guides</span>
              <a
                href="#pricing"
                className="mobile-drawer-link"
                onClick={e => handleInternalNav(e, '#pricing')}
              >
                Pricing Plans & Comparison
              </a>
              <a
                href="#docs"
                className="mobile-drawer-link"
                onClick={e => handleInternalNav(e, '#docs')}
              >
                Documentation & Guides
              </a>
              <a
                href="https://t.me/+919975649957"
                target="_blank"
                rel="noopener noreferrer"
                className="mobile-drawer-link"
                onClick={() => setMobileMenuOpen(false)}
              >
                Telegram Community & Support
              </a>
              <a
                href="#security"
                className="mobile-drawer-link"
                onClick={e => handleInternalNav(e, '#security')}
              >
                Enterprise Security & Privacy
              </a>
              <button
                type="button"
                className="mobile-drawer-link"
                onClick={() => { setMobileMenuOpen(false); setAboutOpen(true); }}
              >
                About iamhujju
              </button>
            </div>

            <div className="mobile-drawer-footer">
              <button
                type="button"
                className="mobile-drawer-contact-btn"
                onClick={() => { setMobileMenuOpen(false); setContactOpen(true); }}
              >
                Contact Founder & Support
              </button>
              {!currentUser && (
                <button
                  type="button"
                  className="mobile-drawer-login-btn"
                  onClick={() => openLogin()}
                >
                  Sign In to iamhujju
                </button>
              )}
              <button
                type="button"
                className="any-btn-primary mobile-full-cta glow-cyan"
                onClick={() => { setMobileMenuOpen(false); onOpenChat(selectedModel); }}
              >
                <span>Launch AnyChat Workspace</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>
          </div>
        )}
      </header>


      {/* ==============================================================
           2. HERO SECTION + INTERACTIVE SHOWCASE (anyapi.ai style)
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
            <div className="any-pill-tabs-bar" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={activeHeroTab === 'chat'}
                className={activeHeroTab === 'chat' ? 'is-active' : ''}
                onClick={() => setActiveHeroTab('chat')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m3 21 1.9-5.7a8.5 8.5 0 1 1 3.8 3.8z"/></svg>
                <span>AI Workspace</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeHeroTab === 'arena'}
                className={activeHeroTab === 'arena' ? 'is-active' : ''}
                onClick={() => setActiveHeroTab('arena')}
              >
                <svg className="violet-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/></svg>
                <span>Side-by-Side Compare</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeHeroTab === 'routing'}
                className={activeHeroTab === 'routing' ? 'is-active' : ''}
                onClick={() => setActiveHeroTab('routing')}
              >
                <svg className="emerald-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                <span>Smart Auto-Routing</span>
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={activeHeroTab === 'analytics'}
                className={activeHeroTab === 'analytics' ? 'is-active' : ''}
                onClick={() => setActiveHeroTab('analytics')}
              >
                <svg className="cyan-stroke" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>
                <span>Usage & Telemetry</span>
              </button>
            </div>

            {/* macOS Window Frame */}
            <div className="spotlight-card any-window-frame" onMouseMove={handleSpotlightMove}>
              
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
                        Synthesize an optimized WebSocket reconnection backoff with jitter in TypeScript.
                      </div>
                    </div>

                    <div className="chat-asst-row">
                      <div className="chat-asst-avatar">AI</div>
                      <div className="chat-asst-box">
                        <div className="chat-asst-meta">
                          <span className="meta-cyan">Claude 3.7 Sonnet (Extended Reasoning)</span>
                          <span className="meta-emerald">418 tok/s · TTFT 98ms</span>
                        </div>
                        <pre className="chat-code-block">
                          <code>
                            <span className="c-cyan">export class</span> <span className="c-muted">ExponentialBackoff</span> &#123;{'\n'}
                            {'  '}<span className="c-cyan">private</span> base = 1000; <span className="c-muted">// 1s</span>{'\n'}
                            {'  '}<span className="c-cyan">private</span> max = 30000; <span className="c-muted">// 30s</span>{'\n'}
                            {'  '}<span className="c-violet">getDelay</span>(attempt: <span className="c-cyan">number</span>): <span className="c-cyan">number</span> &#123;{'\n'}
                            {'    '}<span className="c-cyan">const</span> exp = Math.min(<span className="c-cyan">this</span>.max, <span className="c-cyan">this</span>.base * Math.pow(2, attempt));{'\n'}
                            {'    '}<span className="c-cyan">return</span> Math.floor(exp * (0.8 + Math.random() * 0.4));{'\n'}
                            {'  '}&#125;{'\n'}
                            &#125;
                          </code>
                        </pre>
                        <div className="chat-footer-bar">
                          <span>Synthesized in 0.42s across OpenRouter backbone</span>
                          <button
                            type="button"
                            className="any-link-cta"
                            onClick={() => onOpenChat('anthropic/claude-3.7-sonnet')}
                          >
                            Open in Full Studio →
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Panel 2: Side-by-Side Compare */}
              {activeHeroTab === 'arena' && (
                <div className="any-tab-panel">
                  <div className="arena-split-grid">
                    <div className="arena-card">
                      <div className="arena-header">
                        <span className="text-cyan">DeepSeek R1 (Thinking Mode)</span>
                        <span className="text-emerald">Free Tier</span>
                      </div>
                      <div className="arena-thought">
                        &lt;thought&gt; Calculating complexity bounds and evaluating cache trade-offs... &lt;/thought&gt;
                      </div>
                      <div className="arena-body">
                        The solution guarantees O(log N) amortized search using binary partition, utilizing constant spatial overhead.
                      </div>
                    </div>

                    <div className="arena-card">
                      <div className="arena-header">
                        <span className="text-violet">Claude 3.7 Sonnet</span>
                        <span className="text-slate">Frontier Pro</span>
                      </div>
                      <div className="arena-thought">
                        Synthesizing defensive null guards and boundary edge handling...
                      </div>
                      <div className="arena-body">
                        Here is the type-safe drop-in handler with rigorous boundary validation and zero-dependency unit tests.
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Panel 3: Smart Auto-Routing */}
              {activeHeroTab === 'routing' && (
                <div className="any-tab-panel">
                  <div className="routing-stack">
                    <div className="routing-subtitle">
                      Dynamic multi-cloud routing policy: Latency-optimized with automatic failover.
                    </div>
                    <div className="routing-row row-active">
                      <span><span className="routing-dot dot-emerald"></span> Primary: Anthropic Claude 3.7 Sonnet</span>
                      <span className="text-emerald">Active · 98ms TTFT</span>
                    </div>
                    <div className="routing-row row-standby">
                      <span><span className="routing-dot dot-slate"></span> Failover 1: DeepSeek R1 (Open Source)</span>
                      <span className="text-slate">Standby · Health 100%</span>
                    </div>
                    <div className="routing-row row-standby">
                      <span><span className="routing-dot dot-slate"></span> Failover 2: Google Gemini 2.5 Flash</span>
                      <span className="text-slate">Standby · Health 100%</span>
                    </div>
                  </div>
                </div>
              )}

              {/* Tab Panel 4: Usage & Telemetry */}
              {activeHeroTab === 'analytics' && (
                <div className="any-tab-panel">
                  <div className="analytics-quad-grid">
                    <div className="stat-tile">
                      <div className="stat-val text-cyan">412</div>
                      <div className="stat-label">Accessible Models</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-val text-emerald">100%</div>
                      <div className="stat-label">Privacy Guarantee</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-val text-white">0ms</div>
                      <div className="stat-label">Switching Barrier</div>
                    </div>
                    <div className="stat-tile">
                      <div className="stat-val text-violet">AES-256</div>
                      <div className="stat-label">Cloud Encryption</div>
                    </div>
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
              <span className="marquee-item"><svg className="provider-icon cyan-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M6 18c0-3 3-5 6-5s6 2 6 5"/></svg> Meta LLaMA</span>
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
              <span className="marquee-item"><svg className="provider-icon cyan-fill" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="8" r="4"/><path d="M6 18c0-3 3-5 6-5s6 2 6 5"/></svg> Meta LLaMA</span>
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
              <div className="metric-label">Guaranteed Multi-Cloud Uptime</div>
            </div>

            <div className="spotlight-card metric-card" onMouseMove={handleSpotlightMove}>
              <div className="metric-number text-violet">&lt;110ms</div>
              <div className="metric-label">Average Time-to-First-Token</div>
            </div>

          </div>
        </div>
      </section>


      {/* ==============================================================
           5. PRODUCTS BENTO SHOWCASE (AnyChat, Arena, Auto-Routing, Studio)
           ============================================================== */}
      <section className="any-bento-section" id="products">
        <div className="any-section-inner">
          
          <div className="any-section-head text-center">
            <span className="any-eyebrow">ENGINEERED FOR MODERN BUILDERS</span>
            <h2 className="any-h2">Everything in one AI workspace</h2>
            <p className="any-subhead">
              No more juggling multiple subscriptions or tab switching. Compare answers, automate complex prompts, and switch models on the fly.
            </p>
          </div>

          <div className="bento-layout-grid">
            
            {/* Bento Card 1: AnyChat Workspace */}
            <div className="spotlight-card bento-card bento-wide" onMouseMove={handleSpotlightMove}>
              <div>
                <div className="bento-badge cyan-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18M15 9h6"/></svg>
                  <span>UNIFIED WORKSPACE (/chat)</span>
                </div>
                <h3 className="bento-title">AnyChat Workspace — 400+ models in one browser tab</h3>
                <p className="bento-desc">
                  Access GPT-4o, Claude 3.7 Sonnet, DeepSeek R1, Grok, and Gemini without managing separate API accounts or token limits. Seamlessly switch models mid-conversation while retaining full context.
                </p>
              </div>

              <div className="bento-mockup-box">
                <div className="bento-mockup-header">
                  <span>AnyChat Live Session</span>
                  <span className="text-emerald">Active Model: Claude 3.7 Sonnet (200k)</span>
                </div>
                <div className="bento-mockup-stats">
                  <div className="mockup-stat"><strong className="text-white">0ms</strong><span>Switching Lag</span></div>
                  <div className="mockup-stat"><strong className="text-white">100%</strong><span>Context Retention</span></div>
                  <div className="mockup-stat"><strong className="text-white">AES-256</strong><span>Cloud Vault</span></div>
                </div>
              </div>
            </div>

            {/* Bento Card 2: Side-by-Side Model Arena */}
            <div className="spotlight-card bento-card" id="arena" onMouseMove={handleSpotlightMove}>
              <div>
                <div className="bento-badge violet-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24M14.83 14.83l4.24 4.24M14.83 9.17l4.24-4.24M4.93 19.07l4.24-4.24"/></svg>
                  <span>REAL-TIME ARENA</span>
                </div>
                <h3 className="bento-title">Side-by-Side Model Arena</h3>
                <p className="bento-desc">
                  Broadcast prompts to 2, 3, or 4 models simultaneously. Pinpoint hallucinations, compare reasoning speed, and pick the best response.
                </p>
              </div>

              <div className="bento-arena-preview">
                <div className="arena-preview-header">
                  <span>DeepSeek R1 vs Claude 3.7</span>
                  <span className="text-cyan">Diff Match: 99.4%</span>
                </div>
                <div className="arena-progress-bar">
                  <div className="arena-progress-fill"></div>
                </div>
              </div>
            </div>

            {/* Bento Card 3: Smart Auto-Routing */}
            <div className="spotlight-card bento-card" id="routing" onMouseMove={handleSpotlightMove}>
              <div>
                <div className="bento-badge emerald-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                  <span>ZERO DOWNTIME ROUTING</span>
                </div>
                <h3 className="bento-title">Smart Auto-Routing</h3>
                <p className="bento-desc">
                  Intelligent heuristics automatically select the fastest, most cost-effective, or highest-reasoning model with sub-10ms automatic failover.
                </p>
              </div>

              <div className="bento-routing-preview">
                <div className="routing-preview-item">
                  <span className="routing-dot dot-emerald"></span>
                  <span>Primary: Claude 3.7 Sonnet</span>
                  <span className="text-emerald">Optimal</span>
                </div>
                <div className="routing-preview-item">
                  <span className="routing-dot dot-yellow"></span>
                  <span>Fallback: DeepSeek R1</span>
                  <span className="text-slate">Hot Standby</span>
                </div>
              </div>
            </div>

            {/* Bento Card 4: Prompt & Companion Studio */}
            <div className="spotlight-card bento-card bento-wide" id="studio" onMouseMove={handleSpotlightMove}>
              <div>
                <div className="bento-badge amber-badge">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>CUSTOM COMPANIONS & PERSONAS</span>
                </div>
                <h3 className="bento-title">Prompt & Companion Studio</h3>
                <p className="bento-desc">
                  Design bespoke AI companions with tailored system instructions, memory parameters, and domain-specific workflows (Coding Architect, Financial Analyst, Copy Strategist).
                </p>
              </div>

              <div className="bento-studio-tags">
                <span className="studio-tag">🛠️ Senior Full-Stack Architect</span>
                <span className="studio-tag">📊 Quantitative Data Scientist</span>
                <span className="studio-tag">✍️ High-Conversion Copywriter</span>
                <span className="studio-tag">🔒 OWASP AppSec Auditor</span>
              </div>
            </div>

          </div>

        </div>
      </section>


      {/* ==============================================================
           6. ENTERPRISE PRIVACY & SECURITY SECTION (#security)
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
              <h3 className="sec-card-title">Encrypted Sessions</h3>
              <p className="sec-card-desc">
                End-to-end TLS 1.3 transport encryption, Firebase Auth access tokens, and optional AES-256 cloud database sync.
              </p>
            </div>

            <div className="spotlight-card security-card" onMouseMove={handleSpotlightMove}>
              <div className="sec-icon-box bg-violet-dim text-violet">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
              </div>
              <h3 className="sec-card-title">Full User Control</h3>
              <p className="sec-card-desc">
                Total control over your conversation history. One-click instant chat purge, JSON conversation export, and local-only sandbox mode.
              </p>
            </div>

          </div>

        </div>
      </section>


      {/* ==============================================================
           7. FILTERABLE FEATURED MODELS GRID (#models)
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

          <div className="models-footer-cta text-center">
            <button
              type="button"
              className="any-btn-secondary"
              onClick={() => onOpenModels()}
            >
              <span>Browse All 400+ Active Models in Directory →</span>
            </button>
          </div>

        </div>
      </section>


      {/* ==============================================================
           8. DEDICATED 3-TIER PRICING SECTION (#pricing / /pricing)
           ============================================================== */}
      <section className="any-pricing-section" id="pricing">
        <div className="any-section-inner">
          
          <div className="any-section-head text-center">
            <span className="any-eyebrow">SIMPLE, TRANSPARENT PRICING</span>
            <h2 className="any-h2">Pick the plan that fits your ambition</h2>
            <p className="any-subhead">
              Start with our permanent Free Tier with zero credit card required, or upgrade for unlimited 400+ frontier models.
            </p>

            {/* Monthly / Annual Toggle */}
            <div className="pricing-toggle-wrap">
              <div className="pricing-toggle-container">
                <button
                  type="button"
                  className={`pricing-toggle-btn ${pricingCycle === 'monthly' ? 'is-active' : ''}`}
                  onClick={() => setPricingCycle('monthly')}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  className={`pricing-toggle-btn ${pricingCycle === 'annual' ? 'is-active' : ''}`}
                  onClick={() => setPricingCycle('annual')}
                >
                  <span>Annual Billing</span>
                  <span className="pricing-save-badge">Save 20%</span>
                </button>
              </div>
            </div>
          </div>

          <div className="pricing-cards-grid">
            
            {/* Tier 1: Free Starter */}
            <div className="spotlight-card pricing-card" onMouseMove={handleSpotlightMove}>
              <div className="pricing-card-header">
                <span className="pricing-tier-name text-slate">Free Starter</span>
                <div className="pricing-price-wrap">
                  <span className="pricing-currency">$</span>
                  <span className="pricing-amount">0</span>
                  <span className="pricing-cycle">/ forever</span>
                </div>
                <p className="pricing-tier-desc">Perfect for students, casual testing, and free frontier exploration.</p>
              </div>

              <div className="pricing-feature-list">
                <div className="pricing-feature-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Access to all 100% Free models (DeepSeek R1, Gemini 2.5 Flash, Qwen 2.5)</span>
                </div>
                <div className="pricing-feature-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Unlimited chat conversations & search history</span>
                </div>
                <div className="pricing-feature-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Persistent Cloud Firestore conversation synchronization</span>
                </div>
                <div className="pricing-feature-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Drop-in OpenAI SDK & cURL HTTP gateway compatibility</span>
                </div>
                <div className="pricing-feature-item">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Community Telegram support</span>
                </div>
              </div>

              <button
                type="button"
                className="pricing-card-cta any-btn-secondary"
                onClick={() => onOpenChat(selectedModel)}
              >
                Start for free
              </button>
            </div>

            {/* Tier 2: Pro Companion (Featured) */}
            <div className="spotlight-card pricing-card pricing-card-featured" onMouseMove={handleSpotlightMove}>
              <div className="pricing-featured-badge">MOST POPULAR</div>
              
              <div className="pricing-card-header">
                <span className="pricing-tier-name text-cyan">Pro Companion</span>
                <div className="pricing-price-wrap">
                  <span className="pricing-currency">$</span>
                  <span className="pricing-amount">{pricingCycle === 'monthly' ? '19' : '15'}</span>
                  <span className="pricing-cycle">/ month</span>
                </div>
                <p className="pricing-tier-desc">For creators, developers, and power users who need all frontier models daily.</p>
              </div>

              <div className="pricing-feature-list">
                <div className="pricing-feature-item">
                  <svg className="text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span><strong>Everything in Free Starter</strong></span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Access to <strong>400+ Frontier Models</strong> (GPT-4o, Claude 3.7 Sonnet, o3-mini, Grok 4.7)</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Side-by-Side Model Arena (run up to 4 models in parallel)</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Smart Auto-Routing with latency & cost optimization</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Prompt & Companion Studio (custom personas & saved workflows)</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-cyan" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>High-speed priority gateway (&lt;110ms TTFT)</span>
                </div>
              </div>

              <button
                type="button"
                className="pricing-card-cta any-btn-primary glow-cyan"
                onClick={() => openLogin()}
              >
                <span>Upgrade to Pro Companion</span>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M5 12h14M12 5l7 7-7 7"/></svg>
              </button>
            </div>

            {/* Tier 3: Team / Power User */}
            <div className="spotlight-card pricing-card" onMouseMove={handleSpotlightMove}>
              <div className="pricing-card-header">
                <span className="pricing-tier-name text-violet">Team / Power User</span>
                <div className="pricing-price-wrap">
                  <span className="pricing-currency">$</span>
                  <span className="pricing-amount">{pricingCycle === 'monthly' ? '49' : '39'}</span>
                  <span className="pricing-cycle">/ seat / mo</span>
                </div>
                <p className="pricing-tier-desc">For engineering squads, agencies, and businesses scaling on multi-model AI.</p>
              </div>

              <div className="pricing-feature-list">
                <div className="pricing-feature-item">
                  <svg className="text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span><strong>Everything in Pro Companion</strong></span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Multi-seat shared workspace & collaborative saved chats</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Dedicated OpenAI-compatible API Gateway key (@iamhujju/cli)</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Shared team prompt templates & custom companion personas</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>Zero Data Retention (ZDR) enterprise agreement</span>
                </div>
                <div className="pricing-feature-item">
                  <svg className="text-violet" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>24/7 Priority Founder Support via Telegram & direct email</span>
                </div>
              </div>

              <button
                type="button"
                className="pricing-card-cta any-btn-secondary"
                onClick={() => setContactOpen(true)}
              >
                Contact Founder / Team Plan
              </button>
            </div>

          </div>

          {/* Detailed Feature Comparison Table (matching AnyAPI /pricing) */}
          <div className="pricing-comparison-wrap">
            <div className="pricing-table-head text-center">
              <span className="any-eyebrow text-cyan">IN-DEPTH BREAKDOWN</span>
              <h3 className="pricing-table-title">Full Feature & Limit Comparison</h3>
              <p className="pricing-table-sub">Compare plan parameters, concurrency, latency SLAs, and enterprise privacy guarantees.</p>
            </div>

            <div className="spotlight-card pricing-table-card" onMouseMove={handleSpotlightMove}>
              <div className="pricing-table-overflow">
                <table className="pricing-matrix-table">
                  <thead>
                    <tr>
                      <th className="th-feature">Platform Features</th>
                      <th className="th-plan">Free Starter</th>
                      <th className="th-plan th-highlight">Pro Companion</th>
                      <th className="th-plan">Team & Power User</th>
                    </tr>
                  </thead>
                  <tbody>
                    {comparisonCategories.map(cat => (
                      <Fragment key={cat.category}>
                        <tr className="tr-category">
                          <td colSpan={4}>{cat.category}</td>
                        </tr>
                        {cat.features.map(feat => (
                          <tr key={feat.name} className="tr-feature">
                            <td className="td-feature-name">{feat.name}</td>
                            <td className="td-val">{feat.free}</td>
                            <td className="td-val td-highlight">{feat.pro}</td>
                            <td className="td-val">{feat.team}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Expandable FAQ Accordion (matching AnyAPI FAQ) */}
          <div className="pricing-faq-wrap">
            <div className="pricing-table-head text-center">
              <span className="any-eyebrow text-emerald">ANSWERS & CLARITY</span>
              <h3 className="pricing-table-title">Frequently Asked Questions</h3>
              <p className="pricing-table-sub">Everything you need to know about billing, model routing, zero data retention, and BYOK credentials.</p>
            </div>

            <div className="faq-accordion-list">
              {pricingFaqs.map((faq, index) => {
                const isOpen = openFaq === index;
                return (
                  <div
                    key={faq.q}
                    className={`spotlight-card faq-accordion-card ${isOpen ? 'is-open' : ''}`}
                    onMouseMove={handleSpotlightMove}
                  >
                    <button
                      type="button"
                      className="faq-question-btn"
                      onClick={() => setOpenFaq(prev => prev === index ? null : index)}
                      aria-expanded={isOpen}
                    >
                      <span className="faq-question-text">{faq.q}</span>
                      <span className="faq-toggle-icon">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          {isOpen ? <path d="M5 12h14" /> : <path d="M12 5v14M5 12h14" />}
                        </svg>
                      </span>
                    </button>
                    {isOpen && (
                      <div className="faq-answer-block">
                        <p>{faq.a}</p>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

        </div>
      </section>


      {/* ==============================================================
           9. INTERACTIVE DOCS & QUICKSTART SECTION (#docs / /docs)
           ============================================================== */}
      <section className="any-docs-section" id="docs">
        <div className="any-section-inner">
          
          <div className="any-section-head text-center">
            <span className="any-eyebrow">DOCUMENTATION & DEVELOPER GUIDE</span>
            <h2 className="any-h2">Build, chat, and prompt in seconds</h2>
            <p className="any-subhead">
              Everything you need to master multi-model conversations, keyboard workflows, and drop-in OpenAI API integration.
            </p>
          </div>

          <div className="docs-layout-split">
            
            {/* Docs Left Navigation Sidebar */}
            <div className="docs-sidebar-nav">
              <button
                type="button"
                className={`docs-nav-tab ${activeDocsTopic === 'getting-started' ? 'is-active' : ''}`}
                onClick={() => setActiveDocsTopic('getting-started')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                <span>Getting Started in 60s</span>
              </button>

              <button
                type="button"
                className={`docs-nav-tab ${activeDocsTopic === 'switching-models' ? 'is-active' : ''}`}
                onClick={() => setActiveDocsTopic('switching-models')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="17 1 21 5 17 9"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><polyline points="7 23 3 19 7 15"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
                <span>Switching Models Mid-Chat</span>
              </button>

              <button
                type="button"
                className={`docs-nav-tab ${activeDocsTopic === 'prompting' ? 'is-active' : ''}`}
                onClick={() => setActiveDocsTopic('prompting')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                <span>Prompting Best Practices</span>
              </button>

              <button
                type="button"
                className={`docs-nav-tab ${activeDocsTopic === 'shortcuts' ? 'is-active' : ''}`}
                onClick={() => setActiveDocsTopic('shortcuts')}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect width="18" height="12" x="3" y="6" rx="2"/><path d="M7 10h.01M12 10h.01M17 10h.01M7 14h.01M12 14h.01M17 14h.01"/></svg>
                <span>Keyboard Shortcuts</span>
              </button>

              <div className="docs-sidebar-footer">
                <button
                  type="button"
                  className="docs-open-modal-btn"
                  onClick={() => { setDocsTab('quickstart'); setDocsOpen(true); }}
                >
                  <span>Open Full API & CLI Reference</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3"/></svg>
                </button>
              </div>
            </div>

            {/* Docs Right Content Viewer */}
            <div className="spotlight-card docs-content-viewer" onMouseMove={handleSpotlightMove}>
              
              {activeDocsTopic === 'getting-started' && (
                <div className="docs-topic-panel">
                  <span className="docs-topic-eyebrow text-cyan">QUICKSTART GUIDE</span>
                  <h3 className="docs-topic-title">Getting Started in 60 Seconds</h3>
                  <p className="docs-topic-p">
                    iamhujju lets you chat with leading frontier and open-weights models instantly without requiring upfront API keys or payment.
                  </p>
                  
                  <div className="docs-steps-list">
                    <div className="docs-step-row">
                      <span className="docs-step-num">1</span>
                      <div>
                        <strong>Launch AnyChat:</strong> Click <button type="button" className="docs-inline-link" onClick={() => onOpenChat()}>Open Workspace</button> to open the multi-model chat interface.
                      </div>
                    </div>
                    <div className="docs-step-row">
                      <span className="docs-step-num">2</span>
                      <div>
                        <strong>Select a Model:</strong> Choose between Free Tier models (DeepSeek R1, Gemini 2.5 Flash) or log in to unlock 400+ frontier engines.
                      </div>
                    </div>
                    <div className="docs-step-row">
                      <span className="docs-step-num">3</span>
                      <div>
                        <strong>Drop-in API Compatibility:</strong> Point any OpenAI SDK script to <code>https://iamhujju.com/api</code> by changing <code>baseURL</code>.
                      </div>
                    </div>
                  </div>

                  <pre className="docs-code-pane">
                    <code>
                      <span className="c-muted"># Drop-in cURL request to iamhujju API Gateway</span>{'\n'}
                      curl https://iamhujju.com/api/chat/completions \{'\n'}
                      {'  '}-H <span className="c-emerald">"Content-Type: application/json"</span> \{'\n'}
                      {'  '}-d <span className="c-cyan">'&#123;"model": "openrouter/free", "messages": [&#123;"role": "user", "content": "Hello iamhujju!"&#125;]&#125;'</span>
                    </code>
                  </pre>
                </div>
              )}

              {activeDocsTopic === 'switching-models' && (
                <div className="docs-topic-panel">
                  <span className="docs-topic-eyebrow text-violet">CONVERSATION CONTINUITY</span>
                  <h3 className="docs-topic-title">Switching Models Mid-Chat</h3>
                  <p className="docs-topic-p">
                    Unlike standard single-provider web interfaces, iamhujju allows dynamic model swapping within the same live conversation thread.
                  </p>
                  <div className="docs-benefit-box">
                    <strong>How to switch models on the fly:</strong>
                    <ul>
                      <li>Open the model dropdown in the top header of AnyChat at any point in the conversation.</li>
                      <li>Select any available model (e.g., switch from GPT-4o for ideation to DeepSeek R1 for mathematical proof, then Claude 3.7 for code synthesis).</li>
                      <li>All previous message history is automatically reformatted and passed to the new model's tokenizer without truncation.</li>
                    </ul>
                  </div>
                </div>
              )}

              {activeDocsTopic === 'prompting' && (
                <div className="docs-topic-panel">
                  <span className="docs-topic-eyebrow text-emerald">BEST PRACTICES</span>
                  <h3 className="docs-topic-title">Prompting & Reasoning Best Practices</h3>
                  <p className="docs-topic-p">
                    Optimize token throughput and accuracy when interacting with reasoning and agentic models:
                  </p>
                  <div className="docs-best-practices-grid">
                    <div className="bp-card">
                      <strong>Reasoning Models (&lt;think&gt;)</strong>
                      <p>DeepSeek R1 and o3-mini output thought chains. Let them complete reasoning before asking for brevity.</p>
                    </div>
                    <div className="bp-card">
                      <strong>Structured JSON Schemas</strong>
                      <p>Specify explicit JSON keys in your prompt for 100% deterministic parsing with GPT-4o and Claude 3.7.</p>
                    </div>
                    <div className="bp-card">
                      <strong>System Instructions</strong>
                      <p>Use the Prompt & Companion Studio to set role boundaries that persist across every message turn.</p>
                    </div>
                  </div>
                </div>
              )}

              {activeDocsTopic === 'shortcuts' && (
                <div className="docs-topic-panel">
                  <span className="docs-topic-eyebrow text-amber">PRODUCTIVITY HACKS</span>
                  <h3 className="docs-topic-title">Keyboard Shortcuts Reference</h3>
                  <p className="docs-topic-p">
                    Navigate and control your AI workspace with speed:
                  </p>
                  <div className="docs-shortcuts-table">
                    <div className="shortcut-row">
                      <span className="shortcut-desc">Open Model Quick Switcher</span>
                      <kbd className="shortcut-key">Ctrl / Cmd + K</kbd>
                    </div>
                    <div className="shortcut-row">
                      <span className="shortcut-desc">Send message</span>
                      <kbd className="shortcut-key">Enter</kbd>
                    </div>
                    <div className="shortcut-row">
                      <span className="shortcut-desc">Insert new line</span>
                      <kbd className="shortcut-key">Shift + Enter</kbd>
                    </div>
                    <div className="shortcut-row">
                      <span className="shortcut-desc">Copy last AI response</span>
                      <kbd className="shortcut-key">Ctrl / Cmd + Shift + C</kbd>
                    </div>
                    <div className="shortcut-row">
                      <span className="shortcut-desc">Toggle Copilot Live Support</span>
                      <kbd className="shortcut-key">Ctrl / Cmd + /</kbd>
                    </div>
                  </div>
                </div>
              )}

            </div>

          </div>

        </div>
      </section>


      {/* ==============================================================
           10. BOTTOM CONVERSION BANNER & DUAL ACTION CARDS
           ============================================================== */}
      <section className="any-cta-section">
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
                onClick={e => handleInternalNav(e, '#pricing')}
                onKeyDown={e => { if (e.key === 'Enter') handleInternalNav(e, '#pricing'); }}
              >
                <span className="card-mini-eyebrow text-cyan">PRICING ON YOUR TERMS</span>
                <h3 className="card-mini-title">Pick the plan that fits your scale</h3>
                <p className="card-mini-desc">Generous free tier forever with zero credit card, or pay-as-you-go Pro upgrades.</p>
              </div>

              <div
                className="cta-glass-card"
                role="button"
                tabIndex={0}
                onClick={e => handleInternalNav(e, '#docs')}
                onKeyDown={e => { if (e.key === 'Enter') handleInternalNav(e, '#docs'); }}
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
           11. COMPREHENSIVE FOOTER
           ============================================================== */}
      <footer className="any-footer-root">
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
                <li><button type="button" onClick={() => onOpenChat(selectedModel)}>AnyChat Workspace</button></li>
                <li><a href="#arena" onClick={e => handleInternalNav(e, '#arena')}>Multi-Model Arena</a></li>
                <li><a href="#routing" onClick={e => handleInternalNav(e, '#routing')}>Auto-Router</a></li>
                <li><a href="#studio" onClick={e => handleInternalNav(e, '#studio')}>Prompt & Studio</a></li>
                <li><button type="button" onClick={() => onOpenModels()}>Model Hub (400+)</button></li>
                <li><button type="button" onClick={() => onOpenSkills()}>Skills Catalog</button></li>
              </ul>
            </div>

            <div className="footer-nav-col">
              <h4>Flagship Models</h4>
              <ul>
                <li><button type="button" onClick={() => handleLaunchModel('claude-3.7-sonnet', 'openrouter:anthropic/claude-3.7-sonnet')}>Claude 3.7 Sonnet</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('deepseek/deepseek-r1', 'openrouter:deepseek/deepseek-r1')}>DeepSeek R1</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('gpt-4o', 'openrouter:openai/gpt-4o')}>GPT-4o (Omni)</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('gemini-2.5-flash', 'openrouter:google/gemini-2.5-flash')}>Gemini 2.5 Flash</button></li>
                <li><button type="button" onClick={() => handleLaunchModel('grok', 'openrouter:x-ai/grok-2')}>xAI Grok 4.7</button></li>
              </ul>
            </div>

            <div className="footer-nav-col">
              <h4>Support & Legal</h4>
              <ul>
                <li><a href="mailto:huzaifakazi1991@gmail.com">huzaifakazi1991@gmail.com</a></li>
                <li><a href="https://t.me/+919975649957" target="_blank" rel="noopener noreferrer">Telegram: +919975649957</a></li>
                <li><a href="#security" onClick={e => handleInternalNav(e, '#security')}>Enterprise Security</a></li>
                <li><button type="button" onClick={() => setContactOpen(true)}>Contact Founder</button></li>
                <li><button type="button" onClick={() => setAboutOpen(true)}>About iamhujju</button></li>
              </ul>
            </div>

          </div>

          <div className="footer-bottom-bar">
            <div>© 2026 iamhujju.com — One AI Workspace for 400+ Models. All rights reserved.</div>
            <div className="footer-bottom-links">
              <a href="#security" onClick={e => handleInternalNav(e, '#security')}>Terms of Service</a>
              <a href="#security" onClick={e => handleInternalNav(e, '#security')}>Privacy Policy</a>
              <a href="#security" onClick={e => handleInternalNav(e, '#security')}>Security Guarantee</a>
            </div>
          </div>

        </div>
      </footer>


      {/* ==============================================================
           12. BUILT-IN MODALS & AI SUPPORT COPILOT WIDGET
           ============================================================== */}

      {/* Auth Modal (Firebase Google One-Click + Email/Password) */}
      {authOpen && (
        <div className="any-modal-backdrop" onClick={() => setAuthOpen(false)}>
          <div className="any-auth-dialog" onClick={e => e.stopPropagation()}>
            <button
              type="button"
              className="any-modal-close"
              onClick={() => setAuthOpen(false)}
              aria-label="Close authentication modal"
            >
              ×
            </button>

            <div className="any-auth-header">
              <div className="any-auth-brand">iamhujju AI Workspace</div>
              <h2 className="any-auth-title">
                {authMode === 'login' ? 'Welcome Back' : 'Create Your Free Account'}
              </h2>
              <p className="any-auth-sub">
                {authMode === 'signup'
                  ? 'Sign up to unlock 400+ models, persistent cloud history, and high-speed auto-routing.'
                  : 'Sign in to access your models, saved prompts, and cloud conversations.'}
              </p>
            </div>

            {/* Google One-Click Auth Button */}
            <button
              type="button"
              className="any-google-btn"
              disabled={authBusy}
              onClick={async () => {
                setAuthBusy(true);
                setAuthError('');
                try {
                  const user = await signInWithGoogle();
                  if (user) {
                    await syncUserProfile(user);
                    onAuthenticated(user, pendingModelId);
                    setAuthOpen(false);
                  }
                } catch (err) {
                  setAuthError(err.message || 'Google sign-in could not be completed.');
                } finally {
                  setAuthBusy(false);
                }
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
              <span>{authBusy ? 'Connecting to Google...' : 'Continue with Google'}</span>
            </button>

            <div className="any-auth-divider">
              <span>or email</span>
            </div>

            <form
              className="any-auth-form"
              onSubmit={e => {
                e.preventDefault();
                setAuthError('Email/password login is ready. Prefer Google One-Click above for instant setup.');
              }}
            >
              <input
                type="email"
                placeholder="developer@iamhujju.com"
                value={authEmail}
                onChange={e => setAuthEmail(e.target.value)}
                required
              />
              <input
                type="password"
                placeholder="••••••••••••"
                value={authPassword}
                onChange={e => setAuthPassword(e.target.value)}
                required
              />

              {authError && <div className="any-auth-error">{authError}</div>}

              <button type="submit" className="any-auth-submit-btn" disabled={authBusy}>
                {authMode === 'login' ? 'Sign In' : 'Create Free Account'}
              </button>
            </form>

            <div className="any-auth-toggle-mode">
              <span>{authMode === 'login' ? "Don't have an account?" : 'Already have an account?'}</span>
              <button
                type="button"
                onClick={() => {
                  setAuthMode(authMode === 'login' ? 'signup' : 'login');
                  setAuthError('');
                }}
              >
                {authMode === 'login' ? 'Sign Up' : 'Sign In'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Contact Modal */}
      {contactOpen && (
        <ContactModal
          onClose={() => setContactOpen(false)}
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
