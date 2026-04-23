FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/notification-service/package.json ./services/notification-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services/notification-service ./services/notification-service
WORKDIR /app/services/notification-service
RUN pnpm prisma generate --schema=./prisma/schema.prisma
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nexus
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nexus:nodejs /app/packages ./packages
COPY --from=builder --chown=nexus:nodejs /app/services/notification-service/dist ./services/notification-service/dist
COPY --from=builder --chown=nexus:nodejs /app/services/notification-service/package.json ./services/notification-service/package.json
COPY --from=builder --chown=nexus:nodejs /app/services/notification-service/prisma ./services/notification-service/prisma
COPY --from=builder --chown=nexus:nodejs /app/node_modules/.prisma/notification-client ./node_modules/.prisma/notification-client
COPY --from=builder --chown=nexus:nodejs /app/node_modules/@prisma ./node_modules/@prisma
USER nexus
WORKDIR /app/services/notification-service
EXPOSE 3003
CMD ["node", "dist/index.js"]
