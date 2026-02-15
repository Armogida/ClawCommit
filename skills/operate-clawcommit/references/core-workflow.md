# Core Workflow

## Preflight

1. Install and validate local build state.
- `npm install`
- `npx hardhat compile`
- `npm test`
2. Configure `.env` for remote networks.
- `BSC_RPC_URL`
- `DEPLOYER_PRIVATE_KEY`
- `BSCSCAN_API_KEY`
3. Choose network intentionally.
- `bsc` for mainnet
- `bscTestnet` for testnet

Bundled shortcut:

```bash
bash <skill-dir>/scripts/preflight.sh --repo <repo-path> [--skip-install]
```

## Deploy Contract

```bash
npx hardhat run scripts/deploy.ts --network bsc
```

Expected output: deployed contract address and deploy transaction hash.
Persist address to `bsc.address` or task notes.

## Commit Decision

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/commit.ts \
  --contract <CONTRACT_ADDRESS> \
  --prompt "<PROMPT>" \
  --output "<OUTPUT>" \
  --model-version "<MODEL_VERSION>" \
  --nonce "<NONCE>"
```

Expected output: commit ID, transaction hash, and computed commitment hash.
Store the nonce because reveal must reuse it.

## Reveal Decision

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/reveal.ts \
  --contract <CONTRACT_ADDRESS> \
  --commit-id <COMMIT_ID> \
  --prompt "<PROMPT>" \
  --output "<OUTPUT>" \
  --model-version "<MODEL_VERSION>" \
  --nonce "<NONCE>"
```

Expected output: reveal transaction hash and success confirmation.

## Replay Verification

```bash
npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH>
```

Optional custom RPC:

```bash
npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH> --rpc <RPC_URL>
```

Success text should include:
- `Deterministic Replay Verified`
- `Commit hash matches reveal`

## One-Shot Proof Artifacts

```bash
npx hardhat run scripts/deployAndProve.ts --network bsc
```

Expected files in `deployment-proof/`:
- `contract.txt`
- `deploy-tx.txt`
- `commit-tx.txt`
- `reveal-tx.txt`

## Verify Published Source

```bash
npx hardhat run scripts/verifyContract.ts --network bsc -- --address <CONTRACT_ADDRESS>
```

Use after deployment when `BSCSCAN_API_KEY` is configured.

## Automated Decision Cycle

Use the bundled helper to run commit, reveal, and replay in one command:

```bash
bash <skill-dir>/scripts/decision_cycle.sh \
  --repo <repo-path> \
  --contract <CONTRACT_ADDRESS> \
  --prompt "<PROMPT>" \
  --output "<OUTPUT>" \
  --model-version "<MODEL_VERSION>" \
  --network bsc \
  --json-out deployment-proof/decision-cycle-summary.json
```

## Failure Triage

- `HashMismatch` on reveal: payload or nonce changed between commit and reveal.
- `OnlyCommitter`: reveal is not sent by original committer address.
- Replay script selector error: tx is not a `revealDecision` call.
- Replay status failure: reveal transaction reverted onchain.
