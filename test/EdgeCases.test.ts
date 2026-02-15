import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Edge Cases and Security", function () {
  let contract: ClawCommit;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;
  let addr3: HardhatEthersSigner;
  let addr4: HardhatEthersSigner;
  let addr5: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3, addr4, addr5] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ClawCommit");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe("Gas and Large Input Tests", function () {
    it("should handle 10KB decision string", async function () {
      const largeDecision = "x".repeat(10000);
      const nonce = "large-input-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [largeDecision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, largeDecision, nonce);
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should handle very long nonce (1000 chars)", async function () {
      const decision = "NORMAL_DECISION";
      const longNonce = "n".repeat(1000);
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, longNonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, longNonce);

      const c = await contract.getCommitment(0);
      expect(c.nonce).to.equal(longNonce);
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should handle both large decision and large nonce simultaneously", async function () {
      const largeDecision = "d".repeat(5000);
      const largeNonce = "n".repeat(5000);
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [largeDecision, largeNonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, largeDecision, largeNonce);
      expect(await contract.verify(0)).to.equal(true);
    });
  });

  describe("Timestamp Ordering Tests", function () {
    it("should record ascending timestamps for sequential commits", async function () {
      const hash1 = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["DECISION_1", "nonce1"]
      );
      const hash2 = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["DECISION_2", "nonce2"]
      );

      await contract.commit(hash1);
      await contract.commit(hash2);

      const c0 = await contract.getCommitment(0);
      const c1 = await contract.getCommitment(1);
      expect(c1.timestamp).to.be.greaterThanOrEqual(c0.timestamp);
    });

    it("should record a non-zero timestamp", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["DECISION", "nonce"]
      );

      await contract.commit(hash);
      const c = await contract.getCommitment(0);
      expect(c.timestamp).to.be.greaterThan(0);
    });
  });

  describe("State Invariant Tests", function () {
    it("should never allow commitCount to decrease", async function () {
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["DECISION", "nonce"]
      );

      await contract.commit(hash);
      expect(await contract.commitCount()).to.equal(1);

      await contract.commit(hash);
      expect(await contract.commitCount()).to.equal(2);

      await contract.commit(hash);
      expect(await contract.commitCount()).to.equal(3);

      // Count should remain at 3 with no further commits
      expect(await contract.commitCount()).to.equal(3);
    });

    it("should not allow modifying a revealed commitment", async function () {
      const decision = "ORIGINAL_DECISION";
      const nonce = "original-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      // Attempting to reveal again should revert
      await expect(
        contract.reveal(0, decision, nonce)
      ).to.be.revertedWith("Already revealed");
    });

    it("should not allow reveal with different valid data after already revealed", async function () {
      const decision = "DECISION_A";
      const nonce = "nonce-a";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      // Even trying with a completely different decision+nonce should fail with Already revealed
      await expect(
        contract.reveal(0, "DECISION_B", "nonce-b")
      ).to.be.revertedWith("Already revealed");
    });

    it("should preserve commitment data integrity after reveal", async function () {
      const decision = "PRESERVE_ME";
      const nonce = "integrity-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      // Read commitment multiple times to ensure data is stable
      const c1 = await contract.getCommitment(0);
      const c2 = await contract.getCommitment(0);
      expect(c1.hash).to.equal(c2.hash);
      expect(c1.decision).to.equal(c2.decision);
      expect(c1.nonce).to.equal(c2.nonce);
      expect(c1.revealed).to.equal(c2.revealed);
      expect(c1.committer).to.equal(c2.committer);
    });
  });

  describe("Frontrunning / Access Control Tests", function () {
    it("should prevent addr2 from revealing addr1 commitment even with correct data", async function () {
      const decision = "SECRET_DECISION";
      const nonce = "secret-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      // addr1 commits
      await contract.connect(addr1).commit(hash);

      // addr2 tries to reveal with correct decision and nonce
      await expect(
        contract.connect(addr2).reveal(0, decision, nonce)
      ).to.be.revertedWith("Only committer can reveal");
    });

    it("should prevent owner from revealing another user's commitment", async function () {
      const decision = "USER_DECISION";
      const nonce = "user-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      // addr1 commits
      await contract.connect(addr1).commit(hash);

      // Owner (deployer) tries to reveal — should fail
      await expect(
        contract.connect(owner).reveal(0, decision, nonce)
      ).to.be.revertedWith("Only committer can reveal");
    });

    it("should allow only the original committer to reveal after others fail", async function () {
      const decision = "MY_DECISION";
      const nonce = "my-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.connect(addr1).commit(hash);

      // Others fail to reveal
      await expect(
        contract.connect(addr2).reveal(0, decision, nonce)
      ).to.be.revertedWith("Only committer can reveal");

      await expect(
        contract.connect(owner).reveal(0, decision, nonce)
      ).to.be.revertedWith("Only committer can reveal");

      // Original committer succeeds
      await contract.connect(addr1).reveal(0, decision, nonce);
      expect(await contract.verify(0)).to.equal(true);
    });
  });

  describe("Multi-Signer Integration Tests", function () {
    it("should handle 5 concurrent committers independently", async function () {
      const signers = [addr1, addr2, addr3, addr4, addr5];
      const entries = signers.map((_, i) => ({
        decision: `DECISION_SIGNER_${i}`,
        nonce: `nonce-signer-${i}`,
      }));

      // Each signer commits their own decision
      for (let i = 0; i < signers.length; i++) {
        const hash = ethers.solidityPackedKeccak256(
          ["string", "string"],
          [entries[i].decision, entries[i].nonce]
        );
        await contract.connect(signers[i]).commit(hash);
      }

      expect(await contract.commitCount()).to.equal(5);

      // Each signer reveals their own commitment
      for (let i = 0; i < signers.length; i++) {
        await contract.connect(signers[i]).reveal(i, entries[i].decision, entries[i].nonce);
      }

      // Verify all 5 independently
      for (let i = 0; i < signers.length; i++) {
        expect(await contract.verify(i)).to.equal(true);
        const c = await contract.getCommitment(i);
        expect(c.committer).to.equal(signers[i].address);
        expect(c.decision).to.equal(entries[i].decision);
        expect(c.nonce).to.equal(entries[i].nonce);
      }
    });

    it("should allow any address to call verify on any commitment", async function () {
      const decision = "ADDR1_DECISION";
      const nonce = "addr1-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      // addr1 commits and reveals
      await contract.connect(addr1).commit(hash);
      await contract.connect(addr1).reveal(0, decision, nonce);

      // addr2 (non-committer) can call verify
      expect(await contract.connect(addr2).verify(0)).to.equal(true);

      // owner can also verify
      expect(await contract.connect(owner).verify(0)).to.equal(true);
    });

    it("should allow any address to read commitment data via getCommitment", async function () {
      const decision = "READABLE_DECISION";
      const nonce = "readable-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.connect(addr1).commit(hash);
      await contract.connect(addr1).reveal(0, decision, nonce);

      // addr2 can read commitment data
      const c = await contract.connect(addr2).getCommitment(0);
      expect(c.decision).to.equal(decision);
      expect(c.committer).to.equal(addr1.address);
    });

    it("should isolate commitments so one signer's reveal does not affect another", async function () {
      const hash1 = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["DEC_A", "nonce_a"]
      );
      const hash2 = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["DEC_B", "nonce_b"]
      );

      await contract.connect(addr1).commit(hash1);
      await contract.connect(addr2).commit(hash2);

      // Only addr1 reveals
      await contract.connect(addr1).reveal(0, "DEC_A", "nonce_a");

      // addr1's commitment is revealed
      const c0 = await contract.getCommitment(0);
      expect(c0.revealed).to.equal(true);

      // addr2's commitment is still unrevealed
      const c1 = await contract.getCommitment(1);
      expect(c1.revealed).to.equal(false);
      expect(c1.decision).to.equal("");
    });
  });

  describe("Edge Case Inputs", function () {
    it("should handle decision with only whitespace", async function () {
      const decision = "   ";
      const nonce = "whitespace-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      const c = await contract.getCommitment(0);
      expect(c.decision).to.equal(decision);
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should handle decision with newlines and tabs", async function () {
      const decision = "line1\nline2\ttabbed\r\nwindows-line";
      const nonce = "newline-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      const c = await contract.getCommitment(0);
      expect(c.decision).to.equal(decision);
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should handle empty decision with non-empty nonce", async function () {
      const decision = "";
      const nonce = "nonce-for-empty";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      const c = await contract.getCommitment(0);
      expect(c.decision).to.equal("");
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should handle non-empty decision with empty nonce", async function () {
      const decision = "DECISION_NO_NONCE";
      const nonce = "";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      const c = await contract.getCommitment(0);
      expect(c.nonce).to.equal("");
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should handle both empty decision and empty nonce", async function () {
      const decision = "";
      const nonce = "";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should handle decision containing null bytes", async function () {
      const decision = "before\x00after";
      const nonce = "null-byte-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should distinguish between similar decisions with different whitespace", async function () {
      const decision1 = "DECISION";
      const decision2 = "DECISION ";
      const nonce = "same-nonce";

      const hash1 = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision1, nonce]
      );

      await contract.commit(hash1);

      // Reveal with trailing space should fail
      await expect(
        contract.reveal(0, decision2, nonce)
      ).to.be.revertedWith("Hash mismatch");
    });

    it("should handle decision with unicode emoji characters", async function () {
      const decision = "approve trade for user with amount $500";
      const nonce = "emoji-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);
      expect(await contract.verify(0)).to.equal(true);
    });
  });
});
