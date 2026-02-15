# OpenClaw Native Integration

This folder provides a local OpenClaw integration layer for ClawCommit.

## What it includes

- `openclaw.js`: thin wrapper around `skills/operate-clawcommit/scripts/decision_cycle.sh`
- `openclaw-decision.schema.json`: provider-neutral decision log schema
- `convert-to-clawcommit.js`: schema validator + converter for agent logs

## Decision log schema

Standardized fields required from Claude/Codex/Gemini/OpenClaw runs:

- `sessionId`
- `agentId`
- `eventType`
- `timestamp` (RFC3339)
- `prompt`
- `output`
- `modelVersion`
- `nonce` (`0x` + 64 hex)

Optional:

- `metadata` (free-form context map)

## Convert provider log to ClawCommit payload

```bash
node integrations/openclaw/convert-to-clawcommit.js \
  --input artifacts/openclaw-run.json \
  --out .clawcommit/decision.json
```

## Convert + execute commit/reveal/replay

```bash
node integrations/openclaw/convert-to-clawcommit.js \
  --input artifacts/openclaw-run.json \
  --out .clawcommit/decision.json \
  --run-decision-cycle \
  --repo . \
  --network bscTestnet \
  --contract "$CLAWCOMMIT_CONTRACT_TESTNET" \
  --rpc "$BSC_TESTNET_RPC_URL" \
  --json-out .clawcommit/decision-cycle.json \
  --json-include-prompt \
  --links-out .clawcommit/decision-cycle.md \
  --links-include-prompt
```

## Wrapper API (direct)

```bash
npm run openclaw:attest -- \
  --repo . \
  --network bscTestnet \
  --contract "$CLAWCOMMIT_CONTRACT_TESTNET" \
  --decision-json .clawcommit/decision.json \
  --json-out .clawcommit/example.json \
  --json-include-prompt \
  --links-out .clawcommit/example.md \
  --links-include-prompt
```

## Safety defaults

- Testnet-first for PR paths.
- Mainnet writes require explicit `--allow-mainnet-writes true` and workflow gating.
- Link-report prompt rendering is opt-in.
- Redaction is enabled by default for prompt/output rendering.
