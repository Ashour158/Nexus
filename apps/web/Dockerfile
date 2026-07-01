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
RUN pnpm --filter "./apps/web..." build

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
