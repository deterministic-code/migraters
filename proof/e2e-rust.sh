#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

bash proof/ensure-instant-client.sh
instant="$root/proof/.instantclient"
if [[ "$(uname -s)" == Darwin ]]; then
  export DYLD_LIBRARY_PATH="$instant${DYLD_LIBRARY_PATH:+:$DYLD_LIBRARY_PATH}"
else
  export LD_LIBRARY_PATH="$instant${LD_LIBRARY_PATH:+:$LD_LIBRARY_PATH}"
fi

export CARGO_TARGET_DIR="$root/rust/target"
cargo build --manifest-path rust/init/Cargo.toml
export PATH="$CARGO_TARGET_DIR/debug:$PATH"
migrate-init --all
cargo build --manifest-path rust/Cargo.toml
rm -f app.sqlite
bash "$root/proof/e2e-providers.sh"
