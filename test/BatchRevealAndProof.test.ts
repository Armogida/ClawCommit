import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommitBatch } from "../typechain-types";
import {
  computeLeafHash,
  computeParentHash,
  computeMerkleRoot,
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
 * BatchRevealAndProof Test Suite
 */
describe("Batch Reveal and Proof Verification", function () {
  let contract: ClawCommitBatch;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("ClawCommitBatch");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe("Reveal Leaf Tests", function () {
    it("should successfully reveal a leaf and store correct data", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 3, "v2", manifestHash);

      // Reveal leaf at index 1
      await contract.revealBatchLeaf(0, 1, "p1", "o1", "n1");

      // Verify revealed leaf data
      const revealedLeaf = await contract.getRevealedLeaf(0, 1);
      expect(revealedLeaf.revealed).to.be.true;
      expect(revealedLeaf.prompt).to.equal("p1");
      expect(revealedLeaf.output).to.equal("o1");
      expect(revealedLeaf.nonce).to.equal("n1");
      expect(revealedLeaf.leafIndex).to.equal(1);
      expect(revealedLeaf.leafHash).to.equal(leaves[1]);
    });

    it("should emit BatchLeafRevealed event with correct arguments", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 2, "v2", manifestHash);

      // Reveal and check event
      await expect(contract.revealBatchLeaf(0, 0, "p0", "o0", "n0"))
        .to.emit(contract, "BatchLeafRevealed")
        .withArgs(0, 0, leaves[0], signer.address, "p0", "o0");
    });

    it("should revert with OnlyBatchCommitter when non-committer tries to reveal", async function () {
      const [signer1, signer2] = await ethers.getSigners();

      // Signer1 commits a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.connect(signer1).commitBatch(root, 2, "v2", manifestHash);

      // Signer2 tries to reveal - should fail
      await expect(
        contract.connect(signer2).revealBatchLeaf(0, 0, "p0", "o0", "n0")
      ).to.be.revertedWithCustomError(contract, "OnlyBatchCommitter");
    });

    it("should revert with LeafAlreadyRevealed when revealing same leaf twice", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 2, "v2", manifestHash);

      // First reveal - should succeed
      await contract.revealBatchLeaf(0, 0, "p0", "o0", "n0");

      // Second reveal of same leaf - should fail
      await expect(
        contract.revealBatchLeaf(0, 0, "p0", "o0", "n0")
      ).to.be.revertedWithCustomError(contract, "LeafAlreadyRevealed");
    });

    it("should revert with LeafIndexOutOfRange when leafIndex >= leafCount", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch with 3 leaves
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 3, "v2", manifestHash);

      // Try to reveal leaf at index 3 (out of range)
      await expect(
        contract.revealBatchLeaf(0, 3, "p3", "o3", "n3")
      ).to.be.revertedWithCustomError(contract, "LeafIndexOutOfRange");

      // Try to reveal leaf at index 100 (way out of range)
      await expect(
        contract.revealBatchLeaf(0, 100, "p100", "o100", "n100")
      ).to.be.revertedWithCustomError(contract, "LeafIndexOutOfRange");
    });

    it("should reveal multiple leaves from same batch independently", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
        computeLeafHash("p3", "o3", "v2", "n3", 3),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 4, "v2", manifestHash);

      // Reveal leaves at indices 0, 2, 3
      await contract.revealBatchLeaf(0, 0, "p0", "o0", "n0");
      await contract.revealBatchLeaf(0, 2, "p2", "o2", "n2");
      await contract.revealBatchLeaf(0, 3, "p3", "o3", "n3");

      // Verify all revealed leaves
      const leaf0 = await contract.getRevealedLeaf(0, 0);
      expect(leaf0.revealed).to.be.true;
      expect(leaf0.prompt).to.equal("p0");

      const leaf2 = await contract.getRevealedLeaf(0, 2);
      expect(leaf2.revealed).to.be.true;
      expect(leaf2.prompt).to.equal("p2");

      const leaf3 = await contract.getRevealedLeaf(0, 3);
      expect(leaf3.revealed).to.be.true;
      expect(leaf3.prompt).to.equal("p3");

      // Verify unrevealed leaf returns default struct
      const leaf1 = await contract.getRevealedLeaf(0, 1);
      expect(leaf1.revealed).to.be.false;
      expect(leaf1.prompt).to.equal("");
    });

    it("should return zero struct for unrevealed leaf", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 2, "v2", manifestHash);

      // Get unrevealed leaf
      const revealedLeaf = await contract.getRevealedLeaf(0, 0);

      // Verify it's a zero/default struct
      expect(revealedLeaf.revealed).to.be.false;
      expect(revealedLeaf.leafHash).to.equal(ethers.ZeroHash);
      expect(revealedLeaf.prompt).to.equal("");
      expect(revealedLeaf.output).to.equal("");
      expect(revealedLeaf.nonce).to.equal("");
      expect(revealedLeaf.leafIndex).to.equal(0);
    });

    it("should handle reveals independently for different signers' batches", async function () {
      const [signer1, signer2] = await ethers.getSigners();

      // Signer1 commits batch 0
      const leaves1 = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
      ];
      const root1 = computeMerkleRoot(leaves1);
      const manifestHash1 = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.connect(signer1).commitBatch(root1, 2, "v2", manifestHash1);

      // Signer2 commits batch 1
      const leaves2 = [
        computeLeafHash("p2", "o2", "v3", "n2", 0),
        computeLeafHash("p3", "o3", "v3", "n3", 1),
      ];
      const root2 = computeMerkleRoot(leaves2);
      const manifestHash2 = ethers.keccak256(ethers.toUtf8Bytes("manifest2"));

      await contract.connect(signer2).commitBatch(root2, 2, "v3", manifestHash2);

      // Signer1 can reveal from batch 0
      await contract.connect(signer1).revealBatchLeaf(0, 0, "p0", "o0", "n0");
      const leaf1 = await contract.getRevealedLeaf(0, 0);
      expect(leaf1.revealed).to.be.true;
      expect(leaf1.prompt).to.equal("p0");

      // Signer2 can reveal from batch 1
      await contract.connect(signer2).revealBatchLeaf(1, 1, "p3", "o3", "n3");
      const leaf2 = await contract.getRevealedLeaf(1, 1);
      expect(leaf2.revealed).to.be.true;
      expect(leaf2.prompt).to.equal("p3");

      // Signer1 cannot reveal from batch 1
      await expect(
        contract.connect(signer1).revealBatchLeaf(1, 0, "p2", "o2", "n2")
      ).to.be.revertedWithCustomError(contract, "OnlyBatchCommitter");

      // Signer2 cannot reveal from batch 0
      await expect(
        contract.connect(signer2).revealBatchLeaf(0, 1, "p1", "o1", "n1")
      ).to.be.revertedWithCustomError(contract, "OnlyBatchCommitter");
    });
  });

  describe("Proof Verification Tests", function () {
    it("should return true for valid inclusion proof", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
        computeLeafHash("p3", "o3", "v2", "n3", 3),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 4, "v2", manifestHash);

      // Generate proof for leaf at index 2
      const proof = generateProof(2, leaves);

      // Verify inclusion
      const isValid = await contract.verifyBatchInclusion(
        0,
        leaves[2],
        proof.siblings,
        proof.path
      );

      expect(isValid).to.be.true;
    });

    it("should return false for invalid proof with wrong sibling", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
        computeLeafHash("p3", "o3", "v2", "n3", 3),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 4, "v2", manifestHash);

      // Generate valid proof
      const proof = generateProof(1, leaves);

      // Tamper with the first sibling
      const wrongLeaf = computeLeafHash("wrong", "wrong", "v2", "nWrong", 99);
      const invalidSiblings = [wrongLeaf, ...proof.siblings.slice(1)];

      // Verify inclusion with tampered proof
      const isValid = await contract.verifyBatchInclusion(
        0,
        leaves[1],
        invalidSiblings,
        proof.path
      );

      expect(isValid).to.be.false;
    });

    it("should return false for proof of leaf not in tree", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
        computeLeafHash("p2", "o2", "v2", "n2", 2),
        computeLeafHash("p3", "o3", "v2", "n3", 3),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 4, "v2", manifestHash);

      // Generate proof for a leaf in the tree
      const proof = generateProof(0, leaves);

      // Try to verify a foreign leaf with the proof
      const foreignLeaf = computeLeafHash("alien", "data", "v2", "nX", 99);

      const isValid = await contract.verifyBatchInclusion(
        0,
        foreignLeaf,
        proof.siblings,
        proof.path
      );

      expect(isValid).to.be.false;
    });

    it("should revert with ProofLengthMismatch when siblings and path lengths differ", async function () {
      const [signer] = await ethers.getSigners();

      // Create and commit a batch
      const leaves = [
        computeLeafHash("p0", "o0", "v2", "n0", 0),
        computeLeafHash("p1", "o1", "v2", "n1", 1),
      ];
      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));

      await contract.commitBatch(root, 2, "v2", manifestHash);

      // Create mismatched siblings and path
      const siblings = [leaves[1], leaves[0]]; // 2 elements
      const path = [false]; // 1 element

      await expect(
        contract.verifyBatchInclusion(0, leaves[0], siblings, path)
      ).to.be.revertedWithCustomError(contract, "ProofLengthMismatch");
    });

    it("should verify proofs for trees of different sizes (1, 4, 8)", async function () {
      const [signer] = await ethers.getSigners();

      const testSizes = [1, 4, 8];

      for (const size of testSizes) {
        // Create leaves
        const leaves = Array.from({ length: size }, (_, i) =>
          computeLeafHash(`p${i}`, `o${i}`, "v2", `n${i}`, i)
        );

        const root = computeMerkleRoot(leaves);
        const manifestHash = ethers.keccak256(
          ethers.toUtf8Bytes(`manifest-${size}`)
        );

        // Commit batch
        const batchId = await contract.batchCount();
        await contract.commitBatch(root, size, "v2", manifestHash);

        // Verify each leaf in the tree
        for (let i = 0; i < leaves.length; i++) {
          const proof = generateProof(i, leaves);

          const isValid = await contract.verifyBatchInclusion(
            batchId,
            leaves[i],
            proof.siblings,
            proof.path
          );

          expect(isValid).to.be.true;
        }
      }
    });

    it("should complete end-to-end flow: commit batch, reveal leaf, verify inclusion", async function () {
      const [signer] = await ethers.getSigners();

      // Step 1: Create and commit a batch
      const decisions = [
        { prompt: "Deploy to prod?", output: "APPROVE", nonce: "nonce-1" },
        { prompt: "Merge PR #42?", output: "REJECT", nonce: "nonce-2" },
        { prompt: "Grant admin access?", output: "APPROVE", nonce: "nonce-3" },
        { prompt: "Delete database?", output: "REJECT", nonce: "nonce-4" },
      ];

      const leaves = decisions.map((d, i) =>
        computeLeafHash(d.prompt, d.output, "v2", d.nonce, i)
      );

      const root = computeMerkleRoot(leaves);
      const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("e2e-manifest"));

      await contract.commitBatch(root, 4, "v2", manifestHash);

      // Step 2: Reveal a specific leaf (index 2)
      const leafToReveal = 2;
      await contract.revealBatchLeaf(
        0,
        leafToReveal,
        decisions[leafToReveal].prompt,
        decisions[leafToReveal].output,
        decisions[leafToReveal].nonce
      );

      // Verify reveal was successful
      const revealedLeaf = await contract.getRevealedLeaf(0, leafToReveal);
      expect(revealedLeaf.revealed).to.be.true;
      expect(revealedLeaf.prompt).to.equal(decisions[leafToReveal].prompt);
      expect(revealedLeaf.output).to.equal(decisions[leafToReveal].output);
      expect(revealedLeaf.leafHash).to.equal(leaves[leafToReveal]);

      // Step 3: Generate and verify inclusion proof
      const proof = generateProof(leafToReveal, leaves);

      const isValid = await contract.verifyBatchInclusion(
        0,
        revealedLeaf.leafHash,
        proof.siblings,
        proof.path
      );

      expect(isValid).to.be.true;

      // Step 4: Verify other leaves can still be proven (without revealing)
      for (let i = 0; i < leaves.length; i++) {
        if (i === leafToReveal) continue;

        const proof = generateProof(i, leaves);
        const isValid = await contract.verifyBatchInclusion(
          0,
          leaves[i],
          proof.siblings,
          proof.path
        );

        expect(isValid).to.be.true;
      }
    });
  });
});
