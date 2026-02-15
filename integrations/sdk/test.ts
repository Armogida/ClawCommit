/**
 * Test file for ClawCommit SDK
 *
 * To run:
 * 1. Set environment variables: PRIVATE_KEY and CONTRACT_ADDRESS
 * 2. npm install
 * 3. npm run test
 */

import { ClawCommit, DecisionPayload } from "./src/index";

const config = {
  contractAddress: process.env.CONTRACT_ADDRESS || "0x...",
  privateKey: process.env.PRIVATE_KEY,
  rpcUrl: process.env.RPC_URL,
};

function samplePayload(suffix = ""): DecisionPayload {
  return {
    prompt: `Should we execute policy${suffix}?`,
    output: `APPROVE_POLICY${suffix}`,
    modelVersion: "clawcommit-sdk-test-v2"
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

  const payload = samplePayload("_STATIC");
  const { hash, nonce } = ClawCommit.computeDecisionHash(payload);
  console.log("\nHash computation:");
  console.log("Payload:", payload);
  console.log("Nonce:", nonce);
  console.log("Hash:", hash);

  const { hash: hash2 } = ClawCommit.computeDecisionHash(payload, nonce);
  console.log("\nHash is deterministic:", hash === hash2);
}

async function testReadOnlyMode() {
  console.log("\n=== Testing Read-Only Mode ===\n");

  const reader = new ClawCommit({
    contractAddress: config.contractAddress,
    rpcUrl: config.rpcUrl,
  });

  console.log("SDK initialized in read-only mode");
  console.log("Is read-only:", reader.isReadOnly());
  console.log("Contract address:", reader.getContractAddress());

  try {
    const count = await reader.getCommitCount();
    console.log("\nTotal commits in contract:", count);

    if (count > 0) {
      const commitment = await reader.getCommitment(0);
      console.log("\nCommitment 0 summary:");
      console.log("Committer:", commitment.committer);
      console.log("Revealed:", commitment.revealed);
      console.log("Timestamp:", new Date(Number(commitment.timestamp) * 1000).toISOString());

      if (commitment.revealed) {
        const proof = await reader.verify(0);
        console.log("\nVerification:");
        console.log("Prompt:", proof.prompt);
        console.log("Output:", proof.output);
        console.log("Model:", proof.modelVersion);
        console.log("Nonce:", proof.nonce);
        console.log("Stored hash:", proof.storedHash);
        console.log("Replay hash:", proof.replayHash);
        console.log("Verified:", proof.verified);
      }
    }
  } catch (error) {
    console.error("Error in read-only tests:", (error as Error).message);
  }
}

async function testWriteOperations() {
  console.log("\n=== Testing Write Operations ===\n");

  if (!config.privateKey) {
    console.log("Skipping write tests - no private key provided");
    console.log("Set PRIVATE_KEY environment variable to test commit/reveal");
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
    console.log("\nCommitting payload:", payload);

    const commitResult = await claw.commit(payload);
    console.log("\nCommit successful:");
    console.log("Commit ID:", commitResult.commitId);
    console.log("Hash:", commitResult.hash);
    console.log("Nonce:", commitResult.nonce);
    console.log("Tx:", commitResult.txHash);

    await new Promise(resolve => setTimeout(resolve, 3000));

    const revealResult = await claw.reveal(
      parseInt(commitResult.commitId, 10),
      {
        prompt: commitResult.prompt,
        output: commitResult.output,
        modelVersion: commitResult.modelVersion
      },
      commitResult.nonce
    );

    console.log("\nReveal successful:");
    console.log("Tx:", revealResult.txHash);
    console.log("Verified:", revealResult.verified);

    const proof = await claw.verify(parseInt(commitResult.commitId, 10));
    console.log("\nVerification result:");
    console.log("Prompt:", proof.prompt);
    console.log("Output:", proof.output);
    console.log("Model:", proof.modelVersion);
    console.log("Verified:", proof.verified);
  } catch (error) {
    console.error("Error in write tests:", (error as Error).message);
  }
}

async function testErrorHandling() {
  console.log("\n=== Testing Error Handling ===\n");

  try {
    const readOnly = new ClawCommit({ contractAddress: config.contractAddress });
    await readOnly.commit(samplePayload("_NO_KEY"));
    console.log("ERROR: Should have thrown for commit without private key");
  } catch (error) {
    console.log("Correctly threw error for commit without private key:");
    console.log("  ", (error as Error).message);
  }

  try {
    const readOnly = new ClawCommit({ contractAddress: config.contractAddress });
    await readOnly.reveal(0, samplePayload("_NO_KEY"), "nonce");
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
  console.log("Contract:", config.contractAddress);
  console.log("RPC:", config.rpcUrl || "BSC Mainnet (default)");
  console.log("Private Key:", config.privateKey ? "Provided" : "Not provided (read-only mode)");

  try {
    await testStaticMethods();
    await testReadOnlyMode();
    await testErrorHandling();
    await testWriteOperations();

    console.log("\n=== All Tests Complete ===\n");
  } catch (error) {
    console.error("\nTest suite error:", error);
    process.exit(1);
  }
}

runAllTests().catch(console.error);
