'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const fn = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', fn);
    return () => mq.removeEventListener('change', fn);
  }, []);
  return reduced;
}

export type BackgroundVariant = 'page' | 'app';

export function GlobalBackground({ variant = 'page' }: { variant?: BackgroundVariant }) {
  const reduced = usePrefersReducedMotion();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (reduced || !ref.current) return;
    let raf = 0;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(() => {
        if (ref.current) {
          const y = Math.min(window.scrollY, 4000);
          ref.current.style.transform = `translate3d(0, ${y * 0.25}px, 0)`;
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  const leaves = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: `${(i * 37 + 9) % 100}%`,
        size: 3 + ((i * 13) % 7),
        duration: `${22 + ((i * 11) % 18)}s`,
        delay: `${-(i * 5.3) % 26}s`,
        drift: `${8 + ((i * 17) % 20)}vw`,
      })),
    [],
  );

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        ref={ref}
        className="absolute inset-x-0 top-0 h-[115vh] will-change-transform"
        style={{ opacity: variant === 'app' ? 0.28 : 0.55 }}
      >
        <picture>
          <source srcSet="/media/grove-bg-960.avif 960w, /media/grove-bg-1920.avif 1920w" sizes="100vw" type="image/avif" />
          <source srcSet="/media/grove-bg-960.webp 960w, /media/grove-bg-1920.webp 1920w" sizes="100vw" type="image/webp" />
          <img
            src="/media/grove-bg-1920.webp"
            alt=""
            fetchPriority={variant === 'page' ? 'high' : 'low'}
            loading={variant === 'page' ? 'eager' : 'lazy'}
            decoding="async"
            className="h-full w-full object-cover object-center"
          />
        </picture>
      </div>

      <div
        className={
          variant === 'app'
            ? 'absolute inset-0 bg-cream/72 dark:bg-forest/88 backdrop-blur-[7px]'
            : 'absolute inset-0 bg-cream/55 dark:bg-forest/72 backdrop-blur-[2px]'
        }
      />
      <div
        className="absolute inset-0 bg-gradient-to-b from-forest/0 via-forest/0 to-cream/60 dark:via-forest/30 dark:to-forest/70"
      />

      {!reduced && (
        <div className="absolute inset-0 overflow-hidden">
          {leaves.map((l) => (
            <span
              key={l.id}
              className="leaf-particle"
              style={{
                left: l.left,
                width: l.size,
                height: l.size,
                ['--leaf-duration' as string]: l.duration,
                ['--leaf-drift-x' as string]: l.drift,
                animationDelay: l.delay,
                opacity: 0.5,
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
