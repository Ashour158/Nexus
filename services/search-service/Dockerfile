FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/search-service/package.json ./services/search-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services/search-service ./services/search-service
WORKDIR /app/services/search-service
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3006
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nexus
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nexus:nodejs /app/packages ./packages
COPY --from=builder --chown=nexus:nodejs /app/services/search-service/dist ./services/search-service/dist
COPY --from=builder --chown=nexus:nodejs /app/services/search-service/package.json ./services/search-service/package.json
USER nexus
WORKDIR /app/services/search-service
EXPOSE 3006
CMD ["node", "dist/index.js"]
