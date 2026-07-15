# -- Stage 1: Install dependencies ------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/notification-service/package.json ./services/notification-service/

RUN pnpm install --shamefully-hoist --no-frozen-lockfile --filter @nexus/notification-service...

# -- Stage 2: Build ----------------------------------------------------------------
FROM deps AS builder
COPY services/notification-service/ ./services/notification-service/
COPY packages/ ./packages/

RUN pnpm --filter @nexus/notification-service run db:generate
RUN pnpm --filter @nexus/notification-service... run build

# -- Stage 3: Production runner ----------------------------------------------------
RUN find /app/services -path "*/src/*" -type f ! -name "*.ts" | while read f; do d="${f%/src/*}/dist/${f#*/src/}"; mkdir -p "$(dirname "$d")"; cp "$f" "$d"; done

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 service

COPY --from=builder --chown=service:nodejs /app/services/notification-service/dist ./dist
COPY --from=builder --chown=service:nodejs /app/services/notification-service/package.json ./package.json
COPY --from=builder --chown=service:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=service:nodejs /app/packages ./packages

RUN apk add --no-cache openssl && ln -sf /app/node_modules /node_modules
USER service
EXPOSE 3003
ENV NODE_ENV=production PORT=3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3003/health || exit 1

CMD ["node", "dist/index.js"]
