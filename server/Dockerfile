# ==============================================================================
# NanoLabs Control Center - Production Server Dockerfile
# Multi-stage build for optimal image size and minimal attack surface
# ==============================================================================

# Stage 1: Build & Dependencies
FROM node:22-alpine AS builder

WORKDIR /app

# Install build tools if needed
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY tsconfig.json ./
COPY prisma ./prisma/

RUN npm ci

# Generate Prisma client
RUN npx prisma generate

COPY src ./src/

# Compile TypeScript
RUN npm run build

# Remove development dependencies
RUN npm prune --omit=dev

# Stage 2: Production Runtime
FROM node:22-alpine AS runner

WORKDIR /app

# Install curl for container healthchecks
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV PORT=4000
ENV HOST=0.0.0.0

# Copy runtime files
COPY package*.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/prisma ./prisma

EXPOSE 4000

# Automatically sync database schema, seed default tenant/admin if empty, and start server
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/seed.js && node dist/server.js"]
