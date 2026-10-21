#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

npm run prepare
npm ci --prefix typescript
bash proof/ensure-instant-client.sh

bindir="$root/.e2e-bin"
mkdir -p "$bindir"
for cmd in migrate-init migrate-setup migrate-up migrate-down migrate-create; do
  ln -sfn "$root/orchestrator/dist/${cmd}.js" "$bindir/$cmd"
done
chmod +x "$root"/orchestrator/dist/*.js

instant="$root/proof/.instantclient"
if [[ -d "$instant" ]]; then
  if [[ "$(uname -s)" == Darwin ]]; then
    export DYLD_LIBRARY_PATH="$instant${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
  else
    export LD_LIBRARY_PATH="$instant${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
  fi
fi

export PATH="$bindir:$PATH"
bash "$root/proof/e2e-consumer.sh"
migrate-init --language typescript --all
rm -f app.sqlite
bash "$root/proof/e2e-providers.sh"

orch="$root/.e2e-orch"
mkdir -p "$orch"
for cmd in migrate-init migrate-setup migrate-up migrate-down migrate-create; do
  ln -sfn "$root/orchestrator/dist/${cmd}.js" "$orch/$cmd"
done
chmod +x "$root"/orchestrator/dist/*.js
PATH="$orch:$PATH" migrate-init --language typescript --all
test -f "$root/.migraters.yaml"
