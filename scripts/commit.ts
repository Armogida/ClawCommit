import { ethers } from "hardhat";
import { randomBytes } from "crypto";

interface CommitArgs {
  contract: string;
  decision: string;
  nonce?: string;
}

function parseArgs(): CommitArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const decision = get("--decision");
  const nonce = get("--nonce");

  if (!contract || !decision) {
    console.error(
      "Usage: npx hardhat run scripts/commit.ts --network <NETWORK> -- --contract <ADDR> --decision <DECISION> [--nonce <NONCE>]"
    );
    process.exit(1);
  }

  return { contract, decision, nonce };
}

async function main(): Promise<void> {
  const { contract: contractAddress, decision, nonce: providedNonce } = parseArgs();
  const nonce = providedNonce || randomBytes(16).toString("hex");

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const hash = ethers.solidityPackedKeccak256(
    ["string", "string"],
    [decision, nonce]
  );

  console.log("Decision:", decision);
  console.log("Nonce:   ", nonce);
  console.log("Hash:    ", hash);
  console.log("");

  const tx = await contract.commit(hash);
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
  console.log(`  --commit-id <ID> --decision "${decision}" --nonce "${nonce}"`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
