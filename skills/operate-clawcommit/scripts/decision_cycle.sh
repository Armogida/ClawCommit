#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  decision_cycle.sh --contract <ADDR> --prompt <PROMPT> --output <OUTPUT> --model-version <VERSION>
                    [--nonce <NONCE>] [--network <NETWORK>] [--rpc <RPC_URL>]
                    [--allow-mainnet-writes <true|false>]
                    [--repo <PATH>] [--skip-replay] [--json-out <PATH>] [--json-include-prompt]
                    [--deploy-tx <TX_HASH>] [--links-out <PATH>]
                    [--post-gh-pr <PR_NUMBER>] [--gh-repo <OWNER/REPO>]
                    [--links-title <TITLE>] [--links-include-prompt]
                    [--links-prompt-max-chars <N>] [--links-no-redact]
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
allow_mainnet_writes="false"
skip_replay="false"
json_out=""
json_include_prompt="false"
deploy_tx=""
links_out=""
post_gh_pr=""
gh_repo=""
links_title="ClawCommit Decision Cycle"
links_include_prompt="false"
links_prompt_max_chars="1200"
links_redact="true"

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
    --allow-mainnet-writes) allow_mainnet_writes="$2"; shift 2 ;;
    --skip-replay) skip_replay="true"; shift ;;
    --json-out) json_out="$2"; shift 2 ;;
    --json-include-prompt) json_include_prompt="true"; shift ;;
    --deploy-tx) deploy_tx="$2"; shift 2 ;;
    --links-out) links_out="$2"; shift 2 ;;
    --post-gh-pr) post_gh_pr="$2"; shift 2 ;;
    --gh-repo) gh_repo="$2"; shift 2 ;;
    --links-title) links_title="$2"; shift 2 ;;
    --links-include-prompt) links_include_prompt="true"; shift ;;
    --links-prompt-max-chars) links_prompt_max_chars="$2"; shift 2 ;;
    --links-no-redact) links_redact="false"; shift ;;
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

ts_node_bin="$repo/node_modules/.bin/ts-node"
if [[ ! -x "$ts_node_bin" ]]; then
  echo "error: ts-node binary not found at '$ts_node_bin'" >&2
  echo "hint: run 'npm install' in $repo" >&2
  exit 1
fi

if [[ -z "$nonce" ]]; then
  nonce="0x$(openssl rand -hex 32)"
fi

if [[ ( -n "$links_out" || -n "$post_gh_pr" ) && -z "$json_out" ]]; then
  json_out="deployment-proof/decision-cycle-summary.json"
fi

if [[ -n "$json_out" ]]; then
  json_out="$(abs_path "$json_out")"
fi

if [[ -n "$links_out" ]]; then
  links_out="$(abs_path "$links_out")"
fi

if [[ -z "$rpc_url" ]]; then
  case "$network" in
    bscTestnet)
      rpc_url="${BSC_TESTNET_RPC_URL:-https://data-seed-prebsc-1-s1.binance.org:8545/}"
      ;;
    bsc|bscMainnet)
      rpc_url="${BSC_RPC_URL:-https://bsc-dataseed.binance.org/}"
      ;;
  esac
fi

echo "[decision-cycle] repo=$repo network=$network"
echo "[decision-cycle] nonce=$nonce"

commit_log="$(mktemp)"
reveal_log="$(mktemp)"
replay_log="$(mktemp)"
trap 'rm -f "$commit_log" "$reveal_log" "$replay_log"' EXIT

commit_cmd=(
  "$ts_node_bin" scripts/commit.ts
  --contract "$contract"
  --prompt "$prompt"
  --output "$output"
  --model-version "$model_version"
  --nonce "$nonce"
  --allow-mainnet-writes "$allow_mainnet_writes"
)

echo "[decision-cycle] committing decision"
(cd "$repo" && HARDHAT_NETWORK="$network" "${commit_cmd[@]}") | tee "$commit_log"

commit_id="$(sed -n 's/^Commit ID:[[:space:]]*//p' "$commit_log" | tail -n 1 | tr -d '\r')"
commit_tx="$(sed -n 's/^Commit Tx:[[:space:]]*//p' "$commit_log" | tail -n 1 | tr -d '\r')"

if [[ -z "$commit_id" ]]; then
  echo "error: could not parse Commit ID from commit output" >&2
  exit 1
fi

reveal_cmd=(
  "$ts_node_bin" scripts/reveal.ts
  --contract "$contract"
  --commit-id "$commit_id"
  --prompt "$prompt"
  --output "$output"
  --model-version "$model_version"
  --nonce "$nonce"
  --allow-mainnet-writes "$allow_mainnet_writes"
)

echo "[decision-cycle] revealing commit_id=$commit_id"
(cd "$repo" && HARDHAT_NETWORK="$network" "${reveal_cmd[@]}") | tee "$reveal_log"

reveal_tx="$(sed -n 's/^Reveal Tx:[[:space:]]*//p' "$reveal_log" | tail -n 1 | tr -d '\r')"
onchain_verify="$(sed -n 's/^On-chain verify:[[:space:]]*//p' "$reveal_log" | tail -n 1 | tr -d '\r')"
replay_result="skipped"

if [[ "$skip_replay" != "true" ]]; then
  if [[ -z "$reveal_tx" ]]; then
    echo "error: cannot run replay, Reveal Tx was not found in output" >&2
    exit 1
  fi

  replay_cmd=("$ts_node_bin" scripts/replay.ts --tx "$reveal_tx")
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
  export CC_NETWORK="$network"
  export CC_CONTRACT="$contract"
  export CC_DEPLOY_TX="$deploy_tx"
  export CC_COMMIT_ID="$commit_id"
  export CC_COMMIT_TX="$commit_tx"
  export CC_REVEAL_TX="$reveal_tx"
  export CC_NONCE="$nonce"
  export CC_ONCHAIN_VERIFY="$onchain_verify"
  export CC_REPLAY="$replay_result"
  export CC_JSON_INCLUDE_PROMPT="$json_include_prompt"
  export CC_PROMPT="$prompt"
  export CC_OUTPUT="$output"
  export CC_MODEL_VERSION="$model_version"
  node - <<'NODE' > "$json_out"
const payload = {
  network: process.env.CC_NETWORK || "",
  contract: process.env.CC_CONTRACT || "",
  deployTx: process.env.CC_DEPLOY_TX || "",
  commitId: process.env.CC_COMMIT_ID || "",
  commitTx: process.env.CC_COMMIT_TX || "",
  revealTx: process.env.CC_REVEAL_TX || "",
  nonce: process.env.CC_NONCE || "",
  onchainVerify: process.env.CC_ONCHAIN_VERIFY || "",
  replay: process.env.CC_REPLAY || "",
};

if (process.env.CC_JSON_INCLUDE_PROMPT === "true") {
  payload.prompt = process.env.CC_PROMPT || "";
  payload.output = process.env.CC_OUTPUT || "";
  payload.modelVersion = process.env.CC_MODEL_VERSION || "";
}

process.stdout.write(JSON.stringify(payload, null, 2) + "\n");
NODE
  echo "[decision-cycle] wrote $json_out"
fi

reporter="$repo/scripts/integration/post-cycle-links.js"
if [[ -n "$json_out" && -f "$reporter" ]]; then
  report_cmd=(node "$reporter" --artifact "$json_out" --title "$links_title")

  if [[ "$links_include_prompt" == "true" ]]; then
    report_cmd+=(--include-prompt --prompt-max-chars "$links_prompt_max_chars")
    if [[ "$links_redact" == "false" ]]; then
      report_cmd+=(--no-redact)
    fi
  fi

  if [[ -n "$links_out" ]]; then
    report_cmd+=(--out "$links_out")
  fi
  if [[ -n "$post_gh_pr" ]]; then
    report_cmd+=(--post-gh-pr "$post_gh_pr")
  fi
  if [[ -n "$gh_repo" ]]; then
    report_cmd+=(--repo "$gh_repo")
  fi

  echo "[decision-cycle] generating link report"
  (cd "$repo" && "${report_cmd[@]}")
fi
