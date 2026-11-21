import Link from 'next/link';
import { Nav } from '@/components/nav';

export function LegalShell({ title, updated, children }: { title: string; updated: string; children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow px-4 py-16 sm:px-6">
        <article className="card mx-auto w-full max-w-3xl p-8 sm:p-10">
          <h1 className="text-h1">{title}</h1>
          <p className="text-caption mt-3">Last updated: {updated}</p>
          <div className="mt-8 flex flex-col gap-6">{children}</div>
          <p className="text-body-soft mt-10 border-t border-black/10 pt-6 text-sm dark:border-white/10">
            Questions about this page? Write to{' '}
            <a href="mailto:huzaifakazi1991@gmail.com" className="font-semibold text-leaf-deep hover:underline dark:text-leaf">
              huzaifakazi1991@gmail.com
            </a>
            , or continue browsing the <Link href="/" className="font-semibold text-leaf-deep hover:underline dark:text-leaf">home page</Link>.
          </p>
        </article>
      </main>
    </div>
  );
}

export function LegalH({ children }: { children: React.ReactNode }) {
  return <h2 className="text-h2">{children}</h2>;
}

export function LegalP({ children }: { children: React.ReactNode }) {
  return <p className="text-body-soft leading-relaxed">{children}</p>;
}
