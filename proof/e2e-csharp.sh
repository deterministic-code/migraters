#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

dotnet build csharp/MigrateInit/MigrateInit.csproj
export PATH="$root/csharp/MigrateInit/bin/Debug/net9.0:$PATH"
migrate-init --all
dotnet build csharp/MigrateRunner.csproj
export PATH="$root/csharp/bin/Debug/net9.0:$root/csharp/MigrateInit/bin/Debug/net9.0:$PATH"
rm -f app.sqlite
bash "$root/proof/e2e-providers.sh"
