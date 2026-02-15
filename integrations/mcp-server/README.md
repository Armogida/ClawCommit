# ClawCommit MCP Server

MCP server for ClawCommit v2 commit-reveal flows on BNB Chain.

## Supported Operations
- `clawcommit_commit`
- `clawcommit_reveal`
- `clawcommit_verify`
- `clawcommit_compute_hash`

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
- `network` (`bscMainnet` | `bscTestnet`)

### `clawcommit_reveal`
Required:
- `commit_id`
- `prompt`
- `output`
- `model_version`
- `nonce`
- `contract_address`

Optional:
- `network`

### `clawcommit_verify`
Required:
- `commit_id`
- `contract_address`

Optional:
- `network`

### `clawcommit_compute_hash`
Required:
- `prompt`
- `output`
- `model_version`

Optional:
- `nonce`

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

## Notes
- Reveal requires the same payload fields and nonce used when committing.
- Verify works only after reveal.
- Commit/reveal are state-changing and require funded wallet.
