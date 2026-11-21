export type SocialLink = {
  id: 'youtube' | 'telegram' | 'linkedin' | 'instagram';
  label: string;
  handle: string;
  href: string | null;
};

export const SOCIALS: SocialLink[] = [
  { id: 'youtube', label: 'YouTube', handle: '@iamhujju', href: null },
  { id: 'telegram', label: 'Telegram', handle: '@iamhujju', href: null },
  { id: 'linkedin', label: 'LinkedIn', handle: 'huzaifa-kazi', href: null },
  {
    id: 'instagram',
    label: 'Instagram',
    handle: '@iam_hujju_',
    href: 'https://www.instagram.com/iam_hujju_/',
  },
];
