#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

cd "$root/typescript"
tarball="$(npm pack --silent)"
pack_path="$root/typescript/$tarball"
workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
  rm -f "$pack_path"
}
trap cleanup EXIT

cd "$workdir"
npm init -y >/dev/null
npm install "$pack_path"
npx migrate-init --dialect sqlite --dialect postgres
node --input-type=module -e "await import('better-sqlite3'); await import('pg');"
