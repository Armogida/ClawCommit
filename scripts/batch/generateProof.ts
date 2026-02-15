import * as fs from "fs";
import * as path from "path";
import {
  BatchManifest,
  ManifestValidationResult,
  generateMerkleProof,
  validateManifest,
} from "./merkle";
import { parseBooleanFlag, parseNonNegativeBigInt } from "../common/safety";

interface GenerateProofArgs {
  manifestPath: string;
  leafIndex: bigint;
  outPath?: string;
  logSensitive: boolean;
}

interface LoadedManifest {
  manifest: BatchManifest;
  validated: ManifestValidationResult;
}

export function parseArgs(argv: string[]): GenerateProofArgs {
  const args = argv;
  let manifestPath = "";
  let leafIndex: bigint | undefined;
  let outPath: string | undefined;
  const logSensitive = parseBooleanFlag(args, "--log-sensitive");

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manifest" && args[i + 1]) manifestPath = args[++i];
    else if (args[i] === "--leaf-index" && args[i + 1]) {
      leafIndex = parseNonNegativeBigInt(args[++i], "--leaf-index");
    }
    else if (args[i] === "--out" && args[i + 1]) outPath = args[++i];
  }

  if (!manifestPath) throw new Error("Missing --manifest <path>");
  if (leafIndex === undefined) throw new Error("Missing --leaf-index <number>");

  return { manifestPath, leafIndex, outPath, logSensitive };
}

export function loadManifest(manifestPath: string): LoadedManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as BatchManifest;
  const validated = validateManifest(parsed);

  return {
    manifest: validated.manifest,
    validated,
  };
}

function toSafeIndex(index: bigint): number {
  if (index > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error("--leaf-index exceeds max safe JS integer range");
  }

  return Number(index);
}

function ensureParentDir(targetPath: string): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
}

export function assertOutputSafety(outPath: string | undefined, logSensitive: boolean): void {
  if (!outPath && !logSensitive) {
    throw new Error(
      "Refusing to write sensitive proof payload to stdout by default. Provide --out <path> or pass --log-sensitive true."
    );
  }
}

async function main(): Promise<void> {
  const { manifestPath, leafIndex, outPath, logSensitive } = parseArgs(process.argv.slice(2));
  assertOutputSafety(outPath, logSensitive);
  const { manifest, validated } = loadManifest(manifestPath);
  const leafIndexNumber = toSafeIndex(leafIndex);

  if (leafIndexNumber >= manifest.leafCount) {
    throw new Error(
      `Leaf index ${leafIndex.toString()} out of range [0, ${manifest.leafCount - 1}]`
    );
  }

  const leafHashes = manifest.leaves.map((leaf) => leaf.leafHash);
  const proof = generateMerkleProof(leafHashes, leafIndexNumber);
  const leaf = manifest.leaves[leafIndexNumber];

  const output = {
    batchVersion: "clawcommit-batch-v1",
    leafIndex: proof.leafIndex,
    leafHash: proof.leafHash,
    leaf: {
      prompt: leaf.prompt,
      output: leaf.output,
      nonce: leaf.nonce,
      modelVersion: manifest.modelVersion,
    },
    proof: {
      siblings: proof.siblings,
      path: proof.path,
    },
    merkleRoot: manifest.root,
    manifestHash: validated.manifestHash,
  };

  const outputJson = `${JSON.stringify(output, null, 2)}\n`;

  if (outPath) {
    ensureParentDir(outPath);
    fs.writeFileSync(outPath, outputJson);
    console.log("Merkle proof generated.");
    console.log("Manifest:", manifestPath);
    console.log("Leaf index:", leafIndex.toString());
    console.log("Output:", outPath);
    console.log("Root:", manifest.root);
    if (!logSensitive) {
      console.log("Sensitive payload is only written to file. Stdout redaction guard is active.");
    }
  } else {
    process.stdout.write(outputJson);
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error("Error:", error.message || error);
    process.exit(1);
  });
}
