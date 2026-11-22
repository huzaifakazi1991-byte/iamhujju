'use client';

import { useCallback, useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  GALLERY_FOLDERS,
  GALLERY_INTRO,
  galleryItemSlug,
  isGalleryVideo,
  type GalleryItem,
} from '@/lib/gallery';
import { GlassCard } from '@/components/ui/glass';
import { LandingMotion } from '@/components/landing-motion';

const EASE = [0.22, 1, 0.36, 1] as const;

function GalleryMedia({ item, lightbox }: { item: GalleryItem; lightbox?: boolean }) {
  if (isGalleryVideo(item)) {
    if (lightbox) {
      return (
        <video
          src={`/media/gallery/${item.file}`}
          poster={item.poster ? `/media/gallery/${item.poster}` : undefined}
          className="max-h-[60vh] w-full object-contain md:max-h-[80vh]"
          controls
          autoPlay
          playsInline
        />
      );
    }
    return (
      <video
        src={`/media/gallery/${item.file}`}
        poster={item.poster ? `/media/gallery/${item.poster}` : undefined}
        className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
        muted
        playsInline
        preload="metadata"
      />
    );
  }
  /* eslint-disable-next-line @next/next/no-img-element */
  return (
    <img
      src={`/media/gallery/${item.file}`}
      alt={item.title}
      loading="lazy"
      className={
        lightbox
          ? 'max-h-[60vh] w-full object-contain md:max-h-[80vh]'
          : 'h-full w-full object-cover transition-transform duration-500 group-hover:scale-105'
      }
    />
  );
}

export function GallerySection() {
  const [activeFolder, setActiveFolder] = useState(GALLERY_FOLDERS[0].id);
  const [openItem, setOpenItem] = useState<GalleryItem | null>(null);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);
    const on = () => setReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  const close = useCallback(() => setOpenItem(null), []);

  useEffect(() => {
    if (!openItem) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [openItem, close]);

  const folder = GALLERY_FOLDERS.find((f) => f.id === activeFolder) ?? GALLERY_FOLDERS[0];
  const allItems = GALLERY_FOLDERS.flatMap((f) => f.items);
  const totalCount = allItems.length;

  return (
    <GlassCard className="relative overflow-hidden p-8 sm:p-12">
      <div className="hero-glow pointer-events-none absolute inset-0 opacity-50" />
      <div className="relative">
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-leaf/35 bg-leaf/10 px-4 py-1 text-sm font-medium text-leaf-deep dark:text-leaf-glow">
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-leaf" />
          AI Gallery · {totalCount} frames
        </p>
        <h2 className="text-h1">Made by machines. Directed by words.</h2>
        <p className="text-body-soft mt-4 max-w-2xl text-[1.02rem] leading-relaxed">{GALLERY_INTRO}</p>

        <div className="mt-7 flex flex-wrap gap-2" role="tablist" aria-label="Gallery folders">
          {GALLERY_FOLDERS.map((f) => (
            <button
              key={f.id}
              role="tab"
              aria-selected={activeFolder === f.id}
              onClick={() => setActiveFolder(f.id)}
              className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 ${
                activeFolder === f.id
                  ? 'border-leaf/60 bg-leaf/15 text-leaf-deep shadow-[0_4px_16px_rgba(61,220,132,0.25)] dark:text-leaf-glow'
                  : 'border-forest/12 bg-cream/50 text-body-soft hover:border-leaf/40 hover:text-leaf-deep dark:border-white/10 dark:bg-white/5 dark:text-sage dark:hover:text-leaf-glow'
              }`}
            >
              <span aria-hidden>{f.icon}</span>
              {f.label}
              <span className="text-xs opacity-70">{f.items.length}</span>
            </button>
          ))}
        </div>
        <p className="text-caption mt-3">{folder.blurb}</p>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3" style={{ perspective: '1200px' }}>
          <AnimatePresence mode="popLayout" initial={false}>
            {folder.items.map((item, i) => (
              <motion.div
                key={`${folder.id}-${item.file}`}
                layout
                initial={{ opacity: 0, y: 24, rotateX: -8 }}
                animate={{ opacity: 1, y: 0, rotateX: 0 }}
                exit={{ opacity: 0, y: 12, scale: 0.96 }}
                transition={{ duration: reduced ? 0 : 0.45, delay: reduced ? 0 : i * 0.07, ease: EASE }}
                whileHover={reduced ? undefined : { rotateX: 3, rotateY: -5, scale: 1.03, z: 30 }}
                className="group cursor-pointer"
                style={{ transformStyle: 'preserve-3d' }}
                onClick={() => setOpenItem(item)}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenItem(item); } }}
                tabIndex={0}
                role="button"
                aria-label={`Open ${item.title}`}
                data-template={galleryItemSlug(item.file)}
              >
                <div className="glass card-hover overflow-hidden rounded-[1.25rem]">
                  <div className="relative aspect-[4/5] overflow-hidden">
                    <GalleryMedia item={item} />
                    {isGalleryVideo(item) && (
                      <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/30 bg-forest/60 text-cream shadow-lg backdrop-blur-md transition-transform duration-200 group-hover:scale-110" aria-hidden>
                        ▶
                      </span>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-forest/80 via-transparent to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4" style={{ transform: 'translateZ(40px)' }}>
                      <p className="font-display text-[0.95rem] font-bold leading-snug text-cream">
                        {item.title}
                        {isGalleryVideo(item) && <span className="ml-2 rounded-full bg-leaf/25 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wide text-cream/90">video</span>}
                      </p>
                      <p className="mt-1 line-clamp-2 text-xs text-cream/75">{item.why}</p>
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>

        <LandingMotion>
          <p className="text-caption mt-6 text-center">
            Want frames like these? Open any frame and tap <span className="font-semibold">🎨 Recreate this</span> in the{' '}
            <a href="/playground" className="font-medium text-leaf-deep underline decoration-leaf/50 underline-offset-4 hover:decoration-leaf dark:text-leaf">playground</a> —
            Gemini image models are one key away.
          </p>
        </LandingMotion>
      </div>

      <AnimatePresence>
        {openItem && (
          <motion.div
            className="fixed inset-0 z-[90] flex items-center justify-center p-4 sm:p-8"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{ perspective: '1400px' }}
            onClick={close}
            role="dialog"
            aria-modal="true"
            aria-label={openItem.title}
          >
            <div className="absolute inset-0 bg-forest/70 backdrop-blur-xl dark:bg-forest/85" />
            <motion.div
              className="glass-strong relative max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[1.5rem]"
              initial={reduced ? { opacity: 0 } : { opacity: 0, rotateY: -70, rotateX: 8, scale: 0.8, z: -260 }}
              animate={reduced ? { opacity: 1 } : { opacity: 1, rotateY: 0, rotateX: 0, scale: 1, z: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, rotateY: 55, scale: 0.85, z: -160 }}
              transition={{ type: 'spring', stiffness: 210, damping: 26 }}
              style={{ transformStyle: 'preserve-3d' }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="grid md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
                <div className="relative bg-forest/20">
                  <GalleryMedia item={openItem} lightbox />
                </div>
                <div className="flex flex-col justify-center gap-4 p-6 sm:p-8" style={{ transform: 'translateZ(50px)' }}>
                  <span className="text-caption">{folder.icon} {folder.label}</span>
                  <h3 className="font-display text-xl font-bold leading-snug sm:text-2xl">{openItem.title}</h3>
                  <p className="text-body-soft text-[0.95rem] leading-relaxed">{openItem.why}</p>
                  <p className="text-xs leading-relaxed text-body-soft">
                    <span className="font-semibold text-leaf-deep dark:text-leaf">How it was made:</span> {openItem.madeWith}
                  </p>
                  <a
                    href={`/playground?template=${galleryItemSlug(openItem.file)}`}
                    className="btn-primary mt-2 self-start px-5 py-2 text-sm"
                  >
                    🎨 Recreate this
                  </a>
                  <button type="button" className="btn-ghost self-start px-5 py-2 text-sm" onClick={close}>Close</button>
                </div>
              </div>
              <button
                type="button"
                onClick={close}
                aria-label="Close"
                className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-forest/50 text-cream transition-transform hover:scale-105"
              >
                ✕
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassCard>
  );
}
