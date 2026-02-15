import { ethers } from "hardhat";
import { randomBytes } from "crypto";
import {
  assertMainnetWriteAllowed,
  formatSensitive,
  parseBooleanFlag,
  requireAddress,
} from "../scripts/common/safety";

/**
 * AI Decision Pipeline for ClawCommit V2
 *
 * Demonstrates the full lifecycle:
 * 1. AI agent generates a decision payload
 * 2. Agent computes deterministic hash with nonce
 * 3. Agent commits hash onchain
 * 4. Agent reveals prompt/output/modelVersion/nonce onchain
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
  prompt: string;
  output: string;
  modelVersion: string;
  nonce: string;
  hash: string;
  txHash: string;
}

function generateNonce(): string {
  return ethers.hexlify(randomBytes(32));
}

function computeDecisionHash(
  prompt: string,
  output: string,
  modelVersion: string,
  nonce: string
): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  return ethers.keccak256(encoded);
}

async function simulateAIDecision(): Promise<AIDecision> {
  return {
    prompt: "Should we increase the staking reward rate?",
    output: "APPROVE_RATE_INCREASE_5PCT",
    modelVersion: "clawcommit-agent-v2.0",
    timestamp: new Date().toISOString(),
  };
}

async function commitDecision(
  contractAddress: string,
  decision: AIDecision,
  logSensitive: boolean
): Promise<CommitRecord> {
  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const nonce = generateNonce();
  const hash = computeDecisionHash(
    decision.prompt,
    decision.output,
    decision.modelVersion,
    nonce
  );

  console.log("[COMMIT] Prompt:      ", formatSensitive(decision.prompt, logSensitive));
  console.log("[COMMIT] Output:      ", formatSensitive(decision.output, logSensitive));
  console.log("[COMMIT] ModelVersion:", decision.modelVersion);
  console.log("[COMMIT] Nonce:       ", formatSensitive(nonce, logSensitive));
  console.log("[COMMIT] Hash:        ", hash);

  const tx = await contract.commitDecision(hash);
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
          commitId = parsed.args.commitId as bigint;
          break;
        }
      } catch {
        // skip non-contract logs
      }
    }
  }

  console.log("[COMMIT] Tx:", receipt?.hash);
  console.log("[COMMIT] Commit ID:", commitId.toString());

  return {
    commitId,
    prompt: decision.prompt,
    output: decision.output,
    modelVersion: decision.modelVersion,
    nonce,
    hash,
    txHash: receipt?.hash || "",
  };
}

async function revealDecision(
  contractAddress: string,
  record: CommitRecord,
  logSensitive: boolean
): Promise<string> {
  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  console.log("\n[REVEAL] Revealing commit ID:", record.commitId.toString());
  if (!logSensitive) {
    console.log("[REVEAL] Sensitive payload logging disabled.");
  }

  const tx = await contract.revealDecision(
    record.commitId,
    record.prompt,
    record.output,
    record.modelVersion,
    record.nonce
  );
  const receipt = await tx.wait();

  console.log("[REVEAL] Tx:", receipt?.hash);
  console.log("[REVEAL] Decision payload is now public onchain.");

  return receipt?.hash || "";
}

async function replayVerify(
  contractAddress: string,
  commitId: bigint,
  logSensitive: boolean
): Promise<boolean> {
  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const commitment = await contract.getCommitment(commitId);

  console.log("\n[REPLAY] Fetched commitment from chain:");
  console.log("  Hash:        ", commitment.hash);
  console.log("  Prompt:      ", formatSensitive(commitment.prompt, logSensitive));
  console.log("  Output:      ", formatSensitive(commitment.output, logSensitive));
  console.log("  ModelVersion:", commitment.modelVersion);
  console.log("  Nonce:       ", formatSensitive(commitment.nonce, logSensitive));
  console.log("  Revealed:    ", commitment.revealed);
  console.log(
    "  Timestamp:   ",
    new Date(Number(commitment.timestamp) * 1000).toISOString()
  );

  const replayHash = computeDecisionHash(
    commitment.prompt,
    commitment.output,
    commitment.modelVersion,
    commitment.nonce
  );

  console.log("\n[REPLAY] Recomputed hash:", replayHash);
  console.log("[REPLAY] Stored hash:    ", commitment.hash);

  const verified = replayHash === commitment.hash;
  console.log("[REPLAY] VERIFIED:", verified);

  return verified;
}

async function runPipeline(
  contractAddress: string,
  allowMainnetWrites: boolean,
  logSensitive: boolean
): Promise<void> {
  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "ai pipeline");

  console.log("=== ClawCommit V2 AI Decision Pipeline ===\n");

  console.log("--- Step 1: AI Agent Decision ---");
  const decision = await simulateAIDecision();
  console.log("Prompt:", formatSensitive(decision.prompt, logSensitive));
  console.log("Output:", formatSensitive(decision.output, logSensitive));
  console.log("Model:", decision.modelVersion);
  console.log("Decision Timestamp:", decision.timestamp);
  console.log("");

  console.log("--- Step 2: Commit Decision Hash ---");
  const record = await commitDecision(contractAddress, decision, logSensitive);
  console.log("");

  console.log("--- Step 3: Reveal Decision ---");
  await revealDecision(contractAddress, record, logSensitive);

  console.log("--- Step 4: Independent Replay Verification ---");
  const verified = await replayVerify(contractAddress, record.commitId, logSensitive);

  console.log("\n=== Pipeline Complete ===");
  console.log("Commit ID:", record.commitId.toString());
  console.log("Output:", formatSensitive(decision.output, logSensitive));
  console.log("Replay Verified:", verified);
}

interface PipelineArgs {
  contractAddress: string;
  allowMainnetWrites: boolean;
  logSensitive: boolean;
}

function parseArgs(argv: string[]): PipelineArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contractAddress = get("--contract");
  if (!contractAddress) {
    throw new Error(
      "Usage: npx hardhat run backend/aiPipeline.ts -- --contract <ADDRESS> [--allow-mainnet-writes <true|false>] [--log-sensitive <true|false>]"
    );
  }

  return {
    contractAddress: requireAddress(contractAddress, "--contract"),
    allowMainnetWrites: parseBooleanFlag(argv, "--allow-mainnet-writes"),
    logSensitive: parseBooleanFlag(argv, "--log-sensitive"),
  };
}

const args = process.argv.slice(2);

try {
  const parsed = parseArgs(args);
  runPipeline(parsed.contractAddress, parsed.allowMainnetWrites, parsed.logSensitive)
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
} catch (error) {
  console.error((error as Error).message || error);
  process.exit(1);
}
