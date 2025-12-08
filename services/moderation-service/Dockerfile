FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/db-client/package.json ./packages/db-client/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY services/moderation-service/package.json ./services/moderation-service/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY services/moderation-service ./services/moderation-service
RUN pnpm --filter @textmesh/shared-types build && pnpm --filter @textmesh/logger build && pnpm --filter @textmesh/db-client build && pnpm --filter @textmesh/event-bus build && pnpm --filter @textmesh/moderation-service build

FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
RUN addgroup -g 1001 -S nodejs && adduser -S textmesh -u 1001
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/*/package.json ./packages/
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/services/moderation-service/package.json ./services/moderation-service/
COPY --from=builder /app/services/moderation-service/dist ./services/moderation-service/dist
RUN pnpm install --frozen-lockfile --prod
USER textmesh
ENV NODE_ENV=production MODERATION_SERVICE_PORT=3007
EXPOSE 3007
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3007/health || exit 1
CMD ["node", "services/moderation-service/dist/index.js"]
