# Build stage
FROM node:18-alpine as builder

# Create non-root user/group
RUN addgroup -S nodegroup && \
    adduser -S nodeuser -G nodegroup

# Set working directory and permissions
WORKDIR /usr/src/app
RUN chown nodeuser:nodegroup /usr/src/app

# Copy package files with explicit ownership
COPY --chown=nodeuser:nodegroup package*.json ./
COPY --chown=nodeuser:nodegroup lerna.json ./

# Install dependencies with security audit
RUN npm ci && \
    npm audit fix && \
    # Install lerna globally for build process
    npm install -g lerna@7.1.4

# Copy source code with proper permissions
COPY --chown=nodeuser:nodegroup . .

# Build TypeScript code and prune dev dependencies
RUN lerna bootstrap && \
    lerna run build && \
    npm prune --production

# Production stage
FROM node:18-alpine

# Create identical non-root user/group
RUN addgroup -S nodegroup && \
    adduser -S nodeuser -G nodegroup

# Set working directory with proper permissions
WORKDIR /usr/src/app
RUN chown nodeuser:nodegroup /usr/src/app

# Copy built artifacts from builder stage
COPY --from=builder --chown=nodeuser:nodegroup /usr/src/app/packages/*/dist ./dist/
COPY --from=builder --chown=nodeuser:nodegroup /usr/src/app/node_modules ./node_modules/
COPY --from=builder --chown=nodeuser:nodegroup /usr/src/app/packages/*/node_modules ./node_modules/

# Set secure environment variables
ENV NODE_ENV=production \
    PORT=3000 \
    # Explicitly disable npm update checks
    NO_UPDATE_NOTIFIER=1 \
    # Set Node.js memory limits
    NODE_OPTIONS="--max-old-space-size=2048" \
    # Set security headers
    SECURE_HEADERS=true

# Expose application port
EXPOSE 3000

# Implement comprehensive health check
HEALTHCHECK --interval=30s \
            --timeout=5s \
            --start-period=5s \
            --retries=3 \
            CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Set secure user context
USER nodeuser

# Define startup command with proper user
CMD ["node", "dist/server.js"]