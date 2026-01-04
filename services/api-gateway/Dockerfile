# =================================
# TEXTMESH API GATEWAY DOCKERFILE
# =================================

# Build stage
FROM node:25-alpine AS builder

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

# Copy workspace config
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY tsconfig.base.json ./

# Copy packages
COPY packages/shared-types/package.json ./packages/shared-types/
COPY packages/logger/package.json ./packages/logger/
COPY packages/config/package.json ./packages/config/
COPY packages/db-client/package.json ./packages/db-client/

# Copy service
COPY services/api-gateway/package.json ./services/api-gateway/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source code
COPY packages/shared-types ./packages/shared-types
COPY packages/logger ./packages/logger
COPY packages/config ./packages/config
COPY packages/db-client ./packages/db-client
COPY services/api-gateway ./services/api-gateway

# Build
RUN pnpm --filter @textmesh/shared-types build
RUN pnpm --filter @textmesh/logger build
RUN pnpm --filter @textmesh/config build
RUN pnpm --filter @textmesh/db-client build
RUN pnpm --filter @textmesh/api-gateway build

# Production stage
FROM node:25-alpine AS production

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@8.10.0 --activate

# Create non-root user
RUN addgroup -g 1001 -S nodejs && adduser -S textmesh -u 1001

# Copy built artifacts
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
COPY --from=builder /app/services/api-gateway/package.json ./services/api-gateway/
COPY --from=builder /app/services/api-gateway/dist ./services/api-gateway/dist

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod

# Switch to non-root user
USER textmesh

# Set environment
ENV NODE_ENV=production
ENV API_GATEWAY_PORT=8080

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:8080/health || exit 1

# Start
CMD ["node", "services/api-gateway/dist/index.js"]
