#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

bash proof/ensure-instant-client.sh
instant="$root/proof/.instantclient"
export ORACLE_CLIENT_LIB_DIR="$instant"
if [[ "$(uname -s)" == Darwin ]]; then
  export DYLD_LIBRARY_PATH="$instant${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
else
  export LD_LIBRARY_PATH="$instant${DYLD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

npm run build --prefix typescript
bindir="$root/.e2e-bin"
mkdir -p "$bindir"
for cmd in migrate-init migrate-setup migrate-up migrate-down migrate-create; do
  ln -sfn "$root/typescript/dist/orchestrator/${cmd}.js" "$bindir/$cmd"
done
chmod +x "$root"/typescript/dist/orchestrator/*.js
export PATH="$bindir:$PATH"

migrate-init --language rust --all
rm -f app.sqlite
bash "$root/proof/e2e-providers.sh"
