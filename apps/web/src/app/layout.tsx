import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { getLocale } from 'next-intl/server';
import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus CRM',
  description: 'Enterprise revenue platform — Nexus CRM',
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  const dir = locale === 'ar' ? 'rtl' : 'ltr';

  return (
    <html lang={locale} dir={dir}>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}