# ClawCommit SDK - Quick Reference

## Installation

```bash
npm install @clawcommit/sdk ethers
```

## Basic Setup

```typescript
import { ClawCommit } from "@clawcommit/sdk";

// With write access
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
});

// Read-only
const reader = new ClawCommit({
  contractAddress: "0x...",
});
```

## Core Operations

### Commit
```typescript
const result = await claw.commit("DECISION");
// Returns: { commitId, hash, nonce, txHash, explorerUrl }
// SAVE THE NONCE!
```

### Reveal
```typescript
await claw.reveal(commitId, "DECISION", nonce);
// Returns: { commitId, txHash, verified, explorerUrl }
```

### Verify
```typescript
const proof = await claw.verify(commitId);
// Returns: { commitId, decision, nonce, storedHash, replayHash,
//           verified, timestamp, committer, revealed }
```

## Static Methods

```typescript
// Generate nonce
const nonce = ClawCommit.generateNonce();

// Compute hash
const { hash, nonce } = ClawCommit.computeHash("DECISION");
```

## Helper Methods

```typescript
// Get total commits
const count = await claw.getCommitCount();

// Get raw commitment
const data = await claw.getCommitment(commitId);

// Get contract address
const address = claw.getContractAddress();

// Check read-only mode
const isReadOnly = claw.isReadOnly();
```

## Network Configuration

### Mainnet
```typescript
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: "https://bsc-dataseed1.binance.org",
});
```

### Testnet
```typescript
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
});
```

## Error Handling

```typescript
try {
  await claw.commit("DECISION");
} catch (error) {
  if (error.message.includes("Private key required")) {
    // Initialize with private key
  } else if (error.message.includes("insufficient funds")) {
    // Add BNB for gas
  } else if (error.message.includes("Transaction failed")) {
    // Retry or check RPC
  }
}
```

## Common Patterns

### Store and Retrieve
```typescript
// Store
const result = await claw.commit(decision);
await database.save({
  commitId: result.commitId,
  nonce: result.nonce,
  decision,
});

// Retrieve and reveal
const data = await database.get(commitId);
await claw.reveal(data.commitId, data.decision, data.nonce);
```

### Batch Operations
```typescript
const decisions = ["DECISION_1", "DECISION_2", "DECISION_3"];
const commits = [];

for (const decision of decisions) {
  const result = await claw.commit(decision);
  commits.push(result);
  await new Promise(r => setTimeout(r, 1000)); // Delay between tx
}
```

### Audit All Commitments
```typescript
const count = await reader.getCommitCount();

for (let i = 0; i < count; i++) {
  const commitment = await reader.getCommitment(i);

  if (commitment.revealed) {
    const proof = await reader.verify(i);
    console.log(`Commit ${i}: ${proof.verified ? "VALID" : "INVALID"}`);
  }
}
```

## Type Definitions

```typescript
interface ClawCommitConfig {
  contractAddress: string;
  rpcUrl?: string;
  privateKey?: string;
}

interface CommitResult {
  commitId: string;
  hash: string;
  nonce: string;
  txHash: string;
  explorerUrl: string;
}

interface RevealResult {
  commitId: string;
  txHash: string;
  verified: boolean;
  explorerUrl: string;
}

interface VerifyResult {
  commitId: string;
  decision: string;
  nonce: string;
  storedHash: string;
  replayHash: string;
  verified: boolean;
  timestamp: string;
  committer: string;
  revealed: boolean;
}
```

## Environment Variables

```env
CONTRACT_ADDRESS=0x...
PRIVATE_KEY=...
RPC_URL=https://bsc-dataseed1.binance.org
```

## Gas Costs (BSC)

- **Commit:** ~50,000 gas (~$0.10 USD)
- **Reveal:** ~80,000 gas (~$0.15 USD)
- **Verify:** Free (read-only)

## Resources

- **Mainnet Explorer:** https://bscscan.com
- **Testnet Explorer:** https://testnet.bscscan.com
- **Testnet Faucet:** https://testnet.bnbchain.org/faucet-smart
- **Full Documentation:** [README.md](./README.md)

## One-Liners

```typescript
// Commit and save
const { commitId, nonce } = await claw.commit("DECISION");

// Reveal
await claw.reveal(0, "DECISION", nonce);

// Verify
const { verified } = await claw.verify(0);

// Count
const count = await claw.getCommitCount();

// Hash
const { hash } = ClawCommit.computeHash("DECISION");

// Nonce
const nonce = ClawCommit.generateNonce();
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| "Private key required" | Add `privateKey` to config |
| "Insufficient funds" | Add BNB to wallet |
| "Hash mismatch" | Decision/nonce must match exactly |
| "Already revealed" | Check with `getCommitment()` first |
| "Not yet revealed" | Can't verify until revealed |
| RPC timeout | Use different RPC endpoint |

## Support

- GitHub: [Issues](https://github.com/yourusername/ClawCommit/issues)
- Docs: [Full README](./README.md)
- Examples: [examples.ts](./examples.ts)
