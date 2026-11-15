import { useEffect, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import './ApiKeysPage.css';

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

export default function ApiKeysPage({
  user,
  connected,
  modelCount,
  onLogout,
  onOpenHome,
  onOpenModels,
  onOpenChat,
  onOpenIntegrations,
  onModelsChanged
}) {
  const [status, setStatus] = useState(null);
  const [keyInput, setKeyInput] = useState('');
  const [editing, setEditing] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  async function loadStatus(signal) {
    try {
      const response = await fetch('/api/account/api-key', {
        signal,
        cache: 'no-store'
      });
      setStatus(await readResponse(response, 'Could not load API key status'));
    } catch (requestError) {
      if (requestError.name !== 'AbortError') {
        setError(requestError.message || 'Could not load API key status.');
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => loadStatus(controller.signal), 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, []);

  async function saveAndTest(event) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/account/api-key', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ apiKey: keyInput })
      });
      const result = await readResponse(response, 'Could not save API key');
      setStatus(previous => ({ ...previous, ...result, configured: true }));
      setKeyInput('');
      setEditing(false);
      setNotice(`Key verified. ${result.modelCount} models are available to this account.`);
      await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Could not save and verify API key.');
    } finally {
      setBusy(false);
      setKeyInput('');
    }
  }

  async function testSavedKey() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/account/api-key/test', { method: 'POST' });
      const result = await readResponse(response, 'Could not test API key');
      setStatus(previous => ({ ...previous, ...result, configured: true }));
      setNotice(`Connection successful. ${result.modelCount} models are available.`);
      await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Could not test API key.');
    } finally {
      setBusy(false);
    }
  }

  async function revokeKey() {
    if (busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/account/api-key', { method: 'DELETE' });
      if (!response.ok) {
        throw new Error(await response.text() || `Could not revoke API key (HTTP ${response.status}).`);
      }
      setStatus(previous => ({
        ...previous,
        configured: false,
        updatedAt: null,
        lastTestedAt: null
      }));
      setKeyInput('');
      setEditing(false);
      setConfirmRevoke(false);
      setNotice('The account API key has been revoked.');
      await onModelsChanged();
    } catch (requestError) {
      setError(requestError.message || 'Could not revoke API key.');
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
          onOpenApiKeys={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          onOpenIntegrations={onOpenIntegrations}
        />
      </header>

      <div className="api-keys-layout">
        <aside className="api-keys-sidebar" aria-label="Account settings">
          <span className="api-keys-sidebar-label">ACCOUNT</span>
          <button type="button" className="is-current" aria-current="page">
            <span aria-hidden="true">#</span>
            API Keys
          </button>
          <button type="button" onClick={onOpenIntegrations}>
            <span aria-hidden="true">+</span>
            Integrations
          </button>
          <p>Gateway credentials are managed per account.</p>
        </aside>

        <main className="api-keys-main">
          <section className="api-keys-card" aria-labelledby="api-keys-title">
            <div className="api-keys-card-heading">
              <div>
                <p className="api-keys-eyebrow">PERSONAL WORKSPACE</p>
                <h1 id="api-keys-title">API Keys</h1>
                <p className="api-keys-description">
                  Connect your FreeLLMAPI account to use its gateway with this workspace.
                </p>
              </div>
            </div>

            {error && <p className="api-keys-message is-error" role="alert">{error}</p>}
            {notice && <p className="api-keys-message is-success" role="status">{notice}</p>}

            {loading ? (
              <div className="api-keys-state" role="status">Loading API key status…</div>
            ) : status?.configured ? (
              <div className="api-key-record">
                <div className="api-key-record-main">
                  <span className="api-key-record-icon" aria-hidden="true">K</span>
                  <div>
                    <strong>FreeLLMAPI account key</strong>
                    <span className="api-key-record-detail">
                      Secret value hidden · encrypted on this server
                    </span>
                  </div>
                </div>
                <span className="api-key-status">
                  <span />
                  Configured
                </span>
                <span className="api-key-tested">
                  Last tested: {testedLabel(status.lastTestedAt)}
                </span>
                <div className="api-key-actions">
                  <button
                    type="button"
                    className="api-keys-secondary"
                    disabled={busy || !status.canConfigure}
                    onClick={testSavedKey}
                  >
                    {busy ? 'Checking…' : 'Test key'}
                  </button>
                  <button
                    type="button"
                    className="api-keys-secondary"
                    disabled={busy || !status.canConfigure}
                    onClick={() => {
                      setEditing(value => !value);
                      setConfirmRevoke(false);
                      setError('');
                    }}
                  >
                    {editing ? 'Cancel replace' : 'Replace'}
                  </button>
                  <button
                    type="button"
                    className="api-keys-danger"
                    disabled={busy}
                    onClick={() => {
                      setConfirmRevoke(value => !value);
                      setEditing(false);
                      setError('');
                    }}
                  >
                    Revoke
                  </button>
                </div>
              </div>
            ) : (
              <div className="api-keys-empty">
                <span className="api-keys-empty-mark" aria-hidden="true">+</span>
                <div>
                  <strong>No account API key added</strong>
                  <p>
                    Add a FreeLLMAPI key to route this account's requests through your own provider quota.
                  </p>
                  {status?.usingServerKey && (
                    <p className="api-keys-server-key">
                      Requests currently use the server-configured gateway key.
                    </p>
                  )}
                  {!status?.canConfigure && (
                    <p className="api-keys-server-key">
                      The server administrator must configure API_KEY_ENCRYPTION_SECRET before keys can be stored.
                    </p>
                  )}
                  <button
                    type="button"
                    className="api-keys-primary"
                    disabled={!status?.canConfigure}
                    onClick={() => {
                      setEditing(true);
                      setError('');
                    }}
                  >
                    Add API Key
                  </button>
                </div>
              </div>
            )}

            {editing && status?.canConfigure && (
              <form className="api-key-form" onSubmit={saveAndTest}>
                <label htmlFor="account-api-key">
                  {status.configured ? 'Replace with a new FreeLLMAPI key' : 'FreeLLMAPI key'}
                </label>
                <input
                  id="account-api-key"
                  type="password"
                  autoComplete="new-password"
                  spellCheck="false"
                  maxLength={4096}
                  value={keyInput}
                  onChange={event => setKeyInput(event.target.value)}
                  placeholder="Paste your gateway API key"
                  required
                />
                <p>
                  The key is tested before it is saved, encrypted at rest, and never returned to the browser.
                </p>
                <div className="api-key-form-actions">
                  <button className="api-keys-primary" type="submit" disabled={busy}>
                    {busy ? 'Testing and saving…' : 'Save and test'}
                  </button>
                  <button
                    className="api-keys-secondary"
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setEditing(false);
                      setKeyInput('');
                      setError('');
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {confirmRevoke && (
              <div className="api-key-confirm" role="group" aria-label="Confirm API key revocation">
                <p>Revoke this account's saved gateway key? Requests will fall back to the server key if one is configured.</p>
                <button className="api-keys-danger" type="button" disabled={busy} onClick={revokeKey}>
                  {busy ? 'Revoking…' : 'Confirm revoke'}
                </button>
                <button
                  className="api-keys-secondary"
                  type="button"
                  disabled={busy}
                  onClick={() => setConfirmRevoke(false)}
                >
                  Keep key
                </button>
              </div>
            )}

            {!loading && status && !status.canConfigure && status.configured && (
              <p className="api-keys-message is-error" role="status">
                API key encryption is unavailable. Restore the server's original encryption secret to use or revoke this key.
              </p>
            )}
          </section>
          <p className="api-keys-footnote">
            Provider rate limits, key expiration, and integrations are not available in the current FreeLLMAPI contract.
          </p>
        </main>
      </div>
    </div>
  );
}
