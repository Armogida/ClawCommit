# ClawCommit

**Deterministic AI Decision Commit-Reveal Protocol for BNB Chain**

Track: Builders' Tools

---

## Summary

ClawCommit is a smart contract protocol on BNB Chain that provides verifiable, tamper-evident decision logs for AI agents through deterministic commit-reveal mechanics. An AI agent hashes its decision with a nonce, commits the hash onchain, and later reveals the original decision. Any observer can independently replay the hash computation to cryptographically verify the decision was not altered between commit and reveal. This creates an immutable, cost-efficient audit trail that requires zero trust in the decision-maker, enabling AI systems to operate with auditable, onchain-verified integrity.

---

## Judge Quick Start (5 Minutes)

Everything runs locally -- no wallet, no testnet tokens, no blockchain connection required.

### Run Locally (No blockchain required)

```bash
git clone https://github.com/Armogida/ClawCommit.git
cd ClawCommit
npm install
npx hardhat compile
npm test                    # 32+ tests pass
REPORT_GAS=true npm test    # See gas costs per function
```

**Expected output from `npm test`:**

```
  ClawCommit
    Deployment
      ✓ Should deploy successfully
      ✓ Should start with zero commitments
    Commit
      ✓ Should create a commitment with correct hash
      ✓ Should emit CommitCreated event
      ✓ Should increment commitCount
      ...
    Reveal
      ✓ Should reveal with correct decision and nonce
      ✓ Should reject reveal with wrong decision
      ✓ Should reject reveal with wrong nonce
      ...
    Replay Verification
      ✓ Should verify a revealed commitment
      ...

  32 passing (2s)
```

### Full Proof Cycle (Local)

```bash
npx hardhat run scripts/deployAndProve.ts
# Deploys contract, commits example decision, reveals, verifies
# Writes proof artifacts to deployment-proof/
```

This runs the entire commit-reveal-verify lifecycle on a local Hardhat network in seconds, producing proof artifacts you can inspect in the `deployment-proof/` directory.

---

## Gas Efficiency

| Operation | Gas Used | Cost at 3 gwei | Type |
|-----------|----------|-----------------|------|
| `commit()` | ~55,000 | ~$0.0002 | State change |
| `reveal()` | ~90,000 | ~$0.0004 | State change |
| `verify()` | 0 | Free | View (read-only) |
| `computeHash()` | 0 | Free | Pure |
| **Full cycle** | **~145,000** | **~$0.0006** | - |

**At scale:** 1,000 decisions/day costs approximately $0.60/day or $220/year on BSC mainnet. This makes per-decision commits economically viable even for high-frequency AI systems.

Enable gas reporting to see exact costs per function:

```bash
REPORT_GAS=true npm test
```

---

## Core Value Proposition

- **Deterministic Hashing Ensures Tamper-Evidence** -- Using `keccak256(abi.encodePacked(decision, nonce))`, decisions are cryptographically bound to their commit point. Any modification produces a different hash, immediately detectable.

- **Onchain Timestamps Create Immutable Audit Trail** -- Commits and reveals are recorded on BNB Chain with block timestamps, creating a permanent, publicly verifiable record that cannot be retroactively altered.

- **Replay Verification Requires Zero Trust** -- Any observer can independently recompute the hash from the revealed decision and nonce, verifying integrity without trusting the contract, the AI agent, or any intermediary.

---

## Architecture

```
┌─────────────┐
│  AI Agent   │
│  Decides    │
└──────┬──────┘
       │
       ▼
┌──────────────────────────────────────────┐
│  Hash = keccak256(decision || nonce)     │
│  (Deterministic, off-chain computation)  │
└──────┬───────────────────────────────────┘
       │
       ▼
┌──────────────────────────────────────┐
│  COMMIT Phase (onchain)              │
│  Store: hash + block.timestamp       │
│  Decision remains private            │
└──────┬───────────────────────────────┘
       │         [Time passes]
       ▼
┌──────────────────────────────────────┐
│  REVEAL Phase (onchain)              │
│  Submit: decision + nonce            │
│  Contract recomputes & verifies hash │
└──────┬───────────────────────────────┘
       │
       ▼
┌────────────────────────────────────────────┐
│  REPLAY Verification (off-chain)           │
│  Anyone recomputes hash independently      │
│  Compares against onchain committed hash   │
│  Zero trust required                       │
└────────────────────────────────────────────┘
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Install and Compile

```bash
git clone https://github.com/Armogida/ClawCommit.git
cd ClawCommit
npm install
npx hardhat compile
```

### Run Tests

```bash
npx hardhat test
```

### Deploy Locally

```bash
npx hardhat run scripts/deploy.ts
```

### Deploy to BSC Mainnet

```bash
cp .env.example .env
# Edit .env with your BSC_RPC_URL, DEPLOYER_PRIVATE_KEY, and BSCSCAN_API_KEY
npm run deploy:mainnet
```

### Deploy + Full Proof (Mainnet)

```bash
npx hardhat run scripts/deployAndProve.ts --network bscMainnet
```

This deploys, commits an example decision, reveals it, verifies, and writes proof artifacts to `deployment-proof/`.

---

## Usage: Commit, Reveal, Replay

### 1. Commit a Decision

```bash
npx hardhat run scripts/commit.ts --network bscMainnet \
  -- --contract <CONTRACT_ADDRESS> \
  --decision "BUY_BNB_AT_580" \
  --nonce "a1b2c3d4e5f6"
```

The contract stores the keccak256 hash and block timestamp. The decision remains private.

### 2. Reveal the Decision

```bash
npx hardhat run scripts/reveal.ts --network bscMainnet \
  -- --contract <CONTRACT_ADDRESS> \
  --commit-id 0 \
  --decision "BUY_BNB_AT_580" \
  --nonce "a1b2c3d4e5f6"
```

The contract recomputes the hash and verifies it matches the original commitment.

### 3. Replay Verification

```bash
npx hardhat run scripts/replay.ts --network bscMainnet \
  -- --contract <CONTRACT_ADDRESS> \
  --commit-id 0
```

Reads the commitment data and independently recomputes the hash to verify integrity.

### 4. AI Pipeline Demo

```bash
npx hardhat run backend/aiPipeline.ts --network bscMainnet \
  -- --contract <CONTRACT_ADDRESS>
```

Simulates a full AI decision lifecycle: generate decision, commit, reveal, and replay verify.

---

## Onchain Proof

### BSC Mainnet Deployment

- Contract Address: <To be filled after mainnet deployment>
- Explorer: <To be filled after mainnet deployment>
- Deployment Tx: <To be filled after mainnet deployment>

### Example Transactions

- Commit Tx: <To be filled after mainnet deployment>
- Reveal Tx: <To be filled after mainnet deployment>
- Replay Verified: <To be filled after mainnet deployment>

---

## Repository Layout

```
ClawCommit/
├── contracts/
│   └── ClawCommit.sol              — Solidity smart contract
├── scripts/
│   ├── deploy.ts                   — Deployment script
│   ├── commit.ts                   — Commit interaction script
│   ├── reveal.ts                   — Reveal interaction script
│   ├── replay.ts                   — Replay verification script
│   ├── deployAndProve.ts           — Deploy + commit + reveal + proof
│   └── verifyContract.ts           — BscScan contract verification
├── backend/
│   └── aiPipeline.ts               — AI decision pipeline demo
├── frontend/
│   └── index.html                  — Minimal UI (MetaMask + BSC)
├── test/
│   ├── ClawCommit.test.ts          — Core contract test suite
│   └── HashValidation.test.ts      — Deterministic hash validation tests
├── deployment-proof/               — Mainnet deployment artifacts
├── docs/
│   ├── PROJECT.md                  — Project documentation
│   ├── TECHNICAL.md                — Technical specification
│   └── AI_BUILD_LOG.md             — AI-assisted build log
├── hardhat.config.ts               — Hardhat + BSC network config
├── tsconfig.json                   — TypeScript configuration
├── package.json                    — Dependencies and scripts
├── bsc.address                     — Deployment record
├── .env.example                    — Environment variable template
└── LICENSE                         — MIT License
```

---

## Security Considerations

- **Deterministic keccak256 Hashing** -- Collision-resistant, battle-tested in EVM consensus. Same inputs always produce the same hash.

- **Nonce Prevents Pre-Image Attacks** -- Random nonce ensures each commitment is unique, even for identical decisions. Makes brute-force reversal computationally infeasible.

- **No Upgradeability** -- Immutable contract with no proxy, no admin functions, no owner. Deployed behavior is permanent.

- **No Token Logic** -- No ERC20/ERC721, no transfers, no financial surface area. Eliminates reentrancy and flash loan attack vectors.

- **Minimal Contract Surface Area** -- Only `commit()`, `reveal()`, `getCommitment()`, `verify()`, and `computeHash()`. Nothing else.

- **Replay Validator is Read-Only** -- Verification is performed off-chain with no contract interaction needed. Zero-trust, trust-independent verification.

---

## Troubleshooting

### `npm install` fails

Ensure you have **Node.js 18+** installed. Check with `node -v`. If dependencies fail to resolve, clear the cache and retry:

```bash
rm -rf node_modules package-lock.json
npm cache clean --force
npm install
```

### Compile fails

Hardhat downloads the Solidity 0.8.24 compiler automatically on first compile. If it fails:

```bash
npx hardhat clean
npx hardhat compile
```

Ensure you have a stable internet connection for the initial compiler download.

### Tests fail

Reset the build artifacts and recompile:

```bash
npx hardhat clean
npx hardhat compile
npm test
```

### MetaMask won't connect (frontend)

Switch MetaMask to the **BSC network**:

- **Network Name:** BNB Smart Chain
- **RPC URL:** `https://bsc-dataseed.binance.org/`
- **Chain ID:** 56
- **Currency Symbol:** BNB
- **Block Explorer:** `https://bscscan.com`

### Reveal fails with "Hash mismatch"

The `reveal()` function recomputes `keccak256(abi.encodePacked(decision, nonce))` and compares it against the stored hash. A mismatch means the decision or nonce strings provided during reveal do not exactly match those used during commit. Ensure:

- The **exact same decision string** is used (case-sensitive, no extra whitespace)
- The **exact same nonce string** is used
- No characters were added or removed between commit and reveal

---

## License

MIT
