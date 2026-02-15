#!/usr/bin/env node

/**
 * Test script for ClawCommit MCP Server tools.
 */

import path from "path";
import { fileURLToPath } from "url";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

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

function computeDecisionHash(prompt, output, modelVersion, nonce) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  return ethers.keccak256(encoded);
}

async function testComputeHash() {
  console.log("\n=== Test 1: Compute Hash ===");

  const prompt = "Should we deploy AI model v2.1.0 to production?";
  const output = "APPROVE_DEPLOY";
  const modelVersion = "clawcommit-agent-v2.1.0";
  const nonce = ethers.hexlify(randomBytes(32));

  const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

  console.log("Prompt:", prompt);
  console.log("Output:", output);
  console.log("Model Version:", modelVersion);
  console.log("Nonce:", nonce);
  console.log("Hash:", hash);
  console.log("Algorithm: keccak256(abi.encode(prompt, output, modelVersion, nonce))");
  console.log("Hash computed successfully");

  return { prompt, output, modelVersion, nonce, hash };
}

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
    console.log("Connection successful");

    return true;
  } catch (error) {
    console.error("Connection failed:", error.message);
    return false;
  }
}

async function testWallet(network = "bscTestnet") {
  console.log("\n=== Test 3: Check Wallet Configuration ===");

  const privateKey = process.env.DEPLOYER_PRIVATE_KEY;

  if (!privateKey) {
    console.error("DEPLOYER_PRIVATE_KEY not found in environment");
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
      console.warn("Warning: Low balance. You may need more BNB for transactions.");
    } else {
      console.log("Wallet configured and funded");
    }

    return wallet;
  } catch (error) {
    console.error("Wallet configuration error:", error.message);
    return null;
  }
}

async function testContract(contractAddress, network = "bscTestnet") {
  console.log("\n=== Test 4: Verify Contract ===");

  if (!contractAddress) {
    console.log("No contract address provided. Skipping contract verification.");
    return null;
  }

  const ABI = [
    "function commitCount() external view returns (uint256)",
    "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))"
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
    console.log("Contract verified and accessible");

    return contract;
  } catch (error) {
    console.error("Contract verification failed:", error.message);
    return null;
  }
}

async function main() {
  console.log("ClawCommit MCP Server - Tool Verification");
  console.log("=========================================");

  const contractAddress = process.argv[2];
  const network = process.argv[3] || "bscTestnet";

  if (!NETWORKS[network]) {
    console.error("Invalid network. Use 'bscMainnet' or 'bscTestnet'");
    process.exit(1);
  }

  const hashResult = await testComputeHash();
  const connectionOk = await testConnection(network);
  const wallet = await testWallet(network);
  const contract = await testContract(contractAddress, network);

  console.log("\n=== Summary ===");
  console.log("Hash computation: Working");
  console.log(connectionOk ? "Network connection: Working" : "Network connection: Failed");
  console.log(wallet ? "Wallet: Configured" : "Wallet: Not configured");
  console.log(contract ? "Contract: Verified" : "Contract: Not tested");

  console.log("\n=== Example Hash for Testing ===");
  console.log("Prompt:", hashResult.prompt);
  console.log("Output:", hashResult.output);
  console.log("Model Version:", hashResult.modelVersion);
  console.log("Nonce:", hashResult.nonce);
  console.log("Hash:", hashResult.hash);
}

main().catch(error => {
  console.error("\nFatal error:", error);
  process.exit(1);
});
