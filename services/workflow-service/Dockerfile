FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate

FROM base AS deps
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY tsconfig.base.json ./
COPY packages/ ./packages/
COPY services/workflow-service/package.json ./services/workflow-service/
RUN pnpm install --frozen-lockfile

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/packages ./packages
COPY tsconfig.base.json ./
COPY packages ./packages
COPY services/workflow-service ./services/workflow-service
WORKDIR /app/services/workflow-service
RUN pnpm prisma generate --schema=./prisma/schema.prisma
RUN pnpm build

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3007
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nexus
COPY --from=builder --chown=nexus:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nexus:nodejs /app/packages ./packages
COPY --from=builder --chown=nexus:nodejs /app/services/workflow-service/dist ./services/workflow-service/dist
COPY --from=builder --chown=nexus:nodejs /app/services/workflow-service/package.json ./services/workflow-service/package.json
COPY --from=builder --chown=nexus:nodejs /app/services/workflow-service/prisma ./services/workflow-service/prisma
COPY --from=builder --chown=nexus:nodejs /app/node_modules/.prisma/workflow-client ./node_modules/.prisma/workflow-client
COPY --from=builder --chown=nexus:nodejs /app/node_modules/@prisma ./node_modules/@prisma
USER nexus
WORKDIR /app/services/workflow-service
EXPOSE 3007
CMD ["node", "dist/index.js"]
