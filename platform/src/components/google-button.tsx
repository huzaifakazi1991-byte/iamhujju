export function GoogleButton({ label }: { label: string }) {
  return (
    <a
      href="/api/auth/google/start"
      className="btn-ghost flex w-full items-center justify-center gap-2.5 py-2.5 text-sm"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="#4285F4"
          d="M23.52 12.27c0-.85-.08-1.66-.22-2.45H12v4.64h6.46a5.53 5.53 0 0 1-2.4 3.62v3h3.87c2.27-2.09 3.59-5.17 3.59-8.81Z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.24 0 5.96-1.07 7.94-2.91l-3.87-3c-1.08.72-2.45 1.15-4.06 1.15-3.13 0-5.78-2.11-6.72-4.96H1.29v3.09A12 12 0 0 0 12 24Z"
        />
        <path
          fill="#FBBC05"
          d="M5.29 14.27a7.2 7.2 0 0 1 0-4.54V6.64H1.29a12 12 0 0 0 0 10.72l4-3.09Z"
        />
        <path
          fill="#EA4335"
          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.43-3.43A11.97 11.97 0 0 0 12 0 12 12 0 0 0 1.29 6.64l4 3.09C6.22 6.88 8.87 4.75 12 4.75Z"
        />
      </svg>
      {label}
    </a>
  );
}
