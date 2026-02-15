import { ethers } from "hardhat";
import { randomBytes } from "crypto";

/**
 * AI Decision Pipeline for ClawCommit
 *
 * Demonstrates the full lifecycle:
 * 1. AI agent generates a decision (simulated)
 * 2. Agent computes deterministic hash with nonce
 * 3. Agent commits hash onchain
 * 4. Agent reveals decision onchain
 * 5. Independent replay verification
 */

interface AIDecision {
  prompt: string;
  output: string;
  modelVersion: string;
  timestamp: string;
}

interface CommitRecord {
  commitId: bigint;
  decision: string;
  nonce: string;
  hash: string;
  txHash: string;
}

function generateNonce(): string {
  return randomBytes(32).toString("hex");
}

function serializeDecision(decision: AIDecision): string {
  return JSON.stringify(decision);
}

function computeHash(decision: string, nonce: string): string {
  return ethers.solidityPackedKeccak256(
    ["string", "string"],
    [decision, nonce]
  );
}

async function simulateAIDecision(): Promise<AIDecision> {
  return {
    prompt: "Should we increase the staking reward rate?",
    output: "APPROVE_RATE_INCREASE_5PCT",
    modelVersion: "clawcommit-agent-v1.0",
    timestamp: new Date().toISOString(),
  };
}

async function commitDecision(
  contractAddress: string,
  decision: AIDecision
): Promise<CommitRecord> {
  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const serialized = serializeDecision(decision);
  const nonce = generateNonce();
  const hash = computeHash(serialized, nonce);

  console.log("[COMMIT] Decision serialized:", serialized);
  console.log("[COMMIT] Nonce generated:", nonce);
  console.log("[COMMIT] Hash computed:", hash);

  const tx = await contract.commit(hash);
  const receipt = await tx.wait();

  let commitId = BigInt(0);
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "CommitCreated") {
          commitId = parsed.args.commitId;
        }
      } catch {
        // skip
      }
    }
  }

  console.log("[COMMIT] Tx:", receipt?.hash);
  console.log("[COMMIT] Commit ID:", commitId.toString());

  return {
    commitId,
    decision: serialized,
    nonce,
    hash,
    txHash: receipt?.hash || "",
  };
}

async function revealDecision(
  contractAddress: string,
  record: CommitRecord
): Promise<string> {
  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  console.log("\n[REVEAL] Revealing commit ID:", record.commitId.toString());

  const tx = await contract.reveal(
    record.commitId,
    record.decision,
    record.nonce
  );
  const receipt = await tx.wait();

  console.log("[REVEAL] Tx:", receipt?.hash);
  console.log("[REVEAL] Decision is now public onchain.");

  return receipt?.hash || "";
}

async function replayVerify(
  contractAddress: string,
  commitId: bigint
): Promise<boolean> {
  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const commitment = await contract.getCommitment(commitId);

  console.log("\n[REPLAY] Fetched commitment from chain:");
  console.log("  Hash:     ", commitment.hash);
  console.log("  Decision: ", commitment.decision);
  console.log("  Nonce:    ", commitment.nonce);
  console.log("  Revealed: ", commitment.revealed);
  console.log(
    "  Timestamp:",
    new Date(Number(commitment.timestamp) * 1000).toISOString()
  );

  const replayHash = computeHash(commitment.decision, commitment.nonce);

  console.log("\n[REPLAY] Recomputed hash:", replayHash);
  console.log("[REPLAY] Stored hash:    ", commitment.hash);

  const verified = replayHash === commitment.hash;
  console.log("[REPLAY] VERIFIED:", verified);

  return verified;
}

async function runPipeline(contractAddress: string): Promise<void> {
  console.log("=== ClawCommit AI Decision Pipeline ===\n");

  // Step 1: Simulate AI decision
  console.log("--- Step 1: AI Agent Decision ---");
  const decision = await simulateAIDecision();
  console.log("Prompt:", decision.prompt);
  console.log("Output:", decision.output);
  console.log("Model:", decision.modelVersion);
  console.log("");

  // Step 2: Commit
  console.log("--- Step 2: Commit Decision Hash ---");
  const record = await commitDecision(contractAddress, decision);
  console.log("");

  // Step 3: Reveal
  console.log("--- Step 3: Reveal Decision ---");
  await revealDecision(contractAddress, record);

  // Step 4: Replay verify
  console.log("--- Step 4: Independent Replay Verification ---");
  const verified = await replayVerify(contractAddress, record.commitId);

  // Summary
  console.log("\n=== Pipeline Complete ===");
  console.log("Commit ID:", record.commitId.toString());
  console.log("Decision:", decision.output);
  console.log("Replay Verified:", verified);
}

// CLI entry point
const args = process.argv.slice(2);
const contractIdx = args.indexOf("--contract");
if (contractIdx === -1) {
  console.error("Usage: npx hardhat run backend/aiPipeline.ts -- --contract <ADDRESS>");
  process.exit(1);
}

runPipeline(args[contractIdx + 1])
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
