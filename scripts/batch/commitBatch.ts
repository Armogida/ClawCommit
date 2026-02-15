import { ethers } from "hardhat";
import * as fs from "fs";
import { BatchManifest } from "./merkle";

interface CommitBatchArgs {
  contract: string;
  manifestPath: string;
}

function parseArgs(argv: string[]): CommitBatchArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const manifestPath = get("--manifest");

  if (!contract || !manifestPath) {
    throw new Error(
      "Usage: npx hardhat run scripts/batch/commitBatch.ts --network <NETWORK> -- --contract <ADDR> --manifest <MANIFEST_JSON>"
    );
  }

  return { contract, manifestPath };
}

function loadManifest(manifestPath: string): { raw: string; parsed: BatchManifest } {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as BatchManifest;

  if (
    parsed.version !== "clawcommit-batch-v1" ||
    typeof parsed.root !== "string" ||
    typeof parsed.leafCount !== "number" ||
    typeof parsed.modelVersion !== "string"
  ) {
    throw new Error("Invalid manifest format");
  }

  if (parsed.leafCount <= 0 || !Number.isInteger(parsed.leafCount)) {
    throw new Error("Manifest leafCount must be a positive integer");
  }

  return { raw, parsed };
}

async function main(): Promise<void> {
  const { contract: contractAddress, manifestPath } = parseArgs(process.argv.slice(2));
  const { raw, parsed } = loadManifest(manifestPath);

  const manifestHash = ethers.keccak256(ethers.toUtf8Bytes(raw));

  const Factory = await ethers.getContractFactory("ClawCommitBatch");
  const contract = Factory.attach(contractAddress);

  const tx = await contract.commitBatch(
    parsed.root,
    parsed.leafCount,
    parsed.modelVersion,
    manifestHash
  );
  const receipt = await tx.wait();

  let batchId: bigint | undefined;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsedLog?.name === "BatchCommitted") {
          batchId = parsedLog.args.batchId as bigint;
          break;
        }
      } catch {
        // Skip non-contract logs.
      }
    }
  }

  console.log("Batch committed.");
  console.log("Manifest:", manifestPath);
  console.log("Root:", parsed.root);
  console.log("Leaf count:", parsed.leafCount);
  console.log("Manifest hash:", manifestHash);
  console.log("Commit Tx:", receipt?.hash || tx.hash);
  if (batchId !== undefined) {
    console.log("Batch ID:", batchId.toString());
  }
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
