import * as fs from "fs";
import * as path from "path";
import { BatchManifest, generateMerkleProof } from "./merkle";

interface GenerateProofArgs {
  manifestPath: string;
  leafIndex: number;
  outPath?: string;
}

function parseArgs(): GenerateProofArgs {
  const args = process.argv.slice(2);
  let manifestPath = "";
  let leafIndex = -1;
  let outPath: string | undefined;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--manifest" && args[i + 1]) manifestPath = args[++i];
    else if (args[i] === "--leaf-index" && args[i + 1]) leafIndex = parseInt(args[++i], 10);
    else if (args[i] === "--out" && args[i + 1]) outPath = args[++i];
  }

  if (!manifestPath) throw new Error("Missing --manifest <path>");
  if (leafIndex < 0) throw new Error("Missing --leaf-index <number>");

  return { manifestPath, leafIndex, outPath };
}

function loadManifest(manifestPath: string): BatchManifest {
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

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

function ensureParentDir(targetPath: string): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
}

async function main(): Promise<void> {
  const { manifestPath, leafIndex, outPath } = parseArgs();
  const manifest = loadManifest(manifestPath);

  if (leafIndex < 0 || leafIndex >= manifest.leafCount) {
    throw new Error(`Leaf index ${leafIndex} out of range [0, ${manifest.leafCount - 1}]`);
  }

  const leafHashes = manifest.leaves.map((leaf) => leaf.leafHash);
  const proof = generateMerkleProof(leafHashes, leafIndex);
  const leaf = manifest.leaves[leafIndex];

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
  };

  const outputJson = `${JSON.stringify(output, null, 2)}\n`;

  if (outPath) {
    ensureParentDir(outPath);
    fs.writeFileSync(outPath, outputJson);
    console.log("Merkle proof generated.");
    console.log("Manifest:", manifestPath);
    console.log("Leaf index:", leafIndex);
    console.log("Output:", outPath);
    console.log("Root:", manifest.root);
  } else {
    process.stdout.write(outputJson);
  }
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
