# ClawCommit

Deterministic AI decision commit-reveal protocol with independent replay verification on BNB Chain.

## What It Proves

ClawCommit V2 proves:
- the AI decision can be replayed offchain,
- the recomputed hash matches the onchain commit,
- reveal integrity is cryptographically sound.

This project upgrades commit-reveal into a deterministic verification primitive suitable for infra-grade audit trails.

## Deterministic Replay Verification

ClawCommit includes a replay validator CLI that independently recomputes AI decision hashes from onchain data. This ensures third parties can cryptographically verify agent integrity without trusting the operator.

## Hashing Model (V2)

The commitment hash is:

`keccak256(abi.encode(prompt, output, modelVersion, nonce))`

Inputs are revealed later via `revealDecision(...)`. Anyone can decode the reveal transaction, recompute the hash, and compare it to contract state.

## Contract API (V2)

- `commitDecision(bytes32 commitHash) returns (uint256 commitId)`
- `revealDecision(uint256 commitId, string prompt, string output, string modelVersion, string nonce)`
- `getCommitment(uint256 commitId) returns (Commitment)`
- `verifyReplay(uint256 commitId) returns (bool)`
- `computeDecisionHash(string prompt, string output, string modelVersion, string nonce) returns (bytes32)`

## Quick Start

```bash
git clone https://github.com/Armogida/ClawCommit.git
cd ClawCommit
npm install
npx hardhat compile
npm test
```

## Network Config

Mainnet alias is available as `bsc` (same endpoint/chain as `bscMainnet`).

```bash
npx hardhat run scripts/deploy.ts --network bsc
```

## CLI Usage

### 1. Deploy

```bash
npx hardhat run scripts/deploy.ts --network bsc
```

### 2. Commit

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/commit.ts \
  --contract <CONTRACT_ADDRESS> \
  --prompt "Should we rebalance treasury?" \
  --output "APPROVE_REBALANCE" \
  --model-version "clawcommit-v2.0" \
  --nonce "example-nonce-123"
```

### 3. Reveal

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/reveal.ts \
  --contract <CONTRACT_ADDRESS> \
  --commit-id 0 \
  --prompt "Should we rebalance treasury?" \
  --output "APPROVE_REBALANCE" \
  --model-version "clawcommit-v2.0" \
  --nonce "example-nonce-123"
```

### 4. Replay Validator (Standalone)

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH
```

Optional custom RPC:

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH --rpc https://bsc-dataseed.binance.org/
```

On success it prints:

```text
✓ Deterministic Replay Verified
Commit hash matches reveal.
```

## One-Shot Deployment + Proof Artifacts

```bash
npx hardhat run scripts/deployAndProve.ts --network bsc
```

This writes:

- `deployment-proof/contract.txt`
- `deployment-proof/deploy-tx.txt`
- `deployment-proof/commit-tx.txt`
- `deployment-proof/reveal-tx.txt`

## Merkle Batching (Wave 1)

Wave 1 adds root-level batch commitments through `ClawCommitBatch`.

Batch leaf formula:

`keccak256(abi.encode(prompt, output, modelVersion, nonce, leafIndex))`

Merkle parent formula:

`keccak256(abi.encode(left, right))`

Odd-width levels duplicate the last node.

### Build a batch manifest from NDJSON

```bash
npx ts-node scripts/batch/build.ts \
  --in data/decisions-batch-001.ndjson \
  --out artifacts/batches/batch-001.manifest.json \
  --model-version clawcommit-v2.0
```

### Recompute root from manifest

```bash
npx ts-node scripts/batch/recomputeRoot.ts \
  --manifest artifacts/batches/batch-001.manifest.json
```

### Commit batch root onchain

Deploy the batch contract first:

```bash
npx hardhat run scripts/batch/deployBatch.ts --network bsc
```

Then commit:

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/commitBatch.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --manifest artifacts/batches/batch-001.manifest.json
```

### Read committed batch

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/getBatch.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id 0
```

### Generate inclusion proof JSON

```bash
npx ts-node scripts/batch/generateProof.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --leaf-index 1 \
  --out artifacts/batches/batch-001-leaf-1.proof.json
```

### Reveal a batch leaf onchain (with proof)

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/revealLeaf.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id 0 \
  --leaf-index 1 \
  --manifest artifacts/batches/batch-001.manifest.json
```

### Replay batch determinism

Local (manifest-only):

```bash
npx ts-node scripts/batch/replayBatch.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --local
```

On-chain (root/hash cross-check):

```bash
npx ts-node scripts/batch/replayBatch.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id 0 \
  --network bsc
```

## Mainnet Runbook

1. Set `.env` from `.env.example`:
   - `BSC_RPC_URL`
   - `DEPLOYER_PRIVATE_KEY`
   - `BSCSCAN_API_KEY`
2. Run:
   - `npm install && npx hardhat compile && npm test`
   - `npx hardhat run scripts/deploy.ts --network bsc`
   - commit + reveal using scripts above
   - `npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH>`
   - `npx hardhat run scripts/verifyContract.ts --network bsc -- --address <CONTRACT_ADDRESS>`
3. Persist values in `deployment-proof/` and `bsc.address`.

## Transparency

This project uses standard Solidity tooling with Hardhat and ethers.js. The current contract intentionally avoids token/governance logic and keeps minimal attack surface.

## Repo Layout

- `contracts/ClawCommit.sol` - V2 deterministic commit-reveal contract
- `contracts/ClawCommitBatch.sol` - Wave 1 Merkle batch root commitment contract
- `scripts/deploy.ts` - deploy script
- `scripts/commit.ts` - commit CLI
- `scripts/reveal.ts` - reveal CLI
- `scripts/replay.ts` - standalone replay validator (`ts-node`)
- `scripts/batch/build.ts` - NDJSON to manifest/tree builder
- `scripts/batch/recomputeRoot.ts` - deterministic root recomputation
- `scripts/batch/commitBatch.ts` - batch root commit script
- `scripts/batch/getBatch.ts` - batch read script
- `scripts/deployAndProve.ts` - one-shot deploy + proof files
- `scripts/verifyContract.ts` - BscScan verification helper
- `backend/aiPipeline.ts` - AI decision lifecycle demo
- `test/` - contract + replay script tests
- `docs/PROJECT.md` - problem/impact narrative
- `docs/TECHNICAL.md` - protocol and architecture details
- `docs/REPLAY.md` - replay validator behavior and failure modes
- `docs/AI_BUILD_LOG.md` - build/change log
- `deployment-proof/` - deployment artifacts

## Standalone Verification (Zero Trust)

Any person can verify any ClawCommit commitment independently. No wallet needed. No trust required.

### Verify by Reveal Transaction Hash

```bash
npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH>
```

Validator steps:
1. Read the commitment data from BSC (public, free)
2. Decode reveal payload (`prompt/output/modelVersion/nonce`)
3. Recompute `keccak256(abi.encode(prompt, output, modelVersion, nonce))` locally
3. Compare against the stored hash
4. If match → decision is cryptographically proven authentic

## Hackathon Submission Compliance

### Onchain Proof
- **Contract Address**: See `bsc.address` for deployed address
- **Network**: BNB Smart Chain (BSC) Mainnet — Chain ID 56
- **Explorer**: https://bscscan.com/address/[CONTRACT_ADDRESS]
- **Proof Artifacts**: See `deployment-proof/` directory for deploy, commit, and reveal transaction hashes

### Reproducibility
- **Public Repository**: https://github.com/Armogida/ClawCommit
- **Setup Time**: 5 minutes (local), 15 minutes (BSC testnet)
- **Reproduction Steps**:
  1. `git clone https://github.com/Armogida/ClawCommit.git && cd ClawCommit`
  2. `npm install && npx hardhat compile`
  3. `npm test` — 56 tests pass
  4. `npx hardhat run scripts/deployAndProve.ts` — full proof cycle locally
  5. For BSC: `cp .env.example .env` → add keys → `npm run deploy:mainnet`

### No Token Policy
This project contains **zero token logic**. No ERC20, no ERC721, no minting, no transfers, no liquidity pools, no airdrops, no governance tokens. The smart contract (`contracts/ClawCommit.sol`) exclusively implements commit-reveal storage and verification. There is no financial mechanism of any kind.

### AI Build Log
See [`docs/AI_BUILD_LOG.md`](docs/AI_BUILD_LOG.md) for detailed documentation of how Claude Code CLI (Claude Opus 4.6) was used with experimental team agent spawning to build this project. 15+ specialist agents were spawned across 4 build phases.
