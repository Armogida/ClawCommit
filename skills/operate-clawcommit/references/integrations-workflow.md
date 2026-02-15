# Integrations Workflow

## Choose Integration Surface

- MCP server (`integrations/mcp-server/`): interactive AI tool usage.
- GitHub Action (`integrations/github-action/`): CI/CD commit/reveal automation.
- TypeScript SDK (`integrations/sdk/`): programmatic use in apps/services.
- AI schemas (`integrations/ai-schemas/`): function-calling schema exports.

## MCP Server

1. Install and configure.

```bash
cd integrations/mcp-server
npm install
```

2. Configure `.env` with:
- `DEPLOYER_PRIVATE_KEY`
- `BSC_RPC_URL`
- `BSC_TESTNET_RPC_URL` (optional)

3. Validate tool wiring.

```bash
node test-tools.js
```

Supported tools:
- `clawcommit_commit`
- `clawcommit_reveal`
- `clawcommit_verify`
- `clawcommit_compute_hash`

## GitHub Action

1. Use `integrations/github-action/action.yml` in workflow files.
2. Provide required inputs:
- `action` (`commit`, `reveal`, `verify`)
- `contract-address`
3. For state-changing steps also provide:
- `private-key`
- payload fields (`prompt`, `output`, `model-version`)
- `nonce` for reveal
4. Keep reveal payload and nonce identical to commit payload and nonce.

## TypeScript SDK

1. Install dependencies in `integrations/sdk/`.

```bash
cd integrations/sdk
npm install
```

2. Use the high-level client:
- initialize `ClawCommit` with `contractAddress`, `rpcUrl`, and `privateKey`
- call `commit(payload)`
- call `reveal(commitId, payload, nonce)`
- call `verify(commitId)`

3. Use `ClawCommit.computeDecisionHash(payload)` for offchain deterministic hashing.

## AI Schemas

Use schemas in `integrations/ai-schemas/` when generating structured tool invocations:
- `openai-tools.json`
- `anthropic-tools.json`
- `gemini-tools.json`

## Common Integration Guardrails

- Do not expose private keys in logs or committed files.
- Use testnet before mainnet for new integration wiring.
- Capture commit IDs and nonces from automation output for downstream reveal steps.
- Verify final state with replay or verify tooling after reveal.
