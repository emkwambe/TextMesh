FROM node:25-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/config/package.json ./packages/config/
COPY packages/db-client/package.json ./packages/db-client/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY services/post-service/package.json ./services/post-service/

RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY services/post-service ./services/post-service

RUN pnpm --filter @textmesh/shared-types build
RUN pnpm --filter @textmesh/logger build
RUN pnpm --filter @textmesh/config build
RUN pnpm --filter @textmesh/db-client build
RUN pnpm --filter @textmesh/event-bus build
RUN pnpm --filter @textmesh/post-service build

FROM node:25-alpine AS production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
RUN addgroup -g 1001 -S nodejs && adduser -S textmesh -u 1001

COPY --from=builder /app/package.json ./
COPY --from=builder /app/pnpm-workspace.yaml ./
COPY --from=builder /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/*/package.json ./packages/
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/services/post-service/package.json ./services/post-service/
COPY --from=builder /app/services/post-service/dist ./services/post-service/dist

RUN pnpm install --frozen-lockfile --prod
USER textmesh

ENV NODE_ENV=production
ENV POST_SERVICE_PORT=3003
EXPOSE 3003

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3003/health || exit 1

CMD ["node", "services/post-service/dist/index.js"]
