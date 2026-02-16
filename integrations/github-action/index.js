const core = require("@actions/core");
const { ethers } = require("ethers");

const BSC_MAINNET_CHAIN_ID = 56n;
const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;

const CLAWCOMMIT_ABI = [
  "function commitDecision(bytes32 _hash) external returns (uint256 commitId)",
  "function revealDecision(uint256 _commitId, string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external",
  "function verifyReplay(uint256 _commitId) external view returns (bool)",
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))",
  "function computeDecisionHash(string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external pure returns (bytes32)",
  "event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)",
  "event CommitRevealed(uint256 indexed commitId, address indexed committer, string prompt, string output, string modelVersion)",
];

function generateNonce() {
  return ethers.hexlify(ethers.randomBytes(32));
}

function computeDecisionHash(prompt, output, modelVersion, nonce) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  return ethers.keccak256(encoded);
}

function parseBooleanInput(value, label) {
  if (!value) {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(
    `${label} must be boolean (true/false, 1/0, yes/no, on/off). Received: ${value}`
  );
}

function parseCommitId(input, required) {
  if (!input) {
    if (required) {
      throw new Error("commit-id is required for this action");
    }
    return null;
  }
  if (!/^\d+$/.test(input.trim())) {
    throw new Error(`commit-id must be a non-negative integer. Received: ${input}`);
  }
  return BigInt(input.trim());
}

function requireAddress(address) {
  const normalized = String(address || "").trim();
  if (!ethers.isAddress(normalized) && !HEX_32_REGEX.test(normalized)) {
    throw new Error(
      `contract-address must be a valid EVM address or 32-byte hex value. Received: ${address}`
    );
  }
  return normalized;
}

async function assertWriteNetworkSafety(provider, allowMainnetWrites) {
  const chainId = (await provider.getNetwork()).chainId;
  if (chainId === BSC_MAINNET_CHAIN_ID && !allowMainnetWrites) {
    throw new Error(
      "Refusing state-changing operation on BSC mainnet. Set allow-mainnet-writes=true to continue."
    );
  }
}

function formatSensitive(value, logSensitive) {
  return logSensitive ? value : "[REDACTED]";
}

async function commitAction(contract, prompt, output, modelVersion, nonce, opts) {
  const { logSensitive } = opts;
  if (!prompt || !output || !modelVersion) {
    throw new Error("prompt, output, and model-version are required for commit action");
  }

  core.info("Creating commitment");
  core.info(`Prompt: ${formatSensitive(prompt, logSensitive)}`);
  core.info(`Output: ${formatSensitive(output, logSensitive)}`);
  core.info(`Model version: ${modelVersion}`);

  const finalNonce = nonce || generateNonce();
  core.info(`Nonce: ${formatSensitive(finalNonce, logSensitive)}`);
  if (!logSensitive) {
    core.info("Sensitive payload logging disabled. Set log-sensitive=true only in trusted environments.");
  }

  const hash = computeDecisionHash(prompt, output, modelVersion, finalNonce);
  core.info(`Computed hash: ${hash}`);

  core.info("Submitting commit transaction...");
  const tx = await contract.commitDecision(hash);
  core.info(`Transaction submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  core.info(`Transaction confirmed in block ${receipt.blockNumber}`);

  const commitEvent = receipt.logs
    .map((log) => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((event) => event && event.name === "CommitCreated");

  if (!commitEvent) {
    throw new Error("CommitCreated event not found in transaction receipt");
  }

  const commitId = commitEvent.args.commitId;
  const commitIdStr = commitId.toString();
  core.info(`Commitment created with ID: ${commitIdStr}`);

  core.setOutput("commit-id", commitIdStr);
  core.setOutput("hash", hash);
  core.setOutput("nonce", finalNonce);
  core.setOutput("tx-hash", tx.hash);

  core.info("Commit operation successful");
  return { commitId: commitIdStr, hash, nonce: finalNonce, txHash: tx.hash };
}

async function revealAction(contract, commitId, prompt, output, modelVersion, nonce, opts) {
  const { logSensitive } = opts;
  if (commitId === null) {
    throw new Error("commit-id is required for reveal action");
  }
  if (!prompt || !output || !modelVersion || !nonce) {
    throw new Error("prompt, output, model-version, and nonce are required for reveal action");
  }

  core.info(`Revealing commitment ID: ${commitId.toString()}`);
  core.info(`Prompt: ${formatSensitive(prompt, logSensitive)}`);
  core.info(`Output: ${formatSensitive(output, logSensitive)}`);
  core.info(`Nonce: ${formatSensitive(nonce, logSensitive)}`);
  if (!logSensitive) {
    core.info("Sensitive payload logging disabled. Set log-sensitive=true only in trusted environments.");
  }

  const hash = computeDecisionHash(prompt, output, modelVersion, nonce);
  const commitment = await contract.getCommitment(commitId);
  if (commitment.hash !== hash) {
    throw new Error("Hash mismatch between reveal payload and on-chain commitment");
  }

  core.info("Hash verification successful");
  core.info("Submitting reveal transaction...");
  const tx = await contract.revealDecision(commitId, prompt, output, modelVersion, nonce);
  core.info(`Transaction submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  core.info(`Transaction confirmed in block ${receipt.blockNumber}`);

  core.setOutput("commit-id", commitId.toString());
  core.setOutput("hash", hash);
  core.setOutput("tx-hash", tx.hash);

  core.info("Reveal operation successful");
  return { commitId: commitId.toString(), hash, txHash: tx.hash };
}

async function verifyAction(contract, commitId, opts) {
  const { logSensitive } = opts;
  if (commitId === null) {
    throw new Error("commit-id is required for verify action");
  }

  core.info(`Verifying commitment ID: ${commitId.toString()}`);
  const commitment = await contract.getCommitment(commitId);
  if (!commitment.revealed) {
    throw new Error("Commitment has not been revealed yet");
  }

  core.info(`Stored hash: ${commitment.hash}`);
  core.info(`Prompt: ${formatSensitive(commitment.prompt, logSensitive)}`);
  core.info(`Output: ${formatSensitive(commitment.output, logSensitive)}`);
  core.info(`Model version: ${commitment.modelVersion}`);
  core.info(`Nonce: ${formatSensitive(commitment.nonce, logSensitive)}`);
  if (!logSensitive) {
    core.info("Sensitive payload logging disabled. Set log-sensitive=true only in trusted environments.");
  }

  const isValid = await contract.verifyReplay(commitId);
  const localHash = computeDecisionHash(
    commitment.prompt,
    commitment.output,
    commitment.modelVersion,
    commitment.nonce
  );
  const localValid = commitment.hash === localHash;

  core.info(`On-chain verification: ${isValid}`);
  core.info(`Local verification: ${localValid}`);

  core.setOutput("commit-id", commitId.toString());
  core.setOutput("verified", (isValid && localValid).toString());
  core.setOutput("hash", commitment.hash);

  return { commitId: commitId.toString(), verified: isValid && localValid, hash: commitment.hash };
}

async function run() {
  try {
    const action = core.getInput("action", { required: true });
    const prompt = core.getInput("prompt");
    const output = core.getInput("output");
    const modelVersion = core.getInput("model-version");
    const nonce = core.getInput("nonce");
    const commitIdInput = core.getInput("commit-id");
    const contractAddress = requireAddress(core.getInput("contract-address", { required: true }));
    const rpcUrl = core.getInput("rpc-url") || "https://bsc-dataseed.binance.org/";
    const privateKey = core.getInput("private-key");
    const allowMainnetWrites = parseBooleanInput(
      core.getInput("allow-mainnet-writes"),
      "allow-mainnet-writes"
    );
    const logSensitive = parseBooleanInput(core.getInput("log-sensitive"), "log-sensitive");

    core.info(`ClawCommit GitHub Action - Action: ${action}`);
    core.info(`Contract address: ${contractAddress}`);
    core.info(`RPC URL: ${rpcUrl}`);

    if (!["commit", "reveal", "verify"].includes(action)) {
      throw new Error(`Invalid action: ${action}. Must be 'commit', 'reveal', or 'verify'`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const commitId = parseCommitId(commitIdInput, action === "reveal" || action === "verify");

    let contract;
    if (action === "verify") {
      contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, provider);
    } else {
      if (!privateKey) {
        throw new Error("private-key is required for commit and reveal actions");
      }

      await assertWriteNetworkSafety(provider, allowMainnetWrites);

      const wallet = new ethers.Wallet(privateKey, provider);
      core.info(`Using wallet address: ${wallet.address}`);
      contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, wallet);
    }

    const opts = { logSensitive };

    switch (action) {
      case "commit":
        await commitAction(contract, prompt, output, modelVersion, nonce, opts);
        break;
      case "reveal":
        await revealAction(contract, commitId, prompt, output, modelVersion, nonce, opts);
        break;
      case "verify":
        await verifyAction(contract, commitId, opts);
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    core.info("Action completed successfully");
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

if (require.main === module) {
  run();
}

module.exports = {
  CLAWCOMMIT_ABI,
  BSC_MAINNET_CHAIN_ID,
  generateNonce,
  computeDecisionHash,
  parseBooleanInput,
  parseCommitId,
  requireAddress,
  assertWriteNetworkSafety,
  commitAction,
  revealAction,
  verifyAction,
  run,
};
