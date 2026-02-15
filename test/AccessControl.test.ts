import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit, ClawCommitBatch } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

function computeDecisionHash(
  prompt: string,
  output: string,
  modelVersion: string,
  nonce: string
): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  return ethers.keccak256(encoded);
}

describe("AccessControl", function () {
  let clawCommit: ClawCommit;
  let clawCommitBatch: ClawCommitBatch;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;
  let addr3: HardhatEthersSigner;
  let addr4: HardhatEthersSigner;
  let addr5: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();

    const ClawCommitFactory = await ethers.getContractFactory("ClawCommit");
    clawCommit = await ClawCommitFactory.deploy();
    await clawCommit.waitForDeployment();

    const ClawCommitBatchFactory = await ethers.getContractFactory("ClawCommitBatch");
    clawCommitBatch = await ClawCommitBatchFactory.deploy();
    await clawCommitBatch.waitForDeployment();
  });

  describe("ClawCommit - Cross-Commitment Access Control", function () {
    it("non-committer cannot reveal even with correct data on a different commitId", async function () {
      // addr1 commits ID 0
      const hash1 = computeDecisionHash("Prompt1", "Output1", "v1.0", "nonce1");
      await clawCommit.connect(addr1).commitDecision(hash1);

      // addr2 commits ID 1
      const hash2 = computeDecisionHash("Prompt2", "Output2", "v1.0", "nonce2");
      await clawCommit.connect(addr2).commitDecision(hash2);

      // addr2 tries to reveal ID 0 with addr1's correct data
      await expect(
        clawCommit.connect(addr2).revealDecision(0, "Prompt1", "Output1", "v1.0", "nonce1")
      ).to.be.revertedWithCustomError(clawCommit, "OnlyCommitter");

      // Similarly, addr1 cannot reveal addr2's commitment
      await expect(
        clawCommit.connect(addr1).revealDecision(1, "Prompt2", "Output2", "v1.0", "nonce2")
      ).to.be.revertedWithCustomError(clawCommit, "OnlyCommitter");
    });

    it("revealed flag is immutable and stays true forever", async function () {
      const hash = computeDecisionHash("Prompt", "Output", "v1.0", "nonce");
      await clawCommit.connect(addr1).commitDecision(hash);

      // First reveal should succeed
      await clawCommit.connect(addr1).revealDecision(0, "Prompt", "Output", "v1.0", "nonce");

      const commitment = await clawCommit.getCommitment(0);
      expect(commitment.revealed).to.equal(true);

      // Attempting to reveal again should fail with AlreadyRevealed
      await expect(
        clawCommit.connect(addr1).revealDecision(0, "Prompt", "Output", "v1.0", "nonce")
      ).to.be.revertedWithCustomError(clawCommit, "AlreadyRevealed");

      // Verify revealed flag is still true
      const commitmentAfter = await clawCommit.getCommitment(0);
      expect(commitmentAfter.revealed).to.equal(true);
    });

    it("commitment data is immutable after reveal", async function () {
      const hash = computeDecisionHash("Original Prompt", "Original Output", "v1.0", "nonce123");
      await clawCommit.connect(addr1).commitDecision(hash);

      // Reveal with original data
      await clawCommit.connect(addr1).revealDecision(
        0,
        "Original Prompt",
        "Original Output",
        "v1.0",
        "nonce123"
      );

      const commitment = await clawCommit.getCommitment(0);
      expect(commitment.prompt).to.equal("Original Prompt");
      expect(commitment.output).to.equal("Original Output");
      expect(commitment.modelVersion).to.equal("v1.0");
      expect(commitment.nonce).to.equal("nonce123");

      // Attempt to reveal again with different data should fail
      await expect(
        clawCommit.connect(addr1).revealDecision(
          0,
          "Modified Prompt",
          "Modified Output",
          "v2.0",
          "nonce456"
        )
      ).to.be.revertedWithCustomError(clawCommit, "AlreadyRevealed");

      // Verify data remains unchanged
      const commitmentAfter = await clawCommit.getCommitment(0);
      expect(commitmentAfter.prompt).to.equal("Original Prompt");
      expect(commitmentAfter.output).to.equal("Original Output");
      expect(commitmentAfter.modelVersion).to.equal("v1.0");
      expect(commitmentAfter.nonce).to.equal("nonce123");
    });

    it("getCommitment returns zero struct for non-existent commitId", async function () {
      // Query a commitId that was never used
      const commitment = await clawCommit.getCommitment(999);

      expect(commitment.hash).to.equal(ethers.ZeroHash);
      expect(commitment.timestamp).to.equal(0);
      expect(commitment.committer).to.equal(ethers.ZeroAddress);
      expect(commitment.revealed).to.equal(false);
      expect(commitment.prompt).to.equal("");
      expect(commitment.output).to.equal("");
      expect(commitment.modelVersion).to.equal("");
      expect(commitment.nonce).to.equal("");
    });

    it("verifyReplay on non-existent commitId reverts with NotRevealed", async function () {
      // Attempt to verify a commitId that was never created
      await expect(clawCommit.verifyReplay(999)).to.be.revertedWithCustomError(
        clawCommit,
        "NotRevealed"
      );
    });

    it("commitCount never decreases", async function () {
      expect(await clawCommit.commitCount()).to.equal(0);

      // Make 5 commits
      for (let i = 0; i < 5; i++) {
        const hash = computeDecisionHash(`Prompt${i}`, `Output${i}`, "v1.0", `nonce${i}`);
        await clawCommit.connect(addr1).commitDecision(hash);
      }

      expect(await clawCommit.commitCount()).to.equal(5);

      // Make more commits
      for (let i = 5; i < 8; i++) {
        const hash = computeDecisionHash(`Prompt${i}`, `Output${i}`, "v1.0", `nonce${i}`);
        await clawCommit.connect(addr2).commitDecision(hash);
      }

      expect(await clawCommit.commitCount()).to.equal(8);

      // Even after reveals, count should not decrease
      await clawCommit.connect(addr1).revealDecision(0, "Prompt0", "Output0", "v1.0", "nonce0");
      expect(await clawCommit.commitCount()).to.equal(8);
    });

    it("any address can commit", async function () {
      const signers = [owner, addr1, addr2, addr3, addr4];

      for (let i = 0; i < signers.length; i++) {
        const hash = computeDecisionHash(`Prompt${i}`, `Output${i}`, "v1.0", `nonce${i}`);
        await clawCommit.connect(signers[i]).commitDecision(hash);

        const commitment = await clawCommit.getCommitment(i);
        expect(commitment.committer).to.equal(signers[i].address);
        expect(commitment.hash).to.equal(hash);
      }

      expect(await clawCommit.commitCount()).to.equal(5);
    });

    it("any address can call computeDecisionHash as pure function", async function () {
      const signers = [owner, addr1, addr2, addr3, addr4];

      for (const signer of signers) {
        const hash = await clawCommit
          .connect(signer)
          .computeDecisionHash("Prompt", "Output", "v1.0", "nonce");

        const expectedHash = computeDecisionHash("Prompt", "Output", "v1.0", "nonce");
        expect(hash).to.equal(expectedHash);
      }
    });
  });

  describe("ClawCommitBatch - Access Control", function () {
    it("any address can commit batches", async function () {
      const signers = [owner, addr1, addr2, addr3, addr4];

      for (let i = 0; i < signers.length; i++) {
        const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`root${i}`));
        const leafCount = (i + 1) * 10;
        const modelVersion = `v${i}.0`;
        const manifestHash = ethers.keccak256(ethers.toUtf8Bytes(`manifest${i}`));

        await clawCommitBatch
          .connect(signers[i])
          .commitBatch(merkleRoot, leafCount, modelVersion, manifestHash);

        const batch = await clawCommitBatch.getBatch(i);
        expect(batch.committer).to.equal(signers[i].address);
        expect(batch.merkleRoot).to.equal(merkleRoot);
        expect(batch.leafCount).to.equal(leafCount);
      }

      expect(await clawCommitBatch.batchCount()).to.equal(5);
    });

    it("batchCount never decreases", async function () {
      expect(await clawCommitBatch.batchCount()).to.equal(0);

      // Make 5 batch commits
      for (let i = 0; i < 5; i++) {
        const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`root${i}`));
        await clawCommitBatch.connect(addr1).commitBatch(merkleRoot, 10, "v1.0", ethers.ZeroHash);
      }

      expect(await clawCommitBatch.batchCount()).to.equal(5);

      // Make more batch commits
      for (let i = 5; i < 8; i++) {
        const merkleRoot = ethers.keccak256(ethers.toUtf8Bytes(`root${i}`));
        await clawCommitBatch.connect(addr2).commitBatch(merkleRoot, 10, "v1.0", ethers.ZeroHash);
      }

      expect(await clawCommitBatch.batchCount()).to.equal(8);
    });

    it("getBatch returns zero struct for non-existent batchId", async function () {
      // Query a batchId that was never used
      const batch = await clawCommitBatch.getBatch(999);

      expect(batch.merkleRoot).to.equal(ethers.ZeroHash);
      expect(batch.leafCount).to.equal(0);
      expect(batch.timestamp).to.equal(0);
      expect(batch.committer).to.equal(ethers.ZeroAddress);
      expect(batch.modelVersion).to.equal("");
      expect(batch.manifestHash).to.equal(ethers.ZeroHash);
    });

    it("different committers' batches are isolated with no cross-contamination", async function () {
      // addr1 commits batch 0
      const merkleRoot1 = ethers.keccak256(ethers.toUtf8Bytes("root1"));
      const manifestHash1 = ethers.keccak256(ethers.toUtf8Bytes("manifest1"));
      await clawCommitBatch.connect(addr1).commitBatch(merkleRoot1, 100, "v1.0", manifestHash1);

      // addr2 commits batch 1
      const merkleRoot2 = ethers.keccak256(ethers.toUtf8Bytes("root2"));
      const manifestHash2 = ethers.keccak256(ethers.toUtf8Bytes("manifest2"));
      await clawCommitBatch.connect(addr2).commitBatch(merkleRoot2, 200, "v2.0", manifestHash2);

      // Verify batch 0 belongs to addr1 with correct data
      const batch0 = await clawCommitBatch.getBatch(0);
      expect(batch0.committer).to.equal(addr1.address);
      expect(batch0.merkleRoot).to.equal(merkleRoot1);
      expect(batch0.leafCount).to.equal(100);
      expect(batch0.modelVersion).to.equal("v1.0");
      expect(batch0.manifestHash).to.equal(manifestHash1);

      // Verify batch 1 belongs to addr2 with correct data
      const batch1 = await clawCommitBatch.getBatch(1);
      expect(batch1.committer).to.equal(addr2.address);
      expect(batch1.merkleRoot).to.equal(merkleRoot2);
      expect(batch1.leafCount).to.equal(200);
      expect(batch1.modelVersion).to.equal("v2.0");
      expect(batch1.manifestHash).to.equal(manifestHash2);

      // Verify no cross-contamination
      expect(batch0.committer).to.not.equal(batch1.committer);
      expect(batch0.merkleRoot).to.not.equal(batch1.merkleRoot);
      expect(batch0.leafCount).to.not.equal(batch1.leafCount);
    });
  });
});
