#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")" && pwd)"
dest="$root/.instantclient"
if [[ -e "$dest/libclntsh.dylib" || -e "$dest/libclntsh.so" ]]; then
  exit 0
fi

os="$(uname -s)"
if [[ "$os" == Darwin ]]; then
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
  exit 0
fi

if [[ "$os" != Linux ]]; then
  exit 0
fi

if [[ "$(uname -m)" != x86_64 ]]; then
  echo "Oracle Instant Client install supports Linux x86_64 only" >&2
  exit 1
fi

run_root() {
  if [[ "$(id -u)" -eq 0 ]]; then
    "$@"
  else
    sudo "$@"
  fi
}

if ! ldconfig -p 2>/dev/null | grep -q 'libaio\.so\.1\( \|$\)' \
  && [[ ! -e /usr/lib/x86_64-linux-gnu/libaio.so.1 ]]; then
  run_root apt-get update
  run_root apt-get install -y libaio1t64 || run_root apt-get install -y libaio1
  t64="/usr/lib/x86_64-linux-gnu/libaio.so.1t64"
  link="/usr/lib/x86_64-linux-gnu/libaio.so.1"
  if [[ -e "$t64" && ! -e "$link" ]]; then
    run_root ln -sf "$t64" "$link"
  fi
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
curl -fsSL -o "$tmp/ic.zip" \
  'https://download.oracle.com/otn_software/linux/instantclient/2326300/instantclient-basiclite-linux.x64-23.26.3.0.0.zip'
unzip -q "$tmp/ic.zip" -d "$tmp"
inner="$(find "$tmp" -mindepth 1 -maxdepth 1 -type d -name 'instantclient_*' -print -quit)"
if [[ -z "$inner" || ! -e "$inner/libclntsh.so" ]]; then
  echo "Instant Client zip did not contain libclntsh.so" >&2
  exit 1
fi
mkdir -p "$dest"
cp -a "$inner"/. "$dest"/
