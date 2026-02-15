#!/usr/bin/env node

/**
 * Test script for ClawCommit MCP Server tools
 *
 * This script demonstrates how the MCP tools work without requiring
 * a full MCP client setup. Useful for debugging and validation.
 */

import { ethers } from "ethers";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

// Network configuration
const NETWORKS = {
  bscMainnet: {
    url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
    chainId: 56,
    explorer: "https://bscscan.com"
  },
  bscTestnet: {
    url: process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
    chainId: 97,
    explorer: "https://testnet.bscscan.com"
  }
};

/**
 * Test 1: Compute Hash (Off-chain)
 */
async function testComputeHash() {
  console.log("\n=== Test 1: Compute Hash ===");

  const decision = "Deploy AI model v2.1.0 to production";
  const nonce = ethers.hexlify(randomBytes(32));

  const hash = ethers.solidityPackedKeccak256(
    ["string", "string"],
    [decision, nonce]
  );

  console.log("Decision:", decision);
  console.log("Nonce:", nonce);
  console.log("Hash:", hash);
  console.log("Algorithm: keccak256(abi.encodePacked(decision, nonce))");
  console.log("✓ Hash computed successfully (off-chain, no gas)");

  return { decision, nonce, hash };
}

/**
 * Test 2: Verify Connection to BNB Chain
 */
async function testConnection(network = "bscTestnet") {
  console.log(`\n=== Test 2: Verify ${network} Connection ===`);

  const networkConfig = NETWORKS[network];
  const provider = new ethers.JsonRpcProvider(networkConfig.url);

  try {
    const blockNumber = await provider.getBlockNumber();
    const chainId = (await provider.getNetwork()).chainId;

    console.log("Network:", network);
    console.log("RPC URL:", networkConfig.url);
    console.log("Chain ID:", chainId);
    console.log("Current Block:", blockNumber);
    console.log("✓ Connection successful");

    return true;
  } catch (error) {
    console.error("✗ Connection failed:", error.message);
    return false;
  }
}

/**
 * Test 3: Check Wallet Configuration
 */
async function testWallet(network = "bscTestnet") {
  console.log("\n=== Test 3: Check Wallet Configuration ===");

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    console.error("✗ DEPLOYER_PRIVATE_KEY not found in environment");
    console.log("  Add it to .env file for commit/reveal operations");
    return null;
  }

  try {
    const networkConfig = NETWORKS[network];
    const provider = new ethers.JsonRpcProvider(networkConfig.url);
    const wallet = new ethers.Wallet(privateKey, provider);

    const address = await wallet.getAddress();
    const balance = await provider.getBalance(address);
    const balanceBNB = ethers.formatEther(balance);

    console.log("Wallet Address:", address);
    console.log("Balance:", balanceBNB, "BNB");

    if (parseFloat(balanceBNB) < 0.001) {
      console.warn("⚠ Warning: Low balance. You may need more BNB for transactions.");
    } else {
      console.log("✓ Wallet configured and funded");
    }

    return wallet;
  } catch (error) {
    console.error("✗ Wallet configuration error:", error.message);
    return null;
  }
}

/**
 * Test 4: Verify Contract (if address provided)
 */
async function testContract(contractAddress, network = "bscTestnet") {
  console.log("\n=== Test 4: Verify Contract ===");

  if (!contractAddress) {
    console.log("ℹ No contract address provided. Skipping contract verification.");
    console.log("  Deploy ClawCommit contract first, then test with:");
    console.log(`  node test-tools.js <contract_address> [network]`);
    return null;
  }

  const ABI = [
    "function commitCount() external view returns (uint256)",
    "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string decision, string nonce))"
  ];

  try {
    const networkConfig = NETWORKS[network];
    const provider = new ethers.JsonRpcProvider(networkConfig.url);
    const contract = new ethers.Contract(contractAddress, ABI, provider);

    const commitCount = await contract.commitCount();

    console.log("Contract Address:", contractAddress);
    console.log("Network:", network);
    console.log("Total Commits:", commitCount.toString());
    console.log("Explorer:", `${networkConfig.explorer}/address/${contractAddress}`);
    console.log("✓ Contract verified and accessible");

    return contract;
  } catch (error) {
    console.error("✗ Contract verification failed:", error.message);
    console.log("  Ensure the contract is deployed at this address on", network);
    return null;
  }
}

/**
 * Main test runner
 */
async function main() {
  console.log("ClawCommit MCP Server - Tool Verification");
  console.log("=========================================");

  // Parse command line arguments
  const contractAddress = process.argv[2];
  const network = process.argv[3] || "bscTestnet";

  if (!NETWORKS[network]) {
    console.error("Invalid network. Use 'bscMainnet' or 'bscTestnet'");
    process.exit(1);
  }

  // Run tests
  const hashResult = await testComputeHash();
  const connectionOk = await testConnection(network);
  const wallet = await testWallet(network);
  const contract = await testContract(contractAddress, network);

  // Summary
  console.log("\n=== Summary ===");
  console.log("✓ Hash computation: Working");
  console.log(connectionOk ? "✓ Network connection: Working" : "✗ Network connection: Failed");
  console.log(wallet ? "✓ Wallet: Configured" : "✗ Wallet: Not configured");
  console.log(contract ? "✓ Contract: Verified" : "- Contract: Not tested");

  console.log("\nℹ Next Steps:");
  if (!wallet) {
    console.log("  1. Add DEPLOYER_PRIVATE_KEY to .env file");
  }
  if (!contract) {
    console.log("  2. Deploy ClawCommit contract to", network);
    console.log("  3. Run: node test-tools.js <contract_address>", network);
  } else {
    console.log("  Ready to use MCP server with Claude Code!");
    console.log("  Add the server to .claude/settings.json (see README.md)");
  }

  console.log("\n=== Example Hash for Testing ===");
  console.log("Decision:", hashResult.decision);
  console.log("Nonce:", hashResult.nonce);
  console.log("Hash:", hashResult.hash);
  console.log("\nYou can use these values to test commit operations.");
}

main().catch(error => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
