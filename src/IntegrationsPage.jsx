import { useEffect, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import './ApiKeysPage.css';

const PROVIDERS_CONFIG = [
  {
    id: 'openrouter',
    name: 'OpenRouter',
    tagline: '400+ Frontier & Open Models',
    description: 'Unified AI gateway aggregating models from OpenAI, Anthropic Claude, Meta Llama 3, Google Gemini, and DeepSeek with transparent routing.',
    badge: '400+ MODELS',
    portalUrl: 'https://openrouter.ai',
    docsUrl: 'https://openrouter.ai/docs/api-reference/overview',
    termsUrl: 'https://openrouter.ai/terms',
    privacyUrl: 'https://openrouter.ai/privacy',
    placeholder: 'sk-or-v1-...',
    requiresTerms: true,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z" />
        <path d="M2 12h20" />
      </svg>
    )
  },
  {
    id: 'electronhub',
    name: 'ElectronHub AI',
    tagline: 'High-Speed LLM Inference & Routing',
    description: 'High-performance model gateway providing low-latency access to GPT-4o, Claude 3.5 Sonnet, Gemini 2.0, and DeepSeek R1 with full token availability.',
    badge: 'FULL TOKEN ACCESS',
    portalUrl: 'https://app.electronhub.ai',
    docsUrl: 'https://app.electronhub.ai',
    placeholder: 'ek-...',
    requiresTerms: false,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    )
  },
  {
    id: 'groq',
    name: 'Groq Cloud',
    tagline: 'Ultra-Fast LPU Inference Engine',
    description: 'Lightning-fast inference powered by Groq LPUs. Near-instant token generation for Llama 3.3 70B, DeepSeek R1, Gemma 2, and Mixtral.',
    badge: 'ULTRA FAST LPU',
    portalUrl: 'https://console.groq.com',
    docsUrl: 'https://console.groq.com/docs',
    placeholder: 'gsk_...',
    requiresTerms: false,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M13 10V3L4 14h7v7l9-11h-7z" />
      </svg>
    )
  },
  {
    id: 'freemodel',
    name: 'FreeModel.in',
    tagline: 'Curated Developer AI Access',
    description: 'Curated platform offering developer API access for top-tier models including Claude Opus 4.8, GPT-4o, and DeepSeek V3 with generous quotas.',
    badge: 'DEVELOPER ACCESS',
    portalUrl: 'https://freemodel.in',
    docsUrl: 'https://freemodel.in',
    placeholder: 'fm_...',
    requiresTerms: false,
    icon: (
      <svg aria-hidden="true" viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2L2 7l10 5 10-5-10-5z" />
        <path d="M2 17l10 5 10-5" />
        <path d="M2 12l10 5 10-5" />
      </svg>
    )
  }
];

async function readResponse(response, fallback) {
  let result;
  try {
    result = await response.json();
  } catch {
    if (!response.ok) throw new Error(`${fallback} (HTTP ${response.status}).`);
    throw new Error('The local server returned an invalid response.');
  }
  if (!response.ok) {
    throw new Error(result?.error?.message || `${fallback} (HTTP ${response.status}).`);
  }
  return result;
}

function testedLabel(value) {
  if (!value) return 'Not tested';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not tested';
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function IntegrationsPage({
  user,
  connected,
  modelCount,
  onLogout,
  onOpenHome,
  onOpenModels,
  onOpenSkills,
  onOpenSavedChats,
  onOpenChat,
  onOpenApiKeys,
  onOpenPricing,
  onModelsChanged
}) {
  const [integrations, setIntegrations] = useState({});
  const [apiKeys, setApiKeys] = useState({});
  const [termsAccepted, setTermsAccepted] = useState({});
  const [editingProvider, setEditingProvider] = useState(null);
  const [confirmDisconnect, setConfirmDisconnect] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busyProvider, setBusyProvider] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadAllIntegrations(signal) {
    try {
      const results = {};
      await Promise.all(
        PROVIDERS_CONFIG.map(async (provider) => {
          try {
            const response = await fetch(`/api/account/integrations/${provider.id}`, {
              signal,
              cache: 'no-store'
            });
            results[provider.id] = await readResponse(response, `Could not load ${provider.name} status`);
          } catch {
            results[provider.id] = { configured: false, lastTestedAt: null, updatedAt: null };
          }
        })
      );
      setIntegrations(results);
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || 'Could not load integrations status.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    loadAllIntegrations(controller.signal);
    return () => controller.abort();
  }, []);

  function handleKeyChange(providerId, value) {
    setApiKeys(prev => ({ ...prev, [providerId]: value }));
  }

  function handleTermsChange(providerId, value) {
    setTermsAccepted(prev => ({ ...prev, [providerId]: value }));
  }

  async function connect(providerId, event) {
    if (event) event.preventDefault();
    if (busyProvider) return;
    const provider = PROVIDERS_CONFIG.find(p => p.id === providerId);
    const keyCandidate = (apiKeys[providerId] || '').trim();
    if (!keyCandidate) {
      setError(`Please enter a valid API key for ${provider?.name || providerId}.`);
      return;
    }

    setBusyProvider(providerId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/account/integrations/${providerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey: keyCandidate,
          termsAccepted: provider.requiresTerms
            ? Boolean(integrations[providerId]?.termsAcceptedAt || termsAccepted[providerId])
            : undefined
        })
      });
      const result = await readResponse(response, `Could not connect ${provider?.name}`);
      setIntegrations(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], ...result, configured: true }
      }));
      setApiKeys(prev => ({ ...prev, [providerId]: '' }));
      setEditingProvider(null);
      setTermsAccepted(prev => ({ ...prev, [providerId]: false }));
      setNotice(`${provider.name} connected successfully. All available models and tokens are now unlocked in your workspace.`);
      if (typeof onModelsChanged === 'function') await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || `Could not connect ${provider?.name}.`);
    } finally {
      setBusyProvider(null);
      setApiKeys(prev => ({ ...prev, [providerId]: '' }));
    }
  }

  async function testConnection(providerId) {
    if (busyProvider) return;
    const provider = PROVIDERS_CONFIG.find(p => p.id === providerId);
    setBusyProvider(providerId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/account/integrations/${providerId}/test`, {
        method: 'POST'
      });
      const result = await readResponse(response, `Could not test ${provider?.name}`);
      setIntegrations(prev => ({
        ...prev,
        [providerId]: { ...prev[providerId], ...result, configured: true }
      }));
      setNotice(`${provider.name} connection verified. Gateway is responsive with ${result.modelCount || 'active'} models accessible.`);
      if (typeof onModelsChanged === 'function') await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || `Could not test ${provider?.name}.`);
    } finally {
      setBusyProvider(null);
    }
  }

  async function disconnect(providerId) {
    if (busyProvider) return;
    const provider = PROVIDERS_CONFIG.find(p => p.id === providerId);
    setBusyProvider(providerId);
    setError('');
    setNotice('');
    try {
      const response = await fetch(`/api/account/integrations/${providerId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(await response.text() || `Could not disconnect ${provider.name} (HTTP ${response.status}).`);
      }
      setIntegrations(prev => ({
        ...prev,
        [providerId]: {
          ...prev[providerId],
          configured: false,
          lastTestedAt: null,
          updatedAt: null,
          termsAcceptedAt: null
        }
      }));
      setConfirmDisconnect(null);
      setNotice(`${provider.name} credentials disconnected. Default gateway models remain active.`);
      if (typeof onModelsChanged === 'function') await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || `Could not disconnect ${provider?.name}.`);
    } finally {
      setBusyProvider(null);
    }
  }

  return (
    <div className="ak-page">
      {/* Atmosphere Background Glow & Tech Grid */}
      <div className="ak-bg-glow" aria-hidden="true" />
      <div className="ak-bg-grid" aria-hidden="true" />

      {/* ── Top Navigation Bar ── */}
      <header className="ak-nav">
        <button
          className="ak-brand"
          type="button"
          onClick={onOpenHome}
          aria-label="iamhujju Explore"
          title="Return to iamhujju Explore"
        >
          <div className="ak-brand-mascot-ring">
            <img src="/mascot.jpg" alt="iamhujju mascot" className="ak-brand-mascot-img" />
          </div>
          <span className="ak-brand-text">iamhujju</span>
        </button>

        <nav className="ak-nav-links" aria-label="Main navigation">
          <button type="button" onClick={onOpenHome}>Explore</button>
          <button type="button" onClick={() => onOpenModels && onOpenModels()}>Models</button>
          {onOpenSkills && <button type="button" onClick={onOpenSkills}>Skills</button>}
          {onOpenPricing && <button type="button" onClick={onOpenPricing}>Pricing</button>}
          <button type="button" onClick={onOpenChat}>Companion</button>
        </nav>

        <div className="ak-nav-tools">
          <span className={`ak-gateway-status${connected ? ' is-online' : ''}`} role="status">
            <span aria-hidden="true" />
            {connected ? 'Gateway online' : 'Gateway offline'}
          </span>
          <AccountMenu
            user={user}
            connected={connected}
            modelCount={modelCount}
            onLogout={onLogout}
            onOpenApiKeys={onOpenApiKeys}
            onOpenIntegrations={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onOpenPricing={onOpenPricing}
            onOpenSavedChats={onOpenSavedChats}
          />
        </div>
      </header>

      {/* ── Two-Column Obsidian Dashboard Layout ── */}
      <div className="ak-layout">
        {/* Sidebar */}
        <aside className="ak-sidebar" aria-label="Account Settings Navigation">
          <span className="ak-sidebar-label">DEVELOPER & ACCOUNT</span>
          <button type="button" onClick={onOpenApiKeys}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="4.5" />
              <path d="M10.8 12.2L18.5 4.5M17 6l2 2M15 8l2 2" />
            </svg>
            <span>API Keys</span>
          </button>
          <button type="button" className="is-current" aria-current="page">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 00-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 007.94-7.94l-3.76 3.76z" />
            </svg>
            <span>Integrations</span>
          </button>
          {onOpenPricing && (
            <button type="button" onClick={onOpenPricing}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="5" width="20" height="14" rx="2" />
                <line x1="2" y1="10" x2="22" y2="10" />
              </svg>
              <span>Subscription & Plans</span>
            </button>
          )}

          <span className="ak-sidebar-label" style={{ marginTop: '24px' }}>NAVIGATION</span>
          <button type="button" onClick={onOpenHome}>Explore Platform</button>
          <button type="button" onClick={() => onOpenModels && onOpenModels()}>Model Catalog</button>
          <button type="button" onClick={onOpenChat}>AI Companion</button>
        </aside>

        {/* Main Content Area */}
        <main className="ak-main">
          {/* Header Title */}
          <div className="ak-header">
            <div className="ak-header-copy">
              <h1>Integrations & Connectors</h1>
              <p>
                Connect your external API keys from OpenRouter, ElectronHub AI, Groq Cloud, or FreeModel.in.
                Keys are encrypted at rest with AES-256-GCM, unlocking complete access with available tokens across the workspace and OpenAI-compatible gateway endpoints.
              </p>
            </div>
          </div>

          {/* Alert Banners */}
          {notice && (
            <div className="ak-alert-banner is-success" role="status">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" />
              </svg>
              <span>{notice}</span>
              <button type="button" onClick={() => setNotice('')} aria-label="Dismiss notice">✕</button>
            </div>
          )}

          {error && (
            <div className="ak-alert-banner is-error" role="alert">
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span>{error}</span>
              <button type="button" onClick={() => setError('')} aria-label="Dismiss error">✕</button>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && (
            <div className="ak-table-empty">
              <span className="ak-spinner" aria-hidden="true" />
              <p>Loading integration status…</p>
            </div>
          )}

          {/* Providers Grid / Stack */}
          {!loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {PROVIDERS_CONFIG.map((provider) => {
                const info = integrations[provider.id] || { configured: false };
                const isConfigured = Boolean(info.configured);
                const isEditing = editingProvider === provider.id;
                const isDisconnecting = confirmDisconnect === provider.id;
                const isBusy = busyProvider === provider.id;
                const inputKey = apiKeys[provider.id] || '';

                return (
                  <div
                    key={provider.id}
                    className={`ak-integration-card${isConfigured ? ' is-active' : ''}`}
                    id={`integration-${provider.id}`}
                  >
                    {/* Card Header */}
                    <div className="ak-integration-header">
                      <div className="ak-integration-logo-ring">
                        <div className="ak-integration-logo-icon">{provider.icon}</div>
                      </div>

                      <div className="ak-integration-title-group">
                        <div className="ak-integration-title-row">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                            <h2>{provider.name}</h2>
                            <span className="ak-tag-badge">{provider.badge}</span>
                          </div>

                          <span className={`ak-badge-status ${isConfigured ? 'is-active' : 'is-revoked'}`}>
                            {isConfigured ? 'Active & Connected' : 'Not Connected'}
                          </span>
                        </div>

                        <p className="ak-integration-desc">{provider.description}</p>

                        <div className="ak-integration-links">
                          <a href={provider.portalUrl} target="_blank" rel="noreferrer">
                            Get API Key on {provider.name} ↗
                          </a>
                          {provider.docsUrl && (
                            <a href={provider.docsUrl} target="_blank" rel="noreferrer">
                              Documentation ↗
                            </a>
                          )}
                          {provider.termsUrl && (
                            <a href={provider.termsUrl} target="_blank" rel="noreferrer">
                              Terms & Privacy ↗
                            </a>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Configured Details View */}
                    {isConfigured && !isEditing && (
                      <>
                        <div className="ak-integration-meta">
                          <div className="ak-meta-item">
                            <span className="ak-meta-label">STORED KEY</span>
                            <span className="ak-meta-value" style={{ fontFamily: 'var(--font-mono, monospace)' }}>
                              {info.prefix ? `••••••••${info.prefix}` : 'Configured & Encrypted'}
                            </span>
                          </div>
                          <div className="ak-meta-item">
                            <span className="ak-meta-label">STATUS & ENCRYPTION</span>
                            <span className="ak-meta-value highlight-green">Encrypted (AES-256-GCM)</span>
                          </div>
                          <div className="ak-meta-item">
                            <span className="ak-meta-label">LAST VERIFIED</span>
                            <span className="ak-meta-value">{testedLabel(info.lastTestedAt)}</span>
                          </div>
                          <div className="ak-meta-item">
                            <span className="ak-meta-label">ACCESSIBLE MODELS</span>
                            <span className="ak-meta-value highlight-green">
                              {info.modelCount ? `${info.modelCount} models discovered` : 'Complete Token Access'}
                            </span>
                          </div>
                        </div>

                        {/* Actions Row */}
                        <div className="ak-integration-actions">
                          <button
                            className="ak-btn-secondary"
                            type="button"
                            disabled={isBusy}
                            onClick={() => testConnection(provider.id)}
                            title={`Test live connectivity to ${provider.name}`}
                          >
                            {isBusy ? (
                              <>
                                <span className="ak-spinner-sm" aria-hidden="true" />
                                <span>Testing Gateway…</span>
                              </>
                            ) : (
                              <>
                                <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                                  <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                </svg>
                                <span>Test Connection</span>
                              </>
                            )}
                          </button>

                          <button
                            className="ak-btn-secondary"
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setEditingProvider(provider.id);
                              setApiKeys(prev => ({ ...prev, [provider.id]: '' }));
                              setConfirmDisconnect(null);
                            }}
                          >
                            <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                              <path d="M12 20h9" />
                              <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
                            </svg>
                            <span>Replace Key</span>
                          </button>

                          <button
                            className="ak-btn-secondary is-danger-text"
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDisconnect(provider.id)}
                          >
                            Disconnect
                          </button>
                        </div>
                      </>
                    )}

                    {/* Not Connected CTA */}
                    {!isConfigured && !isEditing && (
                      <div className="ak-integration-actions">
                        <button
                          className="ak-btn-primary"
                          type="button"
                          onClick={() => {
                            setEditingProvider(provider.id);
                            setConfirmDisconnect(null);
                          }}
                        >
                          <svg aria-hidden="true" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          <span>Connect {provider.name} API Key</span>
                        </button>
                      </div>
                    )}

                    {/* Form for Connecting or Replacing Key */}
                    {isEditing && (
                      <form
                        className="ak-integration-form"
                        onSubmit={(e) => connect(provider.id, e)}
                        autoComplete="off"
                      >
                        <label htmlFor={`api-key-${provider.id}`}>
                          {isConfigured ? `Replace ${provider.name} API Key` : `Enter ${provider.name} API Key`}
                        </label>
                        <input
                          id={`api-key-${provider.id}`}
                          className="ak-integration-input"
                          type="password"
                          autoComplete="new-password"
                          spellCheck="false"
                          placeholder={provider.placeholder}
                          value={inputKey}
                          onChange={(e) => handleKeyChange(provider.id, e.target.value)}
                          disabled={isBusy}
                          required
                        />

                        <p className="ak-integration-form-hint">
                          Your key is verified live against {provider.name}&apos;s API endpoint before being encrypted and saved.
                          It is never logged or exposed in client responses.
                        </p>

                        {provider.requiresTerms && (
                          <label className="ak-integration-terms">
                            <input
                              type="checkbox"
                              checked={Boolean(info.termsAcceptedAt) || Boolean(termsAccepted[provider.id])}
                              onChange={(e) => handleTermsChange(provider.id, e.target.checked)}
                              disabled={Boolean(info.termsAcceptedAt) || isBusy}
                              required
                            />
                            <span>
                              I have reviewed and agree to {provider.name}&apos;s{' '}
                              <a href={provider.termsUrl} target="_blank" rel="noreferrer">Terms of Service</a>
                              {' '}and{' '}
                              <a href={provider.privacyUrl} target="_blank" rel="noreferrer">Privacy Policy</a>.
                            </span>
                          </label>
                        )}

                        <div className="ak-integration-form-actions">
                          <button
                            className="ak-btn-primary"
                            type="submit"
                            disabled={isBusy || !inputKey.trim() || (provider.requiresTerms && !info.termsAcceptedAt && !termsAccepted[provider.id])}
                          >
                            {isBusy ? (
                              <>
                                <span className="ak-spinner-sm" aria-hidden="true" />
                                <span>Verifying & Connecting…</span>
                              </>
                            ) : (
                              'Save & Verify Connection'
                            )}
                          </button>
                          <button
                            className="ak-btn-secondary"
                            type="button"
                            disabled={isBusy}
                            onClick={() => {
                              setEditingProvider(null);
                              setApiKeys(prev => ({ ...prev, [provider.id]: '' }));
                              setTermsAccepted(prev => ({ ...prev, [provider.id]: false }));
                              setError('');
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {/* Confirm Disconnect Banner */}
                    {isDisconnecting && (
                      <div className="ak-integration-confirm" role="group" aria-label="Confirm disconnect">
                        <p>Are you sure you want to disconnect {provider.name}? Custom models from this provider will be removed from your catalog.</p>
                        <div className="ak-integration-confirm-btns">
                          <button
                            className="ak-btn-danger"
                            type="button"
                            disabled={isBusy}
                            onClick={() => disconnect(provider.id)}
                          >
                            {isBusy ? 'Disconnecting…' : 'Confirm Disconnect'}
                          </button>
                          <button
                            className="ak-btn-secondary"
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDisconnect(null)}
                          >
                            Keep Connected
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* ── Available Connectors & Gateway Extensions Showcase ── */}
          <section className="ak-catalog-section">
            <div className="ak-catalog-title-wrap">
              <h2>Unified Gateway Protocols & Standards</h2>
              <p>Direct routes and protocol extensions available through your iamhujju developer gateway.</p>
            </div>

            <div className="ak-catalog-grid">
              <div className="ak-catalog-card">
                <div className="ak-catalog-card-header">
                  <div className="ak-catalog-card-brand">
                    <span className="ak-catalog-card-icon">⚡</span>
                    <strong>OpenAI SDK Drop-in</strong>
                  </div>
                  <span className="ak-catalog-card-badge">ACTIVE VIA GATEWAY</span>
                </div>
                <p>Access GPT-4o, o1, and all connected provider models through standard OpenAI-compatible /v1/chat/completions endpoints.</p>
                <div className="ak-catalog-card-footer">Zero-config drop-in SDK support</div>
              </div>

              <div className="ak-catalog-card">
                <div className="ak-catalog-card-header">
                  <div className="ak-catalog-card-brand">
                    <span className="ak-catalog-card-icon">🧠</span>
                    <strong>Anthropic Claude Routing</strong>
                  </div>
                  <span className="ak-catalog-card-badge">ACTIVE VIA GATEWAY</span>
                </div>
                <p>Deploy Claude 3.5 Sonnet, Haiku, and Opus across connected providers with full token allowances and extended thinking.</p>
                <div className="ak-catalog-card-footer">200k high-context window</div>
              </div>

              <div className="ak-catalog-card">
                <div className="ak-catalog-card-header">
                  <div className="ak-catalog-card-brand">
                    <span className="ak-catalog-card-icon">✨</span>
                    <strong>Google Gemini Multimodal</strong>
                  </div>
                  <span className="ak-catalog-card-badge">ACTIVE VIA GATEWAY</span>
                </div>
                <p>Harness Gemini 2.0 Flash and 1.5 Pro multimodal reasoning with real-time web grounding and coding capabilities.</p>
                <div className="ak-catalog-card-footer">Native multimodal vision & audio</div>
              </div>

              <div className="ak-catalog-card">
                <div className="ak-catalog-card-header">
                  <div className="ak-catalog-card-brand">
                    <span className="ak-catalog-card-icon">🦙</span>
                    <strong>Ollama / Local AI</strong>
                  </div>
                  <span className="ak-catalog-card-badge is-coming">LOCAL BRIDGE</span>
                </div>
                <p>Connect your on-premise or local Ollama engine (http://localhost:11434) directly to the companion workspace.</p>
                <div className="ak-catalog-card-footer">100% Private local inference</div>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}
