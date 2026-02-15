import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommitBatch } from "../typechain-types";
import {
  computeLeafHash,
  computeParentHash,
  computeMerkleRoot,
  buildManifest,
} from "../scripts/batch/merkle";

/**
 * Merkle Proof Helpers
 */

interface MerkleProof {
  siblings: string[];
  path: boolean[];
}

/**
 * Generate a Merkle inclusion proof for a specific leaf.
 * @param leafIndex - The index of the leaf to prove
 * @param leaves - Array of leaf hashes
 * @returns MerkleProof containing sibling hashes and path directions
 */
function generateProof(leafIndex: number, leaves: string[]): MerkleProof {
  if (leafIndex < 0 || leafIndex >= leaves.length) {
    throw new Error("Leaf index out of bounds");
  }

  const siblings: string[] = [];
  const path: boolean[] = [];

  let level = [...leaves];
  let currentIndex = leafIndex;

  while (level.length > 1) {
    const nextLevel: string[] = [];
    const isRightNode = currentIndex % 2 === 1;

    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = i + 1 < level.length ? level[i + 1] : level[i];

      if (i === currentIndex || i + 1 === currentIndex) {
        // Store sibling
        const sibling = i === currentIndex ? right : left;
        siblings.push(sibling);
        path.push(isRightNode);
      }

      nextLevel.push(computeParentHash(left, right));
    }

    currentIndex = Math.floor(currentIndex / 2);
    level = nextLevel;
  }

  return { siblings, path };
}

/**
 * Verify a Merkle inclusion proof.
 * @param leaf - The leaf hash to verify
 * @param proof - The Merkle proof (siblings and path)
 * @param root - The expected Merkle root
 * @returns true if the proof is valid, false otherwise
 */
function verifyProof(
  leaf: string,
  proof: MerkleProof,
  root: string
): boolean {
  let computedHash = leaf;

  for (let i = 0; i < proof.siblings.length; i++) {
    const sibling = proof.siblings[i];
    const isRightNode = proof.path[i];

    computedHash = isRightNode
      ? computeParentHash(sibling, computedHash)
      : computeParentHash(computedHash, sibling);
  }

  return computedHash === root;
}

/**
 * MerkleProofValidation Test Suite
 */
describe("Merkle Proof Validation", function () {
  let contract: ClawCommitBatch;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("ClawCommitBatch");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe("Proof Generation and Verification", function () {
    it("should generate and verify proofs for a 4-leaf tree (roundtrip)", async function () {
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
        computeLeafHash("p3", "o3", "v2", "n3", 3),
      ];

      const root = computeMerkleRoot(leaves);

      for (let i = 0; i < leaves.length; i++) {
        const proof = generateProof(i, leaves);
        const isValid = verifyProof(leaves[i], proof, root);

        expect(isValid).to.be.true;
      }
    });

    it("should reject invalid proof with wrong sibling hash", async function () {
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
        computeLeafHash("p3", "o3", "v2", "n3", 3),
      ];

      const root = computeMerkleRoot(leaves);
      const proof = generateProof(0, leaves);

      // Tamper with the first sibling
      const invalidProof: MerkleProof = {
        siblings: [
          computeLeafHash("wrong", "wrong", "v2", "wrong", 99),
          ...proof.siblings.slice(1),
        ],
        path: proof.path,
      };

      const isValid = verifyProof(leaves[0], invalidProof, root);
      expect(isValid).to.be.false;
    });

    it("should generate and verify proofs for different tree sizes", async function () {
      const sizes = [1, 2, 3, 4, 5, 8, 16];

      for (const size of sizes) {
        const leaves = Array.from({ length: size }, (_, i) =>
          computeLeafHash(`p${i}`, `o${i}`, "v2", `n${i}`, i)
        );

        const root = computeMerkleRoot(leaves);

        for (let i = 0; i < leaves.length; i++) {
          const proof = generateProof(i, leaves);
          const isValid = verifyProof(leaves[i], proof, root);

          expect(isValid).to.be.true;
        }
      }
    });
  });

  describe("Leaf Ordering", function () {
    it("should produce different roots when leaf positions are swapped", async function () {
      const leaf0 = computeLeafHash("p0", "o0", "v2", "n0", 0);
      const leaf1 = computeLeafHash("p1", "o1", "v2", "n1", 1);
      const leaf2 = computeLeafHash("p2", "o2", "v2", "n2", 2);

      const rootOriginal = computeMerkleRoot([leaf0, leaf1, leaf2]);
      const rootSwapped = computeMerkleRoot([leaf1, leaf0, leaf2]);

      expect(rootOriginal).to.not.equal(rootSwapped);
    });
  });

  describe("Manifest Hash Determinism", function () {
    it("should produce identical manifest hash for same decisions in same order", async function () {
      const decisions = [
        { prompt: "p0", output: "o0", nonce: "n0" },
        { prompt: "p1", output: "o1", nonce: "n1" },
        { prompt: "p2", output: "o2", nonce: "n2" },
      ];

      const manifest1 = buildManifest(decisions, "v2");
      const manifest2 = buildManifest(decisions, "v2");

      const hash1 = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(manifest1)));
      const hash2 = ethers.keccak256(ethers.toUtf8Bytes(JSON.stringify(manifest2)));

      expect(hash1).to.equal(hash2);
      expect(manifest1.root).to.equal(manifest2.root);
    });

    it("should produce different manifest hash for different decision order", async function () {
      const decisions1 = [
        { prompt: "p0", output: "o0", nonce: "n0" },
        { prompt: "p1", output: "o1", nonce: "n1" },
      ];

      const decisions2 = [
        { prompt: "p1", output: "o1", nonce: "n1" },
        { prompt: "p0", output: "o0", nonce: "n0" },
      ];

      const manifest1 = buildManifest(decisions1, "v2");
      const manifest2 = buildManifest(decisions2, "v2");

      expect(manifest1.root).to.not.equal(manifest2.root);
    });
  });

  describe("Single-Leaf Tree", function () {
    it("should have root equal to leaf hash for single-leaf tree", async function () {
      const leaf = computeLeafHash("p0", "o0", "v2", "n0", 0);
      const root = computeMerkleRoot([leaf]);

      expect(root).to.equal(leaf);
    });

    it("should verify proof for single-leaf tree", async function () {
      const leaf = computeLeafHash("p0", "o0", "v2", "n0", 0);
      const root = computeMerkleRoot([leaf]);

      const proof = generateProof(0, [leaf]);
      const isValid = verifyProof(leaf, proof, root);

      expect(isValid).to.be.true;
      expect(proof.siblings).to.have.lengthOf(0);
    });
  });

  describe("Power-of-Two vs Non-Power-of-Two Trees", function () {
    it("should produce valid verifiable root for power-of-two tree (4 leaves)", async function () {
      const leaves = Array.from({ length: 4 }, (_, i) =>
        computeLeafHash(`p${i}`, `o${i}`, "v2", `n${i}`, i)
      );

      const root = computeMerkleRoot(leaves);

      for (let i = 0; i < leaves.length; i++) {
        const proof = generateProof(i, leaves);
        expect(verifyProof(leaves[i], proof, root)).to.be.true;
      }
    });

    it("should produce valid verifiable root for non-power-of-two tree (5 leaves)", async function () {
      const leaves = Array.from({ length: 5 }, (_, i) =>
        computeLeafHash(`p${i}`, `o${i}`, "v2", `n${i}`, i)
      );

      const root = computeMerkleRoot(leaves);

      for (let i = 0; i < leaves.length; i++) {
        const proof = generateProof(i, leaves);
        expect(verifyProof(leaves[i], proof, root)).to.be.true;
      }
    });
  });

  describe("Batch Storage Immutability", function () {
    it("should preserve first batch data after committing second batch", async function () {
      const [signer] = await ethers.getSigners();

      // Commit first batch
      const leaves1 = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
      ];
      const root1 = computeMerkleRoot(leaves1);
      const manifestHash1 = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root1, 2, "v2", manifestHash1);

      const batch1Before = await contract.getBatch(0);

      // Commit second batch
      const leaves2 = [
        computeLeafHash("p2", "o2", "v2", "n2", 0),
        computeLeafHash("p3", "o3", "v2", "n3", 1),
        computeLeafHash("p4", "o4", "v2", "n4", 2),
      ];
      const root2 = computeMerkleRoot(leaves2);
      const manifestHash2 = ethers.keccak256(ethers.toUtf8Bytes("manifest2"));

      await contract.commitBatch(root2, 3, "v3", manifestHash2);

      // Verify first batch is unchanged
      const batch1After = await contract.getBatch(0);

      expect(batch1After.merkleRoot).to.equal(batch1Before.merkleRoot);
      expect(batch1After.leafCount).to.equal(batch1Before.leafCount);
      expect(batch1After.committer).to.equal(batch1Before.committer);
      expect(batch1After.modelVersion).to.equal(batch1Before.modelVersion);
      expect(batch1After.manifestHash).to.equal(batch1Before.manifestHash);
      expect(batch1After.timestamp).to.equal(batch1Before.timestamp);

      // Verify second batch is correct
      const batch2 = await contract.getBatch(1);
      expect(batch2.merkleRoot).to.equal(root2);
      expect(batch2.leafCount).to.equal(3);
      expect(batch2.modelVersion).to.equal("v3");
      expect(batch2.manifestHash).to.equal(manifestHash2);
    });
  });

  describe("Multiple Batches from Different Signers", function () {
    it("should store correct committer for each batch from different signers", async function () {
      const [signer1, signer2] = await ethers.getSigners();

      // Signer 1 commits batch 0
      const leaves1 = [computeLeafHash("p0", "o0", "v2", "n0", 0)];
      const root1 = computeMerkleRoot(leaves1);
      const manifestHash1 = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.connect(signer1).commitBatch(root1, 1, "v2", manifestHash1);

      // Signer 2 commits batch 1
      const leaves2 = [
        computeLeafHash("p1", "o1", "v2", "n1", 0),
        computeLeafHash("p2", "o2", "v2", "n2", 1),
      ];
      const root2 = computeMerkleRoot(leaves2);
      const manifestHash2 = ethers.keccak256(ethers.toUtf8Bytes("manifest2"));

      await contract.connect(signer2).commitBatch(root2, 2, "v3", manifestHash2);

      // Verify batch 0 has signer1 as committer
      const batch0 = await contract.getBatch(0);
      expect(batch0.committer).to.equal(signer1.address);
      expect(batch0.merkleRoot).to.equal(root1);

      // Verify batch 1 has signer2 as committer
      const batch1 = await contract.getBatch(1);
      expect(batch1.committer).to.equal(signer2.address);
      expect(batch1.merkleRoot).to.equal(root2);
    });
  });

  describe("Leaf Index Impact on Hash", function () {
    it("should produce different leaf hash for same data with different leafIndex", async function () {
      const prompt = "Should we approve?";
      const output = "APPROVE";
      const modelVersion = "v2";
      const nonce = "nonce-123";

      const hash0 = computeLeafHash(prompt, output, modelVersion, nonce, 0);
      const hash1 = computeLeafHash(prompt, output, modelVersion, nonce, 1);
      const hash5 = computeLeafHash(prompt, output, modelVersion, nonce, 5);

      expect(hash0).to.not.equal(hash1);
      expect(hash0).to.not.equal(hash5);
      expect(hash1).to.not.equal(hash5);
    });

    it("should match onchain computeLeafHash with different leafIndex values", async function () {
      const prompt = "Deploy to production?";
      const output = "REJECT";
      const modelVersion = "v2";
      const nonce = "nonce-456";

      for (const leafIndex of [0, 1, 5, 10, 100]) {
        const offchainHash = computeLeafHash(
          prompt,
          output,
          modelVersion,
          nonce,
          leafIndex
        );

        const onchainHash = await contract.computeLeafHash(
          prompt,
          output,
          modelVersion,
          nonce,
          leafIndex
        );

        expect(offchainHash).to.equal(onchainHash);
      }
    });
  });

  describe("Edge Cases for Proof Verification", function () {
    it("should generate correct proof depths for different tree sizes", async function () {
      const testCases = [
        { size: 1, expectedDepth: 0 },
        { size: 2, expectedDepth: 1 },
        { size: 3, expectedDepth: 2 },
        { size: 4, expectedDepth: 2 },
        { size: 5, expectedDepth: 3 },
        { size: 8, expectedDepth: 3 },
        { size: 16, expectedDepth: 4 },
      ];

      for (const { size, expectedDepth } of testCases) {
        const leaves = Array.from({ length: size }, (_, i) =>
          computeLeafHash(`p${i}`, `o${i}`, "v2", `n${i}`, i)
        );

        const proof = generateProof(0, leaves);
        expect(proof.siblings).to.have.lengthOf(expectedDepth);
      }
    });

    it("should fail verification when leaf does not belong to tree", async function () {
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
      ];

      const root = computeMerkleRoot(leaves);
      const proof = generateProof(0, leaves);

      const foreignLeaf = computeLeafHash("alien", "data", "v2", "nX", 99);
      const isValid = verifyProof(foreignLeaf, proof, root);

      expect(isValid).to.be.false;
    });
  });
});
