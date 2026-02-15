import { ethers } from "hardhat";

interface RevealArgs {
  contract: string;
  commitId: number;
  decision: string;
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
  const decision = get("--decision");
  const nonce = get("--nonce");

  if (!contract || !commitIdStr || !decision || !nonce) {
    console.error(
      "Usage: npx hardhat run scripts/reveal.ts --network <NETWORK> -- --contract <ADDR> --commit-id <ID> --decision <DECISION> --nonce <NONCE>"
    );
    process.exit(1);
  }

  return {
    contract,
    commitId: parseInt(commitIdStr),
    decision,
    nonce,
  };
}

async function main(): Promise<void> {
  const { contract: contractAddress, commitId, decision, nonce } = parseArgs();

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  console.log("Revealing commitment", commitId);
  console.log("Decision:", decision);
  console.log("Nonce:   ", nonce);
  console.log("");

  const tx = await contract.reveal(commitId, decision, nonce);
  const receipt = await tx.wait();

  console.log("Reveal Tx:", receipt?.hash);
  console.log("Reveal successful.");

  // Verify immediately after reveal
  const verified = await contract.verify(commitId);
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
