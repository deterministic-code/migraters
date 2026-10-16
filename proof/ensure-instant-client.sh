#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
dest="$root/.instantclient"
if [[ -e "$dest/libclntsh.dylib" || -e "$dest/libclntsh.so" ]]; then
  exit 0
fi
if [[ "$(uname -s)" != Darwin ]]; then
  exit 0
fi
mkdir -p "$dest"
dmg="$(mktemp -t ic-basiclite).dmg"
mount="$(mktemp -d -t ic-mount)"
curl -fsSL -o "$dmg" \
  'https://download.oracle.com/otn_software/mac/instantclient/2326200/instantclient-basiclite-macos.arm64-23.26.2.0.0.dmg'
hdiutil attach "$dmg" -nobrowse -mountpoint "$mount" >/dev/null
rsync -a --exclude='.Trashes' --exclude='.fseventsd' "$mount/" "$dest/"
hdiutil detach "$mount" >/dev/null
rm -f "$dmg"
rmdir "$mount" 2>/dev/null || true
