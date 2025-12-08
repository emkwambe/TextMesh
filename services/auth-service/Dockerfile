# =================================
# TEXTMESH AUTH SERVICE DOCKERFILE
# =================================

FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/config/package.json ./packages/config/
COPY packages/db-client/package.json ./packages/db-client/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY services/auth-service/package.json ./services/auth-service/

RUN pnpm install --frozen-lockfile

COPY packages ./packages
COPY services/auth-service ./services/auth-service

RUN pnpm --filter @textmesh/shared-types build
RUN pnpm --filter @textmesh/logger build
RUN pnpm --filter @textmesh/config build
RUN pnpm --filter @textmesh/db-client build
RUN pnpm --filter @textmesh/event-bus build
RUN pnpm --filter @textmesh/auth-service build

FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
RUN addgroup -g 1001 -S nodejs && adduser -S textmesh -u 1001

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=builder /app/packages/shared-types/dist ./packages/shared-types/dist
COPY --from=builder /app/packages/logger/package.json ./packages/logger/
COPY --from=builder /app/packages/logger/dist ./packages/logger/dist
COPY --from=builder /app/packages/config/package.json ./packages/config/
COPY --from=builder /app/packages/config/dist ./packages/config/dist
COPY --from=builder /app/packages/db-client/package.json ./packages/db-client/
COPY --from=builder /app/packages/db-client/dist ./packages/db-client/dist
COPY --from=builder /app/packages/event-bus/package.json ./packages/event-bus/
COPY --from=builder /app/packages/event-bus/dist ./packages/event-bus/dist
COPY --from=builder /app/services/auth-service/package.json ./services/auth-service/
COPY --from=builder /app/services/auth-service/dist ./services/auth-service/dist

RUN pnpm install --frozen-lockfile --prod
USER textmesh

ENV NODE_ENV=production
ENV AUTH_SERVICE_PORT=3001
EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

CMD ["node", "services/auth-service/dist/index.js"]
