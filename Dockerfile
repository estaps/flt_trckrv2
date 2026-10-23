# syntax=docker/dockerfile:1
FROM node:22-trixie-slim AS deps
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
RUN npm run build

FROM node:22-trixie-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production PORT=3000 HOSTNAME=0.0.0.0
# poppler-utils provides pdftotext for reading PDFs.
# postgresql-client (17 on trixie) provides pg_dump for the pre-migration backup;
# it can dump Postgres 17 and older servers.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl postgresql-client poppler-utils \
  && rm -rf /var/lib/apt/lists/*
COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/dist/worker.js ./worker.js
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/node_modules/.prisma ./node_modules/.prisma
# The Prisma CLI runs migrations on startup; installed on its own so the standalone bundle stays small.
RUN npm install -g prisma@6.19.3 && npm cache clean --force
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh && mkdir -p /data/files /data/backups
VOLUME ["/data"]
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
CMD ["node", "server.js"]
