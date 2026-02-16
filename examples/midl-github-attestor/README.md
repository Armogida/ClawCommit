# Midl GitHub Attestor (ClawCommit Consumer App)

A standalone app scaffold that treats ClawCommit as an external protocol dependency.

It demonstrates:
- GitHub PR context -> auto-generated `prompt`, `output`, `modelVersion`, `nonce`
- `Commit -> Reveal -> Verify` through `@clawcommit/sdk`
- RPC execution against a deployed ClawCommit contract
- UI updates with `commitId`, tx hashes, and verification result

## Why this structure

Use this as a **separate open-source project** instead of forking the full ClawCommit repository.

Best practice:
1. New repo for product/UI (`clawcommit-midl-github-attestor`)
2. Consume ClawCommit via SDK + deployed contract address
3. Keep protocol and product concerns separated

## Local setup

```bash
cd examples/midl-github-attestor
cp .env.example .env
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment variables

- `MIDL_RPC_URL`: Midl-compatible JSON-RPC endpoint
- `CLAWCOMMIT_CONTRACT_ADDRESS`: deployed ClawCommit contract (42-char EVM address)
- `DEPLOYER_PRIVATE_KEY`: signer used by server API routes
- `ALLOW_MAINNET_WRITES`: set `true` only when intentionally writing to BSC mainnet
- `MIDL_EXPLORER_BASE_URL` (optional): custom tx link base
- `GITHUB_TOKEN` (optional): for private repos or higher API quota

## API routes

- `GET /api/github/context?owner=<owner>&repo=<repo>&pr=<number>`
  - Fetches PR metadata and files from GitHub
  - Builds deterministic payload
- `POST /api/commit`
  - Input: `{ payload: { prompt, output, modelVersion, nonce } }`
- `POST /api/reveal`
  - Input: `{ commitId, payload: { prompt, output, modelVersion, nonce } }`
- `GET /api/verify?commitId=<id>`

## Moving to a new repo

This scaffold currently uses a local SDK dependency:

```json
"@clawcommit/sdk": "file:../../integrations/sdk"
```

For a standalone public repo, replace with published npm version when available, for example:

```json
"@clawcommit/sdk": "^1.0.0"
```

## Notes

- Current flow uses a server signer for speed and demo reliability.
- For production wallet-native UX (for example Xverse + WalletConnect), keep this GitHub payload generation but move commit/reveal signing to client wallet adapters.
