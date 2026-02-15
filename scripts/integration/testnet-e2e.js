#!/usr/bin/env node

const assert = require("assert");
const path = require("path");
const { pathToFileURL } = require("url");
const { ethers } = require("ethers");
const githubAction = require(path.resolve(
  __dirname,
  "../../integrations/github-action/index.js"
));
const {
  ClawCommit,
  buildOpenClawDecisionPayload,
  commitOpenClawDecision,
  revealOpenClawDecision,
} = require(path.resolve(
  __dirname,
  "../../integrations/sdk/dist/index.js"
));

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function makePayload(prefix) {
  return {
    prompt: `[${prefix}] Should we execute deterministic replay?`,
    output: `[${prefix}] APPROVE`,
    modelVersion: "clawcommit-e2e-v2",
    nonce: ethers.hexlify(ethers.randomBytes(32)),
  };
}

function makeOpenClawInput(prefix) {
  return {
    modelVersion: "openclaw-e2e-v1",
    context: {
      workflow: "openclaw-pr-validation",
      repository: "Armogida/ClawCommit",
      ref: `refs/pull/${prefix}/head`,
      sha: ethers.hexlify(ethers.randomBytes(8)).replace(/^0x/, ""),
      actor: "github-actions[bot]",
      runId: `${Date.now()}`,
      runUrl: "https://github.com/Armogida/ClawCommit/actions",
    },
    validations: [
      { name: "check-node", passed: true, required: true, details: "ok" },
      { name: "compile", passed: true, required: true, details: "ok" },
      { name: "tests", passed: true, required: true, details: "ok" },
      { name: "lint", passed: false, required: false, details: "non-blocking warnings" },
    ],
  };
}

async function runSdkFlow({ contractAddress, privateKey, rpcUrl }) {
  const payload = makePayload(`sdk-${Date.now()}`);
  const sdk = new ClawCommit({
    contractAddress,
    privateKey,
    rpcUrl,
    allowMainnetWrites: false,
  });

  const commit = await sdk.commit(
    {
      prompt: payload.prompt,
      output: payload.output,
      modelVersion: payload.modelVersion,
    },
    payload.nonce
  );
  await sdk.reveal(
    commit.commitId,
    {
      prompt: payload.prompt,
      output: payload.output,
      modelVersion: payload.modelVersion,
    },
    payload.nonce
  );
  const proof = await sdk.verify(commit.commitId);

  assert.strictEqual(proof.verified, true, "SDK verify must succeed");
  console.log(`sdk flow ok: commitId=${commit.commitId}`);
}

async function runSdkOpenClawFlow({ contractAddress, privateKey, rpcUrl }) {
  const input = makeOpenClawInput(`sdk-${Date.now()}`);
  const payload = buildOpenClawDecisionPayload(input);
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  const sdk = new ClawCommit({
    contractAddress,
    privateKey,
    rpcUrl,
    allowMainnetWrites: false,
  });

  const commit = await commitOpenClawDecision(sdk, input, nonce);
  await revealOpenClawDecision(sdk, commit.commitId, payload, nonce);
  const proof = await sdk.verify(commit.commitId);

  assert.strictEqual(payload.output, "OPENCLAW_APPROVE", "OpenClaw output should approve");
  assert.strictEqual(proof.verified, true, "OpenClaw SDK verify must succeed");
  console.log(`sdk openclaw flow ok: commitId=${commit.commitId}`);
}

async function runGitHubActionFlow({ contractAddress, privateKey, rpcUrl }) {
  const payload = makePayload(`action-${Date.now()}`);
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  await githubAction.assertWriteNetworkSafety(provider, false);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, githubAction.CLAWCOMMIT_ABI, wallet);

  const commit = await githubAction.commitAction(
    contract,
    payload.prompt,
    payload.output,
    payload.modelVersion,
    payload.nonce,
    { logSensitive: false }
  );
  const commitId = BigInt(commit.commitId);

  await githubAction.revealAction(
    contract,
    commitId,
    payload.prompt,
    payload.output,
    payload.modelVersion,
    payload.nonce,
    { logSensitive: false }
  );

  const verified = await githubAction.verifyAction(contract, commitId, {
    logSensitive: false,
  });
  assert.strictEqual(verified.verified, true, "GitHub Action verify must succeed");
  console.log(`github-action flow ok: commitId=${commit.commitId}`);
}

async function runGitHubActionOpenClawFlow({ contractAddress, privateKey, rpcUrl }) {
  const input = makeOpenClawInput(`action-${Date.now()}`);
  const payload = buildOpenClawDecisionPayload(input);
  const nonce = ethers.hexlify(ethers.randomBytes(32));
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  await githubAction.assertWriteNetworkSafety(provider, false);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, githubAction.CLAWCOMMIT_ABI, wallet);

  const commit = await githubAction.commitAction(
    contract,
    payload.prompt,
    payload.output,
    payload.modelVersion,
    nonce,
    { logSensitive: false }
  );
  const commitId = BigInt(commit.commitId);

  await githubAction.revealAction(
    contract,
    commitId,
    payload.prompt,
    payload.output,
    payload.modelVersion,
    nonce,
    { logSensitive: false }
  );

  const verified = await githubAction.verifyAction(contract, commitId, {
    logSensitive: false,
  });
  assert.strictEqual(
    verified.verified,
    true,
    "GitHub Action OpenClaw verify must succeed"
  );
  console.log(`github-action openclaw flow ok: commitId=${commit.commitId}`);
}

async function invokeMcpTool(server, toolName, args) {
  const tool = server._registeredTools[toolName];
  if (!tool) {
    throw new Error(`MCP tool not found: ${toolName}`);
  }

  const validatedArgs = await server.validateToolInput(tool, args, toolName);
  const result = await server.executeToolHandler(tool, validatedArgs, {});
  const text = result?.content?.[0]?.text;
  if (!text) {
    throw new Error(`MCP tool ${toolName} returned no text payload`);
  }

  const parsed = JSON.parse(text);
  if (result?.isError || parsed.success === false) {
    throw new Error(`MCP tool ${toolName} failed: ${parsed.error || text}`);
  }
  return parsed;
}

async function runMcpFlow({ contractAddress, privateKey, rpcUrl }) {
  process.env.BSC_TESTNET_RPC_URL = rpcUrl;
  process.env.DEPLOYER_PRIVATE_KEY = privateKey;

  const mcpModule = await import(pathToFileUrl(
    path.resolve(__dirname, "../../integrations/mcp-server/index.js")
  ));
  const server = mcpModule.server;
  const payload = makePayload(`mcp-${Date.now()}`);

  const commit = await invokeMcpTool(server, "clawcommit_commit", {
    prompt: payload.prompt,
    output: payload.output,
    model_version: payload.modelVersion,
    nonce: payload.nonce,
    contract_address: contractAddress,
    network: "bscTestnet",
    allow_mainnet_writes: false,
    log_sensitive: false,
  });

  await invokeMcpTool(server, "clawcommit_reveal", {
    commit_id: commit.commitId,
    prompt: payload.prompt,
    output: payload.output,
    model_version: payload.modelVersion,
    nonce: payload.nonce,
    contract_address: contractAddress,
    network: "bscTestnet",
    allow_mainnet_writes: false,
  });

  const verify = await invokeMcpTool(server, "clawcommit_verify", {
    commit_id: commit.commitId,
    contract_address: contractAddress,
    network: "bscTestnet",
    log_sensitive: false,
  });

  assert.strictEqual(verify.verified, true, "MCP verify must succeed");
  assert.strictEqual(verify.prompt, "[REDACTED]", "MCP verify should redact sensitive fields");
  console.log(`mcp flow ok: commitId=${commit.commitId}`);
}

async function runMcpOpenClawFlow({ contractAddress, privateKey, rpcUrl }) {
  process.env.BSC_TESTNET_RPC_URL = rpcUrl;
  process.env.DEPLOYER_PRIVATE_KEY = privateKey;

  const mcpModule = await import(pathToFileUrl(
    path.resolve(__dirname, "../../integrations/mcp-server/index.js")
  ));
  const server = mcpModule.server;
  const input = makeOpenClawInput(`mcp-${Date.now()}`);
  const nonce = ethers.hexlify(ethers.randomBytes(32));

  const commit = await invokeMcpTool(server, "clawcommit_openclaw_commit", {
    model_version: input.modelVersion,
    context: input.context,
    validations: input.validations,
    nonce,
    contract_address: contractAddress,
    network: "bscTestnet",
    allow_mainnet_writes: false,
    log_sensitive: false,
  });

  assert.strictEqual(commit.output, "OPENCLAW_APPROVE");

  await invokeMcpTool(server, "clawcommit_openclaw_reveal", {
    commit_id: commit.commitId,
    model_version: input.modelVersion,
    context: input.context,
    validations: input.validations,
    nonce,
    contract_address: contractAddress,
    network: "bscTestnet",
    allow_mainnet_writes: false,
    log_sensitive: false,
  });

  const verify = await invokeMcpTool(server, "clawcommit_verify", {
    commit_id: commit.commitId,
    contract_address: contractAddress,
    network: "bscTestnet",
    log_sensitive: false,
  });

  assert.strictEqual(verify.verified, true, "MCP OpenClaw verify must succeed");
  console.log(`mcp openclaw flow ok: commitId=${commit.commitId}`);
}

function pathToFileUrl(filePath) {
  return pathToFileURL(path.resolve(filePath)).href;
}

async function main() {
  const rpcUrl = getRequiredEnv("TESTNET_RPC_URL");
  const contractAddress = getRequiredEnv("TESTNET_CONTRACT_ADDRESS");
  const privateKey = getRequiredEnv("TESTNET_PRIVATE_KEY");

  if (!ethers.isAddress(contractAddress)) {
    throw new Error(`TESTNET_CONTRACT_ADDRESS is not a valid address: ${contractAddress}`);
  }

  console.log("Running testnet e2e flows (sdk, github-action, mcp, openclaw profile)...");
  await runSdkFlow({ contractAddress, privateKey, rpcUrl });
  await runSdkOpenClawFlow({ contractAddress, privateKey, rpcUrl });
  await runGitHubActionFlow({ contractAddress, privateKey, rpcUrl });
  await runGitHubActionOpenClawFlow({ contractAddress, privateKey, rpcUrl });
  await runMcpFlow({ contractAddress, privateKey, rpcUrl });
  await runMcpOpenClawFlow({ contractAddress, privateKey, rpcUrl });
  console.log("All testnet e2e flows completed successfully.");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
