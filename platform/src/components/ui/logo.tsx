export function LeafMark({ className = 'h-8 w-8' }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" fill="none" aria-hidden className={className}>
      <defs>
        <linearGradient id="leaf-grad" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
          <stop stopColor="#7cf0ae" />
          <stop offset="1" stopColor="#1fa864" />
        </linearGradient>
      </defs>
      <rect x="1" y="1" width="30" height="30" rx="9" fill="url(#leaf-grad)" />
      <path
        d="M23 9c-7.5.6-12.2 3.8-13.4 9.4-.3 1.4-.3 2.8-.1 4.1C16.6 23 21.6 18 23 9Z"
        fill="#052b17"
        fillOpacity="0.82"
      />
      <path d="M9.5 22.5c1-4.5 4.5-8.5 9.5-10.5-2.8 4.3-5.6 8-9.5 10.5Z" fill="#7cf0ae" fillOpacity="0.65" />
    </svg>
  );
}

export function Wordmark() {
  return (
    <span className="flex items-center gap-2.5">
      <LeafMark />
      <span className="whitespace-nowrap font-display text-sm font-bold tracking-tight sm:text-lg">Ratnagiri_Enterprenuers</span>
    </span>
  );
}
