# -- Stage 1: Install dependencies ------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat openssl
RUN corepack enable && corepack prepare pnpm@9.1.0 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/document-service/package.json ./services/document-service/

RUN pnpm install --shamefully-hoist --no-frozen-lockfile --filter @nexus/document-service...

# -- Stage 2: Build ----------------------------------------------------------------
FROM deps AS builder
COPY services/document-service/ ./services/document-service/
COPY packages/ ./packages/

RUN pnpm --filter @nexus/document-service run db:generate
RUN pnpm --filter @nexus/document-service... run build

# -- Stage 3: Production runner ----------------------------------------------------
RUN find /app/services -path "*/src/*" -type f ! -name "*.ts" | while read f; do d="${f%/src/*}/dist/${f#*/src/}"; mkdir -p "$(dirname "$d")"; cp "$f" "$d"; done

FROM node:20-alpine AS runner
WORKDIR /app

RUN addgroup --system --gid 1001 nodejs \
 && adduser --system --uid 1001 service

COPY --from=builder --chown=service:nodejs /app/services/document-service/dist ./dist
COPY --from=builder --chown=service:nodejs /app/services/document-service/package.json ./package.json
COPY --from=builder --chown=service:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=service:nodejs /app/packages ./packages

# Chromium for Puppeteer PDF rendering (Alpine has no bundled browser). Install
# the system chromium + fonts and tell Puppeteer to use it instead of trying to
# download/run its own (which won't run on musl/Alpine).
RUN apk add --no-cache openssl chromium nss freetype harfbuzz ttf-freefont \
 && ln -sf /app/node_modules /node_modules
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser PUPPETEER_SKIP_DOWNLOAD=true
USER service
EXPOSE 3016
ENV NODE_ENV=production PORT=3016

HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3016/health || exit 1

CMD ["node", "dist/index.js"]
