import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import './ApiKeysPage.css';

/* ─── helpers ──────────────────────────────────────────────────────── */

async function readResponse(response, fallback) {
  let result;
  try {
    result = await response.json();
  } catch {
    if (!response.ok) throw new Error(`${fallback} (HTTP ${response.status}).`);
    throw new Error('The server returned an invalid response.');
  }
  if (!response.ok) {
    throw new Error(result?.error?.message || `${fallback} (HTTP ${response.status}).`);
  }
  return result;
}

function formatDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  return Number.isNaN(d.getTime())
    ? '—'
    : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatLastUsed(value) {
  if (!value) return 'Never';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return 'Never';
  const diff = Date.now() - d.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(value);
}

/* ─── Code Snippets Generator ───────────────────────────────────────── */
function buildSnippets(apiKey, model = 'openrouter/free') {
  const displayKey = apiKey || 'sk-hujju-your-api-key';
  return {
    curl: `curl https://iamhujju.com/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -H "Authorization: Bearer ${displayKey}" \\
  -d '{
    "model": "${model}",
    "messages": [
      { "role": "user", "content": "Hello from external developer tool!" }
    ]
  }'`,
    python: `from openai import OpenAI

# Drop-in replacement for OpenAI SDK
client = OpenAI(
    api_key="${displayKey}",
    base_url="https://iamhujju.com/v1"
)

response = client.chat.completions.create(
    model="${model}",
    messages=[
        {"role": "user", "content": "Hello from external developer tool!"}
    ]
)
print(response.choices[0].message.content)`,
    node: `import OpenAI from 'openai';

// Drop-in replacement for OpenAI SDK
const openai = new OpenAI({
  apiKey: '${displayKey}',
  baseURL: 'https://iamhujju.com/v1',
});

const response = await openai.chat.completions.create({
  model: '${model}',
  messages: [{ role: 'user', content: 'Hello from external developer tool!' }],
});
console.log(response.choices[0].message.content);`,
  };
}

/* ─── Copy Button Component ─────────────────────────────────────────── */
function CopyButton({ text, label = 'Copy', successLabel = 'Copied ✓', className = '' }) {
  const [copied, setCopied] = useState(false);
  const timerRef = useRef(null);

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      /* fallback or ignored */
    }
  }

  return (
    <button
      type="button"
      className={`ak-copy-btn${className ? ` ${className}` : ''}${copied ? ' is-copied' : ''}`}
      onClick={handleCopy}
      title={copied ? 'Copied to clipboard' : 'Copy to clipboard'}
    >
      {copied ? (
        <>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M3 8.5l3.5 3.5L13 4.5" />
          </svg>
          <span>{successLabel}</span>
        </>
      ) : (
        <>
          <svg aria-hidden="true" viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.7">
            <rect x="5" y="5" width="8" height="8" rx="1.5" />
            <path d="M3 11V3.5A1.5 1.5 0 014.5 2H11" />
          </svg>
          <span>{label}</span>
        </>
      )}
    </button>
  );
}

/* ─── Create / Reveal Key Modal ─────────────────────────────────────── */
function KeyModal({
  mode = 'create', // 'create' | 'reveal'
  keyName,
  setKeyName,
  rawKey,
  busy,
  error,
  onSubmitCreate,
  onDone,
  onClose,
}) {
  return (
    <div
      className="ak-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ak-modal-title"
      onClick={e => {
        if (e.target === e.currentTarget && mode === 'create') onClose();
      }}
    >
      <div className="ak-modal">
        {mode === 'create' ? (
          <>
            <div className="ak-modal-header">
              <div className="ak-modal-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 5v14M5 12h14" />
                </svg>
              </div>
              <div>
                <h2 id="ak-modal-title">Create New API Key</h2>
                <p>Provide a descriptive name to manage external client access.</p>
              </div>
              <button
                type="button"
                className="ak-modal-close"
                aria-label="Close"
                onClick={onClose}
              >
                ✕
              </button>
            </div>

            {error && <p className="ak-msg ak-msg--error" role="alert">{error}</p>}

            <form onSubmit={onSubmitCreate}>
              <label className="ak-form-label" htmlFor="ak-create-key-name">
                Key Name
              </label>
              <input
                id="ak-create-key-name"
                className="ak-form-input"
                type="text"
                placeholder='e.g. "Cursor IDE", "Cline", "Production App"'
                value={keyName}
                onChange={e => setKeyName(e.target.value)}
                maxLength={80}
                required
                autoFocus
              />
              <p className="ak-form-hint">
                Identify which tool or service will authenticate using this secret.
              </p>

              <div className="ak-modal-actions">
                <button
                  type="submit"
                  className="ak-btn-primary"
                  disabled={busy || !keyName.trim()}
                >
                  {busy ? 'Generating key…' : 'Create Secret Key'}
                </button>
                <button
                  type="button"
                  className="ak-btn-ghost"
                  onClick={onClose}
                  disabled={busy}
                >
                  Cancel
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <div className="ak-modal-header">
              <div className="ak-modal-icon ak-modal-icon--reveal" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="7.5" cy="15.5" r="4.5" />
                  <path d="M10.8 12.2L18.5 4.5M17 6l2 2M15 8l2 2" />
                </svg>
              </div>
              <div>
                <h2 id="ak-modal-title">Save Your Secret Key</h2>
                <p className="ak-modal-keyname">Key: <strong>{keyName}</strong></p>
              </div>
            </div>

            {/* Prominent amber security notice */}
            <div className="ak-security-notice" role="alert">
              <span className="ak-security-icon" aria-hidden="true">⚠️</span>
              <div>
                <strong>Save this secret key now.</strong> For your security, you will not be able to view the full key again.
              </div>
            </div>

            <div className="ak-modal-key-display">
              <code className="ak-raw-key-text">{rawKey}</code>
              <CopyButton
                text={rawKey}
                label="Copy Key"
                successLabel="Copied ✓"
                className="ak-modal-copy-btn"
              />
            </div>

            <div className="ak-modal-actions ak-modal-actions--single">
              <button
                type="button"
                className="ak-btn-primary ak-btn-block"
                onClick={onDone}
              >
                Done
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Live Quick-Connect / Test Drawer ──────────────────────────────── */
function ConnectDrawer({ activeKeys, rawKeyMap, defaultModel = 'openrouter/free' }) {
  const [tab, setTab] = useState('curl'); // 'curl' | 'python' | 'node'
  const [selectedKeyId, setSelectedKeyId] = useState('');
  const [manualKeyInput, setManualKeyInput] = useState('');
  const [modelInput, setModelInput] = useState(defaultModel);
  const [testState, setTestState] = useState(null); // null | 'loading' | { ok, status, latency, text }

  // Sync selectedKeyId when activeKeys change
  useEffect(() => {
    if (activeKeys.length > 0 && (!selectedKeyId || !activeKeys.some(k => k.id === selectedKeyId))) {
      setSelectedKeyId(activeKeys[0].id);
    }
  }, [activeKeys, selectedKeyId]);

  const selectedKey = useMemo(() => {
    return activeKeys.find(k => k.id === selectedKeyId) || activeKeys[0] || null;
  }, [activeKeys, selectedKeyId]);

  // Determine effective raw key (either stored in memory/session from recent creation, or manually provided, or masked placeholder)
  const currentRawKey = useMemo(() => {
    if (manualKeyInput.trim()) return manualKeyInput.trim();
    if (selectedKey && rawKeyMap[selectedKey.id]) return rawKeyMap[selectedKey.id];
    return null;
  }, [selectedKey, rawKeyMap, manualKeyInput]);

  const displaySnippetKey = currentRawKey || (selectedKey?.prefix ? `${selectedKey.prefix.replace('••••', '...')}` : 'sk-hujju-your-key-here');
  const snippets = useMemo(() => {
    return buildSnippets(displaySnippetKey, modelInput || 'openrouter/free');
  }, [displaySnippetKey, modelInput]);

  async function handleTestConnection() {
    setTestState('loading');
    const start = Date.now();
    const authKey = currentRawKey || (selectedKey?.prefix || 'sk-hujju-test');

    try {
      const res = await fetch('/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${authKey}`,
        },
        body: JSON.stringify({
          model: modelInput || 'openrouter/free',
          messages: [{ role: 'user', content: 'Say "OK" in one word.' }],
          max_tokens: 16,
        }),
      });

      const latency = Date.now() - start;
      const data = await res.json().catch(() => ({}));

      let reply = '';
      if (data?.choices?.[0]?.message?.content) {
        reply = data.choices[0].message.content.trim();
      } else if (data?.error?.message) {
        reply = `Error: ${data.error.message}`;
      } else if (!res.ok) {
        reply = `Server returned HTTP ${res.status}`;
      } else {
        reply = '(Success: 200 OK received)';
      }

      setTestState({
        ok: res.ok,
        status: res.status,
        latency,
        text: reply,
      });
    } catch (err) {
      setTestState({
        ok: false,
        status: 0,
        latency: Date.now() - start,
        text: err.message || 'Network connection failed.',
      });
    }
  }

  return (
    <section className="ak-drawer" aria-labelledby="ak-drawer-title">
      <div className="ak-drawer-top">
        <div className="ak-drawer-headings">
          <div className="ak-drawer-badge">QUICK CONNECT</div>
          <h2 id="ak-drawer-title">Connect Your App</h2>
          <p className="ak-drawer-desc">
            Drop-in replacement for OpenAI endpoints. Use with Cursor IDE, Cline, Continue, LiteLLM, or custom code.
          </p>
        </div>

        {/* Live Test Action */}
        <div className="ak-drawer-actions">
          <button
            type="button"
            className="ak-btn-test"
            onClick={handleTestConnection}
            disabled={testState === 'loading'}
          >
            {testState === 'loading' ? (
              <>
                <span className="ak-spinner-sm" aria-hidden="true" />
                <span>Pinging gateway…</span>
              </>
            ) : (
              <>
                <span aria-hidden="true">⚡</span>
                <span>Test Connection</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Live SLA & Failover Status Ribbon */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        padding: '12px 18px',
        background: 'rgba(0, 229, 153, 0.04)',
        border: '1px solid rgba(0, 229, 153, 0.18)',
        borderRadius: '12px',
        margin: '16px 0 20px',
        fontSize: '12px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#00e599', boxShadow: '0 0 10px #00e599' }} />
          <span style={{ color: '#ffffff', fontWeight: 600 }}>Gateway Engine: Operational</span>
          <span style={{ color: '#8b949e' }}>(99.99% Availability SLA)</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span className="ak-tag-ready" style={{ fontSize: '10px', padding: '3px 8px' }}>
            Multi-Key Pool Active
          </span>
          <span style={{ color: '#8b949e', fontSize: '11px' }}>Zero-Downtime Rate-Limit Shield</span>
        </div>
      </div>

      {/* Connection Parameters Ribbon */}
      <div className="ak-conn-params">
        <div className="ak-param-item">
          <span className="ak-param-label">Base URL</span>
          <div className="ak-param-value-wrap">
            <code className="ak-param-code">https://iamhujju.com/v1</code>
            <CopyButton text="https://iamhujju.com/v1" label="Copy" className="ak-param-copy" />
          </div>
        </div>

        <div className="ak-param-item">
          <span className="ak-param-label">Active Key</span>
          {activeKeys.length > 0 ? (
            <div className="ak-key-selector-wrap">
              <select
                className="ak-key-select"
                value={selectedKeyId}
                onChange={e => setSelectedKeyId(e.target.value)}
                aria-label="Select active key"
              >
                {activeKeys.map(k => (
                  <option key={k.id} value={k.id}>
                    {k.name} ({k.prefix})
                  </option>
                ))}
              </select>
              {currentRawKey && (
                <span className="ak-tag-ready" title="Full secret key is loaded in memory for testing">
                  Full Key Ready ✓
                </span>
              )}
            </div>
          ) : (
            <span className="ak-no-key-hint">No active key found. Create one above.</span>
          )}
        </div>

        <div className="ak-param-item">
          <span className="ak-param-label">Model</span>
          <input
            type="text"
            className="ak-model-input"
            value={modelInput}
            onChange={e => setModelInput(e.target.value)}
            placeholder="openrouter/free or auto"
            title="Target model id"
          />
        </div>
      </div>

      {/* If full key is not in memory, offer optional prompt to test with full key */}
      {!currentRawKey && activeKeys.length > 0 && (
        <div className="ak-key-hint-bar">
          <span className="ak-hint-icon" aria-hidden="true">💡</span>
          <span className="ak-hint-text">
            For security, full secret keys are not stored on the server. If testing fails with 401, enter your saved key:
          </span>
          <input
            type="password"
            className="ak-test-key-input"
            placeholder="sk-hujju-..."
            value={manualKeyInput}
            onChange={e => setManualKeyInput(e.target.value)}
            autoComplete="off"
          />
        </div>
      )}

      {/* Live test response display inline */}
      {testState && testState !== 'loading' && (
        <div
          className={`ak-test-result${testState.ok ? ' is-ok' : ' is-err'}`}
          role="status"
          aria-live="polite"
        >
          <div className="ak-test-result-header">
            <span className={`ak-test-badge${testState.ok ? ' is-ok' : ' is-err'}`}>
              {testState.ok ? 'HTTP 200 OK' : `HTTP ${testState.status || 'ERR'}`}
            </span>
            <span className="ak-test-latency">{testState.latency} ms</span>
            <span className="ak-test-status-text">
              {testState.ok ? 'Connection established & verified' : 'Gateway returned error'}
            </span>
          </div>
          <div className="ak-test-response-body">
            <code>{testState.text}</code>
          </div>
        </div>
      )}

      {/* Code Snippet Tabs */}
      <div className="ak-tabs" role="tablist">
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'curl'}
          className={`ak-tab${tab === 'curl' ? ' is-active' : ''}`}
          onClick={() => setTab('curl')}
        >
          cURL
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'python'}
          className={`ak-tab${tab === 'python' ? ' is-active' : ''}`}
          onClick={() => setTab('python')}
        >
          Python (OpenAI SDK)
        </button>
        <button
          role="tab"
          type="button"
          aria-selected={tab === 'node'}
          className={`ak-tab${tab === 'node' ? ' is-active' : ''}`}
          onClick={() => setTab('node')}
        >
          Node.js (OpenAI SDK)
        </button>
      </div>

      <div className="ak-snippet-container" role="tabpanel">
        <CopyButton
          text={snippets[tab]}
          label="Copy snippet"
          successLabel="Copied ✓"
          className="ak-snippet-copy-btn"
        />
        <pre className="ak-snippet-pre">
          <code>{snippets[tab]}</code>
        </pre>
      </div>
    </section>
  );
}

/* ─── Main ApiKeysPage Component ────────────────────────────────────── */

export default function ApiKeysPage({
  user,
  connected,
  modelCount,
  onLogout,
  onOpenHome,
  onOpenModels,
  onOpenSkills,
  onOpenSavedChats,
  onOpenChat,
  onOpenIntegrations,
  onOpenPricing,
  onModelsChanged,
}) {
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  /* Session-based raw key store to provide instant live testing right after creation/regen */
  const [rawKeyMap, setRawKeyMap] = useState(() => {
    try {
      const stored = sessionStorage.getItem('ih_api_keys_cache');
      return stored ? JSON.parse(stored) : {};
    } catch {
      return {};
    }
  });

  const cacheRawKey = useCallback((id, rawKey) => {
    setRawKeyMap(prev => {
      const next = { ...prev, [id]: rawKey };
      try {
        sessionStorage.setItem('ih_api_keys_cache', JSON.stringify(next));
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  /* Modal state */
  const [modalMode, setModalMode] = useState(null); // null | 'create' | 'reveal'
  const [modalKeyName, setModalKeyName] = useState('');
  const [modalRawKey, setModalRawKey] = useState('');
  const [modalBusy, setModalBusy] = useState(false);
  const [modalError, setModalError] = useState('');

  /* Per-key inline action states */
  const [confirmRevokeId, setConfirmRevokeId] = useState(null);
  const [confirmRegenId, setConfirmRegenId] = useState(null);
  const [actionBusyId, setActionBusyId] = useState(null);

  /* Load keys from backend */
  const loadKeys = useCallback(async (signal) => {
    try {
      const res = await fetch('/api/keys', { signal, cache: 'no-store' });
      const data = await readResponse(res, 'Could not load API keys');
      if (!signal?.aborted) {
        setKeys(Array.isArray(data.keys) ? data.keys : []);
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Could not load API keys.');
      }
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    loadKeys(ctrl.signal);
    return () => ctrl.abort();
  }, [loadKeys]);

  /* Open create modal */
  function handleOpenCreate() {
    setModalKeyName('');
    setModalRawKey('');
    setModalError('');
    setModalBusy(false);
    setModalMode('create');
  }

  /* Handle submit create key */
  async function handleSubmitCreate(e) {
    e.preventDefault();
    const name = modalKeyName.trim();
    if (!name || modalBusy) return;

    setModalBusy(true);
    setModalError('');

    try {
      const res = await fetch('/api/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const data = await readResponse(res, 'Could not create API key');

      if (data.key && data.rawKey) {
        cacheRawKey(data.key.id, data.rawKey);
        setKeys(prev => [data.key, ...prev]);
        setModalRawKey(data.rawKey);
        setModalMode('reveal');
      } else {
        throw new Error('Server did not return a valid generated key.');
      }
    } catch (err) {
      setModalError(err.message || 'Failed to create API key.');
    } finally {
      setModalBusy(false);
    }
  }

  /* Handle Regenerate Key */
  async function handleConfirmRegenerate(keyId) {
    const existing = keys.find(k => k.id === keyId);
    setActionBusyId(keyId);
    setError('');

    try {
      const res = await fetch(`/api/keys/${keyId}/regenerate`, { method: 'POST' });
      const data = await readResponse(res, 'Could not regenerate API key');

      if (data.key && data.rawKey) {
        cacheRawKey(data.key.id, data.rawKey);
        setKeys(prev => prev.map(k => (k.id === keyId ? data.key : k)));
        setConfirmRegenId(null);
        setModalKeyName(data.key.name || existing?.name || 'Regenerated Key');
        setModalRawKey(data.rawKey);
        setModalMode('reveal');
      } else {
        throw new Error('Server did not return regenerated key credentials.');
      }
    } catch (err) {
      setError(err.message || 'Could not regenerate key.');
      setConfirmRegenId(null);
    } finally {
      setActionBusyId(null);
    }
  }

  /* Handle Revoke Key */
  async function handleConfirmRevoke(keyId) {
    setActionBusyId(keyId);
    setError('');

    try {
      const res = await fetch(`/api/keys/${keyId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message || `Could not revoke key (HTTP ${res.status}).`);
      }

      setKeys(prev => prev.filter(k => k.id !== keyId));
      setConfirmRevokeId(null);
      setNotice('API key permanently revoked.');
      setTimeout(() => setNotice(''), 4000);
    } catch (err) {
      setError(err.message || 'Could not revoke key.');
      setConfirmRevokeId(null);
    } finally {
      setActionBusyId(null);
    }
  }

  /* When done with reveal modal */
  function handleDoneReveal() {
    setModalMode(null);
    setModalRawKey('');
    setModalKeyName('');
    loadKeys();
  }

  const activeKeys = keys.filter(k => k.status === 'active');

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
            onOpenApiKeys={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            onOpenIntegrations={onOpenIntegrations}
            onOpenPricing={onOpenPricing}
            onOpenSavedChats={onOpenSavedChats}
          />
        </div>
      </header>

      {/* ── Two-column Obsidian Dashboard Layout ── */}
      <div className="ak-layout">
        {/* Sidebar */}
        <aside className="ak-sidebar" aria-label="Account Settings Navigation">
          <span className="ak-sidebar-label">DEVELOPER & ACCOUNT</span>
          <button type="button" className="is-current" aria-current="page">
            <svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="7.5" cy="15.5" r="4.5" />
              <path d="M10.8 12.2L18.5 4.5M17 6l2 2M15 8l2 2" />
            </svg>
            <span>API Keys</span>
          </button>
          <button type="button" onClick={onOpenIntegrations}>
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
            Gateway credentials are cryptographically hashed and managed per account.
          </p>
        </aside>

        {/* Main Content */}
        <main className="ak-main">
          {/* Header & Primary Action */}
          <div className="ak-page-header">
            <div className="ak-page-title-group">
              <h1>API Keys</h1>
              <p className="ak-page-subtitle">
                Connect external developer tools (Cursor IDE, Cline, Continue, OpenAI SDK, custom apps) to iamhujju's 400+ models using drop-in OpenAI-compatible endpoints.
              </p>
            </div>
            <button
              type="button"
              className="ak-btn-primary ak-create-key-btn"
              onClick={handleOpenCreate}
            >
              <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path d="M8 3v10M3 8h10" />
              </svg>
              <span>+ Create New Key</span>
            </button>
          </div>

          {/* Feedback Alerts */}
          {error && (
            <div className="ak-msg ak-msg--error" role="alert">
              <span aria-hidden="true">✕</span>
              <span>{error}</span>
            </div>
          )}
          {notice && (
            <div className="ak-msg ak-msg--success" role="status">
              <span aria-hidden="true">✓</span>
              <span>{notice}</span>
            </div>
          )}

          {/* Active Keys Management Table Card */}
          <section className="ak-card" aria-label="Active Keys Management">
            <div className="ak-card-topbar">
              <div className="ak-card-title-wrap">
                <h3 className="ak-card-title">Active Keys</h3>
                <span className="ak-count-pill">{activeKeys.length}</span>
              </div>
            </div>

            {loading ? (
              <div className="ak-state-box" role="status">
                <div className="ak-spinner" aria-hidden="true" />
                <span>Loading active API keys…</span>
              </div>
            ) : keys.length === 0 ? (
              <div className="ak-empty-box">
                <div className="ak-empty-glyph" aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <circle cx="7.5" cy="15.5" r="4.5" />
                    <path d="M10.8 12.2L18.5 4.5M17 6l2 2M15 8l2 2" />
                  </svg>
                </div>
                <strong>No API Keys Generated</strong>
                <p>
                  Create your first key to connect Cursor, Cline, or the OpenAI SDK to iamhujju's models.
                </p>
                <button
                  type="button"
                  className="ak-btn-primary"
                  onClick={handleOpenCreate}
                >
                  + Create New Key
                </button>
              </div>
            ) : (
              <div className="ak-table-scroll">
                <table className="ak-table">
                  <thead>
                    <tr>
                      <th scope="col">Name</th>
                      <th scope="col">Secret Key</th>
                      <th scope="col">Created Date</th>
                      <th scope="col">Last Used</th>
                      <th scope="col">Requests & Tokens</th>
                      <th scope="col">Status</th>
                      <th scope="col" className="ak-th-actions">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {keys.map(key => {
                      const isRevoked = key.status === 'revoked';
                      return (
                        <tr key={key.id} className={isRevoked ? 'ak-row--revoked' : ''}>
                          {/* Name */}
                          <td className="ak-td-name">
                            <div className="ak-name-cluster">
                              <span className="ak-name-avatar" aria-hidden="true">
                                {key.name?.charAt(0).toUpperCase() || 'K'}
                              </span>
                              <span className="ak-name-text" title={key.name}>{key.name}</span>
                            </div>
                          </td>

                          {/* Secret Key (masked) */}
                          <td className="ak-td-key">
                            <code className="ak-masked-code">{key.prefix}</code>
                          </td>

                          {/* Created Date */}
                          <td className="ak-td-date">
                            {formatDate(key.createdAt)}
                          </td>

                          {/* Last Used */}
                          <td className="ak-td-date">
                            {formatLastUsed(key.lastUsedAt)}
                          </td>

                          {/* Requests & Tokens Count */}
                          <td className="ak-td-count">
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <span style={{ fontWeight: 600, color: '#e5e9f0' }}>
                                {(key.requestCount || 0).toLocaleString()} reqs
                              </span>
                              <span style={{ fontSize: '11px', color: '#00e599', fontFamily: 'monospace' }}>
                                {(key.tokensUsed || 0).toLocaleString()} tokens
                              </span>
                            </div>
                          </td>

                          {/* Status Badge */}
                          <td className="ak-td-status">
                            <span className={`ak-badge${isRevoked ? ' ak-badge--revoked' : ' ak-badge--active'}`}>
                              <span className="ak-badge-dot" aria-hidden="true" />
                              <span>{isRevoked ? 'Revoked' : 'Active'}</span>
                            </span>
                          </td>

                          {/* Actions */}
                          <td className="ak-td-actions">
                            {!isRevoked && (
                              <div className="ak-actions-group">
                                {confirmRegenId === key.id ? (
                                  <div className="ak-inline-confirm" role="group">
                                    <span className="ak-confirm-txt">
                                      Regenerating will immediately revoke the existing key. Continue?
                                    </span>
                                    <button
                                      type="button"
                                      className="ak-btn-primary ak-btn-xs"
                                      disabled={actionBusyId === key.id}
                                      onClick={() => handleConfirmRegenerate(key.id)}
                                    >
                                      {actionBusyId === key.id ? 'Regenerating…' : 'Yes, Continue'}
                                    </button>
                                    <button
                                      type="button"
                                      className="ak-btn-ghost ak-btn-xs"
                                      disabled={actionBusyId === key.id}
                                      onClick={() => setConfirmRegenId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : confirmRevokeId === key.id ? (
                                  <div className="ak-inline-confirm ak-inline-confirm--danger" role="group">
                                    <span className="ak-confirm-txt">
                                      Permanently revoke this key? External apps using it will stop working immediately.
                                    </span>
                                    <button
                                      type="button"
                                      className="ak-btn-danger ak-btn-xs"
                                      disabled={actionBusyId === key.id}
                                      onClick={() => handleConfirmRevoke(key.id)}
                                    >
                                      {actionBusyId === key.id ? 'Revoking…' : 'Yes, Revoke'}
                                    </button>
                                    <button
                                      type="button"
                                      className="ak-btn-ghost ak-btn-xs"
                                      disabled={actionBusyId === key.id}
                                      onClick={() => setConfirmRevokeId(null)}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <button
                                      type="button"
                                      className="ak-btn-ghost ak-btn-sm"
                                      disabled={actionBusyId === key.id}
                                      onClick={() => {
                                        setConfirmRegenId(key.id);
                                        setConfirmRevokeId(null);
                                      }}
                                    >
                                      Regenerate
                                    </button>
                                    <button
                                      type="button"
                                      className="ak-btn-danger-outline ak-btn-sm"
                                      disabled={actionBusyId === key.id}
                                      onClick={() => {
                                        setConfirmRevokeId(key.id);
                                        setConfirmRegenId(null);
                                      }}
                                    >
                                      Revoke / Delete
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* Live Quick-Connect / Test Drawer */}
          {!loading && (
            <ConnectDrawer
              activeKeys={activeKeys}
              rawKeyMap={rawKeyMap}
              defaultModel="openrouter/free"
            />
          )}

          {/* Obsidian Footer Note */}
          <footer className="ak-footnote">
            Keys authenticate requests to <code>/v1/chat/completions</code> and <code>/v1/models</code> using standard HTTP Bearer headers.
            All keys are SHA-256 hashed at rest and never viewable once generated.
          </footer>
        </main>
      </div>

      {/* ── Create / Regenerate Key Reveal Modal ── */}
      {modalMode && (
        <KeyModal
          mode={modalMode}
          keyName={modalKeyName}
          setKeyName={setModalKeyName}
          rawKey={modalRawKey}
          busy={modalBusy}
          error={modalError}
          onSubmitCreate={handleSubmitCreate}
          onDone={handleDoneReveal}
          onClose={() => setModalMode(null)}
        />
      )}
    </div>
  );
}
