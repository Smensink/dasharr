# Build stage for frontend
FROM node:22-alpine AS frontend-builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@latest

# Copy workspace files
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/web/package.json ./apps/web/

# Install dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source files
COPY packages/shared-types ./packages/shared-types
COPY apps/web ./apps/web

# Build from root workspace
WORKDIR /app

# Build shared types first using root typescript
WORKDIR /app/packages/shared-types
RUN ../../node_modules/.bin/tsc

# Build frontend
WORKDIR /app/apps/web
RUN ../../node_modules/.bin/tsc && ../../node_modules/.bin/vite build

# Build stage for backend
FROM node:22-alpine AS backend-builder

WORKDIR /app

# Install pnpm
RUN npm install -g pnpm@latest

# Copy workspace files
COPY .npmrc pnpm-workspace.yaml package.json pnpm-lock.yaml* ./
COPY packages/shared-types/package.json ./packages/shared-types/
COPY apps/api/package.json ./apps/api/

# Install dependencies (including devDependencies needed for build)
RUN pnpm install --frozen-lockfile || pnpm install

# Copy source files
COPY packages/shared-types ./packages/shared-types
COPY apps/api ./apps/api

# Build from root workspace
WORKDIR /app

# Build shared types first using root typescript
WORKDIR /app/packages/shared-types
RUN ../../node_modules/.bin/tsc

# Build backend
WORKDIR /app/apps/api
RUN ../../node_modules/.bin/tsc

# Production stage
FROM node:22-alpine

# Set NODE_ENV to production
ENV NODE_ENV=production

# Install dumb-init for proper signal handling and su-exec for user switching
RUN apk add --no-cache dumb-init su-exec

# Install pnpm
RUN npm install -g pnpm@latest

# Create non-root user
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copy workspace files and package.json files
COPY --from=backend-builder --chown=nodejs:nodejs /app/pnpm-workspace.yaml ./
COPY --from=backend-builder --chown=nodejs:nodejs /app/package.json ./
COPY --from=backend-builder --chown=nodejs:nodejs /app/pnpm-lock.yaml* ./
COPY --from=backend-builder --chown=nodejs:nodejs /app/packages/shared-types/package.json ./packages/shared-types/
COPY --from=backend-builder --chown=nodejs:nodejs /app/apps/api/package.json ./apps/api/

# Install production dependencies
RUN pnpm install --frozen-lockfile --prod || pnpm install --prod

# Copy built files maintaining workspace structure
COPY --from=backend-builder --chown=nodejs:nodejs /app/apps/api/dist ./apps/api/dist
COPY --from=backend-builder --chown=nodejs:nodejs /app/packages/shared-types/dist ./packages/shared-types/dist

# Copy built frontend to be served by backend (relative to api dist folder)
COPY --from=frontend-builder --chown=nodejs:nodejs /app/apps/web/dist ./apps/api/public

# Copy entrypoint script
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3000/api/v1/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Use dumb-init to handle signals properly, then entrypoint for permissions
ENTRYPOINT ["dumb-init", "--", "/entrypoint.sh"]

# Start the application
CMD ["node", "apps/api/dist/server.js"]
