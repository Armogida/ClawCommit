import { ethers } from "hardhat";
import * as fs from "fs";
import {
  BatchManifest,
  ManifestValidationResult,
  generateMerkleProof,
  validateManifest,
} from "./merkle";
import {
  assertMainnetWriteAllowed,
  formatSensitive,
  parseBooleanFlag,
  parseNonNegativeBigInt,
  requireAddress,
} from "../common/safety";

interface RevealLeafArgs {
  contract: string;
  batchId: bigint;
  leafIndex: bigint;
  manifestPath: string;
  allowMainnetWrites: boolean;
  logSensitive: boolean;
}

interface LoadedManifest {
  manifest: BatchManifest;
  validated: ManifestValidationResult;
}

export function parseArgs(argv: string[]): RevealLeafArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const batchIdStr = get("--batch-id");
  const leafIndexStr = get("--leaf-index");
  const manifestPath = get("--manifest");
  const allowMainnetWrites = parseBooleanFlag(argv, "--allow-mainnet-writes");
  const logSensitive = parseBooleanFlag(argv, "--log-sensitive");

  if (!contract || !batchIdStr || !leafIndexStr || !manifestPath) {
    throw new Error(
      "Usage: HARDHAT_NETWORK=<NETWORK> npx ts-node scripts/batch/revealLeaf.ts --contract <ADDR> --batch-id <ID> --leaf-index <INDEX> --manifest <MANIFEST_JSON> [--allow-mainnet-writes <true|false>] [--log-sensitive <true|false>]"
    );
  }

  return {
    contract: requireAddress(contract, "--contract"),
    batchId: parseNonNegativeBigInt(batchIdStr, "--batch-id"),
    leafIndex: parseNonNegativeBigInt(leafIndexStr, "--leaf-index"),
    manifestPath,
    allowMainnetWrites,
    logSensitive,
  };
}

export function loadManifest(manifestPath: string): LoadedManifest {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as BatchManifest;
  const validated = validateManifest(parsed);

  return {
    manifest: validated.manifest,
    validated,
  };
}

function toSafeIndex(index: bigint, label: string): number {
  if (index > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`${label} exceeds max safe JS integer range`);
  }

  return Number(index);
}

async function main(): Promise<void> {
  const {
    contract: contractAddress,
    batchId,
    leafIndex,
    manifestPath,
    allowMainnetWrites,
    logSensitive,
  } = parseArgs(process.argv.slice(2));

  const { manifest, validated } = loadManifest(manifestPath);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "batch reveal script");

  const leafIndexNumber = toSafeIndex(leafIndex, "--leaf-index");
  if (leafIndexNumber >= manifest.leafCount) {
    throw new Error(
      `Leaf index ${leafIndex.toString()} out of range [0, ${manifest.leafCount - 1}]`
    );
  }

  const leaf = manifest.leaves[leafIndexNumber];
  if (!leaf) {
    throw new Error(
      `Leaf index ${leafIndex.toString()} not found in manifest (available range: 0-${
        manifest.leafCount - 1
      })`
    );
  }

  console.log("\nRevealing batch leaf...");
  console.log("Batch ID:   ", batchId.toString());
  console.log("Leaf Index: ", leafIndex.toString());
  console.log("Prompt:     ", formatSensitive(leaf.prompt, logSensitive));
  console.log("Output:     ", formatSensitive(leaf.output, logSensitive));
  console.log("Nonce:      ", formatSensitive(leaf.nonce, logSensitive));
  if (!logSensitive) {
    console.log("Sensitive fields are redacted. Use --log-sensitive true in trusted environments.");
  }
  console.log("Manifest Hash:", validated.manifestHash);
  console.log("");

  const Factory = await ethers.getContractFactory("ClawCommitBatch");
  const contract = Factory.attach(contractAddress);
  const leafHashes = manifest.leaves.map((entry) => entry.leafHash);
  const proof = generateMerkleProof(leafHashes, leafIndexNumber);

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

if (require.main === module) {
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
}
