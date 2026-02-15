# ClawCommit MCP Server

MCP server for ClawCommit v2 commit-reveal flows on BNB Chain.

## Quickstart

- Full step-by-step setup and faucet instructions: [`QUICKSTART.md`](./QUICKSTART.md)
- One-command setup from repo root: `npm run mcp:setup`
- Interactive env wizard: `npm run mcp:env`

## Supported Operations
- `clawcommit_commit`
- `clawcommit_reveal`
- `clawcommit_verify`
- `clawcommit_get_commitment`
- `clawcommit_compute_hash`
- `clawcommit_openclaw_build_payload`
- `clawcommit_openclaw_commit`
- `clawcommit_openclaw_reveal`

## Hash Model
All tools use:

```text
keccak256(abi.encode(prompt, output, modelVersion, nonce))
```

## Tool Parameters
### `clawcommit_commit`
Required:
- `prompt`
- `output`
- `model_version`
- `contract_address`

Optional:
- `nonce`
- `network` (`bscMainnet` | `bscTestnet`, defaults to `bscTestnet`)
- `allow_mainnet_writes` (defaults to `false`)
- `log_sensitive` (defaults to `false`)

If `log_sensitive=false`, you must supply `nonce` explicitly.

### `clawcommit_reveal`
Required:
- `commit_id`
- `prompt`
- `output`
- `model_version`
- `nonce`
- `contract_address`

Optional:
- `network` (defaults to `bscTestnet`)
- `allow_mainnet_writes` (defaults to `false`)

### `clawcommit_verify`
Required:
- `commit_id`
- `contract_address`

Optional:
- `network` (defaults to `bscTestnet`)
- `log_sensitive` (defaults to `false`)

### `clawcommit_compute_hash`
Required:
- `prompt`
- `output`
- `model_version`

Optional:
- `nonce`
- `log_sensitive` (defaults to `false`)

### `clawcommit_get_commitment`
Required:
- `commit_id`
- `contract_address`

Optional:
- `network` (defaults to `bscTestnet`)
- `log_sensitive` (defaults to `false`)

### `clawcommit_openclaw_build_payload`
Required:
- `model_version`
- `context` (workflow/repository + optional ref/sha/actor/runId/runUrl)
- `validations` (array of `{ name, passed, required?, details? }`)

Optional:
- `log_sensitive` (defaults to `false`)

Returns deterministic OpenClaw prompt/output plus `promptDigest`.

### `clawcommit_openclaw_commit`
Required:
- `model_version`
- `context`
- `validations`
- `contract_address`

Optional:
- `nonce` (required if `log_sensitive=false`)
- `network` (`bscMainnet` | `bscTestnet`, defaults to `bscTestnet`)
- `allow_mainnet_writes` (defaults to `false`)
- `log_sensitive` (defaults to `false`)

Builds deterministic OpenClaw payload and commits it on-chain.

### `clawcommit_openclaw_reveal`
Required:
- `commit_id`
- `model_version`
- `context`
- `validations`
- `nonce`
- `contract_address`

Optional:
- `network` (defaults to `bscTestnet`)
- `allow_mainnet_writes` (defaults to `false`)
- `log_sensitive` (defaults to `false`)

Builds deterministic OpenClaw payload and reveals the matching commitment.

## Environment
Set in `.env`:

```bash
DEPLOYER_PRIVATE_KEY=<wallet_private_key>
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
```

## Run
```bash
npm install
npm start
```

## Repo Setup (Recommended)

From repo root:

```bash
npm run mcp:setup
```

This command:
- installs `integrations/mcp-server` dependencies,
- creates `integrations/mcp-server/.env` if missing,
- writes/updates `.claude/settings.json` with a `clawcommit` MCP server entry that runs `integrations/mcp-server/run-mcp.sh`.

Then update `integrations/mcp-server/.env` with your real `DEPLOYER_PRIVATE_KEY`.

Interactive env wizard (recommended):

```bash
npm run mcp:env
```

Or run setup + wizard together:

```bash
npm run mcp:setup:interactive
```

Start manually (from repo root):

```bash
npm run mcp:start
```

## Terminal-Only Testing

If you are only using terminal (no MCP client UI), run:

```bash
# Unit tests for MCP code
npm run mcp:test

# Connectivity + wallet checks (read-only)
cd integrations/mcp-server
node test-tools.js "" bscTestnet
node test-tools.js "" bscMainnet
```

For end-to-end transactions in terminal, use repo scripts (`deploy:testnet`, `commit`, `reveal`, `replay`) under `/Users/luigiarmogida/Documents/projects/ClawCommit/scripts`.

## Notes
- Reveal requires the same payload fields and nonce used when committing.
- Verify works only after reveal.
- Commit/reveal are state-changing and require funded wallet.
- Mainnet writes are blocked by default unless `allow_mainnet_writes=true`.
- Sensitive fields are redacted by default unless `log_sensitive=true`.
