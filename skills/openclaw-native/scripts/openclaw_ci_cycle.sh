#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  openclaw_ci_cycle.sh --repo <PATH> --input <OPENCLAW_INPUT_JSON> --contract <ADDR>
                      [--network <NETWORK>] [--nonce <NONCE>]
                      [--allow-mainnet-writes <true|false>]
                      [--json-out <PATH>] [--links-out <PATH>]
                      [--post-gh-pr <PR_NUMBER>] [--gh-repo <OWNER/REPO>]
                      [--links-title <TITLE>]

Input JSON schema:
{
  "modelVersion": "openclaw-agent-v1",
  "context": {
    "workflow": "openclaw-pr-validation",
    "repository": "owner/repo",
    "ref": "refs/pull/1/head",
    "sha": "abc123",
    "actor": "github-actions[bot]",
    "runId": "123",
    "runUrl": "https://github.com/owner/repo/actions/runs/123"
  },
  "validations": [
    { "name": "compile", "passed": true, "required": true, "details": "ok" }
  ]
}
USAGE
}

repo="."
input=""
contract=""
network="bscTestnet"
nonce=""
allow_mainnet_writes="false"
json_out="deployment-proof/openclaw-decision-cycle.json"
links_out=""
post_gh_pr=""
gh_repo=""
links_title="OpenClaw Decision Cycle (Redacted)"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --repo) repo="$2"; shift 2 ;;
    --input) input="$2"; shift 2 ;;
    --contract) contract="$2"; shift 2 ;;
    --network) network="$2"; shift 2 ;;
    --nonce) nonce="$2"; shift 2 ;;
    --allow-mainnet-writes) allow_mainnet_writes="$2"; shift 2 ;;
    --json-out) json_out="$2"; shift 2 ;;
    --links-out) links_out="$2"; shift 2 ;;
    --post-gh-pr) post_gh_pr="$2"; shift 2 ;;
    --gh-repo) gh_repo="$2"; shift 2 ;;
    --links-title) links_title="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *) echo "error: unknown arg '$1'" >&2; usage; exit 1 ;;
  esac
done

abs_repo="$(cd "$repo" && pwd)"

if [[ -z "$input" || -z "$contract" ]]; then
  echo "error: --input and --contract are required" >&2
  usage
  exit 1
fi

if [[ ! -f "$abs_repo/package.json" ]]; then
  echo "error: package.json not found at '$abs_repo'" >&2
  exit 1
fi

if [[ "$input" = /* ]]; then
  abs_input="$input"
else
  abs_input="$abs_repo/$input"
fi
if [[ ! -f "$abs_input" ]]; then
  echo "error: input JSON not found: $abs_input" >&2
  exit 1
fi

build_payload_script="$abs_repo/scripts/integration/build-openclaw-payload.js"
decision_cycle_script="$abs_repo/skills/operate-clawcommit/scripts/decision_cycle.sh"
links_script="$abs_repo/scripts/integration/post-cycle-links.js"

if [[ ! -f "$build_payload_script" ]]; then
  echo "error: missing helper script: $build_payload_script" >&2
  exit 1
fi
if [[ ! -f "$decision_cycle_script" ]]; then
  echo "error: missing helper script: $decision_cycle_script" >&2
  exit 1
fi

if [[ "$json_out" != /* ]]; then
  abs_json_out="$abs_repo/$json_out"
else
  abs_json_out="$json_out"
fi

if [[ -n "$links_out" ]]; then
  if [[ "$links_out" != /* ]]; then
    abs_links_out="$abs_repo/$links_out"
  else
    abs_links_out="$links_out"
  fi
else
  abs_links_out=""
fi

tmp_payload="$(mktemp)"
tmp_cycle="$(mktemp)"
tmp_prompt="$(mktemp)"
trap 'rm -f "$tmp_payload" "$tmp_cycle" "$tmp_prompt"' EXIT

echo "[openclaw-cycle] building deterministic OpenClaw payload"
node "$build_payload_script" --input "$abs_input" --out "$tmp_payload" >/dev/null

openclaw_meta="$(node -e '
const fs = require("fs");
const payload = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
fs.writeFileSync(process.argv[2], payload.prompt, "utf8");
const values = [
  payload.output,
  payload.modelVersion,
  payload.promptDigest,
  String(payload.requiredValidationCount),
  String(payload.requiredFailureCount),
  String(payload.validations.length),
  payload.promptTemplateVersion,
];
process.stdout.write(values.join("\n"));
' "$tmp_payload" "$tmp_prompt")"

prompt="$(cat "$tmp_prompt")"
output="$(printf '%s' "$openclaw_meta" | sed -n '1p')"
model_version="$(printf '%s' "$openclaw_meta" | sed -n '2p')"
prompt_digest="$(printf '%s' "$openclaw_meta" | sed -n '3p')"
required_validation_count="$(printf '%s' "$openclaw_meta" | sed -n '4p')"
required_failure_count="$(printf '%s' "$openclaw_meta" | sed -n '5p')"
validation_count="$(printf '%s' "$openclaw_meta" | sed -n '6p')"
prompt_template_version="$(printf '%s' "$openclaw_meta" | sed -n '7p')"

if [[ -z "$nonce" ]]; then
  nonce="$(openssl rand -hex 32)"
  nonce="0x${nonce}"
fi

echo "[openclaw-cycle] running commit -> reveal -> replay"
bash "$decision_cycle_script" \
  --repo "$abs_repo" \
  --network "$network" \
  --contract "$contract" \
  --prompt "$prompt" \
  --output "$output" \
  --model-version "$model_version" \
  --nonce "$nonce" \
  --allow-mainnet-writes "$allow_mainnet_writes" \
  --json-out "$tmp_cycle" \
  --links-title "$links_title"

mkdir -p "$(dirname "$abs_json_out")"

node -e '
const fs = require("fs");
const input = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
const payload = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const cycle = JSON.parse(fs.readFileSync(process.argv[3], "utf8"));

const merged = {
  profile: "openclaw-native",
  workflow: "openclaw_ci_cycle.sh",
  network: cycle.network,
  contract: cycle.contract,
  deployTx: cycle.deployTx || "",
  commitId: cycle.commitId,
  hash: cycle.hash || "",
  commitTx: cycle.commitTx,
  revealTx: cycle.revealTx,
  nonce: cycle.nonce,
  onchainVerify: cycle.onchainVerify,
  replay: cycle.replay,
  prompt: payload.prompt,
  output: payload.output,
  modelVersion: payload.modelVersion,
  promptTemplateVersion: payload.promptTemplateVersion,
  promptDigest: payload.promptDigest,
  context: input.context,
  validations: payload.validations,
  requiredValidationCount: payload.requiredValidationCount,
  requiredFailureCount: payload.requiredFailureCount,
  validationSummary: `required_failed=${payload.requiredFailureCount}/${payload.requiredValidationCount}; total=${payload.validations.length}`,
  timestamp: new Date().toISOString(),
};

fs.writeFileSync(process.argv[4], `${JSON.stringify(merged, null, 2)}\n`);
' "$abs_input" "$tmp_payload" "$tmp_cycle" "$abs_json_out"

echo "[openclaw-cycle] wrote $abs_json_out"

echo "[openclaw-cycle] summary"
echo "  decision:        $output"
echo "  prompt_digest:   $prompt_digest"
echo "  template:        $prompt_template_version"
echo "  required_failed: $required_failure_count/$required_validation_count"

if [[ -f "$links_script" ]]; then
  report_cmd=(node "$links_script" --artifact "$abs_json_out" --title "$links_title")
  if [[ -n "$abs_links_out" ]]; then
    report_cmd+=(--out "$abs_links_out")
  fi
  if [[ -n "$post_gh_pr" ]]; then
    report_cmd+=(--post-gh-pr "$post_gh_pr")
  fi
  if [[ -n "$gh_repo" ]]; then
    report_cmd+=(--repo "$gh_repo")
  fi
  echo "[openclaw-cycle] generating explorer link report"
  (cd "$abs_repo" && "${report_cmd[@]}")
fi
