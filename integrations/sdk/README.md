# @clawcommit/sdk

TypeScript SDK for the ClawCommit AI Decision Commit-Reveal Protocol on BNB Chain.

## Overview

ClawCommit enables tamper-evident, auditable decision logs via a commit-reveal pattern with cryptographic replay verification. This SDK abstracts all blockchain complexity, allowing any AI tool or application to use ClawCommit with simple function calls.

## Installation

```bash
npm install @clawcommit/sdk ethers
```

## Quick Start

### Commit and Reveal (Write Operations)

```typescript
import { ClawCommit } from "@clawcommit/sdk";

const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY, // Required for write operations
});

// 1. Commit a decision
const result = await claw.commit("APPROVE_TRADE_42");
console.log("Commit ID:", result.commitId);
console.log("Transaction:", result.explorerUrl);
console.log("Save this nonce:", result.nonce); // IMPORTANT: Save for reveal!

// 2. Reveal later
const revealResult = await claw.reveal(
  parseInt(result.commitId),
  "APPROVE_TRADE_42",
  result.nonce
);
console.log("Revealed:", revealResult.explorerUrl);
console.log("Verified:", revealResult.verified);
```

### Read-Only Mode (No Private Key Needed)

```typescript
import { ClawCommit } from "@clawcommit/sdk";

// Initialize without private key for read-only operations
const reader = new ClawCommit({
  contractAddress: "0x...",
});

// Verify any revealed commitment
const proof = await reader.verify(0);
console.log("Decision:", proof.decision);
console.log("Nonce:", proof.nonce);
console.log("Verified:", proof.verified);
console.log("Timestamp:", proof.timestamp);
console.log("Committer:", proof.committer);
```

## API Reference

### Constructor

```typescript
new ClawCommit(config: ClawCommitConfig)
```

**Parameters:**
- `config.contractAddress` (string, required): ClawCommit contract address on BNB Chain
- `config.privateKey` (string, optional): Private key for signing transactions (required for commit/reveal)
- `config.rpcUrl` (string, optional): RPC URL (defaults to BSC mainnet)

**Example:**
```typescript
// Mainnet with write access
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
});

// Testnet
const clawTest = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
});

// Read-only
const reader = new ClawCommit({
  contractAddress: "0x...",
});
```

### Methods

#### `commit(decision: string, nonce?: string): Promise<CommitResult>`

Commit a decision to the blockchain.

**Parameters:**
- `decision` (string): The decision to commit
- `nonce` (string, optional): Nonce for hashing (auto-generated if not provided)

**Returns:**
```typescript
{
  commitId: string;      // Unique commitment ID
  hash: string;          // Computed hash
  nonce: string;         // Nonce used (save this!)
  txHash: string;        // Transaction hash
  explorerUrl: string;   // Block explorer URL
}
```

**Example:**
```typescript
const result = await claw.commit("DEPLOY_MODEL_V2");
console.log(`Committed as ID ${result.commitId}`);
console.log(`Nonce: ${result.nonce}`); // Save securely!
```

#### `reveal(commitId: number, decision: string, nonce: string): Promise<RevealResult>`

Reveal a previously committed decision.

**Parameters:**
- `commitId` (number): The commitment ID to reveal
- `decision` (string): The original decision string
- `nonce` (string): The nonce used during commitment

**Returns:**
```typescript
{
  commitId: string;      // Commitment ID revealed
  txHash: string;        // Transaction hash
  verified: boolean;     // Verification result
  explorerUrl: string;   // Block explorer URL
}
```

**Example:**
```typescript
await claw.reveal(0, "DEPLOY_MODEL_V2", savedNonce);
```

#### `verify(commitId: number): Promise<VerifyResult>`

Verify a revealed commitment by replaying the hash computation.

**Parameters:**
- `commitId` (number): The commitment ID to verify

**Returns:**
```typescript
{
  commitId: string;      // Commitment ID
  decision: string;      // Revealed decision
  nonce: string;         // Revealed nonce
  storedHash: string;    // Hash stored in contract
  replayHash: string;    // Hash recomputed from decision + nonce
  verified: boolean;     // Whether hashes match
  timestamp: string;     // ISO timestamp of commit
  committer: string;     // Address that created commitment
  revealed: boolean;     // Whether revealed
}
```

**Example:**
```typescript
const proof = await claw.verify(0);
if (proof.verified) {
  console.log(`Decision "${proof.decision}" verified at ${proof.timestamp}`);
  console.log(`Made by ${proof.committer}`);
}
```

#### `getCommitCount(): Promise<number>`

Get total number of commitments in the contract.

**Returns:** Total commit count

**Example:**
```typescript
const count = await claw.getCommitCount();
console.log(`Total commits: ${count}`);
```

#### `getCommitment(commitId: number): Promise<CommitmentData>`

Get raw commitment data from the contract.

**Returns:**
```typescript
{
  hash: string;
  timestamp: bigint;
  committer: string;
  revealed: boolean;
  decision: string;
  nonce: string;
}
```

### Static Methods

#### `ClawCommit.computeHash(decision: string, nonce?: string): { hash: string; nonce: string }`

Compute hash for a decision and nonce (no blockchain interaction).

**Example:**
```typescript
const { hash, nonce } = ClawCommit.computeHash("APPROVE_TRADE_42");
console.log("Hash:", hash);
console.log("Nonce:", nonce);
```

#### `ClawCommit.generateNonce(): string`

Generate a cryptographically secure random nonce.

**Returns:** 64-character hex string (32 bytes)

**Example:**
```typescript
const nonce = ClawCommit.generateNonce();
```

### Utility Methods

#### `getContractAddress(): string`

Get the contract address being used.

#### `getProvider(): ethers.JsonRpcProvider`

Get the ethers provider instance.

#### `getSigner(): ethers.Wallet | undefined`

Get the ethers wallet instance (if configured).

#### `isReadOnly(): boolean`

Check if SDK is in read-only mode.

## Use Cases

### AI Agent Decision Logging

```typescript
import { ClawCommit } from "@clawcommit/sdk";

const claw = new ClawCommit({
  contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
  privateKey: process.env.AGENT_PRIVATE_KEY!,
});

async function logAgentDecision(decision: string) {
  // Commit immediately
  const result = await claw.commit(decision);

  // Store nonce in your database
  await db.saveNonce(result.commitId, result.nonce);

  console.log(`Agent decision committed: ${result.commitId}`);
  return result;
}

async function revealDecision(commitId: number) {
  // Retrieve nonce from database
  const { decision, nonce } = await db.getCommitment(commitId);

  // Reveal onchain
  await claw.reveal(commitId, decision, nonce);

  console.log(`Decision ${commitId} revealed`);
}
```

### Audit Trail Verification

```typescript
import { ClawCommit } from "@clawcommit/sdk";

const reader = new ClawCommit({
  contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
});

async function auditCommitments() {
  const count = await reader.getCommitCount();

  for (let i = 0; i < count; i++) {
    const commitment = await reader.getCommitment(i);

    if (commitment.revealed) {
      const proof = await reader.verify(i);
      console.log(`Commit ${i}: ${proof.verified ? "VALID" : "INVALID"}`);
      console.log(`  Decision: ${proof.decision}`);
      console.log(`  Time: ${proof.timestamp}`);
      console.log(`  By: ${proof.committer}`);
    }
  }
}
```

### Trading Bot with Tamper-Proof Logs

```typescript
import { ClawCommit } from "@clawcommit/sdk";

const claw = new ClawCommit({
  contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
  privateKey: process.env.BOT_PRIVATE_KEY!,
});

async function executeTradeWithProof(tradeData: any) {
  // 1. Commit decision before execution
  const decision = JSON.stringify({
    action: "BUY",
    symbol: "BNB",
    amount: 10,
    price: 350,
    timestamp: Date.now(),
  });

  const commit = await claw.commit(decision);

  // 2. Execute trade
  const trade = await exchange.executeTrade(tradeData);

  // 3. Reveal commitment
  await claw.reveal(
    parseInt(commit.commitId),
    decision,
    commit.nonce
  );

  return {
    trade,
    proof: commit.explorerUrl,
  };
}
```

### Compliance Verification

```typescript
import { ClawCommit } from "@clawcommit/sdk";

const reader = new ClawCommit({
  contractAddress: "0x...",
});

async function verifyCompliance(commitId: number) {
  try {
    const proof = await reader.verify(commitId);

    if (!proof.verified) {
      throw new Error("Hash mismatch - data may be tampered");
    }

    const decision = JSON.parse(proof.decision);
    const commitTime = new Date(proof.timestamp);

    return {
      valid: true,
      decision,
      timestamp: commitTime,
      committer: proof.committer,
      blockchainProof: `${reader.getContractAddress()}#${commitId}`,
    };
  } catch (error) {
    return { valid: false, error: (error as Error).message };
  }
}
```

## Error Handling

The SDK throws descriptive errors for common issues:

```typescript
try {
  await claw.commit("DECISION");
} catch (error) {
  if (error.message.includes("Private key required")) {
    console.error("Need to initialize SDK with private key");
  } else if (error.message.includes("Transaction failed")) {
    console.error("Blockchain transaction error:", error);
  }
}
```

## Network Configuration

### BNB Chain Mainnet (Default)

```typescript
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
  // rpcUrl defaults to mainnet
});
```

### BNB Chain Testnet

```typescript
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
});
```

### Custom RPC

```typescript
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: "https://your-custom-rpc.com",
});
```

## TypeScript Support

Full TypeScript support with comprehensive type definitions:

```typescript
import {
  ClawCommit,
  ClawCommitConfig,
  CommitResult,
  RevealResult,
  VerifyResult,
} from "@clawcommit/sdk";
```

## Security Best Practices

1. **Never commit private keys to version control**
   ```typescript
   // Use environment variables
   const claw = new ClawCommit({
     contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
     privateKey: process.env.PRIVATE_KEY!,
   });
   ```

2. **Securely store nonces**
   - Nonces must be saved to reveal commitments
   - Store in encrypted database or secure key management system
   - Never log nonces to console in production

3. **Validate inputs**
   ```typescript
   if (!decision || decision.length === 0) {
     throw new Error("Decision cannot be empty");
   }
   ```

4. **Use read-only mode when possible**
   ```typescript
   // For verification only, no private key needed
   const reader = new ClawCommit({ contractAddress: "0x..." });
   ```

## License

MIT

## Support

For issues, questions, or contributions, please visit the [ClawCommit repository](https://github.com/yourusername/ClawCommit).
