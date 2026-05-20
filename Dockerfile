# Use lightweight slim Node LTS base image
FROM node:20-slim

# Create and define app directory
WORKDIR /app

# Ensure we install openssl for secure networking if needed
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# Copy package descriptors first to maximize caching
COPY package*.json ./

# Install dependencies (only production)
RUN npm ci --omit=dev

# Copy application source code
COPY . .

# Set up local volume mount point for SQLite database persistence
ENV DATABASE_PATH=/data/database.sqlite
ENV PORT=3000
ENV NODE_ENV=production

# Create persistent data directory with correct permissions
RUN mkdir -p /data

# Expose port 3000
EXPOSE 3000

# Execute server boot sequence
CMD ["node", "backend/server.js"]
