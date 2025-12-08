FROM node:25-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/db-client/package.json ./packages/db-client/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY services/notification-service/package.json ./services/notification-service/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY services/notification-service ./services/notification-service
RUN pnpm --filter @textmesh/shared-types build && pnpm --filter @textmesh/logger build && pnpm --filter @textmesh/db-client build && pnpm --filter @textmesh/event-bus build && pnpm --filter @textmesh/notification-service build

FROM node:25-alpine AS production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
RUN addgroup -g 1001 -S nodejs && adduser -S textmesh -u 1001
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/*/package.json ./packages/
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/services/notification-service/package.json ./services/notification-service/
COPY --from=builder /app/services/notification-service/dist ./services/notification-service/dist
RUN pnpm install --frozen-lockfile --prod
USER textmesh
ENV NODE_ENV=production NOTIFICATION_SERVICE_PORT=3006
EXPOSE 3006
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3006/health || exit 1
CMD ["node", "services/notification-service/dist/index.js"]
