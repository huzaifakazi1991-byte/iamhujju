import Link from 'next/link';
import { Nav } from '@/components/nav';
import { LeafMark } from '@/components/ui/logo';

export default function NotFound() {
  return (
    <div className="min-h-screen">
      <Nav />
      <main className="hero-glow flex min-h-[70vh] items-center justify-center px-4 py-16 sm:px-6">
        <div className="glass-strong mx-auto max-w-md rounded-[1.5rem] p-10 text-center">
          <LeafMark className="mx-auto mb-6 h-14 w-14 animate-pulse" />
          <p className="text-caption">Error 404</p>
          <h1 className="text-h2 mt-2">This path is still wild forest.</h1>
          <p className="text-body-soft mx-auto mt-3 max-w-sm text-sm leading-relaxed">
            The page you requested doesn&apos;t exist — or was moved while nobody was watching.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/" className="btn-leaf px-6 py-2.5 text-sm">Back home</Link>
            <Link href="/playground" className="btn-ghost px-6 py-2.5 text-sm">Open playground</Link>
          </div>
        </div>
      </main>
    </div>
  );
}
