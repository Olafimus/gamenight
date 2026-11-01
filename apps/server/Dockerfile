# Build context: repo root  (docker build -f apps/server/Dockerfile .)
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/server/package.json apps/server/
COPY apps/web/package.json apps/web/
# only server (+ shared via workspace link), production deps only (tsx is a runtime dep)
RUN npm ci --workspace @gamenight/server --include-workspace-root=false --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production PORT=3001
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY packages/shared ./packages/shared
COPY apps/server/package.json ./apps/server/
COPY apps/server/src ./apps/server/src
COPY apps/server/drizzle ./apps/server/drizzle
COPY apps/server/docker-entrypoint.sh ./apps/server/
RUN chmod +x apps/server/docker-entrypoint.sh && chown -R node:node /app
USER node
WORKDIR /app/apps/server
EXPOSE 3001
HEALTHCHECK --interval=15s --timeout=3s --start-period=20s --retries=5 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null || exit 1
ENTRYPOINT ["./docker-entrypoint.sh"]
