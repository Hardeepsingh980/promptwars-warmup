# Haqdar runs as a small Node server. No build step is needed.
FROM node:22-slim

ENV NODE_ENV=production
WORKDIR /app

# Install only production packages, from the lock file.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY server.js ./
COPY src ./src
COPY shared ./shared
COPY public ./public

# The JSON database lives here. On Cloud Run this path is a Cloud Storage volume.
ENV DATA_FILE=/data/haqdar.json
RUN mkdir -p /data && chown node:node /data

# Run as the unprivileged user that the Node image provides.
USER node

# Cloud Run sets PORT. The server reads it from the environment.
EXPOSE 8080
CMD ["node", "server.js"]
