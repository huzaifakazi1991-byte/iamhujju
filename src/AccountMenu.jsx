import { useEffect, useRef, useState } from 'react';
import './AccountMenu.css';

async function responseMessage(response, fallback) {
  try {
    const body = await response.json();
    return body?.error?.message || fallback;
  } catch {
    return fallback;
  }
}

export default function AccountMenu({
  user,
  connected,
  modelCount,
  onLogout,
  onOpenApiKeys,
  onOpenIntegrations
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const rootRef = useRef(null);
  const triggerRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;

    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }

    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open]);

  async function signOut() {
    setBusy(true);
    setError('');

    try {
      const response = await fetch('/api/auth/logout', { method: 'POST' });
      if (!response.ok) {
        throw new Error(await responseMessage(response, `Sign out failed (HTTP ${response.status}).`));
      }

      await onLogout();
    } catch (requestError) {
      setError(requestError.message || 'Could not sign out.');
      setBusy(false);
    }
  }

  return (
    <div className="account-menu" ref={rootRef}>
      <button
        className="account-menu-trigger"
        type="button"
        aria-label={`Account options for ${user.email}`}
        aria-expanded={open}
        aria-controls="account-menu-panel"
        onClick={() => {
          setError('');
          setOpen(value => !value);
        }}
        ref={triggerRef}
      >
        <span className="account-menu-avatar" aria-hidden="true">
          {user.email.charAt(0).toUpperCase()}
        </span>
        <span className="account-menu-trigger-label">Account</span>
        <svg aria-hidden="true" viewBox="0 0 16 16" width="14" height="14">
          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="1.5" />
        </svg>
      </button>

      {open && (
        <div className="account-menu-panel" id="account-menu-panel">
          <div className="account-menu-identity">
            <span className="account-menu-avatar account-menu-avatar-large" aria-hidden="true">
              {user.email.charAt(0).toUpperCase()}
            </span>
            <div>
              <span className="account-menu-caption">Signed in as</span>
              <strong title={user.email}>{user.email}</strong>
            </div>
          </div>

          <div className="account-menu-status" role="status">
            <span className={`account-menu-dot${connected ? ' is-online' : ''}`} />
            <span>{connected ? 'Gateway connected' : 'Gateway unavailable'}</span>
            {connected && <span className="account-menu-model-count">{modelCount} models</span>}
          </div>
          <p className="account-menu-note">
            Provider rate limits are not reported by the available APIs.
          </p>

          {error && <p className="account-menu-error" role="alert">{error}</p>}

          <button
            className="account-menu-action"
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenApiKeys();
            }}
          >
            <span>API Keys</span>
            <span aria-hidden="true">›</span>
          </button>
          <button
            className="account-menu-action"
            type="button"
            onClick={() => {
              setOpen(false);
              onOpenIntegrations();
            }}
          >
            <span>Integrations</span>
            <span aria-hidden="true">›</span>
          </button>
          <button
            className="account-menu-sign-out"
            type="button"
            disabled={busy}
            onClick={signOut}
          >
            {busy ? 'Signing out…' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
