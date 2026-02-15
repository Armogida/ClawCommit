import * as fs from "fs";
import * as path from "path";
import {
  buildManifest,
  canonicalizeManifest,
  computeManifestHash,
  parseDecisionNdjson,
  toCanonicalManifest,
} from "./merkle";

interface BuildArgs {
  inputPath: string;
  outputPath: string;
  modelVersion: string;
}

function parseArgs(argv: string[]): BuildArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const inputPath = get("--in");
  const outputPath = get("--out");
  const modelVersion = get("--model-version");

  if (!inputPath || !outputPath || !modelVersion) {
    throw new Error(
      "Usage: npx ts-node scripts/batch/build.ts --in <INPUT_NDJSON> --out <OUTPUT_MANIFEST_JSON> --model-version <MODEL_VERSION>"
    );
  }

  return { inputPath, outputPath, modelVersion };
}

function ensureParentDir(targetPath: string): void {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
}

async function main(): Promise<void> {
  const { inputPath, outputPath, modelVersion } = parseArgs(process.argv.slice(2));
  const raw = fs.readFileSync(inputPath, "utf8");
  const decisions = parseDecisionNdjson(raw);

  const manifest = toCanonicalManifest(buildManifest(decisions, modelVersion));
  const manifestHash = computeManifestHash(manifest);

  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);

  console.log("Batch manifest generated.");
  console.log("Input:", inputPath);
  console.log("Output:", outputPath);
  console.log("Leaf count:", manifest.leafCount);
  console.log("Root:", manifest.root);
  console.log("Canonical manifest hash:", manifestHash);
  console.log("Canonical JSON bytes:", canonicalizeManifest(manifest).length);
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
