import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommitBatch } from "../typechain-types";
import {
  computeLeafHash,
  computeMerkleRoot,
  generateMerkleProof,
} from "../scripts/batch/merkle";

describe("ClawCommitBatch (Wave 2 multi-reveal writes)", function () {
  let contract: ClawCommitBatch;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("ClawCommitBatch");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  function buildLeaves(modelVersion: string): string[] {
    return [
      computeLeafHash("p0", "o0", modelVersion, "n0", 0),
      computeLeafHash("p1", "o1", modelVersion, "n1", 1),
      computeLeafHash("p2", "o2", modelVersion, "n2", 2),
      computeLeafHash("p3", "o3", modelVersion, "n3", 3),
    ];
  }

  async function commitDefaultBatch(modelVersion = "v2"): Promise<string[]> {
    const leaves = buildLeaves(modelVersion);
    const root = computeMerkleRoot(leaves);
    const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest-wave2"));
    await contract.commitBatch(root, leaves.length, modelVersion, manifestHash);
    return leaves;
  }

  it("reveals multiple leaves in one transaction", async function () {
    const [signer] = await ethers.getSigners();
    const leaves = await commitDefaultBatch();
    const indexes = [0, 2, 3];

    const reveals = indexes.map((leafIndex) => ({
      leafIndex,
      prompt: `p${leafIndex}`,
      output: `o${leafIndex}`,
      nonce: `n${leafIndex}`,
    }));
    const proofs = indexes.map((leafIndex) => {
      const proof = generateMerkleProof(leaves, leafIndex);
      return { siblings: proof.siblings, path: proof.path };
    });

    await expect(contract.revealBatchLeaves(0, reveals, proofs))
      .to.emit(contract, "BatchLeafRevealed")
      .withArgs(0, 0, leaves[0], signer.address, "p0", "o0");

    for (const leafIndex of indexes) {
      const revealedLeaf = await contract.getRevealedLeaf(0, leafIndex);
      expect(revealedLeaf.revealed).to.equal(true);
      expect(revealedLeaf.leafHash).to.equal(leaves[leafIndex]);
    }
  });

  it("reverts on empty reveal set", async function () {
    await expect(contract.revealBatchLeaves(0, [], [])).to.be.revertedWithCustomError(
      contract,
      "EmptyRevealSet"
    );
  });

  it("reverts when reveal/proof array lengths differ", async function () {
    const leaves = await commitDefaultBatch();
    const proof = generateMerkleProof(leaves, 1);

    await expect(
      contract.revealBatchLeaves(
        0,
        [{ leafIndex: 1, prompt: "p1", output: "o1", nonce: "n1" }],
        []
      )
    ).to.be.revertedWithCustomError(contract, "RevealSetLengthMismatch");

    await expect(
      contract.revealBatchLeaves(
        0,
        [],
        [{ siblings: proof.siblings, path: proof.path }]
      )
    ).to.be.revertedWithCustomError(contract, "EmptyRevealSet");
  });

  it("reverts for non-committer", async function () {
    const [signer1, signer2] = await ethers.getSigners();
    const leaves = buildLeaves("v2");
    const root = computeMerkleRoot(leaves);
    const manifestHash = ethers.keccak256(ethers.toUtf8Bytes("manifest-wave2-signer"));
    await contract.connect(signer1).commitBatch(root, leaves.length, "v2", manifestHash);

    const proof = generateMerkleProof(leaves, 1);
    await expect(
      contract.connect(signer2).revealBatchLeaves(
        0,
        [{ leafIndex: 1, prompt: "p1", output: "o1", nonce: "n1" }],
        [{ siblings: proof.siblings, path: proof.path }]
      )
    ).to.be.revertedWithCustomError(contract, "OnlyBatchCommitter");
  });

  it("is atomic: any bad reveal payload reverts the entire transaction", async function () {
    const leaves = await commitDefaultBatch();
    const indexes = [0, 1];
    const proofs = indexes.map((leafIndex) => {
      const proof = generateMerkleProof(leaves, leafIndex);
      return { siblings: proof.siblings, path: proof.path };
    });

    await expect(
      contract.revealBatchLeaves(
        0,
        [
          { leafIndex: 0, prompt: "p0", output: "o0", nonce: "n0" },
          { leafIndex: 1, prompt: "p1", output: "tampered-output", nonce: "n1" },
        ],
        proofs
      )
    ).to.be.revertedWithCustomError(contract, "LeafHashMismatch");

    const leaf0 = await contract.getRevealedLeaf(0, 0);
    const leaf1 = await contract.getRevealedLeaf(0, 1);
    expect(leaf0.revealed).to.equal(false);
    expect(leaf1.revealed).to.equal(false);
  });

  it("reverts when one requested leaf is already revealed", async function () {
    const leaves = await commitDefaultBatch();

    const proof1 = generateMerkleProof(leaves, 1);
    await contract.revealBatchLeaves(
      0,
      [{ leafIndex: 1, prompt: "p1", output: "o1", nonce: "n1" }],
      [{ siblings: proof1.siblings, path: proof1.path }]
    );

    const proof2 = generateMerkleProof(leaves, 2);
    await expect(
      contract.revealBatchLeaves(
        0,
        [
          { leafIndex: 1, prompt: "p1", output: "o1", nonce: "n1" },
          { leafIndex: 2, prompt: "p2", output: "o2", nonce: "n2" },
        ],
        [
          { siblings: proof1.siblings, path: proof1.path },
          { siblings: proof2.siblings, path: proof2.path },
        ]
      )
    ).to.be.revertedWithCustomError(contract, "LeafAlreadyRevealed");

    const unrevealedLeaf = await contract.getRevealedLeaf(0, 2);
    expect(unrevealedLeaf.revealed).to.equal(false);
  });
});
