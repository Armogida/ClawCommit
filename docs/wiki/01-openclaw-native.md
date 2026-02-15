# OpenClaw Native: Verifiable SDLC Decisions for AI Coding Agents

Modern AI agents are writing, reviewing, merging, and deploying code that affects real systems.
OpenClaw Native is the ClawCommit profile that makes those decisions tamper-evident.

## Why this exists

Most agent decision logs are mutable and operator-controlled.
ClawCommit anchors decisions on-chain with deterministic commit-reveal hashing:

`keccak256(abi.encode(prompt, output, modelVersion, nonce))`

If a reveal differs from the committed hash, tampering is immediately detectable.

## What OpenClaw Native adds

- Provider-neutral decision log schema (`integrations/openclaw/openclaw-decision.schema.json`)
- Converter/adapter from agent logs to ClawCommit payloads (`integrations/openclaw/convert-to-clawcommit.js`)
- Wrapper CLI for decision cycle execution (`integrations/openclaw/openclaw.js`)
- PR/merge workflow templates that publish explorer links and artifacts

## Recommended flow

1. Agent framework emits a standardized decision log JSON.
2. Adapter validates the log against schema.
3. Adapter converts it to ClawCommit decision payload.
4. Decision cycle commits/reveals/verifies.
5. Workflow posts redacted links and stores full artifact.

## Default posture

- PR path: testnet writes (`bscTestnet`)
- Merge path: mainnet only with explicit allow flag and guarded workflow
- Prompt/output public rendering: opt-in
- Redaction: enabled by default for link reports

## Example

```bash
node integrations/openclaw/convert-to-clawcommit.js \
  --input artifacts/openclaw-run.json \
  --out .clawcommit/decision.json \
  --run-decision-cycle \
  --repo . \
  --network bscTestnet \
  --contract "$CLAWCOMMIT_CONTRACT_TESTNET" \
  --rpc "$BSC_TESTNET_RPC_URL" \
  --json-out .clawcommit/pr-123.json \
  --json-include-prompt \
  --links-out .clawcommit/pr-123.md \
  --links-include-prompt
```
