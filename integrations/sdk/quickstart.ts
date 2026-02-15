#!/usr/bin/env ts-node

/**
 * Quick Start Guide for ClawCommit SDK
 *
 * This interactive script helps you get started with ClawCommit.
 *
 * Usage:
 *   1. npm install
 *   2. Set environment variables (CONTRACT_ADDRESS, PRIVATE_KEY)
 *   3. ts-node quickstart.ts
 */

import { ClawCommit } from "./src/index";
import * as readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
}

async function main() {
  console.log("\n╔═══════════════════════════════════════════════════╗");
  console.log("║     ClawCommit SDK - Quick Start Guide          ║");
  console.log("╚═══════════════════════════════════════════════════╝\n");

  // Get configuration
  const contractAddress =
    process.env.CONTRACT_ADDRESS ||
    (await question("Enter contract address: "));

  const hasPrivateKey = process.env.PRIVATE_KEY ? "yes" : "no";
  const mode =
    hasPrivateKey === "yes"
      ? "write (commit/reveal)"
      : (await question("Do you have a private key? (yes/no): "));

  let claw: ClawCommit;

  if (mode.toLowerCase().startsWith("y")) {
    const privateKey =
      process.env.PRIVATE_KEY ||
      (await question("Enter private key (or set PRIVATE_KEY env var): "));

    claw = new ClawCommit({
      contractAddress,
      privateKey,
    });

    console.log("\n✓ SDK initialized with write access");
  } else {
    claw = new ClawCommit({
      contractAddress,
    });

    console.log("\n✓ SDK initialized in read-only mode");
  }

  // Main menu
  while (true) {
    console.log("\n───────────────────────────────────────────────────");
    console.log("\nWhat would you like to do?");
    console.log("  1. Test static methods (no blockchain)");
    console.log("  2. Get commit count");
    console.log("  3. View a commitment");
    console.log("  4. Verify a commitment");

    if (!claw.isReadOnly()) {
      console.log("  5. Commit a decision");
      console.log("  6. Reveal a commitment");
    }

    console.log("  0. Exit");

    const choice = await question("\nEnter choice: ");

    try {
      switch (choice) {
        case "1":
          await testStaticMethods();
          break;

        case "2":
          await getCommitCount(claw);
          break;

        case "3":
          await viewCommitment(claw);
          break;

        case "4":
          await verifyCommitment(claw);
          break;

        case "5":
          if (claw.isReadOnly()) {
            console.log("\n✗ Write operations require a private key");
          } else {
            await commitDecision(claw);
          }
          break;

        case "6":
          if (claw.isReadOnly()) {
            console.log("\n✗ Write operations require a private key");
          } else {
            await revealCommitment(claw);
          }
          break;

        case "0":
          console.log("\nGoodbye!\n");
          rl.close();
          return;

        default:
          console.log("\n✗ Invalid choice");
      }
    } catch (error) {
      console.error("\n✗ Error:", (error as Error).message);
    }
  }
}

async function testStaticMethods() {
  console.log("\n=== Testing Static Methods ===\n");

  // Generate nonce
  const nonce = ClawCommit.generateNonce();
  console.log("Generated nonce:", nonce);
  console.log("Nonce length:", nonce.length, "characters\n");

  // Compute hash
  const decision = "EXAMPLE_DECISION_" + Date.now();
  const { hash, nonce: generatedNonce } = ClawCommit.computeHash(decision);

  console.log("Decision:", decision);
  console.log("Nonce:", generatedNonce);
  console.log("Hash:", hash);

  // Verify determinism
  const { hash: hash2 } = ClawCommit.computeHash(decision, generatedNonce);
  console.log("\nHash is deterministic:", hash === hash2 ? "✓" : "✗");
}

async function getCommitCount(claw: ClawCommit) {
  console.log("\n=== Getting Commit Count ===\n");

  const count = await claw.getCommitCount();
  console.log("Total commitments:", count);

  if (count === 0) {
    console.log("\nNo commitments yet. Create one with option 5!");
  }
}

async function viewCommitment(claw: ClawCommit) {
  console.log("\n=== View Commitment ===\n");

  const count = await claw.getCommitCount();
  console.log(`Available commits: 0 to ${count - 1}`);

  const commitIdStr = await question("Enter commit ID: ");
  const commitId = parseInt(commitIdStr);

  if (isNaN(commitId) || commitId < 0 || commitId >= count) {
    console.log("✗ Invalid commit ID");
    return;
  }

  const commitment = await claw.getCommitment(commitId);

  console.log("\nCommitment", commitId, ":");
  console.log("  Hash:", commitment.hash);
  console.log("  Committer:", commitment.committer);
  console.log("  Timestamp:", new Date(Number(commitment.timestamp) * 1000).toISOString());
  console.log("  Revealed:", commitment.revealed ? "Yes" : "No");

  if (commitment.revealed) {
    console.log("  Decision:", commitment.decision);
    console.log("  Nonce:", commitment.nonce);
  }
}

async function verifyCommitment(claw: ClawCommit) {
  console.log("\n=== Verify Commitment ===\n");

  const count = await claw.getCommitCount();
  console.log(`Available commits: 0 to ${count - 1}`);

  const commitIdStr = await question("Enter commit ID to verify: ");
  const commitId = parseInt(commitIdStr);

  if (isNaN(commitId) || commitId < 0 || commitId >= count) {
    console.log("✗ Invalid commit ID");
    return;
  }

  const proof = await claw.verify(commitId);

  console.log("\nVerification Result:");
  console.log("  Commit ID:", proof.commitId);
  console.log("  Decision:", proof.decision);
  console.log("  Nonce:", proof.nonce);
  console.log("  Stored Hash:", proof.storedHash);
  console.log("  Replay Hash:", proof.replayHash);
  console.log("  Match:", proof.storedHash === proof.replayHash ? "✓" : "✗");
  console.log("  Verified:", proof.verified ? "✓ YES" : "✗ NO");
  console.log("  Timestamp:", proof.timestamp);
  console.log("  Committer:", proof.committer);
}

async function commitDecision(claw: ClawCommit) {
  console.log("\n=== Commit Decision ===\n");

  const decision = await question("Enter decision to commit: ");

  if (!decision) {
    console.log("✗ Decision cannot be empty");
    return;
  }

  console.log("\nCommitting to blockchain...");
  const result = await claw.commit(decision);

  console.log("\n✓ Commitment successful!");
  console.log("  Commit ID:", result.commitId);
  console.log("  Hash:", result.hash);
  console.log("  Nonce:", result.nonce);
  console.log("  Transaction:", result.txHash);
  console.log("  Explorer:", result.explorerUrl);

  console.log("\n⚠ IMPORTANT: Save this nonce to reveal later!");
  console.log("  Nonce:", result.nonce);
}

async function revealCommitment(claw: ClawCommit) {
  console.log("\n=== Reveal Commitment ===\n");

  const count = await claw.getCommitCount();
  console.log(`Available commits: 0 to ${count - 1}`);

  const commitIdStr = await question("Enter commit ID to reveal: ");
  const commitId = parseInt(commitIdStr);

  if (isNaN(commitId) || commitId < 0 || commitId >= count) {
    console.log("✗ Invalid commit ID");
    return;
  }

  const decision = await question("Enter the original decision: ");
  const nonce = await question("Enter the nonce: ");

  console.log("\nRevealing on blockchain...");
  const result = await claw.reveal(commitId, decision, nonce);

  console.log("\n✓ Reveal successful!");
  console.log("  Transaction:", result.txHash);
  console.log("  Verified:", result.verified ? "✓ YES" : "✗ NO");
  console.log("  Explorer:", result.explorerUrl);
}

// Run the interactive guide
main().catch((error) => {
  console.error("\nFatal error:", error);
  rl.close();
  process.exit(1);
});
