const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("ClawCommit", function () {
  let clawCommit;
  let owner;
  let addr1;

  const DECISION = "BUY_BNB_AT_580";
  const NONCE = "randomNonce123abc";

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const ClawCommit = await ethers.getContractFactory("ClawCommit");
    clawCommit = await ClawCommit.deploy();
    await clawCommit.waitForDeployment();
  });

  describe("commit", function () {
    it("should create a commitment with correct hash", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );

      await clawCommit.commit(hash);

      const commitment = await clawCommit.getCommitment(0);
      expect(commitment.hash).to.equal(hash);
      expect(commitment.committer).to.equal(owner.address);
      expect(commitment.revealed).to.equal(false);
    });

    it("should emit CommitCreated event", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );

      await expect(clawCommit.commit(hash))
        .to.emit(clawCommit, "CommitCreated");
    });

    it("should increment commitCount", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );

      await clawCommit.commit(hash);
      expect(await clawCommit.commitCount()).to.equal(1);

      await clawCommit.commit(hash);
      expect(await clawCommit.commitCount()).to.equal(2);
    });
  });

  describe("reveal", function () {
    let hash;

    beforeEach(async function () {
      hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );
      await clawCommit.commit(hash);
    });

    it("should reveal with correct decision and nonce", async function () {
      await clawCommit.reveal(0, DECISION, NONCE);

      const commitment = await clawCommit.getCommitment(0);
      expect(commitment.revealed).to.equal(true);
      expect(commitment.decision).to.equal(DECISION);
      expect(commitment.nonce).to.equal(NONCE);
    });

    it("should emit CommitRevealed event", async function () {
      await expect(clawCommit.reveal(0, DECISION, NONCE))
        .to.emit(clawCommit, "CommitRevealed")
        .withArgs(0, owner.address, DECISION);
    });

    it("should revert with wrong decision", async function () {
      await expect(
        clawCommit.reveal(0, "WRONG_DECISION", NONCE)
      ).to.be.revertedWith("Hash mismatch");
    });

    it("should revert with wrong nonce", async function () {
      await expect(
        clawCommit.reveal(0, DECISION, "wrongNonce")
      ).to.be.revertedWith("Hash mismatch");
    });

    it("should revert if not the committer", async function () {
      await expect(
        clawCommit.connect(addr1).reveal(0, DECISION, NONCE)
      ).to.be.revertedWith("Only committer can reveal");
    });

    it("should revert if already revealed", async function () {
      await clawCommit.reveal(0, DECISION, NONCE);
      await expect(
        clawCommit.reveal(0, DECISION, NONCE)
      ).to.be.revertedWith("Already revealed");
    });
  });

  describe("verify", function () {
    it("should return true for correctly revealed commitment", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );
      await clawCommit.commit(hash);
      await clawCommit.reveal(0, DECISION, NONCE);

      expect(await clawCommit.verify(0)).to.equal(true);
    });

    it("should revert if not yet revealed", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );
      await clawCommit.commit(hash);

      await expect(clawCommit.verify(0)).to.be.revertedWith(
        "Not yet revealed"
      );
    });
  });

  describe("computeHash", function () {
    it("should return deterministic hash", async function () {
      const contractHash = await clawCommit.computeHash(DECISION, NONCE);
      const localHash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );
      expect(contractHash).to.equal(localHash);
    });

    it("should return different hashes for different inputs", async function () {
      const hash1 = await clawCommit.computeHash("DECISION_A", "nonce1");
      const hash2 = await clawCommit.computeHash("DECISION_B", "nonce2");
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe("replay verification (off-chain simulation)", function () {
    it("should match on-chain hash when replayed locally", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );
      await clawCommit.commit(hash);
      await clawCommit.reveal(0, DECISION, NONCE);

      const commitment = await clawCommit.getCommitment(0);
      const replayHash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [commitment.decision, commitment.nonce]
      );

      expect(replayHash).to.equal(commitment.hash);
    });
  });
});
