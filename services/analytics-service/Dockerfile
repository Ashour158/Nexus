# -- Stage 1: Install dependencies ------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@latest --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/ ./packages/
COPY services/analytics-service/package.json ./services/analytics-service/

RUN pnpm install --frozen-lockfile --filter analytics-service...

# -- Stage 2: Build ----------------------------------------------------------------
FROM deps AS builder
COPY services/analytics-service/ ./services/analytics-service/
COPY packages/ ./packages/

RUN pnpm --filter analytics-service run build

# -- Stage 3: Production runner ----------------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 service

COPY --from=builder --chown=service:nodejs /app/services/analytics-service/dist ./dist
COPY --from=builder --chown=service:nodejs /app/services/analytics-service/package.json ./package.json
COPY --from=builder --chown=service:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=service:nodejs /app/packages ./packages

USER service
EXPOSE 3008
ENV NODE_ENV=production PORT=3008

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://localhost:3008/health || exit 1

CMD ["node", "dist/index.js"]