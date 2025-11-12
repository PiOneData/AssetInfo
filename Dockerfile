# Multi-stage Dockerfile for building and running the AssetNext application
FROM node:20-alpine AS builder
WORKDIR /app

# Install basic build tools
RUN apk add --no-cache python3 make g++ libc6-compat

# Copy package metadata first for better cache use
COPY package.json package-lock.json* ./

# Install dependencies (use npm ci if lockfile present)
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy repo and run build (vite + esbuild server bundle)
COPY . .
RUN npm run build

# --- runtime image ---
FROM node:20-slim AS runner
WORKDIR /app

ENV NODE_ENV=production

# Create non-root user
RUN groupadd --system appgroup && useradd --system --gid appgroup appuser

# Install cross-platform installer creation tools
RUN apt-get update && apt-get install -y \
    # Windows installer tools
    nsis \
    # Basic utilities
    bash tar gzip \
    wget cpio \
    # Python for scripts
    python3 python3-pip \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts, data files, and package metadata as root so npm can write node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/static ./static
COPY --from=builder /app/build ./build
COPY --from=builder /app/server/data ./server/data
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/package.json ./package.json

# Install production dependencies as root (use --omit=dev to avoid npm's deprecated warning)
RUN if [ -f package-lock.json ]; then \
      npm ci --omit=dev --no-audit --no-fund; \
    else \
      npm install --omit=dev --no-audit --no-fund; \
    fi

# Fix permissions so the non-root user can run the app
RUN chown -R appuser:appgroup /app

USER appuser

EXPOSE 5926

HEALTHCHECK --interval=30s --timeout=10s --start-period=5s \
  CMD wget -qO- http://localhost:5926/api/health || exit 1

CMD ["node", "dist/production.js"]