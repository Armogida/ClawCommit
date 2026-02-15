#!/usr/bin/env node

/**
 * ClawCommit MCP Server
 *
 * Provides Model Context Protocol tools for AI-native blockchain commit-reveal operations.
 * Enables Claude Code and other MCP clients to commit, reveal, and verify AI decisions
 * on BNB Chain with tamper-evident guarantees.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

// ClawCommit contract ABI (minimal interface)
const ABI = [
  "function commit(bytes32 _hash) external returns (uint256)",
  "function reveal(uint256 _commitId, string calldata _decision, string calldata _nonce) external",
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string decision, string nonce))",
  "function verify(uint256 _commitId) external view returns (bool)",
  "function computeHash(string calldata _decision, string calldata _nonce) external pure returns (bytes32)",
  "event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)",
  "event CommitRevealed(uint256 indexed commitId, address indexed committer, string decision)"
];

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
 * Get provider and signer for network operations
 */
function getProvider(network = "bscMainnet", needsSigner = false) {
  const networkConfig = NETWORKS[network];
  if (!networkConfig) {
    throw new Error(`Unknown network: ${network}. Supported: ${Object.keys(NETWORKS).join(", ")}`);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.url);

  if (needsSigner) {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error("DEPLOYER_PRIVATE_KEY not found in environment. Required for commit/reveal operations.");
    }
    return { provider, signer: new ethers.Wallet(privateKey, provider), networkConfig };
  }

  return { provider, networkConfig };
}

/**
 * Get contract instance
 */
function getContract(contractAddress, network, needsSigner = false) {
  const { provider, signer, networkConfig } = getProvider(network, needsSigner);
  const contract = new ethers.Contract(contractAddress, ABI, needsSigner ? signer : provider);
  return { contract, provider, signer, networkConfig };
}

/**
 * Generate a cryptographically secure nonce
 */
function generateNonce() {
  return ethers.hexlify(randomBytes(32));
}

/**
 * Format explorer URL for transaction
 */
function getExplorerUrl(network, txHash) {
  const networkConfig = NETWORKS[network];
  return `${networkConfig.explorer}/tx/${txHash}`;
}

/**
 * Format explorer URL for address
 */
function getAddressUrl(network, address) {
  const networkConfig = NETWORKS[network];
  return `${networkConfig.explorer}/address/${address}`;
}

// Initialize MCP Server
const server = new McpServer({
  name: "clawcommit",
  version: "1.0.0",
  description: "AI Decision Commit-Reveal Protocol for BNB Chain"
});

// Tool 1: Commit a decision hash
server.tool(
  "clawcommit_commit",
  "Commit an AI decision hash to BNB Chain. The decision remains private until revealed. Returns commitId, hash, nonce, and transaction details.",
  {
    decision: z.string().describe("The AI decision or data to commit (will be hashed)"),
    nonce: z.string().optional().describe("Optional nonce for additional entropy (auto-generated if omitted)"),
    contract_address: z.string().describe("ClawCommit contract address on BNB Chain"),
    network: z.enum(["bscMainnet", "bscTestnet"]).default("bscMainnet").describe("BNB Chain network to use")
  },
  async ({ decision, nonce, contract_address, network }) => {
    try {
      // Generate nonce if not provided
      const finalNonce = nonce || generateNonce();

      // Compute hash using Solidity's abi.encodePacked equivalent
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, finalNonce]
      );

      // Get contract with signer
      const { contract, signer, networkConfig } = getContract(contract_address, network, true);

      // Submit commit transaction
      const tx = await contract.commit(hash);
      const receipt = await tx.wait();

      // Extract commitId from CommitCreated event
      const event = receipt.logs
        .map(log => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find(e => e && e.name === "CommitCreated");

      const commitId = event ? Number(event.args.commitId) : null;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              commitId,
              hash,
              nonce: finalNonce,
              txHash: receipt.hash,
              explorerUrl: getExplorerUrl(network, receipt.hash),
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              committer: await signer.getAddress(),
              network,
              message: "Decision committed successfully. Keep the nonce safe for reveal operation."
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              details: error.reason || error.code
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }
);

// Tool 2: Reveal a committed decision
server.tool(
  "clawcommit_reveal",
  "Reveal a previously committed decision on BNB Chain. Verifies the hash matches before revealing. Only the original committer can reveal.",
  {
    commit_id: z.number().int().min(0).describe("The commitment ID to reveal"),
    decision: z.string().describe("The original decision string that was committed"),
    nonce: z.string().describe("The nonce used during commitment"),
    contract_address: z.string().describe("ClawCommit contract address on BNB Chain"),
    network: z.enum(["bscMainnet", "bscTestnet"]).default("bscMainnet").describe("BNB Chain network to use")
  },
  async ({ commit_id, decision, nonce, contract_address, network }) => {
    try {
      // Get contract with signer
      const { contract, signer, networkConfig } = getContract(contract_address, network, true);

      // Verify hash locally before submitting transaction
      const expectedHash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      // Get commitment to verify it exists and hasn't been revealed
      const commitment = await contract.getCommitment(commit_id);

      if (commitment.revealed) {
        throw new Error("Commitment already revealed");
      }

      if (commitment.hash !== expectedHash) {
        throw new Error("Hash mismatch. Decision or nonce incorrect.");
      }

      // Submit reveal transaction
      const tx = await contract.reveal(commit_id, decision, nonce);
      const receipt = await tx.wait();

      // Verify the reveal was successful
      const verified = await contract.verify(commit_id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              commitId: commit_id,
              decision,
              txHash: receipt.hash,
              explorerUrl: getExplorerUrl(network, receipt.hash),
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              verified,
              committer: await signer.getAddress(),
              network,
              message: "Decision revealed and verified successfully"
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              details: error.reason || error.code
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }
);

// Tool 3: Verify a revealed commitment
server.tool(
  "clawcommit_verify",
  "Verify a commitment by replaying the hash computation. Zero gas cost, read-only operation. Anyone can verify any revealed commitment.",
  {
    commit_id: z.number().int().min(0).describe("The commitment ID to verify"),
    contract_address: z.string().describe("ClawCommit contract address on BNB Chain"),
    network: z.enum(["bscMainnet", "bscTestnet"]).default("bscMainnet").describe("BNB Chain network to use")
  },
  async ({ commit_id, contract_address, network }) => {
    try {
      // Get contract (read-only, no signer needed)
      const { contract, networkConfig } = getContract(contract_address, network, false);

      // Get commitment data
      const commitment = await contract.getCommitment(commit_id);

      if (!commitment.revealed) {
        throw new Error("Commitment not yet revealed. Cannot verify.");
      }

      // Verify using contract's verify function
      const verified = await contract.verify(commit_id);

      // Also compute hash locally for additional verification
      const replayHash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [commitment.decision, commitment.nonce]
      );

      const localVerified = commitment.hash === replayHash;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              commitId: commit_id,
              decision: commitment.decision,
              nonce: commitment.nonce,
              storedHash: commitment.hash,
              replayHash,
              verified: verified && localVerified,
              contractVerified: verified,
              localVerified,
              timestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
              committer: commitment.committer,
              committerUrl: getAddressUrl(network, commitment.committer),
              network,
              message: verified && localVerified ? "Commitment verified successfully" : "Verification failed"
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message,
              details: error.reason || error.code
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }
);

// Tool 4: Compute hash locally (off-chain, no gas)
server.tool(
  "clawcommit_compute_hash",
  "Compute the deterministic keccak256 hash for a decision and nonce. Off-chain operation, no gas cost, no blockchain interaction.",
  {
    decision: z.string().describe("The decision string to hash"),
    nonce: z.string().optional().describe("Optional nonce for additional entropy (auto-generated if omitted)")
  },
  async ({ decision, nonce }) => {
    try {
      // Generate nonce if not provided
      const finalNonce = nonce || generateNonce();

      // Compute hash using Solidity's abi.encodePacked equivalent
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, finalNonce]
      );

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              decision,
              nonce: finalNonce,
              hash,
              algorithm: "keccak256(abi.encodePacked(decision, nonce))",
              message: "Hash computed successfully. Use this hash for commit operations."
            }, null, 2)
          }
        ]
      };
    } catch (error) {
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error.message
            }, null, 2)
          }
        ],
        isError: true
      };
    }
  }
);

// Start the server
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log server start to stderr (stdout is reserved for MCP protocol)
  console.error("ClawCommit MCP Server running");
  console.error(`Available networks: ${Object.keys(NETWORKS).join(", ")}`);
  console.error(`Private key configured: ${!!process.env.DEPLOYER_PRIVATE_KEY}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
