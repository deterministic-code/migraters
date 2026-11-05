#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

local=0
for arg in "$@"; do
  case "$arg" in
    --local) local=1 ;;
    *)
      echo "unknown arg: $arg" >&2
      exit 2
      ;;
  esac
done

tmp="$(mktemp -d)"
workdir="$tmp/typescript"
mkdir -p "$workdir"
pack_path=""
cleanup() {
  rm -rf "$tmp"
  if [[ -n "$pack_path" ]]; then
    rm -f "$pack_path"
  fi
}
trap cleanup EXIT

if [[ "$local" -eq 1 ]]; then
  cd "$root"
  tarball="$(npm pack --silent)"
  pack_path="$root/$tarball"
  install_spec="$pack_path"
else
  install_spec="@deterministic-code/migraters"
fi

cd "$workdir"
npm init -y >/dev/null
npm install "$install_spec"
npx migrate-init --language typescript --dialect sqlite
npx migrate-setup --provider sqlite --connection sqlite:///./app.sqlite
test -f app.sqlite
npx migrate-init --language typescript --dialect sqlite --dialect postgres
npx migrate-setup --provider sqlite --connection ./app.sqlite
npx migrate-create --provider sqlite --name add_users
cat > sql/sqlite/migrations/0001_add_users_up.sql <<'SQL'
CREATE TABLE users (id INTEGER PRIMARY KEY);
SQL
cat > sql/sqlite/migrations/0001_add_users_down.sql <<'SQL'
DROP TABLE users;
SQL
npx migrate-up --provider sqlite --connection ./app.sqlite
npx migrate-init --language csharp --dialect sqlite
npx migrate-init --language rust --dialect sqlite
