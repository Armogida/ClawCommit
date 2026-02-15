---
name: operate-clawcommit
description: Operate ClawCommit workflows in this repository, including contract deployment, commit/reveal execution, deterministic replay verification, Merkle batch commitments, and integration setup for MCP/SDK/GitHub Actions. Use when requests involve scripts under scripts/ or scripts/batch/, deployment-proof artifacts, V2 hash validation, or ClawCommit integration wiring.
---

# Operate ClawCommit

## Overview

Execute ClawCommit protocol operations with the repository's canonical commands and deterministic hash model. Load only the reference file needed for the requested workflow.

## Start

1. Confirm environment and dependencies.
- `node -v` (18+ expected)
- `npm install`
2. Prepare environment for networked actions.
- `cp .env.example .env`
- Set `BSC_RPC_URL`, `DEPLOYER_PRIVATE_KEY`, and `BSCSCAN_API_KEY` when needed.
3. Run baseline checks before deployment or mainnet transactions.
- `npx hardhat compile`
- `npm test`
4. Select and load the matching reference.
- Core commit/reveal/replay/deploy: `references/core-workflow.md`
- Merkle batch flow: `references/batch-workflow.md`
- MCP/SDK/GitHub Action integration: `references/integrations-workflow.md`

## Operating Rules

- Preserve the V2 hash model exactly: `keccak256(abi.encode(prompt, output, modelVersion, nonce))`.
- Reuse identical payload fields and `nonce` between commit and reveal.
- Default to `bsc` only when the user requests mainnet or does not override network.
- Save proof outputs in `deployment-proof/` and batch outputs in `artifacts/batches/`.
- Capture and report contract address, commit/batch IDs, transaction hashes, and verification results.
- Confirm intent before running any state-changing mainnet command.

## Fast Paths

- One-shot deploy plus proof artifacts:
`npx hardhat run scripts/deployAndProve.ts --network bsc`
- Local batch walkthrough:
`npm run batch:demo:local`
- Standalone replay check:
`npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH>`

## Bundled Scripts

- `scripts/preflight.sh`
Run install, compile, and tests in one command before onchain work.

```bash
bash <skill-dir>/scripts/preflight.sh --repo <repo-path> [--skip-install]
```

- `scripts/decision_cycle.sh`
Run commit -> reveal -> replay as one flow and emit a machine-readable summary.

```bash
bash <skill-dir>/scripts/decision_cycle.sh \
  --repo <repo-path> \
  --contract <CONTRACT_ADDRESS> \
  --prompt "<PROMPT>" \
  --output "<OUTPUT>" \
  --model-version "<MODEL_VERSION>" \
  --network bsc \
  --json-out deployment-proof/decision-cycle-summary.json
```

- `scripts/batch_local_cycle.sh`
Run build -> recomputeRoot -> generateProof -> replayBatch --local and optionally write summary JSON.

```bash
bash <skill-dir>/scripts/batch_local_cycle.sh \
  --repo <repo-path> \
  --in data/decisions-batch-001.ndjson \
  --out artifacts/batches/batch-001.manifest.json \
  --model-version clawcommit-v2.0 \
  --leaf-index 1 \
  --json-out artifacts/batches/batch-001.local-cycle.json
```

## References

- `references/core-workflow.md`
- `references/batch-workflow.md`
- `references/integrations-workflow.md`
