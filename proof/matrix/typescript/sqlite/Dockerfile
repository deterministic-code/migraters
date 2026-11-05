FROM node:22-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl sqlite3 && rm -rf /var/lib/apt/lists/*
COPY . .
ARG MIGRATERS_SOURCE=published
RUN if [ "$MIGRATERS_SOURCE" = local ]; then npm install ./packs/deterministic-code-migraters-*.tgz; else npm install @deterministic-code/migraters; fi
RUN npx migrate-init --language typescript --dialect sqlite
CMD ["./e2e.sh"]
