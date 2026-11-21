'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { LeafMark } from '@/components/ui/logo';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[app] unhandled error:', error);
  }, [error]);

  return (
    <main className="hero-glow flex min-h-screen items-center justify-center px-4 py-16 sm:px-6">
      <div className="glass-strong mx-auto max-w-md rounded-[1.5rem] p-10 text-center">
        <LeafMark className="mx-auto mb-6 h-14 w-14" />
        <p className="text-caption">Something went wrong</p>
        <h1 className="text-h2 mt-2">A branch snapped.</h1>
        <p className="text-body-soft mx-auto mt-3 max-w-sm text-sm leading-relaxed">
          An unexpected error occurred. It has been logged — try again, and if it persists the team can trace it via the digest.
        </p>
        {error.digest && <p className="mt-3 font-mono text-xs opacity-60">digest: {error.digest}</p>}
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <button onClick={reset} className="btn-leaf px-6 py-2.5 text-sm">Try again</button>
          <Link href="/" className="btn-ghost px-6 py-2.5 text-sm">Back home</Link>
        </div>
      </div>
    </main>
  );
}
