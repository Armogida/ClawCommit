# Batch Workflow

## Hash and Tree Rules

- Leaf hash: `keccak256(abi.encode(prompt, output, modelVersion, nonce, leafIndex))`
- Parent hash: `keccak256(abi.encode(left, right))`
- Odd-width levels duplicate the last node.
- Leaf ordering is strictly ascending by `leafIndex`.

## Build Manifest from NDJSON

```bash
npx ts-node scripts/batch/build.ts \
  --in data/decisions-batch-001.ndjson \
  --out artifacts/batches/batch-001.manifest.json \
  --model-version clawcommit-v2.0
```

## Recompute Root Locally

```bash
npx ts-node scripts/batch/recomputeRoot.ts \
  --manifest artifacts/batches/batch-001.manifest.json
```

Use this step to prove deterministic root reproduction before onchain commit.

## Deploy Batch Contract

```bash
npx hardhat run scripts/batch/deployBatch.ts --network bsc
```

## Commit Batch Root

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/commitBatch.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --manifest artifacts/batches/batch-001.manifest.json
```

Expected output: batch ID, root, leaf count, and transaction hash.

## Read Batch Metadata

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/getBatch.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id <BATCH_ID>
```

## Generate Inclusion Proof

```bash
npx ts-node scripts/batch/generateProof.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --leaf-index <LEAF_INDEX> \
  --out artifacts/batches/batch-001-leaf-<LEAF_INDEX>.proof.json
```

## Reveal Leaf with Proof

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/revealLeaf.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id <BATCH_ID> \
  --leaf-index <LEAF_INDEX> \
  --manifest artifacts/batches/batch-001.manifest.json
```

## Replay Batch Determinism

Local verification:

```bash
npx ts-node scripts/batch/replayBatch.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --local
```

Onchain cross-check:

```bash
npx ts-node scripts/batch/replayBatch.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id <BATCH_ID> \
  --network bsc
```

## Local Demonstration Shortcut

```bash
npm run batch:demo:local
```

This runs build, proof generation, commit, reveal, and replay steps and writes a transcript to `deployment-proof/batch-demo-transcript.txt`.

## Automated Local Batch Cycle

Use the bundled helper to run build, recompute root, proof generation, and local replay verification:

```bash
bash <skill-dir>/scripts/batch_local_cycle.sh \
  --repo <repo-path> \
  --in data/decisions-batch-001.ndjson \
  --out artifacts/batches/batch-001.manifest.json \
  --model-version clawcommit-v2.0 \
  --leaf-index 1 \
  --json-out artifacts/batches/batch-001.local-cycle.json
```
