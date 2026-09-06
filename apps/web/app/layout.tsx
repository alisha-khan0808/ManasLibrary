import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';
import { ToastProvider } from '@/components/ui/Toast';
import { assertDemoModeIsSafe } from '@/lib/demo/config';

// Evaluated during `next build`: fails the build rather than shipping an
// authentication bypass to production.
assertDemoModeIsSafe();

// Self-hosted by next/font — no runtime request to Google, so the console
// stays free of third-party fetches and the fonts cannot fail to load.
const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-jakarta',
  display: 'swap',
});


export const metadata: Metadata = {
  title: {
    default: 'Manas Library',
    template: '%s · Manas Library',
  },
  description: 'Multi-branch library management for the Manas Library franchise.',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0f121c' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      className={jakarta.variable}
      suppressHydrationWarning
    >
      <head>
        {/* Applies the saved theme before first paint so a dark-mode user
            never sees a white flash. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('manas-theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(t==='dark'||(!t&&d))document.documentElement.classList.add('dark');}catch(e){}})();`,
          }}
        />
      </head>
      <body className="min-h-screen antialiased">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
