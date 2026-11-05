#!/usr/bin/env bash
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"

for compose in "$root"/proof/matrix/*/*/compose.yml; do
  language="$(basename "$(dirname "$(dirname "$compose")")")"
  dialect="$(basename "$(dirname "$compose")")"
  bash "$root/proof/stage-cell.sh" "$language" "$dialect"
  project="migraters-e2e-${language}-${dialect}"
  docker compose -p "$project" -f "$compose" up --build --abort-on-container-exit --exit-code-from e2e
  run_status=$?
  docker compose -p "$project" -f "$compose" down -v --remove-orphans
  if [[ $run_status -ne 0 ]]; then
    exit "$run_status"
  fi
done
