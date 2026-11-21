import type { Metadata, Viewport } from 'next';
import './globals.css';
import { ToastProvider } from '@/components/toast';
import { GlobalBackground } from '@/components/ui/global-background';

export const metadata: Metadata = {
  title: 'IamHujju — Frontier AI, for everyone',
  description: 'A multi-provider AI playground with transparent token metering. Start free, paste any provider key, go live instantly.',
};

export const viewport: Viewport = { themeColor: '#04140e' };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preload" href="/fonts/outfit-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <link rel="preload" href="/fonts/inter-var.woff2" as="font" type="font/woff2" crossOrigin="anonymous" />
        <script
          dangerouslySetInnerHTML={{ __html: `try{const t=localStorage.getItem('theme');if(t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches))document.documentElement.classList.add('dark')}catch(e){}` }}
        />
      </head>
      <body>
        <GlobalBackground variant="page" />
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
