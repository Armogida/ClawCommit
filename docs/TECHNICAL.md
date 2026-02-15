# ClawCommit: Technical Specification

**Version:** 1.0.0
**Solidity:** 0.8.24
**Network:** BNB Smart Chain (BSC) -- Chain ID 56 (Mainnet), 97 (Testnet)

---

## 1. System Architecture Overview

```
                    OFF-CHAIN                          ON-CHAIN (BSC)
    ┌──────────────────────────┐       ┌────────────────────────────────┐
    │                          │       │                                │
    │  AI Agent / Decision     │       │   ClawCommit Contract          │
    │  Maker                   │       │                                │
    │                          │       │   ┌──────────────────────┐     │
    │  1. Generate decision    │       │   │ commitments mapping  │     │
    │  2. Generate nonce       │       │   │                      │     │
    │  3. Compute hash         │──────▶│   │  commitId => {       │     │
    │     keccak256(           │ commit│   │    hash,              │     │
    │       decision, nonce)   │  (hash)   │    timestamp,         │     │
    │  4. Store decision+nonce │       │   │    committer,         │     │
    │     locally              │       │   │    revealed,          │     │
    │                          │──────▶│   │    decision,          │     │
    │  5. Reveal decision+     │ reveal│   │    nonce              │     │
    │     nonce                │  (d,n)│   │  }                    │     │
    │                          │       │   └──────────────────────┘     │
    └──────────────────────────┘       └────────────────────────────────┘
                                                      │
                                                      │ read
                                                      ▼
                    ┌──────────────────────────────────────────┐
                    │  REPLAY VERIFICATION (off-chain)         │
                    │                                          │
                    │  1. Read commitment data from chain      │
                    │  2. Recompute: keccak256(decision, nonce)│
                    │  3. Compare against stored hash          │
                    │  4. Match = verified, no match = tampered│
                    │                                          │
                    │  Zero trust. Zero gas. Anyone can do it. │
                    └──────────────────────────────────────────┘
```

**Components:**

| Component | Location | Purpose |
|-----------|----------|---------|
| Smart Contract | `contracts/ClawCommit.sol` | Onchain commit-reveal storage and verification |
| Deploy Script | `scripts/deploy.ts` | Contract deployment to BSC |
| Commit Script | `scripts/commit.ts` | CLI for committing decisions |
| Reveal Script | `scripts/reveal.ts` | CLI for revealing decisions |
| Replay Script | `scripts/replay.ts` | CLI for replay verification |
| Deploy + Prove | `scripts/deployAndProve.ts` | Deploy, commit, reveal, and generate proof artifacts |
| AI Pipeline | `backend/aiPipeline.ts` | Full AI decision lifecycle demo |
| Frontend | `frontend/index.html` | Minimal UI for MetaMask/BSC interaction |
| Test Suite | `test/ClawCommit.test.ts` | Core contract tests |
| Hash Tests | `test/HashValidation.test.ts` | Deterministic hash validation tests |

---

## 2. Smart Contract Interface

### Struct Definitions

```solidity
struct Commitment {
    bytes32 hash;        // keccak256(abi.encodePacked(decision, nonce))
    uint256 timestamp;   // block.timestamp at commit time
    address committer;   // msg.sender who created the commitment
    bool revealed;       // true after successful reveal
    string decision;     // plaintext decision (empty until revealed)
    string nonce;        // plaintext nonce (empty until revealed)
}
```

### State Variables

```solidity
uint256 public commitCount;                          // auto-incrementing commit ID
mapping(uint256 => Commitment) public commitments;   // commitId => Commitment
```

### Function Signatures

```solidity
// Commit a hashed decision. Returns the new commitId.
function commit(bytes32 _hash) external returns (uint256 commitId);

// Reveal a previously committed decision. Verifies hash match.
function reveal(uint256 _commitId, string calldata _decision, string calldata _nonce) external;

// Read full commitment data (view, zero gas).
function getCommitment(uint256 _commitId) external view returns (Commitment memory);

// Verify a revealed commitment by replaying the hash (view, zero gas).
function verify(uint256 _commitId) external view returns (bool);

// Compute hash for a given decision and nonce (pure, zero gas).
function computeHash(string calldata _decision, string calldata _nonce) external pure returns (bytes32);
```

### Event Definitions

```solidity
event CommitCreated(
    uint256 indexed commitId,
    address indexed committer,
    bytes32 hash,
    uint256 timestamp
);

event CommitRevealed(
    uint256 indexed commitId,
    address indexed committer,
    string decision
);
```

---

## 3. Deterministic Hashing Specification

| Property | Value |
|----------|-------|
| Hash function | keccak256 |
| Encoding | `abi.encodePacked(decision, nonce)` |
| Input types | `string decision`, `string nonce` |
| Output | `bytes32` (256-bit hash) |
| Determinism | Same `(decision, nonce)` always produces the same hash |

**Solidity:**
```solidity
bytes32 hash = keccak256(abi.encodePacked(decision, nonce));
```

**JavaScript (ethers.js):**
```javascript
const hash = ethers.solidityPackedKeccak256(
  ["string", "string"],
  [decision, nonce]
);
```

This determinism is the core guarantee enabling replay verification. The hash function has no randomness, no state dependency, and no conditional behavior.

---

## 4. Commit Flow (Step-by-Step)

1. Agent generates a decision string (e.g., `"BUY_BNB_AT_580"`).
2. Agent generates a cryptographically random nonce (e.g., `"a1b2c3d4e5f6..."`).
3. Agent computes: `hash = keccak256(abi.encodePacked(decision, nonce))`.
4. Agent calls `commit(hash)` on the ClawCommit contract.
5. Contract stores: `commitId`, `hash`, `block.timestamp`, `msg.sender`.
6. Contract emits `CommitCreated(commitId, committer, hash, timestamp)`.
7. Agent securely stores `decision` and `nonce` locally for later reveal.

**Only the hash goes onchain at this stage.** The decision and nonce remain private until reveal.

---

## 5. Reveal Flow (Step-by-Step)

1. Agent calls `reveal(commitId, decision, nonce)`.
2. Contract loads the stored commitment for `commitId`.
3. Contract checks: `msg.sender == commitment.committer` (access control).
4. Contract checks: `!commitment.revealed` (no double reveal).
5. Contract recomputes: `expectedHash = keccak256(abi.encodePacked(decision, nonce))`.
6. Contract checks: `expectedHash == commitment.hash` (hash match).
7. If all checks pass: stores `decision`, `nonce`, sets `revealed = true`.
8. Contract emits `CommitRevealed(commitId, committer, decision)`.
9. If any check fails: transaction reverts with descriptive error.

**Revert conditions:**
- `"Only committer can reveal"` -- caller is not the original committer
- `"Already revealed"` -- commitment was already revealed
- `"Hash mismatch"` -- provided decision/nonce do not match the committed hash

---

## 6. Replay Verification Flow (Step-by-Step)

1. Verifier calls `getCommitment(commitId)` to read commitment data (zero gas).
2. Verifier extracts: `hash`, `decision`, `nonce`, `revealed` status.
3. Verifier confirms `revealed == true` (cannot verify unrevealed commitments).
4. Verifier independently computes: `replayHash = keccak256(abi.encodePacked(decision, nonce))`.
5. Verifier compares `replayHash` against the stored `hash`.
6. If match: decision integrity is confirmed. The decision is proven authentic and unmodified.

**This can be done entirely off-chain.** No transaction required. No gas cost. No trust in any operator.

---

## 7. Hardhat Configuration for BSC Mainnet

```typescript
// hardhat.config.ts
import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import * as dotenv from "dotenv";

dotenv.config();

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },
  networks: {
    bscMainnet: {
      url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
      chainId: 56,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
    bscTestnet: {
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
    hardhat: {
      chainId: 31337,
    },
  },
  etherscan: {
    apiKey: {
      bsc: process.env.BSCSCAN_API_KEY || "",
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS === "true",
    currency: "USD",
  },
};

export default config;
```

---

## 8. TypeScript Configuration

ClawCommit uses TypeScript end-to-end for scripts, tests, and configuration. Three components work together to enable this: `tsconfig.json`, `ts-node`, and TypeChain.

### tsconfig.json

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "outDir": "./dist",
    "declaration": true,
    "sourceMap": true
  },
  "include": [
    "./scripts",
    "./test",
    "./backend",
    "./hardhat.config.ts"
  ],
  "files": ["./hardhat.config.ts"]
}
```

| Setting | Purpose |
|---------|---------|
| `target: "ES2020"` | Targets ES2020 for `BigInt` support and modern JS features used by ethers.js v6 |
| `module: "commonjs"` | Uses CommonJS modules for Node.js and Hardhat compatibility |
| `strict: true` | Enables all strict type-checking options for safer code |
| `esModuleInterop: true` | Allows default imports from CommonJS modules (e.g., `import dotenv from "dotenv"`) |
| `resolveJsonModule: true` | Enables importing `.json` files as modules with type inference |
| `outDir: "./dist"` | Compiled JavaScript output directory (not used at runtime -- see ts-node below) |
| `declaration: true` | Generates `.d.ts` type declaration files alongside compiled output |
| `sourceMap: true` | Generates source maps for debugging TypeScript in stack traces |

The `include` array tells TypeScript which directories to type-check: `scripts/`, `test/`, `backend/`, and the Hardhat config file. The `files` entry ensures `hardhat.config.ts` is always included as a root file.

### ts-node: Running TypeScript Directly

Hardhat uses `ts-node` (listed in `devDependencies`) to execute `.ts` files directly without a separate compile step. When you run:

```bash
npx hardhat run scripts/deploy.ts
npx hardhat test
```

Hardhat detects `hardhat.config.ts` and automatically registers `ts-node`, which transpiles TypeScript to JavaScript in memory at runtime. This means:

- No `tsc` build step is needed before running scripts or tests
- Changes to `.ts` files take effect immediately on the next run
- The `outDir: "./dist"` setting in `tsconfig.json` is not used during development -- `ts-node` handles everything in memory

### TypeChain: Typed Contract Bindings

TypeChain generates fully typed TypeScript bindings for smart contracts. It is configured via `@typechain/hardhat` and `@typechain/ethers-v6` in `devDependencies`.

When you run `npx hardhat compile`, TypeChain automatically generates typed bindings in the `typechain-types/` directory:

```
typechain-types/
├── ClawCommit.ts           — Typed contract interface
├── factories/
│   └── ClawCommit__factory.ts  — Typed deployment factory
├── common.ts               — Shared type utilities
└── index.ts                — Re-exports all types
```

These bindings provide:

- **Type-safe contract interactions** -- Method parameters and return types are known at compile time
- **Autocompletion in editors** -- IDEs can suggest available contract methods and their signatures
- **Compile-time error detection** -- Passing wrong argument types to contract calls is caught before runtime

Example usage in tests and scripts:

```typescript
import { ClawCommit } from "../typechain-types";

const contract: ClawCommit = await ethers.deployContract("ClawCommit");
const hash: string = await contract.computeHash("BUY_BNB_AT_580", "nonce123");
// TypeScript knows computeHash takes two strings and returns a string (bytes32)
```

TypeChain bindings are regenerated automatically on every `npx hardhat compile`. They should not be committed to version control (they are excluded by `.gitignore`).

---

## 9. Environment Variables Required

Create a `.env` file from the template:

```bash
cp .env.example .env
```

Required variables:

```
BSC_RPC_URL=https://bsc-dataseed.binance.org/
DEPLOYER_PRIVATE_KEY=<your-deployer-private-key>
BSCSCAN_API_KEY=<your-bscscan-api-key>
```

**Security:** Never commit `.env` to version control. The `.gitignore` already excludes it.

---

## 10. Deployment Instructions

### Compile

```bash
npx hardhat compile
```

### Deploy to Local Hardhat Network

```bash
npx hardhat run scripts/deploy.ts
```

### Deploy to BSC Testnet

```bash
npx hardhat run scripts/deploy.ts --network bscTestnet
```

### Deploy to BSC Mainnet

```bash
npx hardhat run scripts/deploy.ts --network bscMainnet
```

Output:
```
Deploying ClawCommit...
ClawCommit deployed to: 0x...
Network: bscMainnet
Chain ID: 56
```

Record the contract address in `bsc.address`.

---

## 11. How to Verify Contract on BscScan

```bash
npx hardhat verify --network bscMainnet <CONTRACT_ADDRESS>
```

If the contract has no constructor arguments, this is all that's needed. BscScan will display the verified source code.

---

## 12. Example CLI Usage

### Commit a Decision

```bash
npx hardhat run scripts/commit.ts --network bscMainnet \
  -- --contract 0xYourContractAddress \
  --decision "BUY_BNB_AT_580" \
  --nonce "randomNonce123"
```

Output:
```
Decision: BUY_BNB_AT_580
Nonce: randomNonce123
Hash: 0x7f4a5c8b...
Commit Tx: 0xabc123...
Commit ID: 0
```

### Reveal a Decision

```bash
npx hardhat run scripts/reveal.ts --network bscMainnet \
  -- --contract 0xYourContractAddress \
  --commit-id 0 \
  --decision "BUY_BNB_AT_580" \
  --nonce "randomNonce123"
```

Output:
```
Revealing commitment 0
Decision: BUY_BNB_AT_580
Nonce: randomNonce123
Reveal Tx: 0xdef456...
Reveal successful
```

### Verify (Replay) a Commitment

```bash
npx hardhat run scripts/replay.ts --network bscMainnet \
  -- --contract 0xYourContractAddress \
  --commit-id 0
```

Output:
```
Commitment ID: 0
Hash: 0x7f4a5c8b...
Timestamp: 2026-02-14T12:00:00.000Z
Committer: 0xYourAddress
Revealed: true
Decision: BUY_BNB_AT_580
Nonce: randomNonce123
Replay Hash: 0x7f4a5c8b...
Stored Hash: 0x7f4a5c8b...
Replay Verified: true
```

---

## 13. Gas Considerations

| Function | Gas Used | Type | Cost at 5 gwei |
|----------|----------|------|-----------------|
| `commit()` | ~50,000-60,000 | State change | ~0.00025-0.0003 BNB |
| `reveal()` | ~80,000-100,000 | State change | ~0.0004-0.0005 BNB |
| `getCommitment()` | 0 | View (free) | 0 |
| `verify()` | 0 | View (free) | 0 |
| `computeHash()` | 0 | Pure (free) | 0 |

At typical BSC gas prices (3-5 gwei), a full commit-reveal cycle costs less than 0.001 BNB -- fractions of a cent. This makes per-decision commits economically viable even for high-frequency AI systems.

Enable gas reporting in tests:

```bash
REPORT_GAS=true npx hardhat test
```

---

## 14. Testing Instructions

### Run Full Test Suite

```bash
npx hardhat test
```

### Run with Gas Reporting

```bash
REPORT_GAS=true npx hardhat test
```

### Run Specific Test File

```bash
npx hardhat test test/ClawCommit.test.ts
```

### Run with Coverage

```bash
npx hardhat coverage
```

### Test Coverage Areas

The test suite covers:

- **Commit creation and storage** -- hash, timestamp, committer recorded correctly
- **Reveal with correct decision/nonce** -- hash match verification, state updates
- **Reveal rejection with wrong decision** -- reverts with "Hash mismatch"
- **Reveal rejection with wrong nonce** -- reverts with "Hash mismatch"
- **Only committer can reveal** -- reverts with "Only committer can reveal"
- **Cannot reveal twice** -- reverts with "Already revealed"
- **Hash computation correctness** -- on-chain `computeHash()` matches off-chain computation
- **Deterministic hash consistency** -- same inputs always produce same hash
- **Event emission** -- `CommitCreated` and `CommitRevealed` events emitted correctly
- **Replay verification** -- off-chain hash recomputation matches on-chain stored hash
