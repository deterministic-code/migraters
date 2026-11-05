FROM --platform=linux/amd64 mcr.microsoft.com/dotnet/sdk:9.0
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl apt-transport-https gnupg && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL https://packages.microsoft.com/keys/microsoft.asc | gpg --dearmor -o /usr/share/keyrings/microsoft-prod.gpg
RUN echo "deb [arch=amd64 signed-by=/usr/share/keyrings/microsoft-prod.gpg] https://packages.microsoft.com/debian/12/prod bookworm main" > /etc/apt/sources.list.d/microsoft-prod.list
RUN apt-get update && ACCEPT_EULA=Y apt-get install -y mssql-tools18 unixodbc-dev && rm -rf /var/lib/apt/lists/*
ENV PATH="/opt/mssql-tools18/bin:$PATH"
COPY . .
ARG MIGRATERS_SOURCE=published
RUN if [ "$MIGRATERS_SOURCE" = local ]; then npm install ./packs/deterministic-code-migraters-*.tgz; else npm install @deterministic-code/migraters; fi
RUN npx migrate-init --language csharp --dialect sqlserver
CMD ["./e2e.sh"]
