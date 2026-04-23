import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { AppProviders } from './providers';
import './globals.css';

export const metadata: Metadata = {
  title: 'Nexus CRM',
  description: 'Enterprise revenue platform — Nexus CRM',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
