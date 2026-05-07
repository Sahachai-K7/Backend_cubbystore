# syntax=docker/dockerfile:1.7

# ---- deps: install production-only node_modules ----
FROM oven/bun:1-alpine AS deps
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production

# ---- runner: minimal runtime image ----
FROM oven/bun:1-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Non-root user
RUN addgroup -S app && adduser -S app -G app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json bun.lock ./
COPY src ./src

# Persist uploads dir; in production mount /app/uploads as a volume
RUN mkdir -p /app/uploads/products && chown -R app:app /app

USER app
EXPOSE 3000

# Healthcheck against the existing /health endpoint
HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget --quiet --spider http://localhost:3000/health || exit 1

# Run pending migrations on boot, then start the server
CMD ["sh", "-c", "bun run src/db/migrate.ts && bun run src/index.ts"]
