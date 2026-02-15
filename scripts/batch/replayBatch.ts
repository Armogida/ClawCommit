import { readFileSync } from "fs";
import { Contract, JsonRpcProvider } from "ethers";
import {
  BatchManifest,
  ManifestValidationResult,
  computeLeafHash,
  computeMerkleRoot,
  validateManifest,
} from "./merkle";
import { parseNonNegativeBigInt, requireAddress } from "../common/safety";

const BATCH_ABI = [
  "function getBatch(uint256 batchId) external view returns (tuple(bytes32 merkleRoot, uint32 leafCount, uint64 timestamp, address committer, string modelVersion, bytes32 manifestHash))",
] as const;

interface ReplayArgs {
  manifestPath: string;
  contractAddress?: string;
  batchId?: bigint;
  network?: string;
  local: boolean;
}

interface LoadedManifest {
  manifest: BatchManifest;
  validated: ManifestValidationResult;
}

export function parseArgs(argv: string[]): ReplayArgs {
  let manifestPath = "";
  let contractAddress: string | undefined;
  let batchId: bigint | undefined;
  let network: string | undefined;
  let local = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--manifest" && argv[i + 1]) {
      manifestPath = argv[++i];
    } else if (argv[i] === "--contract" && argv[i + 1]) {
      contractAddress = requireAddress(argv[++i], "--contract");
    } else if (argv[i] === "--batch-id" && argv[i + 1]) {
      batchId = parseNonNegativeBigInt(argv[++i], "--batch-id");
    } else if (argv[i] === "--network" && argv[i + 1]) {
      network = argv[++i];
    } else if (argv[i] === "--local") {
      local = true;
    }
  }

  if (!manifestPath) {
    throw new Error(
      [
        "Usage:",
        "  npx ts-node scripts/batch/replayBatch.ts --manifest <PATH> --local",
        "  npx ts-node scripts/batch/replayBatch.ts --manifest <PATH> --contract <ADDR> --batch-id <ID> [--network <NETWORK>]",
      ].join("\n")
    );
  }

  if (!local && (!contractAddress || batchId === undefined)) {
    throw new Error(
      "Provide --contract and --batch-id for on-chain verification, or use --local"
    );
  }

  return { manifestPath, contractAddress, batchId, network, local };
}

export function loadManifest(manifestPath: string): LoadedManifest {
  let raw: string;
  try {
    raw = readFileSync(manifestPath, "utf-8");
  } catch (error) {
    throw new Error(`Failed to read manifest file: ${manifestPath}`);
  }

  let parsed: BatchManifest;
  try {
    parsed = JSON.parse(raw) as BatchManifest;
  } catch (error) {
    throw new Error(`Invalid JSON in manifest file: ${manifestPath}`);
  }

  const validated = validateManifest(parsed);
  return { manifest: validated.manifest, validated };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  console.log("\n📦 Batch Replay Verification");
  console.log(`   Manifest: ${args.manifestPath}`);

  const { manifest, validated } = loadManifest(args.manifestPath);

  console.log(`   Leaves: ${manifest.leafCount}`);
  console.log(`   Model: ${manifest.modelVersion}`);

  const recomputedLeafHashes = manifest.leaves.map((leaf) =>
    computeLeafHash(
      leaf.prompt,
      leaf.output,
      manifest.modelVersion,
      leaf.nonce,
      leaf.leafIndex
    )
  );

  let leafMismatches = 0;
  for (let i = 0; i < recomputedLeafHashes.length; i++) {
    if (recomputedLeafHashes[i] !== manifest.leaves[i].leafHash) {
      console.log(`   ✗ Leaf ${i}: hash mismatch`);
      leafMismatches++;
    }
  }

  if (leafMismatches > 0) {
    throw new Error(`${leafMismatches} leaf hash mismatches`);
  }
  console.log(`   ✓ All ${manifest.leafCount} leaf hashes verified`);

  const recomputedRoot = computeMerkleRoot(recomputedLeafHashes);

  if (recomputedRoot !== manifest.root) {
    throw new Error(
      [
        "Merkle root mismatch",
        `Manifest root:    ${manifest.root}`,
        `Recomputed root:  ${recomputedRoot}`,
      ].join("\n")
    );
  }
  console.log(`   ✓ Merkle root verified: ${recomputedRoot.slice(0, 18)}...`);
  console.log(`   ✓ Canonical manifest hash: ${validated.manifestHash}`);

  if (args.local) {
    console.log("\n✓ LOCAL REPLAY VERIFIED");
    console.log(`   Root: ${recomputedRoot}`);
    return;
  }

  const rpcUrls: Record<string, string> = {
    localhost: "http://127.0.0.1:8545/",
    bsc: "https://bsc-dataseed.binance.org/",
    bscMainnet: "https://bsc-dataseed.binance.org/",
    bscTestnet: "https://data-seed-prebsc-1-s1.binance.org:8545/",
  };

  const rpcUrl =
    rpcUrls[args.network || ""] ||
    process.env.BSC_RPC_URL ||
    "https://bsc-dataseed.binance.org/";
  const provider = new JsonRpcProvider(rpcUrl);
  const contract = new Contract(args.contractAddress!, BATCH_ABI, provider);

  console.log("\n🔗 On-Chain Verification");
  console.log(`   Contract: ${args.contractAddress}`);
  console.log(`   Batch ID: ${args.batchId!.toString()}`);

  const batch = await contract.getBatch(args.batchId!);

  if (batch.merkleRoot !== recomputedRoot) {
    throw new Error(
      [
        "On-chain root mismatch",
        `On-chain root:   ${batch.merkleRoot}`,
        `Recomputed root: ${recomputedRoot}`,
      ].join("\n")
    );
  }
  console.log(`   ✓ On-chain Merkle root matches`);

  const manifestHash = validated.manifestHash;
  if (batch.manifestHash !== manifestHash) {
    throw new Error(
      [
        "Manifest hash mismatch",
        `On-chain hash:   ${batch.manifestHash}`,
        `Computed hash:   ${manifestHash}`,
      ].join("\n")
    );
  }
  console.log(`   ✓ Manifest hash matches`);

  if (BigInt(batch.leafCount) !== BigInt(manifest.leafCount)) {
    throw new Error(
      `Leaf count mismatch: on-chain ${batch.leafCount}, manifest ${manifest.leafCount}`
    );
  }
  console.log(`   ✓ Leaf count matches: ${manifest.leafCount}`);

  console.log("\n✓ DETERMINISTIC BATCH REPLAY VERIFIED");
  console.log(`   Batch ID: ${args.batchId!.toString()}`);
  console.log(`   Root: ${recomputedRoot}`);
  console.log(`   Committer: ${batch.committer}`);
  console.log(`   Timestamp: ${new Date(Number(batch.timestamp) * 1000).toISOString()}`);
}

if (require.main === module) {
  main().catch((error) => {
    console.error("\n✗ ERROR:", error.message || error);
    process.exit(1);
  });
}
