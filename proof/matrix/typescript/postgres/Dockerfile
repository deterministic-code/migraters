FROM node:22-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl postgresql-client && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm install ./packs/deterministic-code-migraters-*.tgz
RUN npx migrate-init --language typescript --dialect postgres
CMD ["./e2e.sh"]
