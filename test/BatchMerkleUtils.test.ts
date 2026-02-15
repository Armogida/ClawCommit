import { expect } from "chai";
import {
  buildManifest,
  computeManifestHash,
  computeLeafHash,
  computeMerkleRoot,
  computeParentHash,
  validateManifest,
  parseDecisionNdjson,
} from "../scripts/batch/merkle";

describe("Batch Merkle Utilities", function () {
  it("computes deterministic leaf hash", async function () {
    const leafA = computeLeafHash("p", "o", "v2", "n", 0);
    const leafB = computeLeafHash("p", "o", "v2", "n", 0);
    const leafC = computeLeafHash("p", "o", "v2", "n", 1);

    expect(leafA).to.equal(leafB);
    expect(leafA).to.not.equal(leafC);
  });

  it("duplicates the last node for odd-width levels", async function () {
    const l0 = computeLeafHash("p0", "o0", "v2", "n0", 0);
    const l1 = computeLeafHash("p1", "o1", "v2", "n1", 1);
    const l2 = computeLeafHash("p2", "o2", "v2", "n2", 2);

    const left = computeParentHash(l0, l1);
    const right = computeParentHash(l2, l2);
    const expectedRoot = computeParentHash(left, right);

    const root = computeMerkleRoot([l0, l1, l2]);
    expect(root).to.equal(expectedRoot);
  });

  it("builds a manifest with consistent root and leafCount", async function () {
    const manifest = buildManifest(
      [
        { prompt: "p0", output: "o0", nonce: "n0" },
        { prompt: "p1", output: "o1", nonce: "n1" },
      ],
      "v2"
    );

    expect(manifest.version).to.equal("clawcommit-batch-v1");
    expect(manifest.leafCount).to.equal(2);
    expect(manifest.leaves).to.have.lengthOf(2);
    expect(manifest.root).to.equal(
      computeMerkleRoot(manifest.leaves.map((leaf) => leaf.leafHash))
    );

    const validated = validateManifest(manifest);
    expect(validated.recomputedRoot).to.equal(manifest.root);
    expect(validated.manifestHash).to.equal(computeManifestHash(manifest));
  });

  it("parses NDJSON decision input", async function () {
    const raw = [
      JSON.stringify({ prompt: "p0", output: "o0", nonce: "n0" }),
      JSON.stringify({ prompt: "p1", output: "o1", nonce: "n1" }),
    ].join("\n");

    const parsed = parseDecisionNdjson(raw);

    expect(parsed).to.deep.equal([
      { prompt: "p0", output: "o0", nonce: "n0" },
      { prompt: "p1", output: "o1", nonce: "n1" },
    ]);
  });

  it("rejects malformed NDJSON rows", async function () {
    const bad = JSON.stringify({ prompt: "p0", output: "o0" });

    expect(() => parseDecisionNdjson(bad)).to.throw(
      "must include string fields: prompt, output, nonce"
    );
  });

  it("rejects manifest when leafCount does not match leaves length", async function () {
    const manifest = buildManifest(
      [
        { prompt: "p0", output: "o0", nonce: "n0" },
        { prompt: "p1", output: "o1", nonce: "n1" },
      ],
      "v2"
    );
    manifest.leafCount = 1;

    expect(() => validateManifest(manifest)).to.throw("leafCount mismatch");
  });

  it("rejects manifest when leaf index ordering is not sequential", async function () {
    const manifest = buildManifest(
      [
        { prompt: "p0", output: "o0", nonce: "n0" },
        { prompt: "p1", output: "o1", nonce: "n1" },
      ],
      "v2"
    );
    manifest.leaves[1].leafIndex = 7;

    expect(() => validateManifest(manifest)).to.throw("Leaf index mismatch");
  });

  it("rejects manifest when root does not match recomputed root", async function () {
    const manifest = buildManifest(
      [
        { prompt: "p0", output: "o0", nonce: "n0" },
        { prompt: "p1", output: "o1", nonce: "n1" },
      ],
      "v2"
    );
    manifest.root = "0x" + "00".repeat(32);

    expect(() => validateManifest(manifest)).to.throw("Manifest root mismatch");
  });
});
