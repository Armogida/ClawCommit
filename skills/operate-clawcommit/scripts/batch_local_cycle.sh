#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  batch_local_cycle.sh --in <INPUT_NDJSON> --out <MANIFEST_JSON> --model-version <VERSION>
                       [--leaf-index <N>] [--proof-out <PROOF_JSON>]
                       [--repo <PATH>] [--json-out <PATH>]
USAGE
}

repo="."
input_path=""
manifest_path=""
model_version=""
leaf_index="0"
proof_out=""
json_out=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --in) input_path="$2"; shift 2 ;;
    --out) manifest_path="$2"; shift 2 ;;
    --model-version) model_version="$2"; shift 2 ;;
    --leaf-index) leaf_index="$2"; shift 2 ;;
    --proof-out) proof_out="$2"; shift 2 ;;
    --json-out) json_out="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

abs_path() {
  if [[ "$1" = /* ]]; then
    echo "$1"
  else
    echo "$repo/$1"
  fi
}

if [[ -z "$input_path" || -z "$manifest_path" || -z "$model_version" ]]; then
  echo "error: required args missing" >&2
  usage
  exit 1
fi

if [[ ! -f "$repo/package.json" ]]; then
  echo "error: package.json not found at '$repo'" >&2
  exit 1
fi

input_path="$(abs_path "$input_path")"
manifest_path="$(abs_path "$manifest_path")"

if [[ ! -f "$input_path" ]]; then
  echo "error: input NDJSON not found at '$input_path'" >&2
  exit 1
fi

if [[ -z "$proof_out" ]]; then
  proof_out="$(dirname "$manifest_path")/leaf-${leaf_index}.proof.json"
else
  proof_out="$(abs_path "$proof_out")"
fi

if [[ -n "$json_out" ]]; then
  json_out="$(abs_path "$json_out")"
fi

echo "[batch-local-cycle] repo=$repo"
echo "[batch-local-cycle] build manifest"
(cd "$repo" && npx ts-node scripts/batch/build.ts \
  --in "$input_path" \
  --out "$manifest_path" \
  --model-version "$model_version")

echo "[batch-local-cycle] recompute root"
(cd "$repo" && npx ts-node scripts/batch/recomputeRoot.ts \
  --manifest "$manifest_path")

echo "[batch-local-cycle] generate proof"
(cd "$repo" && npx ts-node scripts/batch/generateProof.ts \
  --manifest "$manifest_path" \
  --leaf-index "$leaf_index" \
  --out "$proof_out")

echo "[batch-local-cycle] replay verify local"
(cd "$repo" && npx ts-node scripts/batch/replayBatch.ts \
  --manifest "$manifest_path" \
  --local)

root="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(m.root||'');" "$manifest_path")"
leaf_count="$(node -e "const fs=require('fs');const m=JSON.parse(fs.readFileSync(process.argv[1],'utf8'));process.stdout.write(String(m.leafCount||''));" "$manifest_path")"

echo "[batch-local-cycle] done"
echo "  manifest:   $manifest_path"
echo "  proof:      $proof_out"
echo "  leaf_count: $leaf_count"
echo "  root:       $root"

if [[ -n "$json_out" ]]; then
  mkdir -p "$(dirname "$json_out")"
  cat > "$json_out" <<EOF
{
  "manifest": "$manifest_path",
  "proof": "$proof_out",
  "leafIndex": $leaf_index,
  "leafCount": $leaf_count,
  "root": "$root"
}
EOF
  echo "[batch-local-cycle] wrote $json_out"
fi
