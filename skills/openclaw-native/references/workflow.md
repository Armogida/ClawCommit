# OpenClaw Native Workflow

## Objective

Track CI validation decisions with deterministic OpenClaw payloads and ClawCommit commit-reveal proofs while keeping PR comments redacted.

## Deterministic Rules

1. Build payload from `{ modelVersion, context, validations[] }`.
2. Sort validations by `name` before prompt construction.
3. Use prompt template version `openclaw-prompt-v1`.
4. Map decision output:
- `OPENCLAW_APPROVE` when all required validations pass.
- `OPENCLAW_REJECT` when any required validation fails.
5. Keep `prompt/output/modelVersion/nonce` byte-identical between commit and reveal.

## PR Commit Flow

1. Collect validation outcomes (`check-node`, `compile`, `tests`, optional extras).
2. Build payload via:
`node scripts/integration/build-openclaw-payload.js --input <input.json> --out <payload.json>`
3. Commit on `bscTestnet` using local GitHub Action or CLI.
4. Save `.clawcommit/openclaw/pr-<PR_NUMBER>-latest.json` including:
- prompt, output, modelVersion, nonce
- context and validations
- commitId, hash, commitTx
- promptDigest, network, contract
5. Post a PR comment with explorer links only (redacted payload).

## Merge Reveal Flow

1. Download latest PR artifact for the merged PR.
2. Reveal with the exact payload + nonce from the artifact.
3. Run verify/replay check and require `verified=true`.
4. Write `.clawcommit/openclaw/pr-<PR_NUMBER>-revealed.json` with reveal tx + verify status.
5. Post updated PR comment with reveal tx link and verification summary.

## Local End-to-End Helper

Use the bundled helper when testing outside GitHub Actions:

```bash
bash skills/openclaw-native/scripts/openclaw_ci_cycle.sh \
  --repo /path/to/ClawCommit \
  --input .clawcommit/openclaw/pr-42-input.json \
  --contract 0xYourContract \
  --network bscTestnet \
  --json-out deployment-proof/openclaw-cycle.json
```

## Safety Defaults

- Default network is `bscTestnet`.
- Mainnet writes require explicit allow flag.
- PR comments are redacted by default.
- Full payload is artifact-only.
- Do not print private keys or raw secrets.
