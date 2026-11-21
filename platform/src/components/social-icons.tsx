'use client';

import { SOCIALS } from '@/lib/socials';
import { useToast } from '@/components/toast';

const ICONS: Record<string, React.ReactNode> = {
  youtube: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2 31 31 0 0 0 0 12a31 31 0 0 0 .5 5.8 3 3 0 0 0 2.1 2.1c1.9.6 9.4.6 9.4.6s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1A31 31 0 0 0 24 12a31 31 0 0 0-.5-5.8ZM9.6 15.6V8.4L15.8 12l-6.2 3.6Z" />
    </svg>
  ),
  telegram: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M23.9 3.6 20.3 20.5c-.3 1.2-1 1.5-2 .9l-5.6-4.1-2.7 2.6c-.3.3-.6.5-1.1.5l.4-5.7L19.6 5.5c.4-.4-.1-.6-.7-.2L6.2 12.9.6 11.1c-1.2-.4-1.2-1.2.3-1.8L22.3 2c1-.4 1.9.2 1.6 1.6Z" />
    </svg>
  ),
  linkedin: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M4.98 3.5C4.98 4.88 3.87 6 2.5 6S0 4.88 0 3.5 1.12 1 2.5 1s2.48 1.12 2.48 2.5ZM.2 8h4.6v14.8H.2V8Zm7.6 0h4.4v2h.1c.6-1.2 2.1-2.4 4.4-2.4 4.7 0 5.5 3.1 5.5 7.1v8.1h-4.6v-7.2c0-1.7 0-3.9-2.4-3.9s-2.8 1.9-2.8 3.8v7.3H7.8V8Z" />
    </svg>
  ),
  instagram: (
    <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" aria-hidden>
      <path d="M12 2.2c3.2 0 3.6 0 4.9.1 1.2.1 1.8.2 2.2.4.6.2 1 .5 1.4.9.4.4.7.8.9 1.4.2.4.4 1 .4 2.2.1 1.3.1 1.7.1 4.9s0 3.6-.1 4.9c-.1 1.2-.2 1.8-.4 2.2a3.8 3.8 0 0 1-.9 1.4c-.4.4-.8.7-1.4.9-.4.2-1 .4-2.2.4-1.3.1-1.7.1-4.9.1s-3.6 0-4.9-.1c-1.2-.1-1.8-.2-2.2-.4a3.8 3.8 0 0 1-1.4-.9 3.8 3.8 0 0 1-.9-1.4c-.2-.4-.4-1-.4-2.2C2.2 15.6 2.2 15.2 2.2 12s0-3.6.1-4.9c.1-1.2.2-1.8.4-2.2.2-.6.5-1 .9-1.4.4-.4.8-.7 1.4-.9.4-.2 1-.4 2.2-.4C8.4 2.2 8.8 2.2 12 2.2Zm0 2A5.8 5.8 0 1 0 17.8 10 5.8 5.8 0 0 0 12 4.2Zm0 9.5A3.8 3.8 0 1 1 15.8 10 3.8 3.8 0 0 1 12 13.7Zm6-9.7a1.4 1.4 0 1 1-1.4-1.4 1.4 1.4 0 0 1 1.4 1.4Z" transform="translate(0 2)" />
    </svg>
  ),
};

export function SocialIcons({ className = '' }: { className?: string }) {
  const { toast } = useToast();
  return (
    <div className={`flex flex-wrap items-center gap-3 ${className}`}>
      {SOCIALS.map((s) =>
        s.href ? (
          <a
            key={s.id}
            href={s.href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`IamHujju on ${s.label} (${s.handle})`}
            title={`${s.label} · ${s.handle}`}
            className="flex h-11 w-11 items-center justify-center rounded-full border border-forest/10 bg-cream/60 text-body-soft shadow-[0_1px_8px_rgba(13,31,21,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-leaf/50 hover:text-leaf-deep hover:shadow-[0_6px_20px_rgba(61,220,132,0.25)] dark:border-white/10 dark:bg-white/5 dark:text-sage dark:hover:border-leaf/50 dark:hover:text-leaf-glow"
          >
            {ICONS[s.id]}
          </a>
        ) : (
          <button
            key={s.id}
            type="button"
            aria-label={`IamHujju on ${s.label} (${s.handle})`}
            title={`${s.label} · ${s.handle}`}
            onClick={() => toast(`${s.label} link goes live shortly — for now, find us on Instagram @iam_hujju_`, 'info')}
            className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-forest/10 bg-cream/60 text-body-soft shadow-[0_1px_8px_rgba(13,31,21,0.08)] transition-all duration-200 hover:-translate-y-0.5 hover:border-leaf/50 hover:text-leaf-deep hover:shadow-[0_6px_20px_rgba(61,220,132,0.25)] dark:border-white/10 dark:bg-white/5 dark:text-sage dark:hover:border-leaf/50 dark:hover:text-leaf-glow"
          >
            {ICONS[s.id]}
          </button>
        ),
      )}
    </div>
  );
}
