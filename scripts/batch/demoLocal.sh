#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

TRANSCRIPT_PATH="${TRANSCRIPT_PATH:-deployment-proof/batch-demo-transcript.txt}"
INPUT_PATH="${INPUT_PATH:-data/decisions-batch-001.ndjson}"
MANIFEST_PATH="${MANIFEST_PATH:-artifacts/batches/batch-001.manifest.json}"
PROOF_PATH="${PROOF_PATH:-artifacts/batches/batch-001-leaf-1.proof.json}"
MODEL_VERSION="${MODEL_VERSION:-clawcommit-v2.0}"
LEAF_INDEX="${LEAF_INDEX:-1}"

mkdir -p "$(dirname "$TRANSCRIPT_PATH")" "$(dirname "$MANIFEST_PATH")"
: > "$TRANSCRIPT_PATH"

NODE_PID=""
cleanup() {
  if [[ -n "$NODE_PID" ]] && kill -0 "$NODE_PID" 2>/dev/null; then
    log_cmd "kill $NODE_PID"
    kill "$NODE_PID" || true
  fi
}
trap cleanup EXIT

log_cmd() {
  echo "$ $*" | tee -a "$TRANSCRIPT_PATH"
}

run_cmd() {
  local cmd="$*"
  log_cmd "$cmd"
  bash -lc "$cmd" 2>&1 | tee -a "$TRANSCRIPT_PATH"
  echo "" | tee -a "$TRANSCRIPT_PATH"
}

wait_for_node() {
  local tries=0
  until curl -s -X POST http://127.0.0.1:8545 \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' >/dev/null 2>&1; do
    tries=$((tries + 1))
    if [[ "$tries" -ge 30 ]]; then
      echo "Failed to start local Hardhat node on 127.0.0.1:8545" | tee -a "$TRANSCRIPT_PATH"
      exit 1
    fi
    sleep 1
  done
}

extract_contract_address() {
  local from_file="$1"
  grep -E "ClawCommitBatch deployed to:" "$from_file" | tail -n 1 | awk '{print $4}'
}

echo "Batch local demo starting..."
echo "Transcript: $TRANSCRIPT_PATH"
echo ""

log_cmd "npx hardhat node  # started in background"
nohup npx hardhat node >/tmp/clawcommit-hardhat-node.log 2>&1 &
NODE_PID=$!
echo "Hardhat node PID: $NODE_PID" | tee -a "$TRANSCRIPT_PATH"
wait_for_node

tmp_deploy_output="$(mktemp)"
log_cmd "npx hardhat run scripts/batch/deployBatch.ts --network localhost"
if ! npx hardhat run scripts/batch/deployBatch.ts --network localhost 2>&1 | tee "$tmp_deploy_output" | tee -a "$TRANSCRIPT_PATH"; then
  rm -f "$tmp_deploy_output"
  exit 1
fi
echo "" | tee -a "$TRANSCRIPT_PATH"

CONTRACT_ADDR="$(extract_contract_address "$tmp_deploy_output")"
rm -f "$tmp_deploy_output"

if [[ -z "$CONTRACT_ADDR" ]]; then
  echo "Failed to parse contract address from deployment output." | tee -a "$TRANSCRIPT_PATH"
  exit 1
fi

echo "Resolved contract address: $CONTRACT_ADDR" | tee -a "$TRANSCRIPT_PATH"
echo "" | tee -a "$TRANSCRIPT_PATH"

run_cmd "npx ts-node scripts/batch/build.ts --in $INPUT_PATH --out $MANIFEST_PATH --model-version $MODEL_VERSION"
run_cmd "npx ts-node scripts/batch/generateProof.ts --manifest $MANIFEST_PATH --leaf-index $LEAF_INDEX --out $PROOF_PATH"
run_cmd "HARDHAT_NETWORK=localhost npx ts-node scripts/batch/commitBatch.ts --contract $CONTRACT_ADDR --manifest $MANIFEST_PATH"
run_cmd "HARDHAT_NETWORK=localhost npx ts-node scripts/batch/revealLeaf.ts --contract $CONTRACT_ADDR --batch-id 0 --leaf-index $LEAF_INDEX --manifest $MANIFEST_PATH"
run_cmd "BSC_RPC_URL=http://127.0.0.1:8545 npx ts-node scripts/batch/replayBatch.ts --manifest $MANIFEST_PATH --contract $CONTRACT_ADDR --batch-id 0 --network localhost"
run_cmd "npx ts-node scripts/batch/replayBatch.ts --manifest $MANIFEST_PATH --local"

echo "Transcript saved to $TRANSCRIPT_PATH" | tee -a "$TRANSCRIPT_PATH"
echo "Batch local demo complete."
