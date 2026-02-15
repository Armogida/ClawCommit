---
name: clawcommit
description: Integrate and operate ClawCommit commit-reveal decision logging for software delivery pipelines. Use when setting up onchain AI decision attestations, wiring CI/CD workflows, running commit/reveal operations, replay-verifying reveal transactions, or troubleshooting deterministic hash mismatches.
---

# ClawCommit

## Overview
Use this skill to add tamper-evident AI decision logs to engineering workflows with a commit-reveal flow and deterministic replay verification.
Prioritize deterministic payload handling, secret hygiene, and reproducible verification artifacts.

## Integration Modes
- `CLI scripts`: Use when a repo already has ClawCommit scripts.
- `GitHub Action`: Use for PR, merge, and release automation.
- `SDK`: Use for application-level integrations.
- `MCP server`: Use for agent tool-use integrations.

Detect available surfaces first:
- `scripts/commit.ts`, `scripts/reveal.ts`, `scripts/replay.ts`
- `integrations/github-action/action.yml`
- `integrations/sdk/package.json`
- `integrations/mcp-server/index.js`

If none exist, propose one integration mode and implement only what the user requested.

## Required Configuration
- `BSC_RPC_URL`: RPC endpoint.
- `CLAWCOMMIT_CONTRACT`: deployed contract address.
- `PRIVATE_KEY`: required for commit/reveal writes.
- `NETWORK`: Hardhat network name.
- `ALLOW_MAINNET_WRITES`: set `true` only with explicit user confirmation.

## Workflow
1. Normalize payload deterministically.
- Keep `prompt`, `output`, `modelVersion`, and `nonce` byte-identical between commit and reveal.
- Persist `commitId` and `nonce` to artifact storage (`.clawcommit/*.json` or CI artifacts).

2. Execute commit.
```bash
npx hardhat run scripts/commit.ts --network "$NETWORK" -- \
  --contract "$CLAWCOMMIT_CONTRACT" \
  --prompt "$PROMPT" \
  --output "$OUTPUT" \
  --model-version "$MODEL_VERSION" \
  --nonce "$NONCE" \
  --allow-mainnet-writes "${ALLOW_MAINNET_WRITES:-false}" \
  --log-sensitive false
```

3. Execute reveal.
```bash
npx hardhat run scripts/reveal.ts --network "$NETWORK" -- \
  --contract "$CLAWCOMMIT_CONTRACT" \
  --commit-id "$COMMIT_ID" \
  --prompt "$PROMPT" \
  --output "$OUTPUT" \
  --model-version "$MODEL_VERSION" \
  --nonce "$NONCE" \
  --allow-mainnet-writes "${ALLOW_MAINNET_WRITES:-false}" \
  --log-sensitive false
```

4. Verify deterministic replay.
```bash
npx ts-node scripts/replay.ts --tx "$REVEAL_TX_HASH" --rpc "$BSC_RPC_URL"
```
Treat replay mismatch as a release blocker.

5. Publish verification artifacts.
- Capture `commit tx`, `reveal tx`, contract address, and replay verification output.
- Attach artifacts to CI runs or release evidence.

## GitHub Action Path
When `integrations/github-action/action.yml` exists:
- Use `uses: <owner>/<repo>/integrations/github-action@<ref>`.
- Provide `private-key`, `rpc-url`, and `contract-address` from secrets.
- Use `action: commit` for pre-merge workflows and `action: reveal` for post-merge or release workflows.
- Persist commit metadata (commit id, nonce, payload) between jobs using artifacts.

## Troubleshooting
- `insufficient funds`: fund signer with BNB for gas.
- `could not detect network`: verify RPC URL and selected network.
- Replay hash mismatch: recover exact original payload and nonce.
- Mainnet write blocked: set explicit allow flag only after user confirmation.

## Output Expectations
Return:
- exact commands run,
- files changed,
- verification status for commit/reveal/replay,
- unresolved risks (secret scope, artifact retention, mainnet safety).
