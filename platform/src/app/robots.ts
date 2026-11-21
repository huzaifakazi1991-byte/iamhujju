import type { MetadataRoute } from 'next';
import { env } from '@/lib/env';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/api/', '/admin', '/admin/', '/dashboard', '/settings', '/keys', '/billing', '/playground'],
      },
    ],
    sitemap: `${env.appUrl}/sitemap.xml`,
  };
}
