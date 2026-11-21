'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { Nav } from '@/components/nav';

function VerifyInner() {
  const params = useSearchParams();
  const [state, setState] = useState<'pending' | 'ok' | 'error'>('pending');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const token = params.get('token');
    if (!token) { setState('error'); setMessage('Missing verification token.'); return; }
    fetch(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(async (res) => {
        const data = (await res.json()) as { error?: string };
        if (res.ok) { setState('ok'); } else { setState('error'); setMessage(data.error ?? 'Verification failed.'); }
      })
      .catch(() => { setState('error'); setMessage('Network error during verification.'); });
  }, [params]);

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
