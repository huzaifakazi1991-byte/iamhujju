import Link from 'next/link';
import { Nav } from '@/components/nav';

const TABS = [
  { href: '/admin', label: 'Overview' },
  { href: '/admin/providers', label: 'Providers' },
  { href: '/admin/models', label: 'Models' },
  { href: '/admin/plans', label: 'Plans' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/messages', label: 'Messages' },
  { href: '/admin/logs', label: 'Chat logs' },
  { href: '/admin/settings', label: 'Settings' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Nav />
      <div className="glass mx-auto mt-4 max-w-6xl rounded-full px-2 sm:px-3">
        <div className="flex gap-1 overflow-x-auto py-2">
          {TABS.map((t) => (
            <Link key={t.href} href={t.href} className="whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition-colors hover:bg-leaf/8 hover:text-leaf-deep dark:hover:bg-leaf/10 dark:hover:text-leaf">
              {t.label}
            </Link>
          ))}
        </div>
      </div>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
