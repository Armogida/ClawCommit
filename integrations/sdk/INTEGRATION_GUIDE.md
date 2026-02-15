# ClawCommit SDK Integration Guide

This guide walks through integrating the ClawCommit SDK into various AI tools and applications.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [Quick Integration](#quick-integration)
4. [Framework-Specific Integration](#framework-specific-integration)
5. [Production Deployment](#production-deployment)
6. [Troubleshooting](#troubleshooting)

## Prerequisites

- Node.js 18.0.0 or higher
- TypeScript 5.0+ (recommended)
- BNB Chain RPC access
- Private key with BNB for gas (for write operations)

## Installation

### NPM

```bash
npm install @clawcommit/sdk ethers
```

### Yarn

```bash
yarn add @clawcommit/sdk ethers
```

### PNPM

```bash
pnpm add @clawcommit/sdk ethers
```

## Quick Integration

### Step 1: Environment Setup

Create a `.env` file:

```env
CLAWCOMMIT_ADDRESS=0x...
PRIVATE_KEY=your_private_key_here
RPC_URL=https://bsc-dataseed1.binance.org
```

### Step 2: Initialize SDK

```typescript
import { ClawCommit } from "@clawcommit/sdk";
import dotenv from "dotenv";

dotenv.config();

const claw = new ClawCommit({
  contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: process.env.RPC_URL,
});
```

### Step 3: Implement Core Functions

```typescript
// Commit a decision
async function commitDecision(decision: string) {
  const result = await claw.commit(decision);

  // IMPORTANT: Store the nonce securely
  await database.saveNonce(result.commitId, result.nonce);

  return result;
}

// Reveal a decision
async function revealDecision(commitId: string) {
  const { decision, nonce } = await database.getCommitment(commitId);
  return await claw.reveal(parseInt(commitId), decision, nonce);
}

// Verify a decision
async function verifyDecision(commitId: string) {
  return await claw.verify(parseInt(commitId));
}
```

## Framework-Specific Integration

### Express.js API

```typescript
import express from "express";
import { ClawCommit } from "@clawcommit/sdk";

const app = express();
const claw = new ClawCommit({
  contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY,
});

app.post("/api/commit", async (req, res) => {
  try {
    const { decision } = req.body;
    const result = await claw.commit(decision);

    // Store nonce in your database
    await db.saveNonce(result.commitId, result.nonce);

    res.json({
      success: true,
      commitId: result.commitId,
      txHash: result.txHash,
      explorerUrl: result.explorerUrl,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

app.post("/api/reveal/:commitId", async (req, res) => {
  try {
    const { commitId } = req.params;
    const { decision, nonce } = await db.getCommitment(commitId);

    const result = await claw.reveal(parseInt(commitId), decision, nonce);

    res.json({
      success: true,
      verified: result.verified,
      txHash: result.txHash,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

app.get("/api/verify/:commitId", async (req, res) => {
  try {
    const { commitId } = req.params;
    const proof = await claw.verify(parseInt(commitId));

    res.json({
      success: true,
      proof,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: (error as Error).message,
    });
  }
});

app.listen(3000);
```

### Next.js API Routes

```typescript
// pages/api/commit.ts
import { ClawCommit } from "@clawcommit/sdk";
import type { NextApiRequest, NextApiResponse } from "next";

const claw = new ClawCommit({
  contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY,
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { decision } = req.body;
    const result = await claw.commit(decision);

    // Store nonce in database
    await prisma.commitment.create({
      data: {
        commitId: result.commitId,
        nonce: result.nonce,
        decision,
      },
    });

    res.status(200).json({ success: true, result });
  } catch (error) {
    res.status(500).json({ error: (error as Error).message });
  }
}
```

### NestJS Service

```typescript
import { Injectable } from "@nestjs/common";
import { ClawCommit } from "@clawcommit/sdk";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class ClawCommitService {
  private claw: ClawCommit;

  constructor(private configService: ConfigService) {
    this.claw = new ClawCommit({
      contractAddress: this.configService.get("CLAWCOMMIT_ADDRESS")!,
      privateKey: this.configService.get("PRIVATE_KEY"),
    });
  }

  async commitDecision(decision: string) {
    return await this.claw.commit(decision);
  }

  async revealDecision(commitId: number, decision: string, nonce: string) {
    return await this.claw.reveal(commitId, decision, nonce);
  }

  async verifyDecision(commitId: number) {
    return await this.claw.verify(commitId);
  }
}
```

### Python Integration (via Child Process)

Create a Node.js wrapper script:

```typescript
// clawcommit-wrapper.ts
import { ClawCommit } from "@clawcommit/sdk";

const claw = new ClawCommit({
  contractAddress: process.env.CLAWCOMMIT_ADDRESS!,
  privateKey: process.env.PRIVATE_KEY,
});

const [, , action, ...args] = process.argv;

async function main() {
  switch (action) {
    case "commit":
      const commitResult = await claw.commit(args[0]);
      console.log(JSON.stringify(commitResult));
      break;

    case "reveal":
      const revealResult = await claw.reveal(
        parseInt(args[0]),
        args[1],
        args[2]
      );
      console.log(JSON.stringify(revealResult));
      break;

    case "verify":
      const verifyResult = await claw.verify(parseInt(args[0]));
      console.log(JSON.stringify(verifyResult));
      break;
  }
}

main().catch(console.error);
```

Python code:

```python
import subprocess
import json

def commit_decision(decision):
    result = subprocess.run(
        ["node", "clawcommit-wrapper.js", "commit", decision],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)

def verify_decision(commit_id):
    result = subprocess.run(
        ["node", "clawcommit-wrapper.js", "verify", str(commit_id)],
        capture_output=True,
        text=True
    )
    return json.loads(result.stdout)
```

### LangChain Integration

```typescript
import { Tool } from "langchain/tools";
import { ClawCommit } from "@clawcommit/sdk";

class ClawCommitTool extends Tool {
  name = "clawcommit";
  description = "Commit and verify AI decisions on blockchain";
  private claw: ClawCommit;

  constructor(contractAddress: string, privateKey: string) {
    super();
    this.claw = new ClawCommit({ contractAddress, privateKey });
  }

  async _call(input: string): Promise<string> {
    const [action, ...args] = input.split("|");

    switch (action) {
      case "commit":
        const result = await this.claw.commit(args[0]);
        return `Committed with ID ${result.commitId}. Nonce: ${result.nonce}`;

      case "verify":
        const proof = await this.claw.verify(parseInt(args[0]));
        return `Verified: ${proof.verified}. Decision: ${proof.decision}`;

      default:
        return "Unknown action";
    }
  }
}

// Usage
const tool = new ClawCommitTool(
  process.env.CLAWCOMMIT_ADDRESS!,
  process.env.PRIVATE_KEY!
);

const result = await tool.call("commit|APPROVE_TRADE_42");
```

## Production Deployment

### 1. Nonce Storage Strategy

**Bad: In-Memory Storage**
```typescript
// DON'T DO THIS - nonces will be lost on restart
const nonces = new Map<string, string>();
```

**Good: Database Storage**
```typescript
// PostgreSQL example
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function saveNonce(commitId: string, nonce: string) {
  await pool.query(
    "INSERT INTO commitments (commit_id, nonce) VALUES ($1, $2)",
    [commitId, nonce]
  );
}

async function getNonce(commitId: string): Promise<string> {
  const result = await pool.query(
    "SELECT nonce FROM commitments WHERE commit_id = $1",
    [commitId]
  );
  return result.rows[0].nonce;
}
```

### 2. Error Handling

```typescript
import { ClawCommit } from "@clawcommit/sdk";

async function robustCommit(decision: string, retries = 3) {
  for (let i = 0; i < retries; i++) {
    try {
      const result = await claw.commit(decision);
      await saveNonce(result.commitId, result.nonce);
      return result;
    } catch (error) {
      console.error(`Attempt ${i + 1} failed:`, error);

      if (i === retries - 1) throw error;

      // Exponential backoff
      await new Promise(r => setTimeout(r, 1000 * Math.pow(2, i)));
    }
  }
}
```

### 3. Gas Management

```typescript
import { ethers } from "ethers";

async function checkGasBalance(claw: ClawCommit) {
  const signer = claw.getSigner();
  if (!signer) return;

  const balance = await signer.provider!.getBalance(signer.address);
  const minBalance = ethers.parseEther("0.01"); // 0.01 BNB

  if (balance < minBalance) {
    console.warn("Low gas balance:", ethers.formatEther(balance), "BNB");
    // Send alert, trigger refill, etc.
  }
}
```

### 4. Rate Limiting

```typescript
import rateLimit from "express-rate-limit";

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // 100 requests per window
  message: "Too many commit requests",
});

app.use("/api/commit", limiter);
```

### 5. Monitoring

```typescript
import * as Sentry from "@sentry/node";

async function monitoredCommit(decision: string) {
  const transaction = Sentry.startTransaction({
    op: "blockchain",
    name: "ClawCommit.commit",
  });

  try {
    const result = await claw.commit(decision);
    transaction.setStatus("ok");
    return result;
  } catch (error) {
    transaction.setStatus("error");
    Sentry.captureException(error);
    throw error;
  } finally {
    transaction.finish();
  }
}
```

### 6. Environment-Specific Configuration

```typescript
const config = {
  development: {
    contractAddress: "0x...", // Testnet
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
  },
  production: {
    contractAddress: "0x...", // Mainnet
    rpcUrl: "https://bsc-dataseed1.binance.org",
  },
};

const env = process.env.NODE_ENV || "development";
const claw = new ClawCommit(config[env]);
```

## Troubleshooting

### Issue: "Private key required" error

**Solution:** Initialize SDK with private key for write operations.

```typescript
const claw = new ClawCommit({
  contractAddress: "0x...",
  privateKey: process.env.PRIVATE_KEY, // Add this
});
```

### Issue: Transaction fails with "insufficient funds"

**Solution:** Ensure wallet has enough BNB for gas.

```typescript
const balance = await provider.getBalance(address);
console.log("Balance:", ethers.formatEther(balance), "BNB");
```

### Issue: "Nonce not found" error

**Solution:** Ensure nonces are stored persistently.

```typescript
// Save nonce immediately after commit
const result = await claw.commit(decision);
await database.saveNonce(result.commitId, result.nonce);
```

### Issue: RPC connection timeout

**Solution:** Use multiple RPC endpoints with fallback.

```typescript
const RPC_URLS = [
  "https://bsc-dataseed1.binance.org",
  "https://bsc-dataseed2.binance.org",
  "https://bsc-dataseed3.binance.org",
];

let claw;
for (const rpcUrl of RPC_URLS) {
  try {
    claw = new ClawCommit({
      contractAddress: "0x...",
      privateKey: process.env.PRIVATE_KEY,
      rpcUrl,
    });
    await claw.getCommitCount(); // Test connection
    break;
  } catch (error) {
    console.error(`Failed to connect to ${rpcUrl}`);
  }
}
```

### Issue: "Already revealed" error

**Solution:** Check commitment status before revealing.

```typescript
const commitment = await claw.getCommitment(commitId);
if (commitment.revealed) {
  console.log("Already revealed");
} else {
  await claw.reveal(commitId, decision, nonce);
}
```

### Issue: TypeScript compilation errors

**Solution:** Ensure TypeScript is configured correctly.

```json
{
  "compilerOptions": {
    "esModuleInterop": true,
    "skipLibCheck": true,
    "target": "ES2020",
    "module": "commonjs"
  }
}
```

## Best Practices

1. **Always store nonces securely** - Use encrypted database storage
2. **Implement retry logic** - Network issues are common
3. **Monitor gas prices** - Especially during high traffic
4. **Use read-only mode when possible** - No private key needed for verification
5. **Implement proper error handling** - Blockchain operations can fail
6. **Log all operations** - For audit trails
7. **Test on testnet first** - Before mainnet deployment
8. **Keep SDK updated** - Check for security updates
9. **Use environment variables** - Never hardcode secrets
10. **Implement rate limiting** - Prevent abuse

## Next Steps

- Review [README.md](./README.md) for API reference
- Check [examples.ts](./examples.ts) for real-world patterns
- Join community for support
- Report issues on GitHub

## Support

For questions or issues:
- GitHub Issues: [github.com/yourusername/ClawCommit/issues]
- Documentation: [docs.clawcommit.io]
- Discord: [discord.gg/clawcommit]
