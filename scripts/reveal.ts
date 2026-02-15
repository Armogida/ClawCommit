import { ethers } from "hardhat";
import {
  assertMainnetWriteAllowed,
  formatSensitive,
  isCanonicalHexNonce,
  normalizeNonce,
  parseBooleanFlag,
  parseNonNegativeBigInt,
  requireAddress,
} from "./common/safety";

interface RevealArgs {
  contract: string;
  commitId: bigint;
  prompt: string;
  output: string;
  modelVersion: string;
  nonce: string;
  allowMainnetWrites: boolean;
  logSensitive: boolean;
}

function parseArgs(): RevealArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const commitIdStr = get("--commit-id");
  const prompt = get("--prompt");
  const output = get("--output");
  const modelVersion = get("--model-version");
  const nonce = get("--nonce");
  const allowMainnetWrites = parseBooleanFlag(args, "--allow-mainnet-writes");
  const logSensitive = parseBooleanFlag(args, "--log-sensitive");

  if (!contract || !commitIdStr || !prompt || !output || !modelVersion || !nonce) {
    console.error(
      "Usage: npx hardhat run scripts/reveal.ts --network <NETWORK> -- --contract <ADDR> --commit-id <ID> --prompt <PROMPT> --output <OUTPUT> --model-version <MODEL_VERSION> --nonce <NONCE> [--allow-mainnet-writes <true|false>] [--log-sensitive <true|false>]"
    );
    process.exit(1);
  }

  const parsedNonce = normalizeNonce(nonce);
  if (!isCanonicalHexNonce(parsedNonce)) {
    console.warn(
      "Warning: nonce is not canonical 32-byte hex (0x + 64 hex chars). Continue only if this is intentional."
    );
  }

  return {
    contract: requireAddress(contract, "--contract"),
    commitId: parseNonNegativeBigInt(commitIdStr, "--commit-id"),
    prompt,
    output,
    modelVersion,
    nonce: parsedNonce,
    allowMainnetWrites,
    logSensitive,
  };
}

async function main(): Promise<void> {
  const {
    contract: contractAddress,
    commitId,
    prompt,
    output,
    modelVersion,
    nonce,
    allowMainnetWrites,
    logSensitive,
  } = parseArgs();

  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "reveal script");

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  console.log("Revealing commitment", commitId.toString());
  console.log("Prompt:       ", formatSensitive(prompt, logSensitive));
  console.log("Output:       ", formatSensitive(output, logSensitive));
  console.log("Model Version:", modelVersion);
  console.log("Nonce:        ", formatSensitive(nonce, logSensitive));
  if (!logSensitive) {
    console.log("Sensitive fields are redacted. Use --log-sensitive true in trusted environments.");
  }
  console.log("");

  const tx = await contract.revealDecision(
    commitId,
    prompt,
    output,
    modelVersion,
    nonce
  );
  const receipt = await tx.wait();

  console.log("Reveal Tx:", receipt?.hash);
  console.log("Reveal successful.");

  // Verify immediately after reveal
  const verified = await contract.verifyReplay(commitId);
  console.log("On-chain verify:", verified);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message || error);
    if (error.message?.includes("insufficient funds")) {
      console.error("Hint: Deployer account needs BNB for gas fees");
    }
    if (error.message?.includes("could not detect network")) {
      console.error("Hint: Check BSC_RPC_URL in .env");
    }
    process.exit(1);
  });
