import * as fs from "fs";
import {
  BatchManifest,
  validateManifest,
} from "./merkle";

interface RecomputeArgs {
  manifestPath: string;
}

function parseArgs(argv: string[]): RecomputeArgs {
  const idx = argv.indexOf("--manifest");
  const manifestPath = idx !== -1 ? argv[idx + 1] : undefined;

  if (!manifestPath) {
    throw new Error(
      "Usage: npx ts-node scripts/batch/recomputeRoot.ts --manifest <MANIFEST_JSON>"
    );
  }

  return { manifestPath };
}

function loadManifest(manifestPath: string): BatchManifest {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as BatchManifest;

  if (
    parsed.version !== "clawcommit-batch-v1" ||
    typeof parsed.modelVersion !== "string" ||
    !Array.isArray(parsed.leaves)
  ) {
    throw new Error("Invalid manifest format");
  }

  return parsed;
}

async function main(): Promise<void> {
  const { manifestPath } = parseArgs(process.argv.slice(2));
  const manifest = loadManifest(manifestPath);
  const validated = validateManifest(manifest);
  const matches = validated.recomputedRoot === manifest.root;

  console.log("Manifest:", manifestPath);
  console.log("Recorded root:  ", manifest.root);
  console.log("Recomputed root:", validated.recomputedRoot);
  console.log("Manifest hash:  ", validated.manifestHash);

  if (!matches) {
    console.error("Root mismatch.");
    process.exit(1);
  }

  console.log("Root matches.");
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
