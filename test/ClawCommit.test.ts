import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("ClawCommit", function () {
  let clawCommit: ClawCommit;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;

  const DECISION = "BUY_BNB_AT_580";
  const NONCE = "randomNonce123abc";

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ClawCommit");
    clawCommit = await Factory.deploy();
    await clawCommit.waitForDeployment();
  });

  describe("commit", function () {
    it("should store commitment with correct hash and committer", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );

      await clawCommit.commit(hash);

      const c = await clawCommit.getCommitment(0);
      expect(c.hash).to.equal(hash);
      expect(c.committer).to.equal(owner.address);
      expect(c.revealed).to.equal(false);
      expect(c.decision).to.equal("");
      expect(c.nonce).to.equal("");
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

    it("should allow multiple commits from different addresses", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );

      await clawCommit.connect(owner).commit(hash);
      await clawCommit.connect(addr1).commit(hash);

      const c0 = await clawCommit.getCommitment(0);
      const c1 = await clawCommit.getCommitment(1);
      expect(c0.committer).to.equal(owner.address);
      expect(c1.committer).to.equal(addr1.address);
    });
  });

  describe("reveal", function () {
    let hash: string;

    beforeEach(async function () {
      hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [DECISION, NONCE]
      );
      await clawCommit.commit(hash);
    });

    it("should reveal with correct decision and nonce", async function () {
      await clawCommit.reveal(0, DECISION, NONCE);

      const c = await clawCommit.getCommitment(0);
      expect(c.revealed).to.equal(true);
      expect(c.decision).to.equal(DECISION);
      expect(c.nonce).to.equal(NONCE);
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
    it("should produce deterministic hash matching off-chain computation", async function () {
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

      const c = await clawCommit.getCommitment(0);
      const replayHash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [c.decision, c.nonce]
      );

      expect(replayHash).to.equal(c.hash);
    });
  });

  describe("full lifecycle", function () {
    it("should complete commit → reveal → verify → replay cycle", async function () {
      const decision = '{"prompt":"test","output":"APPROVE","model":"v1"}';
      const nonce = "lifecycle-nonce-abc123";

      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      // Commit
      const commitTx = await clawCommit.commit(hash);
      await commitTx.wait();
      expect(await clawCommit.commitCount()).to.equal(1);

      // Reveal
      const revealTx = await clawCommit.reveal(0, decision, nonce);
      await revealTx.wait();

      // Verify on-chain
      expect(await clawCommit.verify(0)).to.equal(true);

      // Replay off-chain
      const c = await clawCommit.getCommitment(0);
      const replay = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [c.decision, c.nonce]
      );
      expect(replay).to.equal(c.hash);
      expect(c.revealed).to.equal(true);
      expect(c.decision).to.equal(decision);
    });
  });
});
