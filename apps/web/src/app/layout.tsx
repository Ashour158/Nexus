import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus CRM',
  description: 'Enterprise revenue platform — Nexus CRM',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'default',
    title: 'NEXUS CRM',
  },
  // CSP is now enforced via HTTP response headers (fastify-helmet) for stronger protection
  // Meta-tag CSP is redundant and can be bypassed in some scenarios
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <head>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              /* The old caching service worker pinned users to a stale app
                 shell. Unregister any existing SW and clear caches on every
                 load; re-registering /sw.js (now a kill-switch) is intentionally
                 removed until offline support is redone network-first. */
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', function() {
                  navigator.serviceWorker.getRegistrations().then(function(registrations) {
                    registrations.forEach(function(registration) { registration.unregister(); });
                  }).catch(function(){});
                  if (window.caches && caches.keys) {
                    caches.keys().then(function(keys) {
                      keys.forEach(function(k) { caches.delete(k); });
                    }).catch(function(){});
                  }
                });
              }
            `,
          }}
        />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
