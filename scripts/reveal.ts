import { ethers } from "hardhat";

interface RevealArgs {
  contract: string;
  commitId: number;
  prompt: string;
  output: string;
  modelVersion: string;
  nonce: string;
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

  if (!contract || !commitIdStr || !prompt || !output || !modelVersion || !nonce) {
    console.error(
      "Usage: npx hardhat run scripts/reveal.ts --network <NETWORK> -- --contract <ADDR> --commit-id <ID> --prompt <PROMPT> --output <OUTPUT> --model-version <MODEL_VERSION> --nonce <NONCE>"
    );
    process.exit(1);
  }

  return {
    contract,
    commitId: parseInt(commitIdStr),
    prompt,
    output,
    modelVersion,
    nonce,
  };
}

async function main(): Promise<void> {
  const { contract: contractAddress, commitId, prompt, output, modelVersion, nonce } = parseArgs();

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  console.log("Revealing commitment", commitId);
  console.log("Prompt:       ", prompt);
  console.log("Output:       ", output);
  console.log("Model Version:", modelVersion);
  console.log("Nonce:        ", nonce);
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
