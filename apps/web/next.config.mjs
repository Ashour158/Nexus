import createNextIntlPlugin from 'next-intl/plugin';
import { withSentryConfig } from '@sentry/nextjs';
import bundleAnalyzer from '@next/bundle-analyzer';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === 'true' });
const isDevelopment = process.env.NODE_ENV === 'development';
const shouldUseStandaloneOutput =
  process.env.FORCE_STANDALONE_OUTPUT === '1' ||
  (process.platform !== 'win32' && process.env.SKIP_STANDALONE_OUTPUT !== '1');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Lint runs as a separate CI gate; ESLint style errors (e.g. unescaped
  // entities) should not block a production build/deploy.
  eslint: { ignoreDuringBuilds: true },
  // Standalone output uses symlinks; local Windows builds commonly fail with EPERM.
  // Linux/Docker keeps standalone by default, Windows can opt in with FORCE_STANDALONE_OUTPUT=1.
  ...(shouldUseStandaloneOutput ? { output: 'standalone' } : {}),
  poweredByHeader: false,
  compress: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'https', hostname: 'storage.googleapis.com' },
    ],
  },
  experimental: {
    serverComponentsExternalPackages: ['@prisma/client'],
    optimizePackageImports: ['lucide-react', '@nexus/shared-types'],
  },
  // Same-origin BFF proxy: the browser calls /bff/<domain>/* on the web origin and
  // Next proxies to the internal service over the Docker network. Avoids CORS and
  // keeps all backend traffic behind the single public web port.
  async rewrites() {
    return [
      { source: '/bff/auth/:path*', destination: 'http://auth-service:3000/api/v1/:path*' },
      { source: '/bff/crm/:path*', destination: 'http://crm-service:3001/api/v1/:path*' },
      { source: '/bff/finance/:path*', destination: 'http://finance-service:3002/api/v1/:path*' },
      { source: '/bff/workflow/:path*', destination: 'http://workflow-service:3007/api/v1/:path*' },
      { source: '/bff/comms/:path*', destination: 'http://comm-service:3009/api/v1/:path*' },
      { source: '/bff/notification/:path*', destination: 'http://notification-service:3003/api/v1/:path*' },
      { source: '/bff/search/:path*', destination: 'http://search-service:3006/api/v1/search/:path*' },
      { source: '/bff/storage/:path*', destination: 'http://storage-service:3010/api/v1/storage/:path*' },
      { source: '/bff/analytics/:path*', destination: 'http://analytics-service:3008/api/v1/analytics/:path*' },
      { source: '/bff/integration/:path*', destination: 'http://integration-service:3012/api/v1/:path*' },
    ];
  },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          {
            key: 'Content-Security-Policy',
            value: [
              "default-src 'self'",
              "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              "img-src 'self' data: blob: https:",
              "font-src 'self'",
              isDevelopment
                ? "connect-src 'self' http://localhost:* ws://localhost:* wss: https:"
                : "connect-src 'self' wss: https:",
              "frame-ancestors 'self'",
            ].join('; '),
          },
        ],
      },
    ];
  },
};

const withIntl = withNextIntl(nextConfig);

const finalConfig = withSentryConfig(withIntl, {
  silent: true,
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  widenClientFileUpload: true,
  hideSourceMaps: true,
  bundleSizeOptimizations: {
    excludeDebugStatements: true,
  },
});

export default withBundleAnalyzer(finalConfig);
