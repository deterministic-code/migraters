#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
language="${1:?language}"
dialect="${2:?dialect}"
cell="$root/proof/matrix/$language/$dialect"
packs="$cell/packs"

rm -rf "$packs"
mkdir -p "$packs"

npm install --prefix "$root" --no-audit --no-fund
npm run prepare --prefix "$root"
(cd "$root" && npm pack --pack-destination "$packs")
