#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

cd "$root"
tarball="$(npm pack --silent)"
pack_path="$root/$tarball"
workdir="$(mktemp -d)"
cleanup() {
  rm -rf "$workdir"
  rm -f "$pack_path"
}
trap cleanup EXIT

cd "$workdir"
npm init -y >/dev/null
npm install "$pack_path"
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
