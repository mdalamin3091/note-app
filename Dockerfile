# ---------- Stage 1: builder ----------
FROM node:20-alpine AS builder
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY src ./src

# dev dependencies fele dilam
RUN npm prune --omit=dev

# ---------- Stage 2: runtime ----------
FROM node:20-alpine
ENV NODE_ENV=production
ENV PORT=3050
WORKDIR /app

COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/src          ./src
COPY --from=builder --chown=node:node /app/package.json ./

USER node

EXPOSE 3050

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3050/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]