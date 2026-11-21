'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Nav } from '@/components/nav';
import { useToast } from '@/components/toast';

function LinkVerify({ token }: { token: string }) {
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await res.json()) as { error?: string };
        if (res.ok) { setState('ok'); } else { setState('error'); setMessage(data.error ?? 'Verification failed.'); }
      })
      .catch(() => { setState('error'); setMessage('Network error during verification.'); });
  }, [token]);

  return (
    <div className="card mx-auto w-full max-w-md p-8 text-center">
      {state === 'pending' && <p className="text-ink-soft dark:text-white/60">Verifying your email…</p>}
      {state === 'ok' && (
        <>
          <div className="mb-3 text-4xl">✅</div>
          <h1 className="text-xl font-bold">Email verified</h1>
          <p className="mt-2 text-sm text-ink-soft dark:text-white/60">Your account is fully activated.</p>
          <Link href="/playground" className="btn-primary mt-6 inline-block px-6 py-2.5 text-sm">Go to playground</Link>
        </>
      )}
      {state === 'error' && (
        <>
          <div className="mb-3 text-4xl">⚠️</div>
          <h1 className="text-xl font-bold">Verification failed</h1>
          <p className="mt-2 text-sm text-ink-soft dark:text-white/60">{message}</p>
          <Link href="/login" className="btn-ghost mt-6 inline-block px-6 py-2.5 text-sm">Back to sign in</Link>
        </>
      )}
    </div>
  );
}

function OtpVerify({ initialEmail }: { initialEmail: string }) {
  const { toast } = useToast();
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy || code.length !== 6 || !email.trim()) return;
    setBusy(true);
    try {
      const res = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), code }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) {
        setDone(true);
        toast('Email verified — your account is fully active!', 'success');
      } else {
        toast(data.error ?? 'Verification failed', 'error');
      }
    } catch {
      toast('Network error during verification', 'error');
    } finally {
      setBusy(false);
    }
  }

  async function resend() {
    if (resendBusy || !email.trim()) return;
    setResendBusy(true);
    try {
      const res = await fetch('/api/auth/verify/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (res.ok) toast('A fresh 6-digit code is on its way to your inbox.', 'success');
      else toast(data.error ?? 'Could not resend code', 'error');
    } catch {
      toast('Network error while resending', 'error');
    } finally {
      setResendBusy(false);
    }
  }

  if (done) {
    return (
      <div className="card mx-auto w-full max-w-md p-8 text-center">
        <div className="mb-3 text-4xl">✅</div>
        <h1 className="text-xl font-bold">Email verified</h1>
        <p className="mt-2 text-sm text-ink-soft dark:text-white/60">Your account is fully activated.</p>
        <Link href="/playground" className="btn-primary mt-6 inline-block px-6 py-2.5 text-sm">Go to playground</Link>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="card mx-auto w-full max-w-md p-8">
      <div className="mb-3 text-center text-4xl" aria-hidden>📧</div>
      <h1 className="text-xl font-bold text-center">Verify your email</h1>
      <p className="mt-2 text-center text-sm text-ink-soft dark:text-white/60">
        Enter the 6-digit code we emailed you. It expires in 10 minutes.
      </p>
      <div className="mt-6 flex flex-col gap-4">
        <label className="block text-sm font-medium">
          Email
          <input className="input mt-1.5" required type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" />
        </label>
        <label className="block text-sm font-medium">
          Verification code
          <input
            className="input mt-1.5 text-center font-mono text-lg tracking-[0.5em]"
            required
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="••••••"
            autoComplete="one-time-code"
          />
        </label>
        <button className="btn-primary py-2.5 text-sm" disabled={busy || code.length !== 6 || !email.trim()}>
          {busy ? 'Verifying…' : 'Verify email'}
        </button>
        <button type="button" className="btn-ghost py-2 text-xs" onClick={resend} disabled={resendBusy || !email.trim()}>
          {resendBusy ? 'Sending…' : 'Didn\'t get the code? Resend'}
        </button>
      </div>
      <p className="mt-6 text-center text-xs text-ink-soft dark:text-white/45">
        Signed in already? <Link href="/playground" className="font-medium text-leaf-deep hover:underline dark:text-leaf">Back to the app</Link>
      </p>
    </form>
  );
}

function VerifyInner() {
  const params = useSearchParams();
  const token = params.get('token');
  const email = params.get('email') ?? '';
  if (token) return <LinkVerify token={token} />;
  return <OtpVerify initialEmail={email} />;
}

export default function VerifyPage() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow px-4 py-16 sm:px-6">
        <Suspense fallback={<div className="skeleton mx-auto h-72 w-full max-w-md" />}>
          <VerifyInner />
        </Suspense>
      </main>
    </div>
  );
}
