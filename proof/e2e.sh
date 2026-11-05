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

if [[ "$local" -eq 1 ]]; then
  export MIGRATERS_SOURCE=local
else
  export MIGRATERS_SOURCE=published
fi

for compose in "$root"/proof/matrix/*/*/compose.yml; do
  language="$(basename "$(dirname "$(dirname "$compose")")")"
  dialect="$(basename "$(dirname "$compose")")"
  if [[ "$local" -eq 1 ]]; then
    bash "$root/proof/stage-cell.sh" "$language" "$dialect"
  fi
  project="migraters-e2e-${language}-${dialect}"
  docker compose -p "$project" -f "$compose" up --build --abort-on-container-exit --exit-code-from e2e
  run_status=$?
  docker compose -p "$project" -f "$compose" down -v --remove-orphans
  if [[ $run_status -ne 0 ]]; then
    exit "$run_status"
  fi
done
