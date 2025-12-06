FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root monorepo files (Railway builds from root context)
COPY package.json pnpm-workspace.yaml ./
# Copy server package files
COPY server/package*.json ./server/
COPY server/prisma ./server/prisma/
COPY server/prisma.config.ts ./server/

# Install dependencies
RUN pnpm install

# Copy server source code
COPY server/ ./server/

# Build server (Railway may also run: pnpm --filter server build)
RUN pnpm --filter server build

FROM node:22-alpine

# Install pnpm in runtime image (REQUIRED for Railway's start command)
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app

# Copy root monorepo files (needed for pnpm --filter to work)
COPY package.json pnpm-workspace.yaml ./
# Copy server built files
COPY --from=builder /app/server/dist ./server/dist
COPY --from=builder /app/server/node_modules ./server/node_modules
COPY --from=builder /app/server/package*.json ./server/
COPY --from=builder /app/server/prisma ./server/prisma/
COPY --from=builder /app/server/prisma.config.ts ./server/

EXPOSE 3000

# Railway overrides this with: pnpm --filter server start
# pnpm must be installed and monorepo structure must be present
CMD ["pnpm", "--filter", "server", "start"]
