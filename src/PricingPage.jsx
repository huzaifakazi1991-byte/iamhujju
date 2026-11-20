import { useCallback, useEffect, useState } from 'react';
import AccountMenu from './AccountMenu.jsx';
import PaymentModal from './PaymentModal.jsx';
import './PricingPage.css';
import { PRICING_PLANS, resolvePlan, CURRENCY_SYMBOL } from './pricingConfig.js';
import { useRazorpayCheckout } from './useRazorpayCheckout.js';
import { signInWithGoogle, syncUserProfile } from './firebase.js';

export default function PricingPage({
  user = null,
  connected = true,
  modelCount = 0,
  onLogout = null,
  onOpenHome = null,
  onOpenModels = null,
  onOpenChat = null,
  onOpenApiKeys = null,
  onOpenIntegrations = null,
  onOpenSavedChats = null,
  onAuthenticated = null
}) {
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState('signup');
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [authConfirm, setAuthConfirm] = useState('');
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedPlanForPayment, setSelectedPlanForPayment] = useState(null);

  const fetchHistory = useCallback(async () => {
    if (!user) return;
    setHistoryLoading(true);
    try {
      const res = await fetch('/api/payments/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data.payments || []);
      }
    } catch (err) {
      console.error('[Pricing History Error]', err);
    } finally {
      setHistoryLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handlePaymentSuccess = useCallback((updatedUser) => {
    if (typeof onAuthenticated === 'function' && updatedUser) {
      onAuthenticated(updatedUser);
    }
    fetchHistory();
  }, [onAuthenticated, fetchHistory]);

  const {
    startCheckout,
    loading: checkoutLoading,
    verifying,
    activePlanId,
    error: checkoutError,
    success: checkoutSuccess,
    resetState
  } = useRazorpayCheckout({
    currentUser: user,
    onOpenAuth: (mode) => {
      setAuthMode(mode || 'login');
      setAuthError('');
      setAuthOpen(true);
    },
    onPaymentSuccess: handlePaymentSuccess
  });

  // Check for intended plan in sessionStorage on mount or when user logs in
  useEffect(() => {
    if (!user) return;
    try {
      const intendedRaw = sessionStorage.getItem('iamhujju_intended_plan');
      if (intendedRaw) {
        const intended = JSON.parse(intendedRaw);
        sessionStorage.removeItem('iamhujju_intended_plan');
        if (intended && intended.planId) {
          const resolved = resolvePlan(intended.planId, intended.billingCycle || billingCycle);
          setSelectedPlanForPayment(resolved);
          setPaymentModalOpen(true);
        }
      }
    } catch {}
  }, [user, billingCycle]);

  function handlePlanClick(planKey) {
    resetState();
    const resolved = resolvePlan(planKey, billingCycle);
    if (resolved.isFree) {
      if (onOpenChat) onOpenChat();
      else if (onOpenHome) onOpenHome();
      return;
    }
    if (!user) {
      try {
        sessionStorage.setItem('iamhujju_intended_plan', JSON.stringify({
          planId: resolved.planId,
          basePlanId: resolved.basePlanId || resolved.planId,
          billingCycle: resolved.billingCycle || billingCycle
        }));
      } catch {}
      setAuthMode('login');
      setAuthError('');
      setAuthOpen(true);
      return;
    }
    setSelectedPlanForPayment(resolved);
    setPaymentModalOpen(true);
  }

  async function handleAuthSubmit(e) {
    e.preventDefault();
    setAuthError('');

    if (authMode === 'signup' && authPassword !== authConfirm) {
      setAuthError('Passwords do not match.');
      return;
    }

    setAuthBusy(true);
    try {
      const res = await fetch(`/api/auth/${authMode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: authEmail, password: authPassword })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Authentication request failed.');
      }
      setAuthOpen(false);
      setAuthPassword('');
      setAuthConfirm('');
      if (typeof onAuthenticated === 'function') {
        onAuthenticated(data.user);
      }
    } catch (err) {
      setAuthError(err.message || 'Authentication failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  async function handleGoogleAuth() {
    setAuthBusy(true);
    setAuthError('');
    try {
      const fbUser = await signInWithGoogle();
      if (!fbUser) throw new Error('Google sign-in was cancelled.');
      await syncUserProfile(fbUser);
      const res = await fetch('/api/auth/firebase-login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: fbUser.email,
          uid: fbUser.uid,
          displayName: fbUser.displayName || ''
        })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error?.message || 'Authentication bridge failed.');
      }
      setAuthOpen(false);
      if (typeof onAuthenticated === 'function') {
        onAuthenticated(data.user);
      }
    } catch (err) {
      setAuthError(err.message || 'Google sign-in failed.');
    } finally {
      setAuthBusy(false);
    }
  }

  function copyUpi() {
    navigator.clipboard.writeText('9975649957@mbk');
    setCopiedUpi(true);
    setTimeout(() => setCopiedUpi(false), 2000);
  }

  // Get active resolved plan cards
  const freePlan = PRICING_PLANS.free;
  const paygPlan = PRICING_PLANS.payg;
  const devPlan = resolvePlan('developer', billingCycle);
  const proPlan = resolvePlan('pro', billingCycle);
  const entPlan = resolvePlan('enterprise', billingCycle);

  const userTier = (user?.tier || 'free').toLowerCase();

  return (
    <div className="pricing-page-root">
      {/* Atmosphere Background */}
      <div className="pricing-bg-glow" aria-hidden="true" />
      <div className="pricing-bg-grid" aria-hidden="true" />

      {/* Navigation Topbar */}
      <header className="pricing-nav">
        <button
          className="pricing-nav-brand"
          type="button"
          onClick={onOpenHome}
          title="Return to iamhujju Home"
        >
          <img src="/mascot.jpg" alt="iamhujju mascot" />
          <span>Huzaifa Kazi</span>
        </button>

        <div className="pricing-nav-actions">
          {onOpenModels && (
            <button className="pricing-nav-btn" type="button" onClick={onOpenModels}>
              Models
            </button>
          )}
          {onOpenChat && (
            <button className="pricing-nav-btn" type="button" onClick={onOpenChat}>
              Companion
            </button>
          )}
          {onOpenApiKeys && (
            <button className="pricing-nav-btn" type="button" onClick={onOpenApiKeys}>
              API Keys
            </button>
          )}
          {user ? (
            <AccountMenu
              user={user}
              connected={connected}
              modelCount={modelCount}
              onLogout={onLogout}
              onOpenApiKeys={onOpenApiKeys}
              onOpenIntegrations={onOpenIntegrations}
              onOpenPricing={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
              onOpenSavedChats={onOpenSavedChats}
            />
          ) : (
            <button
              className="pricing-nav-btn primary"
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError('');
                setAuthOpen(true);
              }}
            >
              Sign In
            </button>
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="pricing-content">
        {/* Hero Section */}
        <div className="pricing-hero">
          <div className="pricing-pill">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
            <span>NO HIDDEN FEES · SCALE AS YOU GROW</span>
          </div>
          <h1 className="pricing-title">
            One AI Workspace. <span className="pricing-title-accent">400+ Models.</span>
            <br />Access more, spend less.
          </h1>
          <p className="pricing-subtitle">
            Predictable, transparent pricing in Indian Rupees (INR / ₹) with instant Razorpay & UPI activation.
            Enjoy unlimited access, rollover tokens, and enterprise-grade SLA.
          </p>
        </div>

        {/* User Active Plan Status Banner */}
        {user && (
          <div className="pricing-current-plan-banner">
            <div>
              <span>Signed in as <strong>{user.email}</strong> · Current tier: </span>
              <strong>{userTier}</strong>
            </div>
            {userTier !== 'enterprise' && (
              <span style={{ color: '#71717a', fontSize: '0.82rem' }}>
                Upgrading settles instantly into your account
              </span>
            )}
          </div>
        )}

        {/* Global Feedback Alerts */}
        {checkoutError && (
          <div className="pricing-alert error" role="alert">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{checkoutError}</span>
          </div>
        )}

        {checkoutSuccess && (
          <div className="pricing-alert success" role="status">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
              <polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span>
              {checkoutSuccess.message || `Payment verified successfully! Your subscription is now active.`}
            </span>
          </div>
        )}

        {/* Billing Cycle Switcher */}
        <div className="pricing-cycle-wrapper">
          <div className="pricing-cycle-switch" role="tablist" aria-label="Billing frequency">
            <button
              type="button"
              role="tab"
              aria-selected={billingCycle === 'monthly'}
              className={`pricing-cycle-tab ${billingCycle === 'monthly' ? 'active' : ''}`}
              onClick={() => setBillingCycle('monthly')}
            >
              Monthly billing
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={billingCycle === 'annual'}
              className={`pricing-cycle-tab ${billingCycle === 'annual' ? 'active' : ''}`}
              onClick={() => setBillingCycle('annual')}
            >
              <span>Annual billing</span>
              <span className="pricing-save-badge">SAVE 20%</span>
            </button>
          </div>
        </div>

        {/* Pricing Cards Grid */}
        <div className="pricing-grid">
          {/* 1. Free Plan */}
          <div className="pricing-card">
            <div className="pricing-card-header">
              <span className="pricing-card-category">{freePlan.category}</span>
              <h2 className="pricing-card-name">{freePlan.name}</h2>
              <div className="pricing-card-price-block">
                <span className="pricing-card-amount">₹0</span>
                <span className="pricing-card-unit">/ month</span>
              </div>
              <span className="pricing-card-usd">{freePlan.amountUsd}</span>
            </div>
            <p className="pricing-card-desc">{freePlan.description}</p>
            <div className="pricing-card-metrics">
              <div>
                <span className="pricing-metric-label">Daily Limit:</span>
                <span className="pricing-metric-val">{freePlan.tokens}</span>
              </div>
              <div>
                <span className="pricing-metric-label">Users:</span>
                <span className="pricing-metric-val">{freePlan.users}</span>
              </div>
            </div>
            <ul className="pricing-features-list">
              {freePlan.features.map((f, i) => (
                <li key={i}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00e599" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pricing-cta-button"
              onClick={() => handlePlanClick('free')}
            >
              {userTier === 'free' ? 'Current Free Tier' : 'Explore Free Tier'}
            </button>
          </div>

          {/* 2. Pay-as-you-go */}
          <div className="pricing-card">
            <div className="pricing-card-header">
              <span className="pricing-card-category">{paygPlan.category}</span>
              <h2 className="pricing-card-name">{paygPlan.name}</h2>
              <div className="pricing-card-price-block">
                <span className="pricing-card-amount">₹1,699</span>
                <span className="pricing-card-unit">one-time</span>
              </div>
              <span className="pricing-card-usd">{paygPlan.amountUsd}</span>
            </div>
            <p className="pricing-card-desc">{paygPlan.description}</p>
            <div className="pricing-card-metrics">
              <div>
                <span className="pricing-metric-label">Credit:</span>
                <span className="pricing-metric-val">{paygPlan.tokens}</span>
              </div>
              <div>
                <span className="pricing-metric-label">Users:</span>
                <span className="pricing-metric-val">{paygPlan.users}</span>
              </div>
            </div>
            <ul className="pricing-features-list">
              {paygPlan.features.map((f, i) => (
                <li key={i}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00e599" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pricing-cta-button"
              disabled={checkoutLoading && activePlanId === paygPlan.planId}
              onClick={() => handlePlanClick('payg')}
            >
              {checkoutLoading && activePlanId === paygPlan.planId ? 'Opening Checkout…' : 'Choose Pay-as-you-go'}
            </button>
          </div>

          {/* 3. Developer Plan */}
          <div className="pricing-card">
            <div className="pricing-card-header">
              <span className="pricing-card-category">{devPlan.category}</span>
              <h2 className="pricing-card-name">{devPlan.title}</h2>
              <div className="pricing-card-price-block">
                <span className="pricing-card-amount">
                  {billingCycle === 'annual' ? '₹1,359' : '₹1,699'}
                </span>
                <span className="pricing-card-unit">/ month</span>
              </div>
              <span className="pricing-card-usd">
                {billingCycle === 'annual' ? 'Billed ₹16,308/year (Save 20%)' : devPlan.amountUsd}
              </span>
            </div>
            <p className="pricing-card-desc">{devPlan.description}</p>
            <div className="pricing-card-metrics">
              <div>
                <span className="pricing-metric-label">Tokens:</span>
                <span className="pricing-metric-val">{devPlan.tokens}</span>
              </div>
              <div>
                <span className="pricing-metric-label">Users:</span>
                <span className="pricing-metric-val">{devPlan.users}</span>
              </div>
            </div>
            <ul className="pricing-features-list">
              {devPlan.features.map((f, i) => (
                <li key={i}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00e599" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pricing-cta-button"
              disabled={checkoutLoading && activePlanId === devPlan.planId}
              onClick={() => handlePlanClick(devPlan.planId)}
            >
              {checkoutLoading && activePlanId === devPlan.planId
                ? 'Opening Checkout…'
                : userTier === 'developer'
                  ? 'Current Plan (Extend)'
                  : 'Upgrade to Developer'}
            </button>
          </div>

          {/* 4. Pro Plan (Featured / Most Popular) */}
          <div className="pricing-card featured">
            <div className="pricing-card-badge">Most Popular</div>
            <div className="pricing-card-header">
              <span className="pricing-card-category">{proPlan.category}</span>
              <h2 className="pricing-card-name">{proPlan.title}</h2>
              <div className="pricing-card-price-block">
                <span className="pricing-card-amount">
                  {billingCycle === 'annual' ? '₹6,559' : '₹8,199'}
                </span>
                <span className="pricing-card-unit">/ month</span>
              </div>
              <span className="pricing-card-usd">
                {billingCycle === 'annual' ? 'Billed ₹78,708/year (Save 20%)' : proPlan.amountUsd}
              </span>
            </div>
            <p className="pricing-card-desc">{proPlan.description}</p>
            <div className="pricing-card-metrics">
              <div>
                <span className="pricing-metric-label">Tokens:</span>
                <span className="pricing-metric-val">{proPlan.tokens}</span>
              </div>
              <div>
                <span className="pricing-metric-label">Rate Limits:</span>
                <span className="pricing-metric-val">120 RPM</span>
              </div>
            </div>
            <ul className="pricing-features-list">
              {proPlan.features.map((f, i) => (
                <li key={i}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pricing-cta-button featured"
              disabled={checkoutLoading && activePlanId === proPlan.planId}
              onClick={() => handlePlanClick(proPlan.planId)}
            >
              {checkoutLoading && activePlanId === proPlan.planId
                ? 'Opening Checkout…'
                : userTier === 'pro'
                  ? 'Current Plan (Extend)'
                  : 'Upgrade to Pro'}
            </button>
          </div>

          {/* 5. Enterprise Plan */}
          <div className="pricing-card">
            <div className="pricing-card-header">
              <span className="pricing-card-category">{entPlan.category}</span>
              <h2 className="pricing-card-name">{entPlan.title}</h2>
              <div className="pricing-card-price-block">
                <span className="pricing-card-amount">
                  {billingCycle === 'annual' ? '₹19,199' : '₹23,999'}
                </span>
                <span className="pricing-card-unit">/ month</span>
              </div>
              <span className="pricing-card-usd">
                {billingCycle === 'annual' ? 'Billed ₹230,388/year (Save 20%)' : entPlan.amountUsd}
              </span>
            </div>
            <p className="pricing-card-desc">{entPlan.description}</p>
            <div className="pricing-card-metrics">
              <div>
                <span className="pricing-metric-label">Capacity:</span>
                <span className="pricing-metric-val">{entPlan.tokens}</span>
              </div>
              <div>
                <span className="pricing-metric-label">SLA:</span>
                <span className="pricing-metric-val">99.99%</span>
              </div>
            </div>
            <ul className="pricing-features-list">
              {entPlan.features.map((f, i) => (
                <li key={i}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#00e599" strokeWidth="2.5">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="pricing-cta-button"
              disabled={checkoutLoading && activePlanId === entPlan.planId}
              onClick={() => handlePlanClick(entPlan.planId)}
            >
              {checkoutLoading && activePlanId === entPlan.planId
                ? 'Opening Checkout…'
                : userTier === 'enterprise'
                  ? 'Current Plan (Active)'
                  : 'Upgrade to Enterprise'}
            </button>
          </div>
        </div>

        {/* Direct UPI Alternate Block */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '14px',
          padding: '1.25rem 1.75rem',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          marginBottom: '3rem'
        }}>
          <div>
            <h4 style={{ margin: '0 0 0.25rem', color: '#fff', fontSize: '0.95rem' }}>
              Prefer direct UPI payment?
            </h4>
            <p style={{ margin: 0, color: '#a1a1aa', fontSize: '0.84rem' }}>
              Pay directly to VPA <code>9975649957@mbk</code> (Huzaifa Kazi) via GPay, PhonePe, Paytm, or CRED.
            </p>
          </div>
          <button
            type="button"
            className="pricing-nav-btn"
            onClick={copyUpi}
          >
            {copiedUpi ? '✓ UPI ID Copied!' : 'Copy UPI ID: 9975649957@mbk'}
          </button>
        </div>

        {/* Billing & Payment History Section */}
        <section className="pricing-history-section">
          <h3 className="pricing-history-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2">
              <rect x="2" y="5" width="20" height="14" rx="2" />
              <line x1="2" y1="10" x2="22" y2="10" />
            </svg>
            Billing & Payment Receipts
          </h3>
          <p className="pricing-history-desc">
            All Razorpay transactions, order IDs, and payment verification receipts are recorded below in real-time.
          </p>

          {!user ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#71717a' }}>
              <p>Sign in to view your past transactions and subscription receipts.</p>
              <button
                type="button"
                className="pricing-nav-btn primary"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError('');
                  setAuthOpen(true);
                }}
              >
                Sign In to View Receipts
              </button>
            </div>
          ) : historyLoading ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#71717a' }}>
              Loading receipts…
            </div>
          ) : history.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#71717a' }}>
              No payments recorded yet. When you upgrade, your verified receipts will show up here.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="pricing-history-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Plan</th>
                    <th>Billing</th>
                    <th>Amount</th>
                    <th>Receipt / Order ID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id || item.orderId}>
                      <td>
                        {item.createdAt
                          ? new Date(item.createdAt).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })
                          : 'Recent'}
                      </td>
                      <td style={{ textTransform: 'capitalize', fontWeight: 600, color: '#fff' }}>
                        {item.planId || 'Standard'}
                      </td>
                      <td style={{ textTransform: 'capitalize' }}>
                        {item.billingCycle || 'monthly'}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontWeight: 600, color: '#38bdf8' }}>
                        ₹{item.amountInr || Math.round((item.amountPaise || 0) / 100)}
                      </td>
                      <td style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.8rem' }}>
                        {item.paymentId || item.orderId || item.receipt || '—'}
                      </td>
                      <td>
                        <span className={`pricing-status-pill ${item.status || 'captured'}`}>
                          {item.status || 'captured'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Footer Guarantees */}
        <div className="pricing-footer-guarantee">
          <div className="pricing-guarantee-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#34d399" strokeWidth="2.5">
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>256-Bit SSL Encrypted Razorpay Gateway</span>
          </div>
          <div className="pricing-guarantee-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span>Instant Token & Tier Activation</span>
          </div>
          <div className="pricing-guarantee-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#a78bfa" strokeWidth="2.5">
              <rect x="1" y="4" width="22" height="16" rx="2" ry="2" />
              <line x1="1" y1="10" x2="23" y2="10" />
            </svg>
            <span>UPI, Credit/Debit Cards, NetBanking</span>
          </div>
          <div className="pricing-guarantee-item">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fbbf24" strokeWidth="2.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span>Direct WhatsApp Support: +91 9975649957</span>
          </div>
        </div>
      </main>

      {/* Authentication Dialog for unauthenticated upgrades */}
      {authOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(8px)',
            zIndex: 100,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem'
          }}
          onClick={() => setAuthOpen(false)}
        >
          <div
            style={{
              background: '#0d0d12',
              border: '1px solid rgba(255, 255, 255, 0.12)',
              borderRadius: '16px',
              maxWidth: '420px',
              width: '100%',
              padding: '2rem',
              boxShadow: '0 20px 40px rgba(0,0,0,0.6)',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                <img src="/mascot.jpg" alt="Mascot" style={{ width: '28px', height: '28px', borderRadius: '6px' }} />
                <span style={{ fontWeight: 700, color: '#fff' }}>iamhujju</span>
              </div>
              <button
                type="button"
                onClick={() => setAuthOpen(false)}
                style={{ background: 'none', border: 'none', color: '#a1a1aa', cursor: 'pointer', fontSize: '1.2rem' }}
              >
                ✕
              </button>
            </div>

            <h3 style={{ margin: '0 0 0.5rem', color: '#fff', fontSize: '1.25rem' }}>
              {authMode === 'signup' ? 'Create your account' : 'Sign in to your account'}
            </h3>
            <p style={{ margin: '0 0 1.25rem', color: '#a1a1aa', fontSize: '0.85rem' }}>
              Sign in to complete your checkout and link your subscription to your personal AI workspace.
            </p>

            <button
              type="button"
              onClick={handleGoogleAuth}
              disabled={authBusy}
              style={{
                width: '100%',
                padding: '0.75rem',
                borderRadius: '8px',
                background: '#fff',
                color: '#1f2937',
                border: 'none',
                fontWeight: 600,
                fontSize: '0.9rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.6rem',
                marginBottom: '1rem'
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
              </svg>
              Continue with Google
            </button>

            <div style={{ textAlign: 'center', color: '#52525b', fontSize: '0.8rem', margin: '0.75rem 0' }}>
              <span>or continue with email</span>
            </div>

            <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <input
                type="email"
                placeholder="Email address"
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                required
                style={{
                  background: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
              <input
                type="password"
                placeholder="Password"
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                required
                style={{
                  background: '#18181b',
                  border: '1px solid rgba(255, 255, 255, 0.12)',
                  borderRadius: '8px',
                  padding: '0.75rem',
                  color: '#fff',
                  fontSize: '0.9rem'
                }}
              />
              {authMode === 'signup' && (
                <input
                  type="password"
                  placeholder="Confirm password"
                  value={authConfirm}
                  onChange={(e) => setAuthConfirm(e.target.value)}
                  required
                  style={{
                    background: '#18181b',
                    border: '1px solid rgba(255, 255, 255, 0.12)',
                    borderRadius: '8px',
                    padding: '0.75rem',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              )}

              {authError && (
                <div style={{ color: '#f87171', fontSize: '0.82rem' }}>
                  {authError}
                </div>
              )}

              <button
                type="submit"
                disabled={authBusy}
                className="pricing-cta-button featured"
                style={{ marginTop: '0.5rem' }}
              >
                {authBusy
                  ? 'Connecting…'
                  : authMode === 'signup'
                    ? 'Create Account & Continue'
                    : 'Sign In & Continue'}
              </button>

              <div style={{ textAlign: 'center', marginTop: '0.5rem', fontSize: '0.82rem', color: '#a1a1aa' }}>
                {authMode === 'signup' ? 'Already have an account?' : 'New to iamhujju?'}
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode(authMode === 'signup' ? 'login' : 'signup');
                    setAuthError('');
                  }}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#38bdf8',
                    cursor: 'pointer',
                    marginLeft: '0.4rem',
                    fontWeight: 600
                  }}
                >
                  {authMode === 'signup' ? 'Sign in' : 'Create account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Razorpay & Direct UPI Secure Payment Checkout Modal */}
      <PaymentModal
        isOpen={paymentModalOpen}
        onClose={() => setPaymentModalOpen(false)}
        plan={selectedPlanForPayment}
        currentUser={user}
        onPaymentSuccess={(updatedUser) => {
          setPaymentModalOpen(false);
          handlePaymentSuccess(updatedUser);
        }}
      />
    </div>
  );
}
