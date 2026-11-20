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
  return Number.isNaN(date.getTime()) ? 'Not tested' : date.toLocaleString();
}

export default function IntegrationsPage({
  user,
  connected,
  modelCount,
  onLogout,
  onOpenHome,
  onOpenModels,
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
      setNotice(`OpenRouter connected. ${result.modelCount} models are available to this key.`);
      await onModelsChanged();
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
      setNotice(`Connection successful. ${result.modelCount} models are available.`);
      await onModelsChanged();
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
      setNotice('OpenRouter has been disconnected.');
      await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Could not disconnect OpenRouter.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="api-keys-page">
      <header className="api-keys-nav">
        <button className="api-keys-brand" type="button" onClick={onOpenHome}>
          <span className="api-keys-brand-mark" aria-hidden="true">i</span>
          <span>iamhujju</span>
        </button>
        <nav className="api-keys-nav-links" aria-label="Main navigation">
          <button type="button" onClick={onOpenHome}>Explore</button>
          <button type="button" onClick={() => onOpenModels()}>Models</button>
          <button type="button" onClick={onOpenChat}>Chat</button>
        </nav>
        <AccountMenu
          user={user}
          connected={connected}
          modelCount={modelCount}
          onLogout={onLogout}
          onOpenApiKeys={onOpenApiKeys}
          onOpenPricing={onOpenPricing}
          onOpenIntegrations={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
        />
      </header>

      <div className="api-keys-layout">
        <aside className="api-keys-sidebar" aria-label="Account settings">
          <span className="api-keys-sidebar-label">ACCOUNT</span>
          <button type="button" onClick={onOpenApiKeys}>
            <span aria-hidden="true">#</span>
            API Keys
          </button>
          <button type="button" className="is-current" aria-current="page">
            <span aria-hidden="true">+</span>
            Integrations
          </button>
          {onOpenPricing && (
            <button type="button" onClick={onOpenPricing}>
              <span aria-hidden="true">💳</span>
              Subscription & Plans
            </button>
          )}
          <p>Only verified, working connectors are listed.</p>
        </aside>

        <main className="api-keys-main">
          <section className="api-keys-card" aria-labelledby="integrations-title">
            <div className="api-keys-card-heading">
              <div>
                <p className="api-keys-eyebrow">PERSONAL WORKSPACE</p>
                <h1 id="integrations-title">Integrations</h1>
                <p className="api-keys-description">
                  Connect a provider account to discover and use its models in chat.
                </p>
              </div>
            </div>

            {error && <p className="api-keys-message is-error" role="alert">{error}</p>}
            {notice && <p className="api-keys-message is-success" role="status">{notice}</p>}

            {loading ? (
              <div className="api-keys-state" role="status">Loading integration status…</div>
            ) : (
              <article className="integration-card">
                <div className="integration-card-main">
                  <span className="integration-provider-mark" aria-hidden="true">O</span>
                  <div>
                    <div className="integration-provider-title">
                      <h2>OpenRouter</h2>
                      <span className={`integration-status${integration?.configured ? ' is-connected' : ''}`}>
                        <span />
                        {integration?.configured ? 'Connected' : 'Not connected'}
                      </span>
                    </div>
                    <p>
                      Model discovery and streaming chat through OpenRouter's official API.
                    </p>
                    <div className="integration-links">
                      <a href={DOCS_URL} target="_blank" rel="noreferrer">API documentation</a>
                      <a href={TERMS_URL} target="_blank" rel="noreferrer">Terms of Service</a>
                      <a href={PRIVACY_URL} target="_blank" rel="noreferrer">Privacy Policy</a>
                    </div>
                  </div>
                </div>

                {integration?.configured && (
                  <div className="integration-record-meta">
                    <span>Credential value hidden and encrypted on this server</span>
                    <span>Last tested: {testedLabel(integration.lastTestedAt)}</span>
                  </div>
                )}

                {!integration?.canConfigure && (
                  <p className="api-keys-message is-error" role="status">
                    The server administrator must configure API_KEY_ENCRYPTION_SECRET before provider keys can be stored.
                  </p>
                )}

                {!integration?.configured && !editing && (
                  <button
                    className="api-keys-primary"
                    type="button"
                    disabled={!integration?.canConfigure}
                    onClick={() => {
                      setEditing(true);
                      setError('');
                    }}
                  >
                    Connect OpenRouter
                  </button>
                )}

                {integration?.configured && (
                  <div className="integration-actions">
                    <button
                      className="api-keys-secondary"
                      type="button"
                      disabled={busy || !integration.canConfigure}
                      onClick={testConnection}
                    >
                      {busy ? 'Testing…' : 'Test connection'}
                    </button>
                    <button
                      className="api-keys-secondary"
                      type="button"
                      disabled={busy || !integration.canConfigure}
                      onClick={() => {
                        setEditing(value => !value);
                        setConfirmDisconnect(false);
                        setError('');
                      }}
                    >
                      {editing ? 'Cancel replace' : 'Replace key'}
                    </button>
                    <button
                      className="api-keys-danger"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setConfirmDisconnect(value => !value);
                        setEditing(false);
                        setError('');
                      }}
                    >
                      Disconnect
                    </button>
                  </div>
                )}

                {editing && integration?.canConfigure && (
                  <form className="api-key-form" onSubmit={connect}>
                    <label htmlFor="openrouter-api-key">
                      {integration.configured ? 'Replace OpenRouter API key' : 'OpenRouter API key'}
                    </label>
                    <input
                      id="openrouter-api-key"
                      type="password"
                      autoComplete="new-password"
                      spellCheck="false"
                      maxLength={4096}
                      value={apiKey}
                      onChange={event => setApiKey(event.target.value)}
                      placeholder="Paste your OpenRouter API key"
                      required
                    />
                    <p>
                      The key is tested against your account's accessible-model catalog before being saved.
                      It is encrypted at rest and never returned to this browser.
                    </p>
                    {!integration?.termsAcceptedAt && (
                      <label className="integration-terms">
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
                          I will also review the selected model provider's terms and data practices.
                        </span>
                      </label>
                    )}
                    <div className="api-key-form-actions">
                      <button className="api-keys-primary" type="submit" disabled={busy}>
                        {busy ? 'Testing and connecting…' : 'Save and test'}
                      </button>
                      <button
                        className="api-keys-secondary"
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

                {confirmDisconnect && (
                  <div className="api-key-confirm" role="group" aria-label="Confirm disconnect">
                    <p>Disconnect OpenRouter? Its models will be removed from this account's model list.</p>
                    <button className="api-keys-danger" type="button" disabled={busy} onClick={disconnect}>
                      {busy ? 'Disconnecting…' : 'Confirm disconnect'}
                    </button>
                    <button
                      className="api-keys-secondary"
                      type="button"
                      disabled={busy}
                      onClick={() => setConfirmDisconnect(false)}
                    >
                      Keep connected
                    </button>
                  </div>
                )}
              </article>
            )}

            <p className="integration-terms-note">
              OpenRouter is the only connector implemented in this step. Other providers are intentionally not shown
              until their official APIs, account terms, and end-to-end flows are verified.
            </p>
          </section>
        </main>
      </div>
    </div>
  );
}
