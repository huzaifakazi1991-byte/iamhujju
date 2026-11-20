import { useCallback, useState } from 'react';
import { resolvePlan } from './pricingConfig.js';

export async function loadRazorpayScript(retries = 2) {
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

export function useRazorpayCheckout({
  currentUser = null,
  onOpenAuth = null,
  onPaymentSuccess = null
} = {}) {
  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [activePlanId, setActivePlanId] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(null);

  const resetState = useCallback(() => {
    setLoading(false);
    setVerifying(false);
    setActivePlanId(null);
    setError('');
  }, []);

  const startCheckout = useCallback(async (planOrId, billingCycle = 'monthly') => {
    setError('');
    setSuccess(null);

    const plan = resolvePlan(planOrId, billingCycle);

    // Free tier doesn't require payment gateway
    if (plan.isFree) {
      return { success: true, isFree: true, plan };
    }

    // 1. Auth Check First:
    // If not signed in, persist intended plan in sessionStorage and trigger auth modal
    if (!currentUser) {
      try {
        sessionStorage.setItem('iamhujju_intended_plan', JSON.stringify({
          planId: plan.planId,
          basePlanId: plan.basePlanId || plan.planId,
          billingCycle: plan.billingCycle || billingCycle
        }));
      } catch {}

      if (typeof onOpenAuth === 'function') {
        onOpenAuth('login', {
          planId: plan.planId,
          billingCycle: plan.billingCycle || billingCycle,
          redirect: '/pricing'
        });
      }
      return { redirectedToAuth: true, plan };
    }

    setLoading(true);
    setActivePlanId(plan.planId);

    try {
      // 2. Create Order on Backend (POST /api/create-order)
      let orderRes = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          planId: plan.planId,
          billingCycle: plan.billingCycle || billingCycle,
          amount: plan.amountPaise,
          email: currentUser.email
        })
      });

      if (!orderRes.ok && orderRes.status === 404) {
        orderRes = await fetch('/api/payments/razorpay/create-order', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            planId: plan.planId,
            billingCycle: plan.billingCycle || billingCycle,
            amount: plan.amountPaise,
            email: currentUser.email
          })
        });
      }

      if (!orderRes.ok) {
        const errData = await orderRes.json().catch(() => ({}));
        throw new Error(errData?.error?.message || 'Could not initiate payment order.');
      }

      const orderData = await orderRes.json();
      const isScriptLoaded = await loadRazorpayScript(2);
      const activeKeyId = orderData.keyId || import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_U2RfhaS1IyP8oo';

      if (orderData.fallbackToDirectUpi) {
        return { success: false, fallbackToDirectUpi: true, orderData };
      }

      if (!isScriptLoaded || !window.Razorpay) {
        throw new Error('Razorpay secure checkout script could not be loaded. Please check your connection.');
      }

      if (!activeKeyId) {
        throw new Error('Razorpay merchant key is not active. Please contact support.');
      }

      // 3. Open Verified Razorpay Modal
      return new Promise((resolve) => {
        const options = {
          key: activeKeyId,
          amount: orderData.amount,
          currency: orderData.currency || 'INR',
          name: 'iamhujju',
          description: `${plan.title || plan.name} Subscription`,
          image: '/mascot.jpg',
          order_id: orderData.order_id || orderData.orderId,
          prefill: {
            name: currentUser?.displayName || currentUser?.email?.split('@')[0] || '',
            email: currentUser?.email || ''
          },
          theme: {
            color: '#09090B'
          },
          handler: async function (response) {
            setLoading(true);
            setVerifying(true);
            try {
              // Send razorpay_payment_id, razorpay_order_id, razorpay_signature to verify endpoint
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
                  planId: plan.planId,
                  billingCycle: plan.billingCycle || billingCycle,
                  email: currentUser.email
                })
              });

              if (!verifyRes.ok && verifyRes.status === 404) {
                verifyRes = await fetch('/api/payments/razorpay/verify', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    order_id: response.razorpay_order_id,
                    payment_id: response.razorpay_payment_id,
                    signature: response.razorpay_signature,
                    razorpay_order_id: response.razorpay_order_id,
                    razorpay_payment_id: response.razorpay_payment_id,
                    razorpay_signature: response.razorpay_signature,
                    planId: plan.planId,
                    billingCycle: plan.billingCycle || billingCycle,
                    email: currentUser.email
                  })
                });
              }

              const verifyData = await verifyRes.json();
              if (verifyRes.ok && verifyData.success) {
                setSuccess(verifyData);
                try {
                  sessionStorage.removeItem('iamhujju_intended_plan');
                } catch {}

                if (typeof onPaymentSuccess === 'function') {
                  onPaymentSuccess(verifyData.user || { ...currentUser, tier: verifyData.tier || plan.basePlanId || plan.planId });
                }
                resolve({ success: true, data: verifyData });
              } else {
                const msg = verifyData?.error?.message || 'Payment signature verification failed.';
                setError(msg);
                resolve({ success: false, error: msg });
              }
            } catch (vErr) {
              const msg = vErr.message || 'Network error verifying transaction.';
              setError(msg);
              resolve({ success: false, error: msg });
            } finally {
              setLoading(false);
              setVerifying(false);
              setActivePlanId(null);
            }
          },
          modal: {
            ondismiss: function () {
              setLoading(false);
              setVerifying(false);
              setActivePlanId(null);
              setError('Payment checkout cancelled. You can retry at any time.');
              resolve({ success: false, cancelled: true });
            }
          }
        };

        const rzp = new window.Razorpay(options);
        rzp.on('payment.failed', function (resp) {
          setLoading(false);
          setVerifying(false);
          setActivePlanId(null);
          const reason = resp.error?.description || resp.error?.reason || 'Transaction could not be completed.';
          setError(`Payment failed: ${reason}`);
          resolve({ success: false, failed: true, error: reason });
        });

        rzp.open();
        setLoading(false);
      });
    } catch (err) {
      setError(err.message || 'Checkout failed.');
      setLoading(false);
      setVerifying(false);
      setActivePlanId(null);
      return { success: false, error: err.message };
    }
  }, [currentUser, onOpenAuth, onPaymentSuccess]);

  return {
    startCheckout,
    loading,
    verifying,
    activePlanId,
    error,
    success,
    resetState
  };
}
