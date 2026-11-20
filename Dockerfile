ARG BUN_VERSION=1.4.4

FROM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY tsconfig.json gambrel.config.ts ./
COPY scripts ./scripts
COPY src ./src
RUN bun run build

FROM oven/bun:${BUN_VERSION} AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends aria2 \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    WAYFARER_HOST=0.0.0.0 \
    WAYFARER_PORT=8787 \
    WAYFARER_DATA_DIRECTORY=/data
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile --production
COPY --from=build /app/dist ./dist
RUN mkdir -p /data && chown bun:bun /data
USER bun
VOLUME ["/data"]
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["bun", "-e", "const port = process.env['WAYFARER_PORT'] ?? '8787'; fetch(`http://127.0.0.1:${port}/api/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
STOPSIGNAL SIGTERM
CMD ["bun", "dist/server/index.js"]
