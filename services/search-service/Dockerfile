FROM node:22-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/db-client/package.json ./packages/db-client/
COPY packages/event-bus/package.json ./packages/event-bus/
COPY services/search-service/package.json ./services/search-service/
RUN pnpm install --frozen-lockfile
COPY packages ./packages
COPY services/search-service ./services/search-service
RUN pnpm --filter @textmesh/shared-types build && pnpm --filter @textmesh/logger build && pnpm --filter @textmesh/db-client build && pnpm --filter @textmesh/event-bus build && pnpm --filter @textmesh/search-service build

FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate
RUN addgroup -g 1001 -S nodejs && adduser -S textmesh -u 1001
COPY --from=builder /app/package.json /app/pnpm-workspace.yaml /app/pnpm-lock.yaml ./
COPY --from=builder /app/packages/*/package.json ./packages/
COPY --from=builder /app/packages/*/dist ./packages/
COPY --from=builder /app/services/search-service/package.json ./services/search-service/
COPY --from=builder /app/services/search-service/dist ./services/search-service/dist
RUN pnpm install --frozen-lockfile --prod
USER textmesh
ENV NODE_ENV=production SEARCH_SERVICE_PORT=3008
EXPOSE 3008
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 CMD wget --no-verbose --tries=1 --spider http://localhost:3008/health || exit 1
CMD ["node", "services/search-service/dist/index.js"]
