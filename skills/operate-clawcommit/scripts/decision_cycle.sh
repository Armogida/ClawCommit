#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  decision_cycle.sh --contract <ADDR> --prompt <PROMPT> --output <OUTPUT> --model-version <VERSION>
                    [--nonce <NONCE>] [--network <NETWORK>] [--rpc <RPC_URL>]
                    [--repo <PATH>] [--skip-replay] [--json-out <PATH>]
USAGE
}

repo="."
network="bsc"
contract=""
prompt=""
output=""
model_version=""
nonce=""
rpc_url=""
skip_replay="false"
json_out=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --network) network="$2"; shift 2 ;;
    --contract) contract="$2"; shift 2 ;;
    --prompt) prompt="$2"; shift 2 ;;
    --output) output="$2"; shift 2 ;;
    --model-version) model_version="$2"; shift 2 ;;
    --nonce) nonce="$2"; shift 2 ;;
    --rpc) rpc_url="$2"; shift 2 ;;
    --skip-replay) skip_replay="true"; shift ;;
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

if [[ -z "$contract" || -z "$prompt" || -z "$output" || -z "$model_version" ]]; then
  echo "error: required args missing" >&2
  usage
  exit 1
fi

if [[ ! -f "$repo/package.json" ]]; then
  echo "error: package.json not found at '$repo'" >&2
  exit 1
fi

if [[ -z "$nonce" ]]; then
  nonce="$(openssl rand -hex 16)"
fi

if [[ -n "$json_out" ]]; then
  json_out="$(abs_path "$json_out")"
fi

echo "[decision-cycle] repo=$repo network=$network"
echo "[decision-cycle] nonce=$nonce"

commit_log="$(mktemp)"
reveal_log="$(mktemp)"
replay_log="$(mktemp)"
trap 'rm -f "$commit_log" "$reveal_log" "$replay_log"' EXIT

commit_cmd=(
  npx hardhat run scripts/commit.ts --network "$network" --
  --contract "$contract"
  --prompt "$prompt"
  --output "$output"
  --model-version "$model_version"
  --nonce "$nonce"
)

echo "[decision-cycle] committing decision"
(cd "$repo" && "${commit_cmd[@]}") | tee "$commit_log"

commit_id="$(sed -n 's/^Commit ID:[[:space:]]*//p' "$commit_log" | tail -n 1 | tr -d '\r')"
commit_tx="$(sed -n 's/^Commit Tx:[[:space:]]*//p' "$commit_log" | tail -n 1 | tr -d '\r')"

if [[ -z "$commit_id" ]]; then
  echo "error: could not parse Commit ID from commit output" >&2
  exit 1
fi

reveal_cmd=(
  npx hardhat run scripts/reveal.ts --network "$network" --
  --contract "$contract"
  --commit-id "$commit_id"
  --prompt "$prompt"
  --output "$output"
  --model-version "$model_version"
  --nonce "$nonce"
)

echo "[decision-cycle] revealing commit_id=$commit_id"
(cd "$repo" && "${reveal_cmd[@]}") | tee "$reveal_log"

reveal_tx="$(sed -n 's/^Reveal Tx:[[:space:]]*//p' "$reveal_log" | tail -n 1 | tr -d '\r')"
onchain_verify="$(sed -n 's/^On-chain verify:[[:space:]]*//p' "$reveal_log" | tail -n 1 | tr -d '\r')"
replay_result="skipped"

if [[ "$skip_replay" != "true" ]]; then
  if [[ -z "$reveal_tx" ]]; then
    echo "error: cannot run replay, Reveal Tx was not found in output" >&2
    exit 1
  fi

  replay_cmd=(npx ts-node scripts/replay.ts --tx "$reveal_tx")
  if [[ -n "$rpc_url" ]]; then
    replay_cmd+=(--rpc "$rpc_url")
  fi

  echo "[decision-cycle] replay verifying tx=$reveal_tx"
  (cd "$repo" && "${replay_cmd[@]}") | tee "$replay_log"
  replay_result="verified"
fi

echo "[decision-cycle] done"
echo "  commit_id:      $commit_id"
echo "  commit_tx:      ${commit_tx:-n/a}"
echo "  reveal_tx:      ${reveal_tx:-n/a}"
echo "  onchain_verify: ${onchain_verify:-n/a}"
echo "  replay:         $replay_result"

if [[ -n "$json_out" ]]; then
  mkdir -p "$(dirname "$json_out")"
  cat > "$json_out" <<EOF
{
  "network": "$network",
  "contract": "$contract",
  "commitId": "$commit_id",
  "commitTx": "${commit_tx}",
  "revealTx": "${reveal_tx}",
  "nonce": "$nonce",
  "onchainVerify": "${onchain_verify}",
  "replay": "$replay_result"
}
EOF
  echo "[decision-cycle] wrote $json_out"
fi
