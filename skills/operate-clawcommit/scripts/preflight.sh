#!/usr/bin/env bash
set -euo pipefail

ROOT="."
skip_install="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) ROOT="$2"; shift 2 ;;
    --skip-install) skip_install="true"; shift ;;
    -h|--help)
      cat <<'USAGE'
Usage:
  preflight.sh [--repo <PATH>] [--skip-install]
USAGE
      exit 0
      ;;
    *)
      echo "error: unknown arg '$1'" >&2
      exit 1
      ;;
  esac
done

if [[ ! -f "$ROOT/package.json" ]]; then
  echo "error: package.json not found at '$ROOT'" >&2
  exit 1
fi

echo "[preflight] repo: $ROOT"
if [[ "$skip_install" != "true" ]]; then
  echo "[preflight] installing dependencies"
  (cd "$ROOT" && npm install)
else
  echo "[preflight] skipping npm install"
fi

echo "[preflight] compiling contracts"
(cd "$ROOT" && npx hardhat compile)

echo "[preflight] running tests"
(cd "$ROOT" && npm test)

echo "[preflight] done"
