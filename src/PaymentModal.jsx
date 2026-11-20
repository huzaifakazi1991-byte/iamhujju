import { useEffect, useRef, useState } from 'react';
import './PaymentModal.css';
import { resolvePlan } from './pricingConfig.js';

async function loadRazorpayScript(retries = 2) {
  if (typeof window !== 'undefined' && window.Razorpay) {
    return true;
  }
  for (let attempt = 0; attempt <= retries; attempt++) {
    const loaded = await new Promise((resolve) => {
      const existingScript = document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]');
      if (existingScript) existingScript.remove();
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
    if (loaded && window.Razorpay) return true;
    if (attempt < retries) {
      await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
    }
  }
  return false;
}

export default function PaymentModal({
  isOpen,
  onClose,
  plan = null,
  currentUser = null,
  onPaymentSuccess = null
}) {
  const dialogRef = useRef(null);
  const [activeMethod, setActiveMethod] = useState('razorpay'); // 'razorpay' | 'upi_direct'
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);
  const [copiedUpi, setCopiedUpi] = useState(false);
  const [utrNumber, setUtrNumber] = useState('');
  const [emailInput, setEmailInput] = useState(currentUser?.email || '');

  // Resolve plan from single source of truth
  const currentPlan = resolvePlan(plan || 'pro');

  const officialUpiId = '9975649957@mbk';
  const accountHolder = 'Huzaifa Kazi (iamhujju)';

  const upiIntentUrl = `upi://pay?pa=${officialUpiId}&pn=iamhujju&am=${currentPlan.amountInr}&cu=INR&tn=iamhujju%20${encodeURIComponent(currentPlan.name)}%20Subscription`;
  const qrCodeUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(upiIntentUrl)}`;

  useEffect(() => {
    if (isOpen) {
      setError('');
      setSuccess(null);
      setUtrNumber('');
      setEmailInput(currentUser?.email || '');
      loadRazorpayScript();
      fetch('/api/payment/config')
        .then(r => r.json())
        .then(cfg => {
          if (!cfg?.isLive && !cfg?.keyId) {
            setActiveMethod('upi_direct');
          }
        })
        .catch(() => {});
      if (dialogRef.current && !dialogRef.current.open) {
        dialogRef.current.showModal();
      }
    } else if (dialogRef.current && dialogRef.current.open) {
      dialogRef.current.close();
    }
  }, [isOpen, currentUser]);

  function copyUpiId() {
    navigator.clipboard.writeText(officialUpiId).then(() => {
      setCopiedUpi(true);
      setTimeout(() => setCopiedUpi(false), 2200);
    });
  }

  async function handleRazorpayCheckout() {
    setLoading(true);
    setError('');

    const customerEmail = currentUser?.email || emailInput.trim();
    if (!customerEmail) {
      setError('Please provide your email address to link your subscription.');
      setLoading(false);
      return;
    }

    try {
      // 1. Create order on backend (calling POST /api/create-order)
      let orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: currentPlan.planId,
          billingCycle: currentPlan.billingCycle || 'monthly',
          amount: typeof currentPlan.amountInr === 'number' ? Math.round(currentPlan.amountInr * 100) : undefined,
          email: customerEmail
        })
      });

      if (!orderRes.ok && orderRes.status === 404) {
        orderRes = await fetch('/api/payments/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: currentPlan.planId,
            billingCycle: currentPlan.billingCycle || 'monthly',
            email: customerEmail
          })
        });
      }

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || 'Failed to initiate order.');
      }

      const orderData = await orderRes.json();
      const isScriptLoaded = await loadRazorpayScript(2);
      const activeKeyId = orderData.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_U2RfhaS1IyP8oo';

      // If Razorpay SDK is ready, live Key ID is returned, and direct UPI fallback not requested
      if (isScriptLoaded && window.Razorpay && activeKeyId && !orderData.fallbackToDirectUpi) {
        const options = {
          key: activeKeyId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'iamhujju',
          description: `${currentPlan.name} Subscription`,
          image: '/mascot.jpg',
          order_id: orderData.order_id || orderData.orderId,
          prefill: {
            name: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
            email: customerEmail,
            contact: ''
          },
          theme: {
            color: '#09090B'
          },
          handler: async function (response) {
            setLoading(true);
            try {
              let verifyRes = await fetch('/api/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  order_id: response.razorpay_order_id,
                  payment_id: response.razorpay_payment_id,
                  signature: response.razorpay_signature,
                  razorpay_order_id: response.razorpay_order_id,
                  razorpay_payment_id: response.razorpay_payment_id,
                  razorpay_signature: response.razorpay_signature,
                  planId: currentPlan.planId,
                  billingCycle: currentPlan.billingCycle || 'monthly',
                  email: customerEmail
                })
              });

              if (!verifyRes.ok && verifyRes.status === 404) {
                verifyRes = await fetch('/api/payments/razorpay/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    planId: currentPlan.planId,
                    billingCycle: currentPlan.billingCycle || 'monthly',
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    email: customerEmail
                  })
                });
              }

              const verifyData = await verifyRes.json();
              if (verifyRes.ok && verifyData.success) {
                setSuccess(verifyData);
                if (onPaymentSuccess) onPaymentSuccess(verifyData.user);
              } else {
                setError(verifyData?.error?.message || 'Payment verification failed.');
              }
            } catch (err) {
              setError(err.message || 'Error communicating with verification service.');
            } finally {
              setLoading(false);
            }
          },
          modal: {
            ondismiss: function () {
              setLoading(false);
              setError('Checkout closed. You can retry at any time or use direct UPI payment below.');
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          const reason = resp.error?.description || resp.error?.reason || 'Payment was unsuccessful.';
          setError(`Payment failed: ${reason}. Please retry or choose another payment method.`);
          setLoading(false);
        });
        rzp.open();
        setLoading(false);
      } else {
        // Fallback to direct UPI payment tab if Razorpay test keys are not active
        setActiveMethod('upi_direct');
        setLoading(false);
      }
    } catch (err) {
      setError(err.message || 'Checkout failed. Please use direct UPI transfer below.');
      setActiveMethod('upi_direct');
      setLoading(false);
    }
  }

  async function handleVerifyUtr(e) {
    e.preventDefault();
    const cleanUtr = utrNumber.trim();
    if (!cleanUtr || cleanUtr.length < 6) {
      setError('Please enter a valid 12-digit UPI reference (UTR) number.');
      return;
    }

    const customerEmail = currentUser?.email || emailInput.trim();
    if (!customerEmail) {
      setError('Please provide your email address to link your subscription.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      let res = await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: currentPlan.planId,
          billingCycle: currentPlan.billingCycle || 'monthly',
          upi_ref: cleanUtr,
          email: customerEmail
        })
      });

      if (!res.ok && res.status === 404) {
        res = await fetch('/api/payments/razorpay/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: currentPlan.planId,
            billingCycle: currentPlan.billingCycle || 'monthly',
            upi_ref: cleanUtr,
            email: customerEmail
          })
        });
      }

      const data = await res.json();
      if (res.ok && data.success) {
        setSuccess(data);
        if (onPaymentSuccess) onPaymentSuccess(data.user);
      } else {
        setError(data?.error?.message || 'Verification could not be completed.');
      }
    } catch (err) {
      setError(err.message || 'Network error while verifying UTR.');
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) return null;

  return (
    <dialog
      className="payment-modal-dialog"
      ref={dialogRef}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="payment-modal-card">
        {/* Header */}
        <div className="payment-modal-header">
          <div className="payment-modal-brand">
            <span className="payment-brand-badge">⚡ SECURE PAYMENT GATEWAY</span>
            <h2 className="payment-modal-title">Upgrade to {currentPlan.name}</h2>
          </div>
          <button
            type="button"
            className="payment-modal-close"
            onClick={onClose}
            aria-label="Close payment dialog"
          >
            ✕
          </button>
        </div>

        {/* Success View */}
        {success ? (
          <div className="payment-success-view">
            <div className="payment-success-icon-wrap">
              <svg viewBox="0 0 24 24" width="36" height="36" fill="none" stroke="currentColor" strokeWidth="2.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3>Subscription Activated!</h3>
            <p className="payment-success-msg">
              Your account has been upgraded to <strong>{currentPlan.name}</strong>. Enjoy full access to all 400+ models, fast smart routing, and extended quota.
            </p>
            {success.paymentRef && (
              <div className="payment-success-ref">
                <span>Reference: <code>{success.paymentRef}</code></span>
              </div>
            )}
            <button
              type="button"
              className="payment-btn-primary"
              onClick={onClose}
            >
              Continue to AI Workspace
            </button>
          </div>
        ) : (
          <div className="payment-modal-body">
            {/* Plan Order Summary */}
            <div className="payment-order-summary">
              <div className="payment-summary-row">
                <span className="summary-label">Selected Tier</span>
                <span className="summary-plan-name">{currentPlan.name}</span>
              </div>
              <div className="payment-summary-row">
                <span className="summary-label">Billing Cycle</span>
                <span className="summary-cycle">
                  {currentPlan.billingCycle === 'annual' ? 'Annual (20% Off)' : 'Monthly'}
                </span>
              </div>
              <div className="payment-summary-divider" />
              <div className="payment-summary-total">
                <div className="total-label-wrap">
                  <span className="total-label">Total Payable</span>
                  <span className="total-subtext">Inclusive of all taxes & instant setup</span>
                </div>
                <div className="total-amount-wrap">
                  <span className="total-inr">
                    {typeof currentPlan.amountInr === 'number'
                      ? `₹${currentPlan.amountInr.toLocaleString('en-IN')}`
                      : currentPlan.amountFormatted || '₹8,199'}
                  </span>
                  {currentPlan.amountUsd && (
                    <span className="total-usd">≈ {currentPlan.amountUsd}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Email Input for Guest / Unauthenticated */}
            {!currentUser && (
              <div className="payment-email-block">
                <label htmlFor="pay-email-input" className="payment-input-label">
                  Your Account Email (for subscription activation):
                </label>
                <input
                  id="pay-email-input"
                  type="email"
                  className="payment-text-input"
                  placeholder="you@company.com"
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  required
                />
              </div>
            )}

            {/* Method Tabs */}
            <div className="payment-method-tabs" role="tablist">
              <button
                type="button"
                className={`payment-method-tab ${activeMethod === 'razorpay' ? 'is-active' : ''}`}
                onClick={() => setActiveMethod('razorpay')}
                role="tab"
                aria-selected={activeMethod === 'razorpay'}
              >
                <span className="tab-icon">💳</span>
                <span>Razorpay Checkout</span>
                <span className="tab-pill">Instant</span>
              </button>
              <button
                type="button"
                className={`payment-method-tab ${activeMethod === 'upi_direct' ? 'is-active' : ''}`}
                onClick={() => setActiveMethod('upi_direct')}
                role="tab"
                aria-selected={activeMethod === 'upi_direct'}
              >
                <span className="tab-icon">📱</span>
                <span>Direct UPI / QR</span>
                <span className="tab-pill">Zero Fee</span>
              </button>
            </div>

            {/* Method 1: Razorpay Gateway */}
            {activeMethod === 'razorpay' && (
              <div className="payment-method-content">
                <div className="payment-badges-row">
                  <span className="pay-badge">GPay</span>
                  <span className="pay-badge">PhonePe</span>
                  <span className="pay-badge">Paytm</span>
                  <span className="pay-badge">CRED</span>
                  <span className="pay-badge">Visa / MC</span>
                  <span className="pay-badge">NetBanking</span>
                </div>
                <p className="payment-method-desc">
                  Pay securely with Razorpay using any UPI application, Indian Debit/Credit Card, or Net Banking from 50+ banks.
                </p>

                {error && <div className="payment-error-alert" role="alert">{error}</div>}

                <button
                  type="button"
                  className="payment-btn-primary"
                  disabled={loading}
                  onClick={handleRazorpayCheckout}
                >
                  {loading ? 'Opening Gateway…' : `Pay ₹${currentPlan.amountInr?.toLocaleString('en-IN') || '8,199'} with Razorpay`}
                </button>
              </div>
            )}

            {/* Method 2: Direct UPI QR & Reference */}
            {activeMethod === 'upi_direct' && (
              <div className="payment-method-content">
                <div className="upi-transfer-card">
                  <div className="upi-qr-section">
                    <img
                      src={qrCodeUrl}
                      alt="Scan to Pay via UPI"
                      className="upi-qr-image"
                      width="160"
                      height="160"
                      loading="lazy"
                    />
                    <span className="upi-scan-hint">Scan with GPay, PhonePe, Paytm, or BHIM</span>
                  </div>

                  <div className="upi-details-section">
                    <div className="upi-detail-item">
                      <span className="upi-label">UPI ID / VPA:</span>
                      <div className="upi-val-row">
                        <strong className="upi-id-highlight">{officialUpiId}</strong>
                        <button
                          type="button"
                          className="upi-copy-btn"
                          onClick={copyUpiId}
                        >
                          {copiedUpi ? '✓ Copied' : 'Copy'}
                        </button>
                      </div>
                    </div>

                    <div className="upi-detail-item">
                      <span className="upi-label">Account Holder:</span>
                      <span className="upi-val">{accountHolder}</span>
                    </div>

                    <a
                      href={upiIntentUrl}
                      className="upi-mobile-intent-btn"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      🚀 Open UPI App on Mobile
                    </a>
                  </div>
                </div>

                {/* UTR Submission Form */}
                <form className="upi-utr-form" onSubmit={handleVerifyUtr}>
                  <label htmlFor="upi-utr-input" className="payment-input-label">
                    Enter 12-digit UTR / UPI Transaction Reference:
                  </label>
                  <div className="upi-utr-input-row">
                    <input
                      id="upi-utr-input"
                      type="text"
                      className="payment-text-input"
                      placeholder="e.g. 432198765432"
                      value={utrNumber}
                      onChange={(e) => setUtrNumber(e.target.value)}
                      maxLength={30}
                      required
                    />
                    <button
                      type="submit"
                      className="payment-btn-verify"
                      disabled={loading}
                    >
                      {loading ? 'Verifying…' : 'Activate Plan'}
                    </button>
                  </div>
                </form>

                {error && <div className="payment-error-alert" role="alert">{error}</div>}
              </div>
            )}

            {/* Footer Trust Guarantee */}
            <div className="payment-modal-footer">
              <div className="payment-trust-item">
                <span>🔒 256-bit SSL Encrypted</span>
              </div>
              <div className="payment-trust-item">
                <span>⚡ Instant Account Activation</span>
              </div>
              <div className="payment-trust-item">
                <span>🇮🇳 Official Razorpay & UPI Verified</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </dialog>
  );
}
