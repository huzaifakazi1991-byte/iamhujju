export const PRESENCE_WINDOW_MS = 60_000;

export function isOnline(presenceLastSeen: Date | null | undefined): boolean {
  return Boolean(presenceLastSeen && Date.now() - presenceLastSeen.getTime() < PRESENCE_WINDOW_MS);
}

export const ONLINE_USER_SELECT = { id: true, name: true, role: true, avatarUrl: true, presenceLastSeen: true } as const;
