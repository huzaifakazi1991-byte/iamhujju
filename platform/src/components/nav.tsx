'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { api } from '@/lib/client';

type Me = { user: { id: string; email: string; name: string | null; role: string } | null };

export function Nav() {
  const [me, setMe] = useState<Me['user']>(null);
  const [loaded, setLoaded] = useState(false);
  const [dark, setDark] = useState(false);
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    api<Me>('/api/auth/me').then((d) => setMe(d.user)).catch(() => setMe(null)).finally(() => setLoaded(true));
    setDark(document.documentElement.classList.contains('dark'));
  }, []);

  useEffect(() => { setOpen(false); }, [pathname]);

  function toggleTheme() {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle('dark', next);
    localStorage.setItem('theme', next ? 'dark' : 'light');
  }

  async function signOut() {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => undefined);
    setMe(null);
    router.push('/');
    router.refresh();
  }

  const links = [
    { href: '/playground', label: 'Playground' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/keys', label: 'API keys' },
  ];

  return (
    <header className="sticky top-0 z-50 glass">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <span className="inline-block h-7 w-7 rounded-lg" style={{ background: 'linear-gradient(135deg,#ff8205,#ffb347)' }} />
          IamHujju
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-black/5 dark:hover:bg-white/10 ${pathname.startsWith(l.href) ? 'text-agent' : ''}`}
            >
              {l.label}
            </Link>
          ))}
          {me?.role === 'ADMIN' && (
            <Link href="/admin" className="rounded-full px-3.5 py-1.5 text-sm font-medium text-agent">Admin</Link>
          )}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button onClick={toggleTheme} aria-label="Toggle dark mode" className="btn-ghost px-3 py-1.5 text-sm">
            {dark ? '☀️' : '🌙'}
          </button>
          {loaded && me ? (
            <>
              <span className="max-w-[140px] truncate text-xs text-ink-soft dark:text-white/60">{me.email}</span>
              <button onClick={signOut} className="btn-ghost px-4 py-1.5 text-sm">Sign out</button>
            </>
          ) : loaded ? (
            <>
              <Link href="/login" className="btn-ghost px-4 py-1.5 text-sm">Sign in</Link>
              <Link href="/signup" className="btn-primary px-4 py-1.5 text-sm">Sign up</Link>
            </>
          ) : null}
        </div>

        <button className="md:hidden btn-ghost px-3 py-1.5 text-sm" onClick={() => setOpen(!open)} aria-label="Menu">☰</button>
      </div>

      {open && (
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="border-t border-black/5 px-4 py-3 md:hidden dark:border-white/10">
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10">{l.label}</Link>
            ))}
            {me?.role === 'ADMIN' && <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-medium text-agent">Admin</Link>}
            <div className="mt-2 flex gap-2">
              {me ? (
                <button onClick={signOut} className="btn-ghost flex-1 px-4 py-2 text-sm">Sign out</button>
              ) : (
                <>
                  <Link href="/login" className="btn-ghost flex-1 px-4 py-2 text-center text-sm">Sign in</Link>
                  <Link href="/signup" className="btn-primary flex-1 px-4 py-2 text-center text-sm">Sign up</Link>
                </>
              )}
              <button onClick={toggleTheme} className="btn-ghost px-3 py-2 text-sm">{dark ? '☀️' : '🌙'}</button>
            </div>
          </div>
        </motion.div>
      )}
    </header>
  );
}
