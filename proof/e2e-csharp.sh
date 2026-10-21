#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

npm run build --prefix typescript
bindir="$root/.e2e-bin"
mkdir -p "$bindir"
for cmd in migrate-init migrate-setup migrate-up migrate-down migrate-create; do
  ln -sfn "$root/typescript/dist/orchestrator/${cmd}.js" "$bindir/$cmd"
done
chmod +x "$root"/typescript/dist/orchestrator/*.js
export PATH="$bindir:$PATH"

migrate-init --language csharp --all
rm -f app.sqlite
bash "$root/proof/e2e-providers.sh"
