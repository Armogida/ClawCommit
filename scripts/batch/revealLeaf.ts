import { ethers } from "hardhat";
import * as fs from "fs";
import { BatchManifest, generateMerkleProof } from "./merkle";

interface RevealLeafArgs {
  contract: string;
  batchId: number;
  leafIndex: number;
  manifestPath: string;
}

function parseArgs(argv: string[]): RevealLeafArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const batchIdStr = get("--batch-id");
  const leafIndexStr = get("--leaf-index");
  const manifestPath = get("--manifest");

  if (!contract || !batchIdStr || !leafIndexStr || !manifestPath) {
    throw new Error(
      "Usage: HARDHAT_NETWORK=<NETWORK> npx ts-node scripts/batch/revealLeaf.ts --contract <ADDR> --batch-id <ID> --leaf-index <INDEX> --manifest <MANIFEST_JSON>"
    );
  }

  const batchId = parseInt(batchIdStr, 10);
  const leafIndex = parseInt(leafIndexStr, 10);

  if (isNaN(batchId) || batchId < 0) {
    throw new Error("--batch-id must be a non-negative integer");
  }

  if (isNaN(leafIndex) || leafIndex < 0) {
    throw new Error("--leaf-index must be a non-negative integer");
  }

  return { contract, batchId, leafIndex, manifestPath };
}

function loadManifest(manifestPath: string): BatchManifest {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as BatchManifest;

  if (
    parsed.version !== "clawcommit-batch-v1" ||
    typeof parsed.root !== "string" ||
    typeof parsed.leafCount !== "number" ||
    typeof parsed.modelVersion !== "string" ||
    !Array.isArray(parsed.leaves)
  ) {
    throw new Error("Invalid manifest format");
  }

  return parsed;
}

async function main(): Promise<void> {
  const { contract: contractAddress, batchId, leafIndex, manifestPath } = parseArgs(
    process.argv.slice(2)
  );

  const manifest = loadManifest(manifestPath);

  // Find the leaf at the specified index
  const leaf = manifest.leaves.find((l) => l.leafIndex === leafIndex);
  if (!leaf) {
    throw new Error(
      `Leaf index ${leafIndex} not found in manifest (available range: 0-${manifest.leafCount - 1})`
    );
  }

  console.log("\nRevealing batch leaf...");
  console.log("Batch ID:   ", batchId);
  console.log("Leaf Index: ", leafIndex);
  console.log(
    "Prompt:     ",
    leaf.prompt.length > 60 ? leaf.prompt.slice(0, 60) + "..." : leaf.prompt
  );
  console.log(
    "Output:     ",
    leaf.output.length > 60 ? leaf.output.slice(0, 60) + "..." : leaf.output
  );
  console.log("Nonce:      ", leaf.nonce);
  console.log("");

  const Factory = await ethers.getContractFactory("ClawCommitBatch");
  const contract = Factory.attach(contractAddress);
  const leafHashes = manifest.leaves.map((entry) => entry.leafHash);
  const proof = generateMerkleProof(leafHashes, leafIndex);

  const tx = await contract.revealBatchLeaf(
    batchId,
    {
      leafIndex,
      prompt: leaf.prompt,
      output: leaf.output,
      nonce: leaf.nonce,
    },
    {
      siblings: proof.siblings,
      path: proof.path,
    }
  );

  console.log("Reveal Tx:  ", tx.hash);

  const receipt = await tx.wait();

  // Parse event logs
  let revealed = false;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsedLog?.name === "BatchLeafRevealed") {
          const revealedBatchId = parsedLog.args.batchId;
          const revealedLeafIndex = parsedLog.args.leafIndex;
          const revealedLeafHash = parsedLog.args.leafHash;
          const revealer = parsedLog.args.revealer;

          console.log("\n✓ Leaf revealed successfully");
          console.log("Batch ID:   ", revealedBatchId.toString());
          console.log("Leaf Index: ", revealedLeafIndex.toString());
          console.log("Leaf Hash:  ", revealedLeafHash);
          console.log("Revealer:   ", revealer);
          revealed = true;
          break;
        }
      } catch {
        // Skip non-contract logs
      }
    }
  }

  if (!revealed) {
    console.log("\n✓ Transaction confirmed (block", receipt?.blockNumber, ")");
  }
}

main().catch((error) => {
  console.error("\n✗ Reveal failed:", error.message || error);

  if (error.message?.includes("OnlyBatchCommitter")) {
    console.error("Hint: Only the original batch committer can reveal leaves.");
  } else if (error.message?.includes("LeafAlreadyRevealed")) {
    console.error("Hint: This leaf has already been revealed.");
  } else if (error.message?.includes("LeafIndexOutOfRange")) {
    console.error("Hint: The leaf index exceeds the batch leaf count.");
  } else if (error.message?.includes("LeafHashMismatch")) {
    console.error("Hint: The provided data does not match the committed leaf hash.");
  } else if (error.message?.includes("ProofLengthMismatch")) {
    console.error("Hint: Merkle proof siblings/path arrays are malformed.");
  } else if (error.message?.includes("insufficient funds")) {
    console.error("Hint: Account needs gas tokens for transaction fees.");
  } else if (error.message?.includes("could not detect network")) {
    console.error("Hint: Check RPC URL in .env or --network flag.");
  }

  process.exit(1);
});
