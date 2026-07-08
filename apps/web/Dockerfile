FROM node:20-alpine AS base
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY apps/web/package.json ./apps/web/
COPY packages/ ./packages/
RUN pnpm install --no-frozen-lockfile --filter "./apps/web..."

FROM deps AS builder
COPY apps/web/ ./apps/web/
COPY packages/ ./packages/
ENV NEXT_TELEMETRY_DISABLED=1
# Point the browser at the same-origin BFF proxy paths (see next.config rewrites).
# NEXT_PUBLIC_* are inlined at build time, so they must be set before `next build`.
ENV NEXT_PUBLIC_AUTH_URL=/bff/auth \
    NEXT_PUBLIC_CRM_URL=/bff/crm \
    NEXT_PUBLIC_FINANCE_URL=/bff/finance \
    NEXT_PUBLIC_WF_URL=/bff/workflow \
    NEXT_PUBLIC_COMMS_URL=/bff/comms \
    NEXT_PUBLIC_NOTIFICATION_SERVICE_URL=/bff/notification \
    NEXT_PUBLIC_SEARCH_URL=/bff/search \
    NEXT_PUBLIC_STORAGE_URL=/bff/storage \
    NEXT_PUBLIC_ANALYTICS_URL=/bff/analytics \
    NEXT_PUBLIC_INTEGRATION_URL=/bff/integration \
    NEXT_PUBLIC_TICKET_URL=/bff/tickets \
    NEXT_PUBLIC_CAMPAIGN_URL=/bff/campaign
# Build workspace packages FIRST. apps/web imports @nexus/validation as a value
# (zod schemas), so its dist/ must exist before `next build` resolves it. The
# recursive `./apps/web...` selector did not reliably build deps, so build all
# publishable packages explicitly (packages without a build script are skipped).
RUN pnpm --filter "./packages/**" run build
RUN pnpm --filter @nexus/web run build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=nextjs:nodejs /app/apps/web/public ./apps/web/public
USER nextjs
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=10s CMD wget -qO- http://localhost:3000/api/health || exit 1
CMD ["node", "apps/web/server.js"]
