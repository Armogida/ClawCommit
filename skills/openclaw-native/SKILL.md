---
name: openclaw-native
description: Build and operate OpenClaw Native decision tracking in this ClawCommit repository. Use when implementing or running OpenClaw-specific SDK/MCP/schema APIs, PR+merge onchain automation, redacted PR link posting, or artifact-based reveal/replay workflows.
---

# OpenClaw Native

## Overview

Use this skill to run the OpenClaw profile end-to-end: deterministic payload build, commit on PR, reveal on merge, and replay verification with artifact persistence.
Keep writes testnet-first and keep PR comments redacted.

## Workflow

1. Verify prerequisites.
- `npm ci`
- `npm run check:node`
- `npm run compile`
- `npm test`

2. Build deterministic OpenClaw payload.
- Input schema: `modelVersion`, `context`, `validations[]`.
- Build using:
`node scripts/integration/build-openclaw-payload.js --input <input.json> --out <payload.json>`

3. Commit onchain (PR path).
- Use local action (`integrations/github-action`) or CLI.
- Persist `.clawcommit/openclaw/pr-<PR_NUMBER>-latest.json` with commit metadata and full payload.

4. Reveal on merge (artifact path).
- Retrieve the PR artifact.
- Reveal using exact `prompt/output/modelVersion/nonce` from artifact.
- Verify replay and persist `.clawcommit/openclaw/pr-<PR_NUMBER>-revealed.json`.

5. Publish redacted links.
- Build/post markdown via:
`node scripts/integration/post-cycle-links.js --artifact <artifact.json> --post-gh-pr <PR_NUMBER> --repo <OWNER/REPO>`

## Bundled Script

Use the helper script for local OpenClaw cycle execution:

```bash
bash <skill-dir>/scripts/openclaw_ci_cycle.sh \
  --repo <repo-path> \
  --input .clawcommit/openclaw/pr-42-input.json \
  --contract <CONTRACT_ADDRESS> \
  --network bscTestnet \
  --json-out deployment-proof/openclaw-cycle.json
```

Optional flags:
- `--links-out <PATH>`
- `--post-gh-pr <PR_NUMBER>` and `--gh-repo <OWNER/REPO>`
- `--allow-mainnet-writes true` (explicit only)

## References

- `references/workflow.md` for PR/merge lifecycle and guardrails.
