import { ethers } from "hardhat";
import { randomBytes } from "crypto";
import {
  assertMainnetWriteAllowed,
  formatSensitive,
  isCanonicalHexNonce,
  normalizeNonce,
  parseBooleanFlag,
  requireAddress,
} from "./common/safety";

interface CommitArgs {
  contract: string;
  prompt: string;
  output: string;
  modelVersion: string;
  nonce?: string;
  allowMainnetWrites: boolean;
  logSensitive: boolean;
}

function parseArgs(): CommitArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const prompt = get("--prompt");
  const output = get("--output");
  const modelVersion = get("--model-version");
  const nonce = get("--nonce");
  const allowMainnetWrites = parseBooleanFlag(args, "--allow-mainnet-writes");
  const logSensitive = parseBooleanFlag(args, "--log-sensitive");

  if (!contract || !prompt || !output || !modelVersion) {
    console.error(
      "Usage: npx hardhat run scripts/commit.ts --network <NETWORK> -- --contract <ADDR> --prompt <PROMPT> --output <OUTPUT> --model-version <MODEL_VERSION> [--nonce <NONCE>] [--allow-mainnet-writes <true|false>] [--log-sensitive <true|false>]"
    );
    process.exit(1);
  }

  return {
    contract: requireAddress(contract, "--contract"),
    prompt,
    output,
    modelVersion,
    nonce,
    allowMainnetWrites,
    logSensitive,
  };
}

async function main(): Promise<void> {
  const {
    contract: contractAddress,
    prompt,
    output,
    modelVersion,
    nonce: providedNonce,
    allowMainnetWrites,
    logSensitive,
  } = parseArgs();
  if (!providedNonce && !logSensitive) {
    throw new Error(
      "Auto-generated nonce would be redacted. Provide --nonce explicitly or set --log-sensitive true."
    );
  }
  const nonce = normalizeNonce(providedNonce || ethers.hexlify(randomBytes(32)));
  if (!isCanonicalHexNonce(nonce)) {
    console.warn(
      "Warning: nonce is not canonical 32-byte hex (0x + 64 hex chars). Continue only if this is intentional."
    );
  }

  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "commit script");

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  const hash = ethers.keccak256(encoded);

  console.log("Prompt:       ", formatSensitive(prompt, logSensitive));
  console.log("Output:       ", formatSensitive(output, logSensitive));
  console.log("Model Version:", modelVersion);
  console.log("Nonce:        ", formatSensitive(nonce, logSensitive));
  console.log("Hash:         ", hash);
  if (!logSensitive) {
    console.log("Sensitive fields are redacted. Use --log-sensitive true in trusted environments.");
  }
  console.log("");

  const tx = await contract.commitDecision(hash);
  const receipt = await tx.wait();
  console.log("Commit Tx:", receipt?.hash);

  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "CommitCreated") {
          console.log("Commit ID:", parsed.args.commitId.toString());
        }
      } catch {
        // skip non-matching logs
      }
    }
  }

  console.log("");
  if (logSensitive) {
    console.log("Save these values for reveal:");
    console.log(
      `  --commit-id <ID> --prompt "${prompt}" --output "${output}" --model-version "${modelVersion}" --nonce "${nonce}"`
    );
  } else {
    console.log("Reveal arguments are not printed because sensitive logging is disabled.");
  }
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
