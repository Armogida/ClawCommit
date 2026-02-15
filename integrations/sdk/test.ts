/**
 * Test file for ClawCommit SDK
 *
 * To run:
 * 1. Set environment variables: PRIVATE_KEY and CONTRACT_ADDRESS
 * 2. npm install
 * 3. npm run test
 */

import { ClawCommit } from "./src/index";

// Configuration
const config = {
  contractAddress: process.env.CONTRACT_ADDRESS || "0x...", // Replace with actual address
  privateKey: process.env.PRIVATE_KEY, // Optional for read-only tests
  rpcUrl: process.env.RPC_URL, // Optional, defaults to BSC mainnet
};

async function testStaticMethods() {
  console.log("\n=== Testing Static Methods ===\n");

  // Test nonce generation
  const nonce1 = ClawCommit.generateNonce();
  const nonce2 = ClawCommit.generateNonce();
  console.log("Generated nonce 1:", nonce1);
  console.log("Generated nonce 2:", nonce2);
  console.log("Nonces are unique:", nonce1 !== nonce2);
  console.log("Nonce length:", nonce1.length, "characters");

  // Test hash computation
  const decision = "APPROVE_TRADE_42";
  const { hash, nonce } = ClawCommit.computeHash(decision);
  console.log("\nHash computation:");
  console.log("Decision:", decision);
  console.log("Nonce:", nonce);
  console.log("Hash:", hash);

  // Test hash determinism
  const { hash: hash2 } = ClawCommit.computeHash(decision, nonce);
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
    // Get commit count
    const count = await reader.getCommitCount();
    console.log("\nTotal commits in contract:", count);

    if (count > 0) {
      // Try to get and verify first commitment
      console.log("\nChecking first commitment (ID: 0):");
      const commitment = await reader.getCommitment(0);
      console.log("Committer:", commitment.committer);
      console.log("Revealed:", commitment.revealed);
      console.log("Timestamp:", new Date(Number(commitment.timestamp) * 1000).toISOString());

      if (commitment.revealed) {
        console.log("\nVerifying commitment 0:");
        const proof = await reader.verify(0);
        console.log("Decision:", proof.decision);
        console.log("Nonce:", proof.nonce);
        console.log("Stored hash:", proof.storedHash);
        console.log("Replay hash:", proof.replayHash);
        console.log("Verified:", proof.verified);
        console.log("Timestamp:", proof.timestamp);
      } else {
        console.log("Commitment 0 has not been revealed yet");
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
    // Test commit
    const decision = `TEST_DECISION_${Date.now()}`;
    console.log("\nCommitting decision:", decision);

    const commitResult = await claw.commit(decision);
    console.log("\nCommit successful!");
    console.log("Commit ID:", commitResult.commitId);
    console.log("Hash:", commitResult.hash);
    console.log("Nonce:", commitResult.nonce);
    console.log("Transaction:", commitResult.txHash);
    console.log("Explorer:", commitResult.explorerUrl);

    // Wait a bit for block confirmation
    console.log("\nWaiting for block confirmation...");
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Test reveal
    console.log("\nRevealing commitment:", commitResult.commitId);
    const revealResult = await claw.reveal(
      parseInt(commitResult.commitId),
      decision,
      commitResult.nonce
    );

    console.log("\nReveal successful!");
    console.log("Transaction:", revealResult.txHash);
    console.log("Verified:", revealResult.verified);
    console.log("Explorer:", revealResult.explorerUrl);

    // Verify after reveal
    console.log("\nVerifying revealed commitment...");
    const proof = await claw.verify(parseInt(commitResult.commitId));
    console.log("\nVerification result:");
    console.log("Decision:", proof.decision);
    console.log("Nonce:", proof.nonce);
    console.log("Verified:", proof.verified);
    console.log("Timestamp:", proof.timestamp);
    console.log("Committer:", proof.committer);

  } catch (error) {
    console.error("Error in write tests:", (error as Error).message);
    if ((error as any).transaction) {
      console.error("Transaction that failed:", (error as any).transaction);
    }
  }
}

async function testErrorHandling() {
  console.log("\n=== Testing Error Handling ===\n");

  // Test write operation without private key
  try {
    const readOnly = new ClawCommit({
      contractAddress: config.contractAddress,
    });
    await readOnly.commit("TEST");
    console.log("ERROR: Should have thrown for commit without private key");
  } catch (error) {
    console.log("Correctly threw error for commit without private key:");
    console.log("  ", (error as Error).message);
  }

  // Test reveal without private key
  try {
    const readOnly = new ClawCommit({
      contractAddress: config.contractAddress,
    });
    await readOnly.reveal(0, "TEST", "nonce");
    console.log("ERROR: Should have thrown for reveal without private key");
  } catch (error) {
    console.log("\nCorrectly threw error for reveal without private key:");
    console.log("  ", (error as Error).message);
  }

  // Test verify on non-revealed commitment (if exists)
  try {
    const reader = new ClawCommit({
      contractAddress: config.contractAddress,
    });

    const count = await reader.getCommitCount();
    if (count > 0) {
      // Try to find a non-revealed commitment
      for (let i = 0; i < count; i++) {
        const commitment = await reader.getCommitment(i);
        if (!commitment.revealed) {
          await reader.verify(i);
          console.log("\nERROR: Should have thrown for verify on non-revealed commitment");
          break;
        }
      }
    }
  } catch (error) {
    console.log("\nCorrectly threw error for verify on non-revealed commitment:");
    console.log("  ", (error as Error).message);
  }
}

async function testBatchOperations() {
  console.log("\n=== Testing Batch Operations ===\n");

  const reader = new ClawCommit({
    contractAddress: config.contractAddress,
    rpcUrl: config.rpcUrl,
  });

  try {
    const count = await reader.getCommitCount();
    console.log("Total commitments:", count);

    if (count > 0) {
      console.log("\nFetching all revealed commitments:");
      const limit = Math.min(count, 10); // Limit to first 10

      for (let i = 0; i < limit; i++) {
        const commitment = await reader.getCommitment(i);
        console.log(`\nCommitment ${i}:`);
        console.log("  Committer:", commitment.committer);
        console.log("  Revealed:", commitment.revealed);
        console.log("  Timestamp:", new Date(Number(commitment.timestamp) * 1000).toISOString());

        if (commitment.revealed) {
          const proof = await reader.verify(i);
          console.log("  Decision:", proof.decision.substring(0, 50) + "...");
          console.log("  Verified:", proof.verified);
        }
      }
    }
  } catch (error) {
    console.error("Error in batch tests:", (error as Error).message);
  }
}

async function runAllTests() {
  console.log("ClawCommit SDK Test Suite");
  console.log("========================\n");
  console.log("Configuration:");
  console.log("Contract:", config.contractAddress);
  console.log("RPC:", config.rpcUrl || "BSC Mainnet (default)");
  console.log("Private Key:", config.privateKey ? "✓ Provided" : "✗ Not provided (read-only mode)");

  try {
    await testStaticMethods();
    await testReadOnlyMode();
    await testErrorHandling();
    await testBatchOperations();
    await testWriteOperations(); // Last because it costs gas

    console.log("\n=== All Tests Complete ===\n");
  } catch (error) {
    console.error("\nTest suite error:", error);
    process.exit(1);
  }
}

// Run tests
runAllTests().catch(console.error);
