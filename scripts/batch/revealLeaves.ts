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

interface RevealLeavesArgs {
  contract: string;
  batchId: bigint;
  leafIndexes: bigint[];
  manifestPath: string;
  allowMainnetWrites: boolean;
  logSensitive: boolean;
}

interface LoadedManifest {
  manifest: BatchManifest;
  validated: ManifestValidationResult;
}

function parseLeafIndexes(raw: string): bigint[] {
  const parts = raw
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);

  if (parts.length === 0) {
    throw new Error("--leaf-indexes must include at least one index");
  }

  const indexes = parts.map((value, position) =>
    parseNonNegativeBigInt(value, `--leaf-indexes[${position}]`)
  );

  const seen = new Set<string>();
  for (const index of indexes) {
    const key = index.toString();
    if (seen.has(key)) {
      throw new Error(`--leaf-indexes contains duplicate value: ${key}`);
    }
    seen.add(key);
  }

  return indexes;
}

export function parseArgs(argv: string[]): RevealLeavesArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const batchIdStr = get("--batch-id");
  const leafIndexesRaw = get("--leaf-indexes");
  const manifestPath = get("--manifest");
  const allowMainnetWrites = parseBooleanFlag(argv, "--allow-mainnet-writes");
  const logSensitive = parseBooleanFlag(argv, "--log-sensitive");

  if (!contract || !batchIdStr || !leafIndexesRaw || !manifestPath) {
    throw new Error(
      "Usage: HARDHAT_NETWORK=<NETWORK> npx ts-node scripts/batch/revealLeaves.ts --contract <ADDR> --batch-id <ID> --leaf-indexes <INDEX_LIST> --manifest <MANIFEST_JSON> [--allow-mainnet-writes <true|false>] [--log-sensitive <true|false>]"
    );
  }

  return {
    contract: requireAddress(contract, "--contract"),
    batchId: parseNonNegativeBigInt(batchIdStr, "--batch-id"),
    leafIndexes: parseLeafIndexes(leafIndexesRaw),
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
    leafIndexes,
    manifestPath,
    allowMainnetWrites,
    logSensitive,
  } = parseArgs(process.argv.slice(2));

  const { manifest, validated } = loadManifest(manifestPath);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "batch multi-reveal script");

  const leafIndexesAsNumbers = leafIndexes.map((value) =>
    toSafeIndex(value, "--leaf-indexes")
  );

  for (let i = 0; i < leafIndexesAsNumbers.length; i++) {
    if (leafIndexesAsNumbers[i] >= manifest.leafCount) {
      throw new Error(
        `Leaf index ${leafIndexes[i].toString()} out of range [0, ${
          manifest.leafCount - 1
        }]`
      );
    }
  }

  const Factory = await ethers.getContractFactory("ClawCommitBatch");
  const contract = Factory.attach(contractAddress);
  const leafHashes = manifest.leaves.map((entry) => entry.leafHash);

  const reveals = leafIndexesAsNumbers.map((index, position) => {
    const leaf = manifest.leaves[index];
    return {
      leafIndex: leafIndexes[position],
      prompt: leaf.prompt,
      output: leaf.output,
      nonce: leaf.nonce,
    };
  });

  const proofs = leafIndexesAsNumbers.map((index) => {
    const proof = generateMerkleProof(leafHashes, index);
    return {
      siblings: proof.siblings,
      path: proof.path,
    };
  });

  console.log("\nRevealing batch leaves...");
  console.log("Batch ID:      ", batchId.toString());
  console.log(
    "Leaf Indexes:  ",
    leafIndexes.map((value) => value.toString()).join(", ")
  );
  console.log("Manifest Hash: ", validated.manifestHash);
  if (!logSensitive) {
    console.log("Sensitive fields are redacted. Use --log-sensitive true in trusted environments.");
  }
  for (const reveal of reveals) {
    console.log(
      `- Leaf ${reveal.leafIndex.toString()}: prompt=${formatSensitive(
        reveal.prompt,
        logSensitive
      )} output=${formatSensitive(reveal.output, logSensitive)} nonce=${formatSensitive(
        reveal.nonce,
        logSensitive
      )}`
    );
  }
  console.log("");

  const tx = await contract.revealBatchLeaves(batchId, reveals, proofs);
  console.log("Reveal Tx:     ", tx.hash);

  const receipt = await tx.wait();
  let revealedCount = 0;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });

        if (parsedLog?.name === "BatchLeafRevealed") {
          const revealedLeafIndex = parsedLog.args.leafIndex;
          const revealedLeafHash = parsedLog.args.leafHash;
          console.log(
            `✓ Revealed leaf ${revealedLeafIndex.toString()} (${revealedLeafHash})`
          );
          revealedCount += 1;
        }
      } catch {
        // Skip non-contract logs
      }
    }
  }

  if (revealedCount === 0) {
    console.log("✓ Transaction confirmed (no BatchLeafRevealed logs parsed)");
    return;
  }

  console.log(`✓ Revealed ${revealedCount} leaf/leaves in one transaction.`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\n✗ Multi-reveal failed:", error.message || error);

    if (error.message?.includes("OnlyBatchCommitter")) {
      console.error("Hint: Only the original batch committer can reveal leaves.");
    } else if (error.message?.includes("LeafAlreadyRevealed")) {
      console.error("Hint: At least one requested leaf was already revealed.");
    } else if (error.message?.includes("LeafIndexOutOfRange")) {
      console.error("Hint: One or more leaf indexes exceed the batch leaf count.");
    } else if (error.message?.includes("LeafHashMismatch")) {
      console.error("Hint: At least one requested leaf payload/proof does not match the committed root.");
    } else if (error.message?.includes("ProofLengthMismatch")) {
      console.error("Hint: One or more Merkle proofs have malformed siblings/path arrays.");
    } else if (error.message?.includes("RevealSetLengthMismatch")) {
      console.error("Hint: Internal reveal/proof arrays differ in length.");
    } else if (error.message?.includes("EmptyRevealSet")) {
      console.error("Hint: Provide at least one leaf index via --leaf-indexes.");
    } else if (error.message?.includes("insufficient funds")) {
      console.error("Hint: Account needs gas tokens for transaction fees.");
    } else if (error.message?.includes("could not detect network")) {
      console.error("Hint: Check RPC URL in .env or --network flag.");
    }

    process.exit(1);
  });
}
