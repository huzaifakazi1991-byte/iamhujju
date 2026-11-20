import { useEffect, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import './ApiKeysPage.css';

const TERMS_URL = 'https://openrouter.ai/terms';
const PRIVACY_URL = 'https://openrouter.ai/privacy';
const DOCS_URL = 'https://openrouter.ai/docs/api-reference/overview';

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
  const [integration, setIntegration] = useState(null);
  const [apiKey, setApiKey] = useState('');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadIntegration(signal) {
    try {
      const response = await fetch('/api/account/integrations/openrouter', {
        signal,
        cache: 'no-store'
      });
      setIntegration(await readResponse(response, 'Could not load integration status'));
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || 'Could not load integration status.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => loadIntegration(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  async function connect(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/account/integrations/openrouter', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          apiKey,
          termsAccepted: Boolean(integration?.termsAcceptedAt) || termsAccepted
        })
      });
      const result = await readResponse(response, 'Could not connect OpenRouter');
      setIntegration(previous => ({ ...previous, ...result, configured: true }));
      setApiKey('');
      setEditing(false);
      setTermsAccepted(false);
      setNotice(`OpenRouter connected successfully. ${result.modelCount} models are now unlocked and available in your workspace.`);
      if (typeof onModelsChanged === 'function') await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Could not connect OpenRouter.');
    } finally {
      setBusy(false);
      setApiKey('');
    }
  }

  async function testConnection() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/account/integrations/openrouter/test', {
        method: 'POST'
      });
      const result = await readResponse(response, 'Could not test OpenRouter');
      setIntegration(previous => ({ ...previous, ...result, configured: true }));
      setNotice(`Connection verified. Gateway is responsive with ${result.modelCount} models accessible.`);
      if (typeof onModelsChanged === 'function') await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Could not test OpenRouter.');
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/account/integrations/openrouter', {
        method: 'DELETE'
      });
      if (!response.ok) {
        throw new Error(await response.text() || `Could not disconnect OpenRouter (HTTP ${response.status}).`);
      }
      setIntegration(previous => ({
        ...previous,
        configured: false,
        lastTestedAt: null,
        updatedAt: null,
        termsAcceptedAt: null
      }));
      setConfirmDisconnect(false);
      setNotice('OpenRouter credentials disconnected. Default community models remain active.');
      if (typeof onModelsChanged === 'function') await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Could not disconnect OpenRouter.');
    } finally {
      setBusy(false);
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
          {onOpenSavedChats && (
            <button type="button" onClick={onOpenSavedChats}>
              <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Saved Chats</span>
            </button>
          )}

          <div className="ak-sidebar-divider" />

          <span className="ak-sidebar-label">WORKSPACE</span>
          <button type="button" onClick={onOpenChat}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
            <span>Companion Chat</span>
          </button>
          <button type="button" onClick={() => onOpenModels && onOpenModels()}>
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="7" height="7" rx="1.5" />
              <rect x="14" y="3" width="7" height="7" rx="1.5" />
              <rect x="3" y="14" width="7" height="7" rx="1.5" />
              <rect x="14" y="14" width="7" height="7" rx="1.5" />
            </svg>
            <span>Explore Models</span>
          </button>

          <p className="ak-sidebar-note">
            Provider credentials are encrypted at rest with AES-256 and never returned to client applications.
          </p>
        </aside>

        {/* Main Content */}
        <main className="ak-main">
          {/* Page Header */}
          <header className="ak-page-header">
            <div className="ak-page-title-group">
              <div className="ak-card-title-wrap" style={{ marginBottom: 6 }}>
                <span className="ak-sidebar-label" style={{ margin: 0 }}>MODEL CONNECTORS</span>
                {integration?.configured && (
                  <span className="ak-count-pill" style={{ color: '#00e599', background: 'rgba(0, 229, 153, 0.12)' }}>
                    ACTIVE
                  </span>
                )}
              </div>
              <h1>Integrations & Connectors</h1>
              <p className="ak-page-subtitle">
                Connect your external provider keys to discover 400+ frontier AI models, stream completions in real-time, and route requests via the unified gateway.
              </p>
            </div>
          </header>

          {/* Feedback Alerts */}
          {error && (
            <div className="ak-msg ak-msg--error" role="alert">
              <span aria-hidden="true">⚠️</span>
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="ak-msg ak-msg--success" role="status">
              <span aria-hidden="true">✓</span>
              <span>{notice}</span>
            </div>
          )}

          {/* Integration Body */}
          {loading ? (
            <div className="ak-card">
              <div className="ak-state-box">
                <div className="ak-spinner" aria-hidden="true" />
                <span>Loading integration status…</span>
              </div>
            </div>
          ) : (
            <div className={`ak-integration-card${integration?.configured ? ' is-active' : ''}`}>
              <div className="ak-integration-header">
                <div className="ak-integration-logo-ring">
                  <svg className="ak-integration-logo-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <circle cx="12" cy="12" r="4" />
                    <line x1="4.93" y1="4.93" x2="9.17" y2="9.17" />
                    <line x1="14.83" y1="14.83" x2="19.07" y2="19.07" />
                    <line x1="14.83" y1="9.17" x2="19.07" y2="4.93" />
                    <line x1="4.93" y1="19.07" x2="9.17" y2="14.83" />
                  </svg>
                </div>

                <div className="ak-integration-title-group">
                  <div className="ak-integration-title-row">
                    <h2>OpenRouter</h2>
                    <span className={`ak-badge ${integration?.configured ? 'ak-badge--active' : 'ak-badge--revoked'}`}>
                      <span className="ak-badge-dot" aria-hidden="true" />
                      <span>{integration?.configured ? 'CONNECTED & ACTIVE' : 'NOT CONNECTED'}</span>
                    </span>
                  </div>

                  <p className="ak-integration-desc">
                    Unified model gateway providing high-speed streaming access to 400+ leading open-source and proprietary models (Claude 3.5, GPT-4o, DeepSeek-R1, Llama 3.3, Gemini 2.0).
                  </p>

                  <div className="ak-integration-links">
                    <a href={DOCS_URL} target="_blank" rel="noreferrer">
                      API Documentation ↗
                    </a>
                    <a href={TERMS_URL} target="_blank" rel="noreferrer">
                      Terms of Service ↗
                    </a>
                    <a href={PRIVACY_URL} target="_blank" rel="noreferrer">
                      Privacy Policy ↗
                    </a>
                  </div>
                </div>
              </div>

              {/* Security & Metadata Grid */}
              <div className="ak-integration-meta">
                <div className="ak-meta-item">
                  <span className="ak-meta-label">Storage & Encryption</span>
                  <span className="ak-meta-value highlight-green">AES-256 Encrypted on Server</span>
                </div>
                <div className="ak-meta-item">
                  <span className="ak-meta-label">Available Models</span>
                  <span className="ak-meta-value">
                    {integration?.configured ? `${integration.modelCount || 400}+ Models Accessible` : 'Community tier active'}
                  </span>
                </div>
                <div className="ak-meta-item">
                  <span className="ak-meta-label">Last Tested</span>
                  <span className="ak-meta-value">{testedLabel(integration?.lastTestedAt)}</span>
                </div>
              </div>

              {/* Server Admin Notice */}
              {!integration?.canConfigure && (
                <div className="ak-msg ak-msg--error" role="status">
                  <span aria-hidden="true">🔒</span>
                  <span>Server Notice: API_KEY_ENCRYPTION_SECRET is not configured on this host. Provider keys cannot be saved until this secret is configured.</span>
                </div>
              )}

              {/* Unconnected State Button */}
              {!integration?.configured && !editing && (
                <div className="ak-integration-actions">
                  <button
                    className="ak-btn-primary"
                    type="button"
                    disabled={!integration?.canConfigure}
                    onClick={() => {
                      setEditing(true);
                      setError('');
                    }}
                  >
                    Connect OpenRouter API Key
                  </button>
                </div>
              )}

              {/* Connected State Actions */}
              {integration?.configured && !editing && !confirmDisconnect && (
                <div className="ak-integration-actions">
                  <button
                    className="ak-btn-test"
                    type="button"
                    disabled={busy || !integration?.canConfigure}
                    onClick={testConnection}
                  >
                    {busy ? (
                      <>
                        <span className="ak-spinner-sm" aria-hidden="true" />
                        <span>Testing Gateway…</span>
                      </>
                    ) : (
                      <>
                        <span aria-hidden="true">⚡</span>
                        <span>Test Connection</span>
                      </>
                    )}
                  </button>
                  <button
                    className="ak-btn-secondary"
                    type="button"
                    disabled={busy || !integration?.canConfigure}
                    onClick={() => {
                      setEditing(true);
                      setConfirmDisconnect(false);
                      setError('');
                    }}
                  >
                    Replace API Key
                  </button>
                  <button
                    className="ak-btn-danger"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setConfirmDisconnect(true);
                      setEditing(false);
                      setError('');
                    }}
                  >
                    Disconnect
                  </button>
                </div>
              )}

              {/* Edit / Connect Form */}
              {editing && integration?.canConfigure && (
                <form className="ak-integration-form" onSubmit={connect}>
                  <label htmlFor="openrouter-api-key">
                    {integration.configured ? 'Replace OpenRouter API Key' : 'Enter OpenRouter API Key'}
                  </label>
                  <input
                    id="openrouter-api-key"
                    className="ak-integration-input"
                    type="password"
                    autoComplete="new-password"
                    spellCheck="false"
                    maxLength={4096}
                    value={apiKey}
                    onChange={event => setApiKey(event.target.value)}
                    placeholder="sk-or-v1-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    required
                  />
                  <p className="ak-integration-form-hint">
                    Your key is tested against OpenRouter's live API catalog before being encrypted and saved. It is never logged or exposed in client responses.
                  </p>

                  {!integration?.termsAcceptedAt && (
                    <label className="ak-integration-terms">
                      <input
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={event => setTermsAccepted(event.target.checked)}
                        required
                      />
                      <span>
                        I have reviewed and agree to OpenRouter's{' '}
                        <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms of Service</a>
                        {' '}and{' '}
                        <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>.
                      </span>
                    </label>
                  )}

                  <div className="ak-integration-form-actions">
                    <button className="ak-btn-primary" type="submit" disabled={busy}>
                      {busy ? (
                        <>
                          <span className="ak-spinner-sm" aria-hidden="true" />
                          <span>Testing & Connecting…</span>
                        </>
                      ) : (
                        'Save & Verify Connection'
                      )}
                    </button>
                    <button
                      className="ak-btn-secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(false);
                        setApiKey('');
                        setTermsAccepted(false);
                        setError('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              )}

              {/* Confirm Disconnect Banner */}
              {confirmDisconnect && (
                <div className="ak-integration-confirm" role="group" aria-label="Confirm disconnect">
                  <p>Are you sure you want to disconnect OpenRouter? Custom provider models will be removed from your model catalog.</p>
                  <div className="ak-integration-confirm-btns">
                    <button className="ak-btn-danger" type="button" disabled={busy} onClick={disconnect}>
                      {busy ? 'Disconnecting…' : 'Confirm Disconnect'}
                    </button>
                    <button
                      className="ak-btn-secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Keep Connected
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Available Connectors & Gateway Extensions Showcase ── */}
          <section className="ak-catalog-section">
            <div className="ak-catalog-title-wrap">
              <h2>Available Connectors & Supported Gateways</h2>
              <p>Direct routes and protocol extensions available through your iamhujju developer gateway.</p>
            </div>

            <div className="ak-catalog-grid">
              <div className="ak-catalog-card">
                <div className="ak-catalog-card-header">
                  <div className="ak-catalog-card-brand">
                    <span className="ak-catalog-card-icon">⚡</span>
                    <strong>OpenAI Direct</strong>
                  </div>
                  <span className="ak-catalog-card-badge">ACTIVE VIA GATEWAY</span>
                </div>
                <p>Access GPT-4o, o1-preview, and o3-mini models via OpenAI compatible /v1/chat/completions endpoints.</p>
                <div className="ak-catalog-card-footer">Zero-config drop-in SDK support</div>
              </div>

              <div className="ak-catalog-card">
                <div className="ak-catalog-card-header">
                  <div className="ak-catalog-card-brand">
                    <span className="ak-catalog-card-icon">🧠</span>
                    <strong>Anthropic Claude</strong>
                  </div>
                  <span className="ak-catalog-card-badge">ACTIVE VIA GATEWAY</span>
                </div>
                <p>Deploy Claude 3.5 Sonnet, Claude 3.5 Haiku, and Claude 3 Opus with reasoning tokens and tool calling.</p>
                <div className="ak-catalog-card-footer">High context 200k tokens</div>
              </div>

              <div className="ak-catalog-card">
                <div className="ak-catalog-card-header">
                  <div className="ak-catalog-card-brand">
                    <span className="ak-catalog-card-icon">✨</span>
                    <strong>Google Gemini</strong>
                  </div>
                  <span className="ak-catalog-card-badge">ACTIVE VIA GATEWAY</span>
                </div>
                <p>Harness Gemini 2.0 Flash, Gemini 1.5 Pro multimodal reasoning with real-time web grounding and coding.</p>
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
