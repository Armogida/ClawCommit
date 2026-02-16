import { expect } from "chai";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { buildManifest, computeManifestHash } from "../scripts/batch/merkle";
import {
  loadManifest as loadRevealManifest,
  parseArgs as parseRevealLeafArgs,
} from "../scripts/batch/revealLeaf";
import {
  loadManifest as loadReplayManifest,
  parseArgs as parseReplayBatchArgs,
} from "../scripts/batch/replayBatch";
import {
  assertOutputSafety,
  loadManifest as loadGenerateProofManifest,
  parseArgs as parseGenerateProofArgs,
} from "../scripts/batch/generateProof";

function withTempManifest(manifest: unknown, run: (manifestPath: string) => void): void {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawcommit-batch-hardening-"));
  const manifestPath = path.join(tempDir, "manifest.json");
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  try {
    run(manifestPath);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

describe("Batch Script Hardening", function () {
  it("revealLeaf parses bigint IDs and safe flags", async function () {
    const parsed = parseRevealLeafArgs([
      "--contract",
      "0x0000000000000000000000000000000000000001",
      "--batch-id",
      "18446744073709551616",
      "--leaf-index",
      "1",
      "--manifest",
      "manifest.json",
      "--log-sensitive",
      "false",
    ]);

    expect(parsed.batchId).to.equal(18446744073709551616n);
    expect(parsed.leafIndex).to.equal(1n);
    expect(parsed.allowMainnetWrites).to.equal(false);
    expect(parsed.logSensitive).to.equal(false);
  });

  it("revealLeaf rejects malformed manifests via shared integrity validation", async function () {
    const manifest = buildManifest(
      [
        { prompt: "prompt0", output: "output0", nonce: "nonce0" },
        { prompt: "prompt1", output: "output1", nonce: "nonce1" },
      ],
      "v2"
    );
    manifest.leafCount = 7;

    withTempManifest(manifest, (manifestPath) => {
      expect(() => loadRevealManifest(manifestPath)).to.throw("leafCount mismatch");
    });
  });

  it("replayBatch parses bigint batch IDs and enforces address validation", async function () {
    const parsed = parseReplayBatchArgs([
      "--manifest",
      "manifest.json",
      "--contract",
      "0x0000000000000000000000000000000000000001",
      "--batch-id",
      "9007199254740993",
      "--network",
      "bscTestnet",
    ]);
    expect(parsed.batchId).to.equal(9007199254740993n);

    expect(() =>
      parseReplayBatchArgs([
        "--manifest",
        "manifest.json",
        "--contract",
        "0x1234",
        "--batch-id",
        "1",
      ])
    ).to.throw("--contract must be a valid EVM address or 32-byte hex value");
  });

  it("replayBatch uses canonical manifest hashing", async function () {
    const manifest = buildManifest(
      [
        { prompt: "a", output: "b", nonce: "n0" },
        { prompt: "c", output: "d", nonce: "n1" },
      ],
      "v2"
    );

    withTempManifest(manifest, (manifestPath) => {
      const loaded = loadReplayManifest(manifestPath);
      expect(loaded.validated.manifestHash).to.equal(computeManifestHash(manifest));
    });
  });

  it("generateProof enforces integer leaf index parsing", async function () {
    expect(() =>
      parseGenerateProofArgs(["--manifest", "manifest.json", "--leaf-index", "not-a-number"])
    ).to.throw("--leaf-index must be a non-negative integer");
  });

  it("generateProof refuses sensitive stdout by default", async function () {
    expect(() => assertOutputSafety(undefined, false)).to.throw(
      "Refusing to write sensitive proof payload to stdout by default"
    );
    expect(() => assertOutputSafety("proof.json", false)).to.not.throw();
    expect(() => assertOutputSafety(undefined, true)).to.not.throw();
  });

  it("generateProof rejects manifests with non-sequential leaf indices", async function () {
    const manifest = buildManifest(
      [
        { prompt: "prompt0", output: "output0", nonce: "nonce0" },
        { prompt: "prompt1", output: "output1", nonce: "nonce1" },
      ],
      "v2"
    );
    manifest.leaves[1].leafIndex = 4;

    withTempManifest(manifest, (manifestPath) => {
      expect(() => loadGenerateProofManifest(manifestPath)).to.throw("Leaf index mismatch");
    });
  });
});
