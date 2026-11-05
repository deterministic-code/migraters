FROM --platform=linux/amd64 node:22-bookworm
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates curl libaio1 unzip && rm -rf /var/lib/apt/lists/*
RUN curl -fsSL -o /tmp/ic.zip https://download.oracle.com/otn_software/linux/instantclient/2326300/instantclient-basiclite-linux.x64-23.26.3.0.0.zip \
 && curl -fsSL -o /tmp/sqlplus.zip https://download.oracle.com/otn_software/linux/instantclient/2326300/instantclient-sqlplus-linux.x64-23.26.3.0.0.zip \
 && unzip -q /tmp/ic.zip -d /opt && unzip -q /tmp/sqlplus.zip -d /opt \
 && ln -s /opt/instantclient_* /opt/instantclient \
 && rm -f /tmp/ic.zip /tmp/sqlplus.zip
ENV LD_LIBRARY_PATH=/opt/instantclient
ENV ORACLE_CLIENT_LIB_DIR=/opt/instantclient
ENV PATH="/opt/instantclient:$PATH"
COPY . .
RUN npm install ./packs/deterministic-code-migraters-*.tgz
RUN npx migrate-init --language typescript --dialect oracle
CMD ["./e2e.sh"]
