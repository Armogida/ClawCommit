/**
 * Real-world usage examples for ClawCommit SDK
 */

import { ClawCommit } from "./src/index";

// Example 1: AI Agent Decision Logger
// ===================================
class AIAgentLogger {
  private claw: ClawCommit;
  private nonceStore: Map<string, string>;

  constructor(contractAddress: string, privateKey: string) {
    this.claw = new ClawCommit({ contractAddress, privateKey });
    this.nonceStore = new Map(); // In production, use a database
  }

  async logDecision(agentId: string, decision: any): Promise<string> {
    const decisionStr = JSON.stringify({
      agentId,
      decision,
      timestamp: Date.now(),
    });

    const result = await this.claw.commit(decisionStr);

    // Store nonce for later reveal
    this.nonceStore.set(result.commitId, result.nonce);

    console.log(`Agent ${agentId} decision committed: ${result.commitId}`);
    console.log(`Explorer: ${result.explorerUrl}`);

    return result.commitId;
  }

  async revealDecision(commitId: string): Promise<void> {
    const nonce = this.nonceStore.get(commitId);
    if (!nonce) {
      throw new Error(`Nonce not found for commit ${commitId}`);
    }

    const commitment = await this.claw.getCommitment(commitId);
    const decisionStr = commitment.decision;

    await this.claw.reveal(commitId, decisionStr, nonce);

    console.log(`Decision ${commitId} revealed and verified`);
  }

  async auditDecision(commitId: string): Promise<any> {
    const proof = await this.claw.verify(commitId);

    return {
      decision: JSON.parse(proof.decision),
      verified: proof.verified,
      timestamp: proof.timestamp,
      committer: proof.committer,
    };
  }
}

// Example 2: Trading Bot with Tamper-Proof Logs
// ==============================================
class TradingBotLogger {
  private claw: ClawCommit;

  constructor(contractAddress: string, privateKey: string) {
    this.claw = new ClawCommit({ contractAddress, privateKey });
  }

  async executeTrade(tradeParams: {
    action: "BUY" | "SELL";
    symbol: string;
    amount: number;
    price: number;
  }): Promise<{ tradeId: string; commitId: string; proof: string }> {
    // 1. Commit decision BEFORE execution
    const decision = JSON.stringify({
      ...tradeParams,
      timestamp: Date.now(),
      nonce: ClawCommit.generateNonce(),
    });

    const commit = await this.claw.commit(decision);

    // 2. Execute trade (simulated)
    const tradeId = `trade_${Date.now()}`;
    console.log(`Executing ${tradeParams.action} ${tradeParams.amount} ${tradeParams.symbol}`);

    // 3. Reveal commitment
    await this.claw.reveal(commit.commitId, decision, commit.nonce);

    return {
      tradeId,
      commitId: commit.commitId,
      proof: commit.explorerUrl,
    };
  }

  async verifyTrade(commitId: string): Promise<boolean> {
    const proof = await this.claw.verify(commitId);
    return proof.verified;
  }
}

// Example 3: Compliance Auditor (Read-Only)
// =========================================
class ComplianceAuditor {
  private claw: ClawCommit;

  constructor(contractAddress: string) {
    // No private key needed - read-only mode
    this.claw = new ClawCommit({ contractAddress });
  }

  async auditAllCommitments(): Promise<void> {
    const count = await this.claw.getCommitCount();
    console.log(`\nAuditing ${count} commitments...\n`);

    let verified = 0;
    let unverified = 0;
    let unrevealed = 0;

    for (let i = 0; i < count; i++) {
      const commitment = await this.claw.getCommitment(i);

      if (!commitment.revealed) {
        unrevealed++;
        console.log(`Commit ${i}: NOT REVEALED`);
        continue;
      }

      try {
        const proof = await this.claw.verify(i);
        if (proof.verified) {
          verified++;
          console.log(`Commit ${i}: VERIFIED ✓`);
        } else {
          unverified++;
          console.log(`Commit ${i}: VERIFICATION FAILED ✗`);
        }
      } catch (error) {
        unverified++;
        console.log(`Commit ${i}: ERROR - ${(error as Error).message}`);
      }
    }

    console.log(`\nAudit Summary:`);
    console.log(`  Total: ${count}`);
    console.log(`  Verified: ${verified}`);
    console.log(`  Unverified: ${unverified}`);
    console.log(`  Unrevealed: ${unrevealed}`);
  }

  async getCommitmentDetails(commitId: number): Promise<any> {
    const commitment = await this.claw.getCommitment(commitId);

    if (!commitment.revealed) {
      return {
        commitId,
        status: "unrevealed",
        committer: commitment.committer,
        timestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
      };
    }

    const proof = await this.claw.verify(commitId);

    return {
      commitId,
      status: proof.verified ? "verified" : "invalid",
      decision: proof.decision,
      committer: proof.committer,
      timestamp: proof.timestamp,
      hash: proof.storedHash,
    };
  }
}

// Example 4: Multi-Signature Decision System
// ==========================================
class MultiSigDecisionSystem {
  private claws: Map<string, ClawCommit>;

  constructor(contractAddress: string, signers: { id: string; privateKey: string }[]) {
    this.claws = new Map();
    signers.forEach(({ id, privateKey }) => {
      this.claws.set(id, new ClawCommit({ contractAddress, privateKey }));
    });
  }

  async collectSignatures(decision: string): Promise<string[]> {
    const commitIds: string[] = [];

    for (const [signerId, claw] of this.claws) {
      console.log(`Collecting signature from ${signerId}...`);
      const result = await claw.commit(decision);
      commitIds.push(result.commitId);
      console.log(`  Commit ID: ${result.commitId}`);
    }

    return commitIds;
  }

  async revealAllSignatures(commitIds: string[], decision: string, nonces: string[]): Promise<void> {
    for (let i = 0; i < commitIds.length; i++) {
      const commitId = commitIds[i];
      const nonce = nonces[i];
      const [signerId, claw] = Array.from(this.claws.entries())[i];

      console.log(`Revealing signature from ${signerId}...`);
      await claw.reveal(commitId, decision, nonce);
    }
  }
}

// Example 5: Time-Locked Decision System
// ======================================
class TimeLockedDecisions {
  private claw: ClawCommit;
  private pendingReveals: Map<string, { decision: string; nonce: string; revealAt: number }>;

  constructor(contractAddress: string, privateKey: string) {
    this.claw = new ClawCommit({ contractAddress, privateKey });
    this.pendingReveals = new Map();
  }

  async commitWithDelay(decision: string, delaySeconds: number): Promise<string> {
    const result = await this.claw.commit(decision);

    // Schedule reveal
    this.pendingReveals.set(result.commitId, {
      decision,
      nonce: result.nonce,
      revealAt: Date.now() + delaySeconds * 1000,
    });

    console.log(`Decision committed. Will reveal in ${delaySeconds} seconds.`);
    return result.commitId;
  }

  async processPendingReveals(): Promise<void> {
    const now = Date.now();

    for (const [commitId, pending] of this.pendingReveals) {
      if (now >= pending.revealAt) {
        console.log(`Revealing time-locked commitment ${commitId}...`);
        await this.claw.reveal(commitId, pending.decision, pending.nonce);
        this.pendingReveals.delete(commitId);
      }
    }
  }
}

// Example 6: Decision Chain (Sequence of Commitments)
// ==================================================
class DecisionChain {
  private claw: ClawCommit;
  private chain: Array<{ commitId: string; decision: string; nonce: string }>;

  constructor(contractAddress: string, privateKey: string) {
    this.claw = new ClawCommit({ contractAddress, privateKey });
    this.chain = [];
  }

  async addDecision(decision: string): Promise<void> {
    // Include reference to previous commitment
    const prevCommitId = this.chain.length > 0 ? this.chain[this.chain.length - 1].commitId : null;

    const chainDecision = JSON.stringify({
      decision,
      previousCommit: prevCommitId,
      index: this.chain.length,
      timestamp: Date.now(),
    });

    const result = await this.claw.commit(chainDecision);

    this.chain.push({
      commitId: result.commitId,
      decision: chainDecision,
      nonce: result.nonce,
    });

    console.log(`Added decision ${result.commitId} to chain (index ${this.chain.length - 1})`);
  }

  async revealChain(): Promise<void> {
    console.log(`Revealing chain of ${this.chain.length} decisions...`);

    for (const entry of this.chain) {
      await this.claw.reveal(entry.commitId, entry.decision, entry.nonce);
      console.log(`  Revealed ${entry.commitId}`);
    }
  }

  async verifyChainIntegrity(): Promise<boolean> {
    console.log(`Verifying chain integrity...`);

    for (let i = 0; i < this.chain.length; i++) {
      const entry = this.chain[i];
      const proof = await this.claw.verify(entry.commitId);

      if (!proof.verified) {
        console.log(`Chain broken at index ${i}`);
        return false;
      }

      const data = JSON.parse(proof.decision);
      if (data.index !== i) {
        console.log(`Index mismatch at ${i}`);
        return false;
      }

      if (i > 0 && data.previousCommit !== this.chain[i - 1].commitId) {
        console.log(`Chain link broken between ${i - 1} and ${i}`);
        return false;
      }
    }

    console.log(`Chain verified: ${this.chain.length} decisions`);
    return true;
  }
}

// Example 7: Batch Processor
// ==========================
class BatchCommitProcessor {
  private claw: ClawCommit;

  constructor(contractAddress: string, privateKey: string) {
    this.claw = new ClawCommit({ contractAddress, privateKey });
  }

  async commitBatch(decisions: string[]): Promise<Array<{ commitId: string; nonce: string }>> {
    const results = [];

    console.log(`Committing batch of ${decisions.length} decisions...`);

    for (const decision of decisions) {
      const result = await this.claw.commit(decision);
      results.push({
        commitId: result.commitId,
        nonce: result.nonce,
      });

      // Small delay between transactions to avoid nonce issues
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Batch committed: ${results.length} commitments`);
    return results;
  }

  async revealBatch(
    commitments: Array<{ commitId: string; decision: string; nonce: string }>
  ): Promise<void> {
    console.log(`Revealing batch of ${commitments.length} commitments...`);

    for (const { commitId, decision, nonce } of commitments) {
      await this.claw.reveal(commitId, decision, nonce);

      // Small delay between transactions
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    console.log(`Batch revealed: ${commitments.length} commitments`);
  }
}

// Usage examples:

async function runExamples() {
  const contractAddress = process.env.CONTRACT_ADDRESS || "0x...";
  const privateKey = process.env.PRIVATE_KEY || "";

  console.log("ClawCommit SDK - Real-World Examples\n");

  // Example 1: AI Agent Logger
  console.log("\n=== Example 1: AI Agent Logger ===\n");
  if (privateKey) {
    const logger = new AIAgentLogger(contractAddress, privateKey);
    const commitId = await logger.logDecision("agent-001", {
      action: "approve",
      target: "trade-42",
    });
    // Later...
    // await logger.revealDecision(commitId);
  }

  // Example 3: Compliance Auditor (no private key needed)
  console.log("\n=== Example 3: Compliance Auditor ===\n");
  const auditor = new ComplianceAuditor(contractAddress);
  // await auditor.auditAllCommitments();

  console.log("\nExamples complete!");
}

// Uncomment to run:
// runExamples().catch(console.error);

export {
  AIAgentLogger,
  TradingBotLogger,
  ComplianceAuditor,
  MultiSigDecisionSystem,
  TimeLockedDecisions,
  DecisionChain,
  BatchCommitProcessor,
};
