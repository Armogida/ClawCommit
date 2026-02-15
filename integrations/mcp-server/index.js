#!/usr/bin/env node

/**
 * ClawCommit MCP Server
 *
 * Provides Model Context Protocol tools for AI-native blockchain commit-reveal operations.
 * Enables MCP clients to commit, reveal, and verify AI decisions on BNB Chain.
 */

import { fileURLToPath, pathToFileURL } from "url";
import path from "path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ethers } from "ethers";
import dotenv from "dotenv";
import { randomBytes } from "crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, ".env") });

const BSC_MAINNET_CHAIN_ID = 56n;
const OPENCLAW_PROMPT_TEMPLATE_VERSION = "openclaw-prompt-v1";

const ABI = [
  "function commitDecision(bytes32 _hash) external returns (uint256)",
  "function revealDecision(uint256 _commitId, string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external",
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))",
  "function verifyReplay(uint256 _commitId) external view returns (bool)",
  "function computeDecisionHash(string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external pure returns (bytes32)",
  "event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)",
  "event CommitRevealed(uint256 indexed commitId, address indexed committer, string prompt, string output, string modelVersion)",
];

const NETWORKS = {
  bscMainnet: {
    url: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
    chainId: 56n,
    explorer: "https://bscscan.com",
  },
  bscTestnet: {
    url:
      process.env.BSC_TESTNET_RPC_URL ||
      "https://data-seed-prebsc-1-s1.binance.org:8545/",
    chainId: 97n,
    explorer: "https://testnet.bscscan.com",
  },
};

const CommitIdSchema = z.union([
  z.number().int().min(0),
  z.string().regex(/^\d+$/),
]);

const OpenClawContextSchema = z.object({
  workflow: z.string().min(1).describe("Workflow name (for example openclaw-pr-validation)"),
  repository: z.string().min(1).describe("Repository identifier (owner/repo)"),
  ref: z.string().optional().describe("Git ref"),
  sha: z.string().optional().describe("Git commit SHA"),
  actor: z.string().optional().describe("Actor/login that triggered workflow"),
  runId: z.string().optional().describe("CI run ID"),
  runUrl: z.string().optional().describe("CI run URL"),
});

const OpenClawValidationSchema = z.object({
  name: z.string().min(1).describe("Validation name (for example compile, unit-tests)"),
  passed: z.boolean().describe("Validation pass/fail status"),
  required: z
    .boolean()
    .optional()
    .describe("Whether this validation gates approval (defaults true)"),
  details: z.string().optional().describe("Optional validation details"),
});

function requireAddress(address) {
  if (!ethers.isAddress(address)) {
    throw new Error(`Invalid contract address: ${address}`);
  }
  return address;
}

function normalizeCommitId(commitId) {
  if (typeof commitId === "number") {
    if (!Number.isSafeInteger(commitId) || commitId < 0) {
      throw new Error(`commit_id must be a non-negative safe integer. Received: ${commitId}`);
    }
    return BigInt(commitId);
  }
  if (typeof commitId === "string" && /^\d+$/.test(commitId)) {
    return BigInt(commitId);
  }
  throw new Error(`commit_id must be a non-negative integer. Received: ${commitId}`);
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

function normalizeNonEmptyText(value, label) {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

function normalizeOpenClawValidationDetails(details) {
  if (!details) {
    return "";
  }
  return String(details).trim().replace(/\r?\n/g, "\\n");
}

function normalizeOpenClawContext(context) {
  return {
    workflow: normalizeNonEmptyText(context.workflow, "context.workflow"),
    repository: normalizeNonEmptyText(context.repository, "context.repository"),
    ref: context.ref ? String(context.ref).trim() : "",
    sha: context.sha ? String(context.sha).trim() : "",
    actor: context.actor ? String(context.actor).trim() : "",
    runId: context.runId ? String(context.runId).trim() : "",
    runUrl: context.runUrl ? String(context.runUrl).trim() : "",
  };
}

function normalizeOpenClawValidation(validation, index) {
  return {
    name: normalizeNonEmptyText(validation.name, `validations[${index}].name`),
    passed: Boolean(validation.passed),
    required: validation.required ?? true,
    details: normalizeOpenClawValidationDetails(validation.details),
  };
}

function sortOpenClawValidations(validations) {
  return [...validations].sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    if (a.required !== b.required) return a.required ? -1 : 1;
    if (a.passed !== b.passed) return a.passed ? 1 : -1;
    if (a.details < b.details) return -1;
    if (a.details > b.details) return 1;
    return 0;
  });
}

function buildOpenClawDecisionPayload({ model_version, context, validations }) {
  const modelVersion = normalizeNonEmptyText(model_version, "model_version");
  if (!Array.isArray(validations) || validations.length === 0) {
    throw new Error("validations must include at least one entry");
  }

  const normalizedContext = normalizeOpenClawContext(context);
  const normalizedValidations = validations.map((entry, index) =>
    normalizeOpenClawValidation(entry, index)
  );
  const sortedValidations = sortOpenClawValidations(normalizedValidations);

  const uniqueNames = new Set();
  for (const validation of sortedValidations) {
    if (uniqueNames.has(validation.name)) {
      throw new Error(`validations contains duplicate name: ${validation.name}`);
    }
    uniqueNames.add(validation.name);
  }

  const requiredValidationCount = sortedValidations.filter((entry) => entry.required).length;
  const requiredFailureCount = sortedValidations.filter(
    (entry) => entry.required && !entry.passed
  ).length;
  const output = requiredFailureCount > 0 ? "OPENCLAW_REJECT" : "OPENCLAW_APPROVE";

  const promptLines = [
    `openclaw.template=${OPENCLAW_PROMPT_TEMPLATE_VERSION}`,
    `openclaw.workflow=${normalizedContext.workflow}`,
    `openclaw.repository=${normalizedContext.repository}`,
    `openclaw.ref=${normalizedContext.ref || ""}`,
    `openclaw.sha=${normalizedContext.sha || ""}`,
    `openclaw.actor=${normalizedContext.actor || ""}`,
    `openclaw.run_id=${normalizedContext.runId || ""}`,
    `openclaw.run_url=${normalizedContext.runUrl || ""}`,
    `openclaw.required_validation_count=${requiredValidationCount}`,
    `openclaw.required_failure_count=${requiredFailureCount}`,
    `openclaw.validation_count=${sortedValidations.length}`,
    ...sortedValidations.map(
      (entry, index) =>
        `openclaw.validation.${index}=name:${entry.name}|required:${entry.required ? "1" : "0"}|passed:${entry.passed ? "1" : "0"}|details:${entry.details}`
    ),
  ];

  const prompt = promptLines.join("\n");
  const promptDigest = ethers.keccak256(ethers.toUtf8Bytes(prompt));

  return {
    prompt,
    output,
    modelVersion,
    promptTemplateVersion: OPENCLAW_PROMPT_TEMPLATE_VERSION,
    promptDigest,
    context: normalizedContext,
    validations: sortedValidations,
    requiredValidationCount,
    requiredFailureCount,
  };
}

function getExplorerUrl(network, txHash) {
  const networkConfig = NETWORKS[network];
  return `${networkConfig.explorer}/tx/${txHash}`;
}

function getAddressUrl(network, address) {
  const networkConfig = NETWORKS[network];
  return `${networkConfig.explorer}/address/${address}`;
}

function formatSensitive(value, logSensitive) {
  return logSensitive ? value : "[REDACTED]";
}

function ensureWriteAllowed(network, allowMainnetWrites) {
  if (NETWORKS[network].chainId === BSC_MAINNET_CHAIN_ID && !allowMainnetWrites) {
    throw new Error(
      "Refusing state-changing operation on BSC mainnet. Set allow_mainnet_writes=true to continue."
    );
  }
}

function getProvider(network = "bscTestnet", needsSigner = false, allowMainnetWrites = false) {
  const networkConfig = NETWORKS[network];
  if (!networkConfig) {
    throw new Error(
      `Unknown network: ${network}. Supported: ${Object.keys(NETWORKS).join(", ")}`
    );
  }

  if (needsSigner) {
    ensureWriteAllowed(network, allowMainnetWrites);
  }

  const provider = new ethers.JsonRpcProvider(networkConfig.url);

  if (needsSigner) {
    const privateKey = process.env.DEPLOYER_PRIVATE_KEY;
    if (!privateKey) {
      throw new Error(
        "DEPLOYER_PRIVATE_KEY not found in environment. Required for commit/reveal operations."
      );
    }
    return {
      provider,
      signer: new ethers.Wallet(privateKey, provider),
      networkConfig,
    };
  }

  return { provider, networkConfig };
}

function getContract(
  contractAddress,
  network,
  needsSigner = false,
  allowMainnetWrites = false
) {
  const checkedAddress = requireAddress(contractAddress);
  const { provider, signer, networkConfig } = getProvider(
    network,
    needsSigner,
    allowMainnetWrites
  );
  const contract = new ethers.Contract(
    checkedAddress,
    ABI,
    needsSigner ? signer : provider
  );
  return { contract, provider, signer, networkConfig };
}

function buildTextResponse(payload) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(payload, null, 2),
      },
    ],
  };
}

function buildErrorResponse(error) {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(
          {
            success: false,
            error: error.message,
            details: error.reason || error.code,
          },
          null,
          2
        ),
      },
    ],
    isError: true,
  };
}

const server = new McpServer({
  name: "clawcommit",
  version: "2.1.0",
  description: "AI Decision Commit-Reveal Protocol for BNB Chain",
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
    network: z
      .enum(["bscMainnet", "bscTestnet"])
      .default("bscTestnet")
      .describe("BNB Chain network"),
    allow_mainnet_writes: z
      .boolean()
      .default(false)
      .describe("Set true to allow commit writes on BSC mainnet"),
    log_sensitive: z
      .boolean()
      .default(false)
      .describe("Set true to include prompt/output/nonce in response"),
  },
  async ({
    prompt,
    output,
    model_version,
    nonce,
    contract_address,
    network,
    allow_mainnet_writes,
    log_sensitive,
  }) => {
    try {
      if (!nonce && !log_sensitive) {
        throw new Error(
          "Auto-generated nonce would be redacted. Provide nonce explicitly or set log_sensitive=true."
        );
      }
      const finalNonce = nonce || generateNonce();
      const hash = computeDecisionHash(prompt, output, model_version, finalNonce);

      const { contract, signer } = getContract(
        contract_address,
        network,
        true,
        allow_mainnet_writes
      );

      const tx = await contract.commitDecision(hash);
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "CommitCreated");

      const commitId = event ? event.args.commitId.toString() : null;

      return buildTextResponse({
        success: true,
        commitId,
        hash,
        nonce: formatSensitive(finalNonce, log_sensitive),
        prompt: formatSensitive(prompt, log_sensitive),
        output: formatSensitive(output, log_sensitive),
        modelVersion: model_version,
        txHash: receipt.hash,
        explorerUrl: getExplorerUrl(network, receipt.hash),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        committer: await signer.getAddress(),
        network,
        sensitiveFieldsRedacted: !log_sensitive,
        message: log_sensitive
          ? "Decision committed successfully. Save prompt/output/modelVersion/nonce for reveal."
          : "Decision committed successfully. Sensitive fields are redacted.",
      });
    } catch (error) {
      return buildErrorResponse(error);
    }
  }
);

server.tool(
  "clawcommit_reveal",
  "Reveal a previously committed decision payload. Only original committer can reveal.",
  {
    commit_id: CommitIdSchema.describe("Commitment ID to reveal"),
    prompt: z.string().describe("Original prompt"),
    output: z.string().describe("Original output"),
    model_version: z.string().describe("Original model version"),
    nonce: z.string().describe("Original nonce"),
    contract_address: z.string().describe("ClawCommit contract address"),
    network: z
      .enum(["bscMainnet", "bscTestnet"])
      .default("bscTestnet")
      .describe("BNB Chain network"),
    allow_mainnet_writes: z
      .boolean()
      .default(false)
      .describe("Set true to allow reveal writes on BSC mainnet"),
  },
  async ({
    commit_id,
    prompt,
    output,
    model_version,
    nonce,
    contract_address,
    network,
    allow_mainnet_writes,
  }) => {
    try {
      const normalizedCommitId = normalizeCommitId(commit_id);
      const { contract, signer } = getContract(
        contract_address,
        network,
        true,
        allow_mainnet_writes
      );

      const expectedHash = computeDecisionHash(prompt, output, model_version, nonce);
      const commitment = await contract.getCommitment(normalizedCommitId);

      if (commitment.revealed) {
        throw new Error("Commitment already revealed");
      }
      if (commitment.hash !== expectedHash) {
        throw new Error(
          "Hash mismatch. Prompt/output/modelVersion/nonce do not match committed hash."
        );
      }

      const tx = await contract.revealDecision(
        normalizedCommitId,
        prompt,
        output,
        model_version,
        nonce
      );
      const receipt = await tx.wait();

      const verified = await contract.verifyReplay(normalizedCommitId);

      return buildTextResponse({
        success: true,
        commitId: normalizedCommitId.toString(),
        txHash: receipt.hash,
        explorerUrl: getExplorerUrl(network, receipt.hash),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        verified,
        committer: await signer.getAddress(),
        network,
        message: "Decision revealed and verified successfully",
      });
    } catch (error) {
      return buildErrorResponse(error);
    }
  }
);

server.tool(
  "clawcommit_verify",
  "Verify a revealed commitment by replaying deterministic hash computation.",
  {
    commit_id: CommitIdSchema.describe("Commitment ID to verify"),
    contract_address: z.string().describe("ClawCommit contract address"),
    network: z
      .enum(["bscMainnet", "bscTestnet"])
      .default("bscTestnet")
      .describe("BNB Chain network"),
    log_sensitive: z
      .boolean()
      .default(false)
      .describe("Set true to include prompt/output/nonce in response"),
  },
  async ({ commit_id, contract_address, network, log_sensitive }) => {
    try {
      const normalizedCommitId = normalizeCommitId(commit_id);
      const { contract } = getContract(contract_address, network, false);

      const commitment = await contract.getCommitment(normalizedCommitId);
      if (!commitment.revealed) {
        throw new Error("Commitment not yet revealed. Cannot verify.");
      }

      const contractVerified = await contract.verifyReplay(normalizedCommitId);
      const replayHash = computeDecisionHash(
        commitment.prompt,
        commitment.output,
        commitment.modelVersion,
        commitment.nonce
      );
      const localVerified = commitment.hash === replayHash;

      return buildTextResponse({
        success: true,
        commitId: normalizedCommitId.toString(),
        prompt: formatSensitive(commitment.prompt, log_sensitive),
        output: formatSensitive(commitment.output, log_sensitive),
        modelVersion: commitment.modelVersion,
        nonce: formatSensitive(commitment.nonce, log_sensitive),
        storedHash: commitment.hash,
        replayHash,
        verified: contractVerified && localVerified,
        contractVerified,
        localVerified,
        timestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
        committer: commitment.committer,
        committerUrl: getAddressUrl(network, commitment.committer),
        network,
        sensitiveFieldsRedacted: !log_sensitive,
        message:
          contractVerified && localVerified
            ? "Commitment verified successfully"
            : "Verification failed",
      });
    } catch (error) {
      return buildErrorResponse(error);
    }
  }
);

server.tool(
  "clawcommit_get_commitment",
  "Fetch commitment details by commit ID.",
  {
    commit_id: CommitIdSchema.describe("Commitment ID to fetch"),
    contract_address: z.string().describe("ClawCommit contract address"),
    network: z
      .enum(["bscMainnet", "bscTestnet"])
      .default("bscTestnet")
      .describe("BNB Chain network"),
    log_sensitive: z
      .boolean()
      .default(false)
      .describe("Set true to include prompt/output/nonce in response"),
  },
  async ({ commit_id, contract_address, network, log_sensitive }) => {
    try {
      const normalizedCommitId = normalizeCommitId(commit_id);
      const { contract } = getContract(contract_address, network, false);
      const commitment = await contract.getCommitment(normalizedCommitId);

      return buildTextResponse({
        success: true,
        commitId: normalizedCommitId.toString(),
        hash: commitment.hash,
        timestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
        committer: commitment.committer,
        committerUrl: getAddressUrl(network, commitment.committer),
        revealed: commitment.revealed,
        prompt: formatSensitive(commitment.prompt, log_sensitive),
        output: formatSensitive(commitment.output, log_sensitive),
        modelVersion: commitment.modelVersion,
        nonce: formatSensitive(commitment.nonce, log_sensitive),
        sensitiveFieldsRedacted: !log_sensitive,
      });
    } catch (error) {
      return buildErrorResponse(error);
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
    nonce: z.string().optional().describe("Optional nonce (auto-generated if omitted)"),
    log_sensitive: z
      .boolean()
      .default(false)
      .describe("Set true to include prompt/output/nonce in response"),
  },
  async ({ prompt, output, model_version, nonce, log_sensitive }) => {
    try {
      const finalNonce = nonce || generateNonce();
      const hash = computeDecisionHash(prompt, output, model_version, finalNonce);

      return buildTextResponse({
        success: true,
        prompt: formatSensitive(prompt, log_sensitive),
        output: formatSensitive(output, log_sensitive),
        modelVersion: model_version,
        nonce: formatSensitive(finalNonce, log_sensitive),
        hash,
        algorithm: "keccak256(abi.encode(prompt, output, modelVersion, nonce))",
        sensitiveFieldsRedacted: !log_sensitive,
        message: "Hash computed successfully",
      });
    } catch (error) {
      return buildErrorResponse(error);
    }
  }
);

server.tool(
  "clawcommit_openclaw_build_payload",
  "Build deterministic OpenClaw prompt/output payload from CI validation metadata.",
  {
    model_version: z.string().describe("Model version string for OpenClaw decision"),
    context: OpenClawContextSchema.describe("OpenClaw workflow context"),
    validations: z
      .array(OpenClawValidationSchema)
      .min(1)
      .describe("Validation results list"),
    log_sensitive: z
      .boolean()
      .default(false)
      .describe("Set true to include full prompt in response"),
  },
  async ({ model_version, context, validations, log_sensitive }) => {
    try {
      const payload = buildOpenClawDecisionPayload({
        model_version,
        context,
        validations,
      });

      return buildTextResponse({
        success: true,
        prompt: formatSensitive(payload.prompt, log_sensitive),
        output: payload.output,
        modelVersion: payload.modelVersion,
        promptTemplateVersion: payload.promptTemplateVersion,
        promptDigest: payload.promptDigest,
        requiredValidationCount: payload.requiredValidationCount,
        requiredFailureCount: payload.requiredFailureCount,
        validations: payload.validations,
        context: payload.context,
        sensitiveFieldsRedacted: !log_sensitive,
        message: "OpenClaw payload built successfully",
      });
    } catch (error) {
      return buildErrorResponse(error);
    }
  }
);

server.tool(
  "clawcommit_openclaw_commit",
  "Build OpenClaw payload, compute hash, and commit decision to BNB Chain.",
  {
    model_version: z.string().describe("Model version string for OpenClaw decision"),
    context: OpenClawContextSchema.describe("OpenClaw workflow context"),
    validations: z
      .array(OpenClawValidationSchema)
      .min(1)
      .describe("Validation results list"),
    nonce: z.string().optional().describe("Optional nonce (required when log_sensitive=false)"),
    contract_address: z.string().describe("ClawCommit contract address on BNB Chain"),
    network: z
      .enum(["bscMainnet", "bscTestnet"])
      .default("bscTestnet")
      .describe("BNB Chain network"),
    allow_mainnet_writes: z
      .boolean()
      .default(false)
      .describe("Set true to allow commit writes on BSC mainnet"),
    log_sensitive: z
      .boolean()
      .default(false)
      .describe("Set true to include full prompt/output/nonce in response"),
  },
  async ({
    model_version,
    context,
    validations,
    nonce,
    contract_address,
    network,
    allow_mainnet_writes,
    log_sensitive,
  }) => {
    try {
      if (!nonce && !log_sensitive) {
        throw new Error(
          "Auto-generated nonce would be redacted. Provide nonce explicitly or set log_sensitive=true."
        );
      }

      const payload = buildOpenClawDecisionPayload({
        model_version,
        context,
        validations,
      });
      const finalNonce = nonce || generateNonce();
      const hash = computeDecisionHash(
        payload.prompt,
        payload.output,
        payload.modelVersion,
        finalNonce
      );

      const { contract, signer } = getContract(
        contract_address,
        network,
        true,
        allow_mainnet_writes
      );
      const tx = await contract.commitDecision(hash);
      const receipt = await tx.wait();

      const event = receipt.logs
        .map((log) => {
          try {
            return contract.interface.parseLog(log);
          } catch {
            return null;
          }
        })
        .find((e) => e && e.name === "CommitCreated");

      const commitId = event ? event.args.commitId.toString() : null;

      return buildTextResponse({
        success: true,
        commitId,
        hash,
        nonce: formatSensitive(finalNonce, log_sensitive),
        prompt: formatSensitive(payload.prompt, log_sensitive),
        output: payload.output,
        modelVersion: payload.modelVersion,
        promptTemplateVersion: payload.promptTemplateVersion,
        promptDigest: payload.promptDigest,
        requiredValidationCount: payload.requiredValidationCount,
        requiredFailureCount: payload.requiredFailureCount,
        validations: payload.validations,
        context: payload.context,
        txHash: receipt.hash,
        explorerUrl: getExplorerUrl(network, receipt.hash),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        committer: await signer.getAddress(),
        network,
        sensitiveFieldsRedacted: !log_sensitive,
        message: "OpenClaw decision committed successfully",
      });
    } catch (error) {
      return buildErrorResponse(error);
    }
  }
);

server.tool(
  "clawcommit_openclaw_reveal",
  "Build OpenClaw payload and reveal a previously committed OpenClaw decision.",
  {
    commit_id: CommitIdSchema.describe("Commitment ID to reveal"),
    model_version: z.string().describe("Model version string for OpenClaw decision"),
    context: OpenClawContextSchema.describe("OpenClaw workflow context"),
    validations: z
      .array(OpenClawValidationSchema)
      .min(1)
      .describe("Validation results list"),
    nonce: z.string().describe("Original nonce used during commit"),
    contract_address: z.string().describe("ClawCommit contract address"),
    network: z
      .enum(["bscMainnet", "bscTestnet"])
      .default("bscTestnet")
      .describe("BNB Chain network"),
    allow_mainnet_writes: z
      .boolean()
      .default(false)
      .describe("Set true to allow reveal writes on BSC mainnet"),
    log_sensitive: z
      .boolean()
      .default(false)
      .describe("Set true to include full prompt in response"),
  },
  async ({
    commit_id,
    model_version,
    context,
    validations,
    nonce,
    contract_address,
    network,
    allow_mainnet_writes,
    log_sensitive,
  }) => {
    try {
      const normalizedCommitId = normalizeCommitId(commit_id);
      const payload = buildOpenClawDecisionPayload({
        model_version,
        context,
        validations,
      });
      const expectedHash = computeDecisionHash(
        payload.prompt,
        payload.output,
        payload.modelVersion,
        nonce
      );

      const { contract, signer } = getContract(
        contract_address,
        network,
        true,
        allow_mainnet_writes
      );
      const commitment = await contract.getCommitment(normalizedCommitId);
      if (commitment.revealed) {
        throw new Error("Commitment already revealed");
      }
      if (commitment.hash !== expectedHash) {
        throw new Error(
          "Hash mismatch. OpenClaw context/validations/model_version/nonce do not match committed hash."
        );
      }

      const tx = await contract.revealDecision(
        normalizedCommitId,
        payload.prompt,
        payload.output,
        payload.modelVersion,
        nonce
      );
      const receipt = await tx.wait();
      const verified = await contract.verifyReplay(normalizedCommitId);

      return buildTextResponse({
        success: true,
        commitId: normalizedCommitId.toString(),
        prompt: formatSensitive(payload.prompt, log_sensitive),
        output: payload.output,
        modelVersion: payload.modelVersion,
        promptTemplateVersion: payload.promptTemplateVersion,
        promptDigest: payload.promptDigest,
        requiredValidationCount: payload.requiredValidationCount,
        requiredFailureCount: payload.requiredFailureCount,
        txHash: receipt.hash,
        explorerUrl: getExplorerUrl(network, receipt.hash),
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        verified,
        committer: await signer.getAddress(),
        network,
        sensitiveFieldsRedacted: !log_sensitive,
        message: "OpenClaw decision revealed and verified successfully",
      });
    } catch (error) {
      return buildErrorResponse(error);
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

const isEntryPoint =
  process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;

if (isEntryPoint) {
  main().catch((error) => {
    console.error("Fatal error:", error);
    process.exit(1);
  });
}

export {
  ABI,
  BSC_MAINNET_CHAIN_ID,
  NETWORKS,
  server,
  requireAddress,
  normalizeCommitId,
  generateNonce,
  computeDecisionHash,
  ensureWriteAllowed,
  getProvider,
  getContract,
  formatSensitive,
  OPENCLAW_PROMPT_TEMPLATE_VERSION,
  buildOpenClawDecisionPayload,
};
