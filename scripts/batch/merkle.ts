import { AbiCoder, isHexString, keccak256, toUtf8Bytes } from "ethers";

export interface DecisionInput {
  prompt: string;
  output: string;
  nonce: string;
}

export interface ManifestLeaf extends DecisionInput {
  leafIndex: number;
  leafHash: string;
}

export interface BatchManifest {
  version: "clawcommit-batch-v1";
  modelVersion: string;
  leafCount: number;
  root: string;
  leaves: ManifestLeaf[];
}

export interface ManifestValidationResult {
  manifest: BatchManifest;
  canonicalManifest: BatchManifest;
  canonicalJson: string;
  manifestHash: string;
  recomputedRoot: string;
}

const abiCoder = AbiCoder.defaultAbiCoder();

function isHex32(value: string): boolean {
  return isHexString(value, 32);
}

export function computeLeafHash(
  prompt: string,
  output: string,
  modelVersion: string,
  nonce: string,
  leafIndex: number
): string {
  const encoded = abiCoder.encode(
    ["string", "string", "string", "string", "uint256"],
    [prompt, output, modelVersion, nonce, leafIndex]
  );

  return keccak256(encoded);
}

export function computeParentHash(left: string, right: string): string {
  const encoded = abiCoder.encode(["bytes32", "bytes32"], [left, right]);
  return keccak256(encoded);
}

export function computeMerkleRoot(leafHashes: string[]): string {
  if (leafHashes.length === 0) {
    throw new Error("Cannot compute Merkle root for empty leaf set");
  }

  let level = [...leafHashes];

  while (level.length > 1) {
    const nextLevel: string[] = [];

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];
      nextLevel.push(computeParentHash(left, right));
    }

    level = nextLevel;
  }

  return level[0];
}

export function buildManifest(
  decisions: DecisionInput[],
  modelVersion: string
): BatchManifest {
  if (decisions.length === 0) {
    throw new Error("Cannot build manifest from an empty decision list");
  }

  const leaves = decisions.map((decision, index) => ({
    leafIndex: index,
    prompt: decision.prompt,
    output: decision.output,
    nonce: decision.nonce,
    leafHash: computeLeafHash(
      decision.prompt,
      decision.output,
      modelVersion,
      decision.nonce,
      index
    ),
  }));

  return {
    version: "clawcommit-batch-v1",
    modelVersion,
    leafCount: leaves.length,
    root: computeMerkleRoot(leaves.map((leaf) => leaf.leafHash)),
    leaves,
  };
}

export function toCanonicalManifest(manifest: BatchManifest): BatchManifest {
  return {
    version: "clawcommit-batch-v1",
    modelVersion: manifest.modelVersion,
    leafCount: manifest.leafCount,
    root: manifest.root,
    leaves: manifest.leaves.map((leaf) => ({
      leafIndex: leaf.leafIndex,
      prompt: leaf.prompt,
      output: leaf.output,
      nonce: leaf.nonce,
      leafHash: leaf.leafHash,
    })),
  };
}

export function canonicalizeManifest(manifest: BatchManifest): string {
  return JSON.stringify(toCanonicalManifest(manifest));
}

export function computeManifestHash(manifest: BatchManifest): string {
  return keccak256(toUtf8Bytes(canonicalizeManifest(manifest)));
}

export function validateManifest(manifest: BatchManifest): ManifestValidationResult {
  if (
    manifest.version !== "clawcommit-batch-v1" ||
    typeof manifest.modelVersion !== "string" ||
    !Array.isArray(manifest.leaves)
  ) {
    throw new Error("Invalid manifest format");
  }

  if (!Number.isInteger(manifest.leafCount) || manifest.leafCount <= 0) {
    throw new Error("Manifest leafCount must be a positive integer");
  }

  if (manifest.leafCount !== manifest.leaves.length) {
    throw new Error(
      `Manifest leafCount mismatch: expected ${manifest.leafCount} leaves, got ${manifest.leaves.length}`
    );
  }

  if (!isHex32(manifest.root)) {
    throw new Error("Manifest root must be a bytes32 hex string");
  }

  const recomputedLeafHashes = manifest.leaves.map((leaf, index) => {
    if (!Number.isInteger(leaf.leafIndex) || leaf.leafIndex < 0) {
      throw new Error(`Leaf index at position ${index} must be a non-negative integer`);
    }
    if (leaf.leafIndex !== index) {
      throw new Error(`Leaf index mismatch at position ${index}`);
    }
    if (
      typeof leaf.prompt !== "string" ||
      typeof leaf.output !== "string" ||
      typeof leaf.nonce !== "string" ||
      typeof leaf.leafHash !== "string"
    ) {
      throw new Error(`Leaf ${index} must include string prompt/output/nonce/leafHash fields`);
    }
    if (!isHex32(leaf.leafHash)) {
      throw new Error(`Leaf ${index} hash must be a bytes32 hex string`);
    }

    const recomputed = computeLeafHash(
      leaf.prompt,
      leaf.output,
      manifest.modelVersion,
      leaf.nonce,
      leaf.leafIndex
    );
    if (recomputed !== leaf.leafHash) {
      throw new Error(
        `Leaf hash mismatch at index ${index}: expected ${leaf.leafHash}, got ${recomputed}`
      );
    }

    return recomputed;
  });

  const recomputedRoot = computeMerkleRoot(recomputedLeafHashes);
  if (recomputedRoot !== manifest.root) {
    throw new Error(
      `Manifest root mismatch: expected ${manifest.root}, recomputed ${recomputedRoot}`
    );
  }

  const canonicalManifest = toCanonicalManifest(manifest);
  const canonicalJson = canonicalizeManifest(canonicalManifest);
  const manifestHash = computeManifestHash(canonicalManifest);

  return {
    manifest,
    canonicalManifest,
    canonicalJson,
    manifestHash,
    recomputedRoot,
  };
}

export function parseDecisionNdjson(raw: string): DecisionInput[] {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length === 0) {
    throw new Error("Input NDJSON contains zero records");
  }

  return lines.map((line, index) => {
    let parsed: unknown;

    try {
      parsed = JSON.parse(line);
    } catch {
      throw new Error(`Invalid JSON on line ${index + 1}`);
    }

    if (
      typeof parsed !== "object" ||
      parsed === null ||
      typeof (parsed as Record<string, unknown>).prompt !== "string" ||
      typeof (parsed as Record<string, unknown>).output !== "string" ||
      typeof (parsed as Record<string, unknown>).nonce !== "string"
    ) {
      throw new Error(
        `Line ${index + 1} must include string fields: prompt, output, nonce`
      );
    }

    const record = parsed as Record<string, string>;
    if (!record.nonce.trim()) {
      throw new Error(`Line ${index + 1} has empty nonce`);
    }

    return {
      prompt: record.prompt,
      output: record.output,
      nonce: record.nonce.trim(),
    };
  });
}

export interface MerkleProof {
  leafIndex: number;
  leafHash: string;
  siblings: string[];
  path: boolean[]; // true = leaf is on right side, false = leaf is on left side
}

export function generateMerkleProof(
  leafHashes: string[],
  targetIndex: number
): MerkleProof {
  if (targetIndex < 0 || targetIndex >= leafHashes.length) {
    throw new Error(`Target index ${targetIndex} out of range [0, ${leafHashes.length - 1}]`);
  }

  const siblings: string[] = [];
  const path: boolean[] = [];
  let level = [...leafHashes];
  let idx = targetIndex;

  while (level.length > 1) {
    const nextLevel: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];

      if (i === idx || i + 1 === idx) {
        if (idx % 2 === 0) {
          // target is left child, sibling is right
          siblings.push(right);
          path.push(false);
        } else {
          // target is right child, sibling is left
          siblings.push(left);
          path.push(true);
        }
      }

      nextLevel.push(computeParentHash(left, right));
    }
    idx = Math.floor(idx / 2);
    level = nextLevel;
  }

  return {
    leafIndex: targetIndex,
    leafHash: leafHashes[targetIndex],
    siblings,
    path,
  };
}

export function verifyMerkleProof(proof: MerkleProof, expectedRoot: string): boolean {
  let computed = proof.leafHash;
  for (let i = 0; i < proof.siblings.length; i++) {
    if (proof.path[i]) {
      computed = computeParentHash(proof.siblings[i], computed);
    } else {
      computed = computeParentHash(computed, proof.siblings[i]);
    }
  }
  return computed === expectedRoot;
}
