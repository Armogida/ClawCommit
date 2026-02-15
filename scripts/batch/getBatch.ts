import { ethers } from "hardhat";
import {
  parseNonNegativeBigInt,
  requireAddress,
} from "../common/safety";

interface GetBatchArgs {
  contract: string;
  batchId: bigint;
}

function parseArgs(argv: string[]): GetBatchArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const batchIdRaw = get("--batch-id");

  if (!contract || !batchIdRaw) {
    throw new Error(
      "Usage: npx hardhat run scripts/batch/getBatch.ts --network <NETWORK> -- --contract <ADDR> --batch-id <ID>"
    );
  }

  return {
    contract: requireAddress(contract, "--contract"),
    batchId: parseNonNegativeBigInt(batchIdRaw, "--batch-id"),
  };
}

async function main(): Promise<void> {
  const { contract: contractAddress, batchId } = parseArgs(process.argv.slice(2));

  const Factory = await ethers.getContractFactory("ClawCommitBatch");
  const contract = Factory.attach(contractAddress);

  const batch = await contract.getBatch(batchId);

  console.log("Batch:", batchId);
  console.log("Merkle Root:", batch.merkleRoot);
  console.log("Leaf Count:", batch.leafCount.toString());
  console.log("Committer:", batch.committer);
  console.log("Model Version:", batch.modelVersion);
  console.log("Manifest Hash:", batch.manifestHash);
  console.log("Timestamp:", batch.timestamp.toString());
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
