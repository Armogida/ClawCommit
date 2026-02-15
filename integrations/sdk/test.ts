/**
 * Runtime test file for ClawCommit SDK.
 *
 * This test suite is CI-safe: it runs offline by default and only performs
 * chain calls when a valid CONTRACT_ADDRESS is provided.
 */

import assert from "assert";
import { ethers } from "ethers";
import { ClawCommit, DecisionPayload } from "./src/index";

const FALLBACK_ADDRESS = "0x0000000000000000000000000000000000000001";
const config = {
  contractAddress: process.env.CONTRACT_ADDRESS || "",
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: process.env.RPC_URL,
};

function hasValidContractAddress(address: string): boolean {
  return !!address && ethers.isAddress(address);
}

function samplePayload(suffix = ""): DecisionPayload {
  return {
    prompt: `Should we execute policy${suffix}?`,
    output: `APPROVE_POLICY${suffix}`,
    modelVersion: "clawcommit-sdk-test-v2",
  };
}

async function testStaticMethods() {
  console.log("\n=== Testing Static Methods ===\n");

  const nonce1 = ClawCommit.generateNonce();
  const nonce2 = ClawCommit.generateNonce();
  console.log("Generated nonce 1:", nonce1);
  console.log("Generated nonce 2:", nonce2);
  console.log("Nonces are unique:", nonce1 !== nonce2);
  console.log("Nonce length:", nonce1.length, "characters");
  assert(/^0x[0-9a-fA-F]{64}$/.test(nonce1), "Nonce 1 must be 0x-prefixed 32-byte hex");
  assert(/^0x[0-9a-fA-F]{64}$/.test(nonce2), "Nonce 2 must be 0x-prefixed 32-byte hex");

  const payload = samplePayload("_STATIC");
  const { hash, nonce } = ClawCommit.computeDecisionHash(payload);
  console.log("\nHash computation:");
  console.log("Payload:", payload);
  console.log("Nonce:", nonce);
  console.log("Hash:", hash);

  const { hash: hash2 } = ClawCommit.computeDecisionHash(payload, nonce);
  console.log("\nHash is deterministic:", hash === hash2);
  assert.strictEqual(hash, hash2, "computeDecisionHash must be deterministic for same nonce");
}

async function testConstructorValidation() {
  console.log("\n=== Testing Constructor Validation ===\n");

  assert.throws(
    () => new ClawCommit({ contractAddress: "0x..." }),
    /cannot be a placeholder/
  );
  assert.throws(
    () => new ClawCommit({ contractAddress: "invalid-address" }),
    /Invalid contract address/
  );

  const client = new ClawCommit({
    contractAddress: FALLBACK_ADDRESS,
    rpcUrl: "http://127.0.0.1:8545",
  });
  console.log("Constructor accepts valid address:", client.getContractAddress());
}

async function testBigIntSafety() {
  console.log("\n=== Testing BigInt Safety ===\n");

  const client = new ClawCommit({
    contractAddress: FALLBACK_ADDRESS,
    rpcUrl: "http://127.0.0.1:8545",
  });

  const capturedCommitIds: bigint[] = [];
  (client as unknown as { contract: unknown }).contract = {
    async commitCount() {
      return 123456789012345678901234567890n;
    },
    async getCommitment(commitId: bigint) {
      capturedCommitIds.push(commitId);
      return {
        hash: "0x" + "ab".repeat(32),
        timestamp: 1735689600n,
        committer: FALLBACK_ADDRESS,
        revealed: true,
        prompt: "p",
        output: "o",
        modelVersion: "m",
        nonce: "0x" + "11".repeat(32),
      };
    },
    async verifyReplay() {
      return true;
    },
  };

  const count = await client.getCommitCount();
  assert.strictEqual(typeof count, "bigint", "getCommitCount must return bigint");
  console.log("Commit count type:", typeof count);
  console.log("Commit count value:", count.toString());

  const largeId = "123456789012345678901234567890";
  const commitment = await client.getCommitment(largeId);
  assert.strictEqual(capturedCommitIds[0].toString(), largeId, "commitId must stay precise");
  assert.strictEqual(commitment.hash.startsWith("0x"), true);
  console.log("Large commitId handled without precision loss");
}

async function testReadOnlyMode() {
  console.log("\n=== Testing Read-Only Mode ===\n");

  if (!hasValidContractAddress(config.contractAddress)) {
    console.log("Skipping chain read test - CONTRACT_ADDRESS not set to a valid address");
    return;
  }

  const reader = new ClawCommit({
    contractAddress: config.contractAddress,
    rpcUrl: config.rpcUrl,
  });

  console.log("SDK initialized in read-only mode");
  console.log("Is read-only:", reader.isReadOnly());
  console.log("Contract address:", reader.getContractAddress());

  try {
    const count = await reader.getCommitCount();
    console.log("\nTotal commits in contract:", count.toString());
  } catch (error) {
    console.error("Error in read-only tests:", (error as Error).message);
  }
}

async function testWriteOperations() {
  console.log("\n=== Testing Write Operations ===\n");

  if (!config.privateKey) {
    console.log("Skipping write tests - no private key provided");
    return;
  }
  if (!hasValidContractAddress(config.contractAddress)) {
    console.log("Skipping write tests - CONTRACT_ADDRESS is missing or invalid");
    return;
  }

  const claw = new ClawCommit({
    contractAddress: config.contractAddress,
    privateKey: config.privateKey,
    rpcUrl: config.rpcUrl,
  });

  console.log("SDK initialized with write access");
  console.log("Is read-only:", claw.isReadOnly());

  try {
    const payload = samplePayload(`_${Date.now()}`);
    const commitResult = await claw.commit(payload);
    console.log("Commit successful:", commitResult.commitId);

    await new Promise((resolve) => setTimeout(resolve, 3000));

    const revealResult = await claw.reveal(
      commitResult.commitId,
      {
        prompt: commitResult.prompt,
        output: commitResult.output,
        modelVersion: commitResult.modelVersion,
      },
      commitResult.nonce
    );
    console.log("Reveal successful:", revealResult.txHash);
  } catch (error) {
    console.error("Error in write tests:", (error as Error).message);
  }
}

async function testErrorHandling() {
  console.log("\n=== Testing Error Handling ===\n");

  try {
    const readOnly = new ClawCommit({ contractAddress: FALLBACK_ADDRESS });
    await readOnly.commit(samplePayload("_NO_KEY"));
    console.log("ERROR: Should have thrown for commit without private key");
  } catch (error) {
    console.log("Correctly threw error for commit without private key:");
    console.log("  ", (error as Error).message);
  }

  try {
    const readOnly = new ClawCommit({ contractAddress: FALLBACK_ADDRESS });
    await readOnly.reveal(0, samplePayload("_NO_KEY"), "0x" + "22".repeat(32));
    console.log("ERROR: Should have thrown for reveal without private key");
  } catch (error) {
    console.log("\nCorrectly threw error for reveal without private key:");
    console.log("  ", (error as Error).message);
  }
}

async function runAllTests() {
  console.log("ClawCommit SDK Test Suite");
  console.log("========================\n");
  console.log("Configuration:");
  console.log("Contract:", config.contractAddress || "<not-set>");
  console.log("RPC:", config.rpcUrl || "BSC Testnet (default)");
  console.log("Private Key:", config.privateKey ? "Provided" : "Not provided (read-only mode)");

  await testStaticMethods();
  await testConstructorValidation();
  await testBigIntSafety();
  await testReadOnlyMode();
  await testErrorHandling();
  await testWriteOperations();

  console.log("\n=== All Tests Complete ===\n");
}

runAllTests().catch((error) => {
  console.error("\nTest suite error:", error);
  process.exit(1);
});
