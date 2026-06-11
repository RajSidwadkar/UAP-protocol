# Stage 1: builder
FROM node:20-alpine AS builder
WORKDIR /app

# Copy configuration and workspace definitions
COPY package*.json tsconfig.base.json ./
COPY packages/gateway/package*.json packages/gateway/

# Install all dependencies (including dev for build)
RUN npm ci --workspace=packages/gateway --ignore-scripts

# Copy source and build
COPY packages/gateway packages/gateway
RUN npm run build --workspace=packages/gateway

# Remove dev dependencies to leave only production modules in /app/node_modules
RUN npm prune --omit=dev --workspace=packages/gateway

# Stage 2: runtime
FROM node:20-alpine AS runtime
WORKDIR /app
RUN addgroup -S uap && adduser -S uap -G uap

# Copy root node_modules
COPY --from=builder /app/node_modules ./node_modules

# Setup gateway workspace
WORKDIR /app/packages/gateway
COPY --from=builder /app/packages/gateway/dist ./dist
# Copy workspace-specific node_modules (important for non-hoisted deps like jose)
COPY --from=builder /app/packages/gateway/node_modules ./node_modules
COPY --from=builder /app/packages/gateway/package.json ./package.json

USER uap
EXPOSE 3000
HEALTHCHECK CMD wget -qO- http://localhost:3000/health || exit 1
CMD ["node", "dist/main.js"]
