FROM rust:1-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl default-mysql-client && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
COPY . .
RUN npm install ./packs/deterministic-code-migraters-*.tgz
RUN npx migrate-init --language rust --dialect mysql
CMD ["./e2e.sh"]
