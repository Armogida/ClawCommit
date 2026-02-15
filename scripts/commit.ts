import { ethers } from "hardhat";
import { randomBytes } from "crypto";

interface CommitArgs {
  contract: string;
  prompt: string;
  output: string;
  modelVersion: string;
  nonce?: string;
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

  if (!contract || !prompt || !output || !modelVersion) {
    console.error(
      "Usage: npx hardhat run scripts/commit.ts --network <NETWORK> -- --contract <ADDR> --prompt <PROMPT> --output <OUTPUT> --model-version <MODEL_VERSION> [--nonce <NONCE>]"
    );
    process.exit(1);
  }

  return { contract, prompt, output, modelVersion, nonce };
}

async function main(): Promise<void> {
  const {
    contract: contractAddress,
    prompt,
    output,
    modelVersion,
    nonce: providedNonce,
  } = parseArgs();
  const nonce = providedNonce || randomBytes(16).toString("hex");

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  const hash = ethers.keccak256(encoded);

  console.log("Prompt:       ", prompt);
  console.log("Output:       ", output);
  console.log("Model Version:", modelVersion);
  console.log("Nonce:        ", nonce);
  console.log("Hash:         ", hash);
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
  console.log("Save these values for reveal:");
  console.log(
    `  --commit-id <ID> --prompt "${prompt}" --output "${output}" --model-version "${modelVersion}" --nonce "${nonce}"`
  );
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
