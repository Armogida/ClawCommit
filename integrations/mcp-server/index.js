#!/usr/bin/env node

/**
 * ClawCommit MCP Server
 *
 * Provides Model Context Protocol tools for AI-native blockchain commit-reveal operations.
 * Enables MCP clients to commit, reveal, and verify AI decisions on BNB Chain.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

dotenv.config();

const ABI = [
  "function commitDecision(bytes32 _hash) external returns (uint256)",
  "function revealDecision(uint256 _commitId, string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external",
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))",
  "function verifyReplay(uint256 _commitId) external view returns (bool)",
  "function computeDecisionHash(string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external pure returns (bytes32)",
  "event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)",
  "event CommitRevealed(uint256 indexed commitId, address indexed committer, string prompt, string output, string modelVersion)"
];

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

function getContract(contractAddress, network, needsSigner = false) {
  const { provider, signer, networkConfig } = getProvider(network, needsSigner);
  const contract = new ethers.Contract(contractAddress, ABI, needsSigner ? signer : provider);
  return { contract, provider, signer, networkConfig };
}

function generateNonce() {
  return ethers.hexlify(randomBytes(32));
}

function computeDecisionHash(prompt, output, modelVersion, nonce) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  return ethers.keccak256(encoded);
}

function getExplorerUrl(network, txHash) {
  const networkConfig = NETWORKS[network];
  return `${networkConfig.explorer}/tx/${txHash}`;
}

function getAddressUrl(network, address) {
  const networkConfig = NETWORKS[network];
  return `${networkConfig.explorer}/address/${address}`;
}

const server = new McpServer({
  name: "clawcommit",
  version: "2.0.0",
  description: "AI Decision Commit-Reveal Protocol for BNB Chain"
});

server.tool(
  "clawcommit_commit",
  "Commit an AI decision hash to BNB Chain. Decision data stays private until reveal.",
  {
    prompt: z.string().describe("Prompt/context used by the AI"),
    output: z.string().describe("Model output or decision result"),
    model_version: z.string().describe("Model version string used to generate output"),
    nonce: z.string().optional().describe("Optional nonce (auto-generated if omitted)"),
    contract_address: z.string().describe("ClawCommit contract address on BNB Chain"),
    network: z.enum(["bscMainnet", "bscTestnet"]).default("bscMainnet").describe("BNB Chain network")
  },
  async ({ prompt, output, model_version, nonce, contract_address, network }) => {
    try {
      const finalNonce = nonce || generateNonce();
      const hash = computeDecisionHash(prompt, output, model_version, finalNonce);

      const { contract, signer } = getContract(contract_address, network, true);

      const tx = await contract.commitDecision(hash);
      const receipt = await tx.wait();

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
              prompt,
              output,
              modelVersion: model_version,
              txHash: receipt.hash,
              explorerUrl: getExplorerUrl(network, receipt.hash),
              blockNumber: receipt.blockNumber,
              gasUsed: receipt.gasUsed.toString(),
              committer: await signer.getAddress(),
              network,
              message: "Decision committed successfully. Save prompt/output/modelVersion/nonce for reveal."
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

server.tool(
  "clawcommit_reveal",
  "Reveal a previously committed decision payload. Only original committer can reveal.",
  {
    commit_id: z.number().int().min(0).describe("Commitment ID to reveal"),
    prompt: z.string().describe("Original prompt"),
    output: z.string().describe("Original output"),
    model_version: z.string().describe("Original model version"),
    nonce: z.string().describe("Original nonce"),
    contract_address: z.string().describe("ClawCommit contract address"),
    network: z.enum(["bscMainnet", "bscTestnet"]).default("bscMainnet").describe("BNB Chain network")
  },
  async ({ commit_id, prompt, output, model_version, nonce, contract_address, network }) => {
    try {
      const { contract, signer } = getContract(contract_address, network, true);

      const expectedHash = computeDecisionHash(prompt, output, model_version, nonce);
      const commitment = await contract.getCommitment(commit_id);

      if (commitment.revealed) {
        throw new Error("Commitment already revealed");
      }

      if (commitment.hash !== expectedHash) {
        throw new Error("Hash mismatch. Prompt/output/modelVersion/nonce do not match committed hash.");
      }

      const tx = await contract.revealDecision(
        commit_id,
        prompt,
        output,
        model_version,
        nonce
      );
      const receipt = await tx.wait();

      const verified = await contract.verifyReplay(commit_id);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              commitId: commit_id,
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

server.tool(
  "clawcommit_verify",
  "Verify a revealed commitment by replaying deterministic hash computation.",
  {
    commit_id: z.number().int().min(0).describe("Commitment ID to verify"),
    contract_address: z.string().describe("ClawCommit contract address"),
    network: z.enum(["bscMainnet", "bscTestnet"]).default("bscMainnet").describe("BNB Chain network")
  },
  async ({ commit_id, contract_address, network }) => {
    try {
      const { contract } = getContract(contract_address, network, false);

      const commitment = await contract.getCommitment(commit_id);

      if (!commitment.revealed) {
        throw new Error("Commitment not yet revealed. Cannot verify.");
      }

      const contractVerified = await contract.verifyReplay(commit_id);
      const replayHash = computeDecisionHash(
        commitment.prompt,
        commitment.output,
        commitment.modelVersion,
        commitment.nonce
      );
      const localVerified = commitment.hash === replayHash;

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              commitId: commit_id,
              prompt: commitment.prompt,
              output: commitment.output,
              modelVersion: commitment.modelVersion,
              nonce: commitment.nonce,
              storedHash: commitment.hash,
              replayHash,
              verified: contractVerified && localVerified,
              contractVerified,
              localVerified,
              timestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
              committer: commitment.committer,
              committerUrl: getAddressUrl(network, commitment.committer),
              network,
              message: contractVerified && localVerified ? "Commitment verified successfully" : "Verification failed"
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

server.tool(
  "clawcommit_compute_hash",
  "Compute deterministic keccak256 hash for prompt/output/modelVersion/nonce.",
  {
    prompt: z.string().describe("Prompt/context used by AI"),
    output: z.string().describe("Model output/decision"),
    model_version: z.string().describe("Model version string"),
    nonce: z.string().optional().describe("Optional nonce (auto-generated if omitted)")
  },
  async ({ prompt, output, model_version, nonce }) => {
    try {
      const finalNonce = nonce || generateNonce();
      const hash = computeDecisionHash(prompt, output, model_version, finalNonce);

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              success: true,
              prompt,
              output,
              modelVersion: model_version,
              nonce: finalNonce,
              hash,
              algorithm: "keccak256(abi.encode(prompt, output, modelVersion, nonce))",
              message: "Hash computed successfully"
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

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("ClawCommit MCP Server running");
  console.error(`Available networks: ${Object.keys(NETWORKS).join(", ")}`);
  console.error(`Private key configured: ${!!process.env.DEPLOYER_PRIVATE_KEY}`);
}

main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
