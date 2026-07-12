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
  // Admin consolidation: retire confirmed duplicate twins by redirecting the
  // legacy route to its canonical admin route. Kept deliberately conservative —
  // only exact-duplicate pages are redirected. Settings/* pages are NOT mass
  // redirected; they remain where they are and are surfaced via the Admin hub.
  async redirects() {
    return [
      // Roles canonicalized under the unified Setup tree at /settings/roles
      // (/admin/roles now redirects there too).
      { source: '/roles', destination: '/settings/roles', permanent: false },
      // NOTE: the old '/settings/validation-rules -> /admin/validation-rules' redirect
      // was REMOVED — after the Setup consolidation /settings/validation-rules is the
      // canonical real page and /admin/validation-rules redirects TO it, so the old
      // rule created an infinite redirect loop.
      // Commissions existed twice: the finance-backed /commissions and the wired
      // incentive-backed /commission (plans + per-rep statements). Canonicalize on
      // /commission and retire the /commissions twin.
      { source: '/commissions', destination: '/commission', permanent: false },
      // Journeys existed at both /journeys and /command-center (same
      // workflow-service journey engine). Canonicalize on /command-center — the
      // builder that owns create + step editing. Order matters: the /new rule
      // must precede the :id rule so "new" is not treated as a journey id.
      { source: '/journeys/new', destination: '/command-center', permanent: false },
      { source: '/journeys/:id', destination: '/command-center/:id', permanent: false },
      { source: '/journeys', destination: '/command-center', permanent: false },
    ];
  },
  // Same-origin BFF proxy: the browser calls /bff/<domain>/* on the web origin and
  // Next proxies to the internal service over the Docker network. Avoids CORS and
  // keeps all backend traffic behind the single public web port.
  async rewrites() {
    return [
      { source: '/bff/auth/:path*', destination: 'http://auth-service:3000/api/v1/:path*' },
      { source: '/bff/crm/:path*', destination: 'http://crm-service:3001/api/v1/:path*' },
      { source: '/bff/finance/:path*', destination: 'http://finance-service:3002/api/v1/:path*' },
      // Setup pages (Global Picklist Sets, Page Layouts, Blueprint Transitions) call these.
      { source: '/bff/metadata/:path*', destination: 'http://metadata-service:3004/api/v1/:path*' },
      { source: '/bff/blueprint/:path*', destination: 'http://blueprint-service:3013/api/v1/:path*' },
      // Approval requests live on approval-service, not workflow-service. The
      // approvals UI calls them via the workflow BFF (apiClients.workflow), so
      // route just the /approval/* subpath to approval-service. Must precede the
      // general /bff/workflow rule below (Next matches rewrites in order).
      { source: '/bff/workflow/approval/:path*', destination: 'http://approval-service:3014/api/v1/approval/:path*' },
      { source: '/bff/workflow/:path*', destination: 'http://workflow-service:3007/api/v1/:path*' },
      { source: '/bff/comms/:path*', destination: 'http://comm-service:3009/api/v1/:path*' },
      { source: '/bff/notification/:path*', destination: 'http://notification-service:3003/api/v1/:path*' },
      { source: '/bff/search/:path*', destination: 'http://search-service:3006/api/v1/search/:path*' },
      // storage-service registers file routes under /api/v1 (e.g. /api/v1/files),
      // NOT /api/v1/storage — the extra segment 404s every upload/list call.
      { source: '/bff/storage/:path*', destination: 'http://storage-service:3010/api/v1/:path*' },
      { source: '/bff/analytics/:path*', destination: 'http://analytics-service:3008/api/v1/analytics/:path*' },
      { source: '/bff/integration/:path*', destination: 'http://integration-service:3012/api/v1/:path*' },
      { source: '/bff/tickets/:path*', destination: 'http://ticket-service:3029/api/v1/:path*' },
      { source: '/bff/campaign/:path*', destination: 'http://campaign-service:3025/api/v1/:path*' },
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
              // RR-H10: 'unsafe-eval' is a code-injection amplifier and is NOT
              // needed by any production client dependency (verified: the only
              // eval/Function use in the app is server-side dev-mock code, which
              // is not subject to browser CSP). It is kept ONLY in development,
              // where Next.js's webpack `eval` devtool / HMR require it.
              // 'unsafe-inline' stays for now: Next.js injects inline bootstrap
              // and framework runtime <script> tags without a per-request nonce,
              // so a strict nonce-based policy is a larger migration (tracked as a
              // follow-up — needs middleware nonce generation + propagation).
              isDevelopment
                ? "script-src 'self' 'unsafe-eval' 'unsafe-inline'"
                : "script-src 'self' 'unsafe-inline'",
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
