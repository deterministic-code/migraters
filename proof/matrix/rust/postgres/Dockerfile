FROM rust:1-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl postgresql-client && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
COPY . .
ARG MIGRATERS_SOURCE=published
RUN if [ "$MIGRATERS_SOURCE" = local ]; then npm install ./packs/deterministic-code-migraters-*.tgz; else npm install @deterministic-code/migraters; fi
RUN npx migrate-init --language rust --dialect postgres
CMD ["./e2e.sh"]
