'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { api } from '@/lib/client';
import { Wordmark } from '@/components/ui/logo';

type Me = { user: { id: string; email: string; name: string | null; role: string; avatarUrl?: string | null } | null };

function initialsFor(name: string | null, email: string) {
  const source = name?.trim() || email;
  return source.slice(0, 2).toUpperCase();
}

function SunIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
      <circle cx="10" cy="10" r="3.5" />
      <path d="M10 2v2M10 16v2M2 10h2M16 10h2M4.3 4.3l1.4 1.4M14.3 14.3l1.4 1.4M15.7 4.3l-1.4 1.4M5.7 14.3l-1.4 1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16.5 12.5A7 7 0 0 1 7.5 3.5a7 7 0 1 0 9 9Z" />
    </svg>
  );
}

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

  useEffect(() => {
    if (!me) return;
    const beat = () => void api('/api/presence', { method: 'POST' }).catch(() => undefined);
    beat();
    const timer = window.setInterval(beat, 30_000);
    return () => window.clearInterval(timer);
  }, [me]);

  useEffect(() => { setOpen(false); }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

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
    { href: '/#about', label: 'About' },
    { href: '/#gallery', label: 'Gallery' },
    { href: '/playground', label: 'Playground' },
    { href: '/pricing', label: 'Pricing' },
    { href: '/dashboard', label: 'Dashboard' },
    { href: '/messages', label: 'Messages' },
    { href: '/keys', label: 'API keys' },
  ];

  return (
    <header className="glass relative sticky top-0 z-50 border-x-0 border-t-0">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link href="/" className="transition-opacity hover:opacity-80">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`relative rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors hover:bg-leaf/8 dark:hover:bg-leaf/10 ${pathname.startsWith(l.href) ? 'text-leaf-deep dark:text-leaf' : ''}`}
            >
              {l.label}
              {pathname.startsWith(l.href) && (
                <motion.span layoutId="nav-underline" className="absolute inset-x-3 -bottom-[1px] h-[2px] rounded-full bg-gradient-to-r from-leaf to-amber" />
              )}
            </Link>
          ))}
          {me?.role === 'ADMIN' && (
            <Link href="/admin" className="rounded-full px-3.5 py-1.5 text-sm font-medium text-leaf-deep dark:text-leaf">Admin</Link>
          )}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          <button onClick={toggleTheme} aria-label="Toggle dark mode" className="btn-ghost px-3 py-1.5 text-sm">
            {dark ? <SunIcon /> : <MoonIcon />}
          </button>
          {loaded && me ? (
            <>
              <Link
                href="/profile"
                title={`${me.name?.trim() || me.email} — profile`}
                className="group flex items-center gap-2 rounded-full border border-forest/10 py-1 pl-1 pr-3 transition-colors hover:border-leaf/40 dark:border-white/10"
              >
                {me.avatarUrl ? (
                  <img src={me.avatarUrl} alt="" className="h-7 w-7 rounded-full object-cover ring-1 ring-leaf/40" />
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-leaf-deep to-leaf text-[10px] font-bold text-cream ring-1 ring-leaf/40">
                    {initialsFor(me.name, me.email)}
                  </span>
                )}
                <span className="max-w-[110px] truncate text-xs font-medium">{me.name?.trim() || me.email}</span>
              </Link>
              <button onClick={signOut} className="btn-ghost px-4 py-1.5 text-sm">Sign out</button>
            </>
          ) : loaded ? (
            <>
              <Link href="/login" className="btn-ghost px-4 py-1.5 text-sm">Sign in</Link>
              <Link href="/signup" className="btn-leaf px-4 py-1.5 text-sm">Sign up</Link>
            </>
          ) : null}
        </div>

        <button className="btn-ghost px-3 py-1.5 text-sm md:hidden" onClick={() => setOpen(!open)} aria-label="Menu" aria-expanded={open}>☰</button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              key="nav-backdrop"
              className="fixed inset-0 z-[36] bg-forest/35 backdrop-blur-[2px] md:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              onClick={() => setOpen(false)}
              aria-hidden
            />
            <motion.div
              key="nav-drawer"
              className="bg-cream/80 absolute inset-x-0 top-full z-[38] origin-top border-t border-forest/8 px-4 py-3 backdrop-blur-xl md:hidden dark:border-white/10 dark:bg-forest/80"
              initial={{ opacity: 0, scaleY: 0.85, y: -10 }}
              animate={{ opacity: 1, scaleY: 1, y: 0 }}
              exit={{ opacity: 0, scaleY: 0.85, y: -10 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('a, button')) setOpen(false);
              }}
            >
          <div className="flex flex-col gap-1">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-medium transition-colors hover:bg-leaf/8 dark:hover:bg-leaf/10">{l.label}</Link>
            ))}
            {me?.role === 'ADMIN' && <Link href="/admin" className="rounded-lg px-3 py-2 text-sm font-medium text-leaf-deep dark:text-leaf">Admin</Link>}
            {me && <Link href="/profile" className="rounded-lg px-3 py-2 text-sm font-medium">Profile</Link>}
            <div className="mt-2 flex gap-2">
              {me ? (
                <>
                  <Link href="/profile" className="btn-leaf flex-1 px-4 py-2 text-center text-sm">Profile</Link>
                  <button onClick={signOut} className="btn-ghost flex-1 px-4 py-2 text-sm">Sign out</button>
                </>
              ) : (
                <>
                  <Link href="/login" className="btn-ghost flex-1 px-4 py-2 text-center text-sm">Sign in</Link>
                  <Link href="/signup" className="btn-leaf flex-1 px-4 py-2 text-center text-sm">Sign up</Link>
                </>
              )}
              <button onClick={toggleTheme} aria-label="Toggle dark mode" className="btn-ghost px-3 py-2 text-sm">{dark ? <SunIcon /> : <MoonIcon />}</button>
            </div>
          </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </header>
  );
}
