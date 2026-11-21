import Link from 'next/link';
import { Nav } from '@/components/nav';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/providers', label: 'Providers' },
  { href: '/admin/models', label: 'Models' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="border-b border-black/5 bg-cream-deep dark:border-white/10 dark:bg-night-soft">
        <div className="mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 py-2.5 sm:px-6">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium hover:bg-black/5 dark:hover:bg-white/10">
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
