import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";

describe("Deterministic Hash Validation", function () {
  let contract: ClawCommit;
  let owner: HardhatEthersSigner;

  beforeEach(async function () {
    [owner] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ClawCommit");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe("hash determinism", function () {
    it("should produce identical hashes for identical inputs", async function () {
      const decision = "APPROVE_TRADE";
      const nonce = "nonce123";

      const hash1 = await contract.computeHash(decision, nonce);
      const hash2 = await contract.computeHash(decision, nonce);
      expect(hash1).to.equal(hash2);
    });

    it("should match off-chain ethers.js computation exactly", async function () {
      const decision = "BUY_BNB_AT_580";
      const nonce = "abc123def456";

      const onchain = await contract.computeHash(decision, nonce);
      const offchain = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );
      expect(onchain).to.equal(offchain);
    });

    it("should produce different hashes for different decisions", async function () {
      const nonce = "sameNonce";
      const h1 = await contract.computeHash("DECISION_A", nonce);
      const h2 = await contract.computeHash("DECISION_B", nonce);
      expect(h1).to.not.equal(h2);
    });

    it("should produce different hashes for different nonces", async function () {
      const decision = "SAME_DECISION";
      const h1 = await contract.computeHash(decision, "nonce1");
      const h2 = await contract.computeHash(decision, "nonce2");
      expect(h1).to.not.equal(h2);
    });

    it("should handle empty decision string", async function () {
      const hash = await contract.computeHash("", "nonce123");
      const expected = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["", "nonce123"]
      );
      expect(hash).to.equal(expected);
    });

    it("should handle empty nonce string", async function () {
      const hash = await contract.computeHash("decision", "");
      const expected = ethers.solidityPackedKeccak256(
        ["string", "string"],
        ["decision", ""]
      );
      expect(hash).to.equal(expected);
    });

    it("should handle long decision strings (JSON payloads)", async function () {
      const decision = JSON.stringify({
        prompt: "Should we adjust the staking reward rate for Q3?",
        output: "APPROVE_RATE_INCREASE_5_PERCENT",
        modelVersion: "clawcommit-agent-v1.0",
        confidence: 0.95,
        timestamp: "2026-02-14T12:00:00.000Z",
      });
      const nonce = "long-test-nonce-" + "x".repeat(100);

      const onchain = await contract.computeHash(decision, nonce);
      const offchain = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );
      expect(onchain).to.equal(offchain);
    });

    it("should handle special characters in decision", async function () {
      const decision = 'action: "buy" & sell <tokens> @ $580 \n\ttab';
      const nonce = "special-chars-nonce";
      const onchain = await contract.computeHash(decision, nonce);
      const offchain = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );
      expect(onchain).to.equal(offchain);
    });

    it("should handle unicode in decision", async function () {
      const decision = "approve trade for user 用户 with amount €500";
      const nonce = "unicode-nonce";
      const onchain = await contract.computeHash(decision, nonce);
      const offchain = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );
      expect(onchain).to.equal(offchain);
    });
  });

  describe("commit-reveal hash integrity", function () {
    it("should verify hash matches after commit and reveal", async function () {
      const decision = "EXECUTE_ORDER_42";
      const nonce = "integrity-nonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      const c = await contract.getCommitment(0);
      expect(c.hash).to.equal(hash);
      expect(c.decision).to.equal(decision);
      expect(c.nonce).to.equal(nonce);
      expect(await contract.verify(0)).to.equal(true);
    });

    it("should reject reveal with single-character nonce difference", async function () {
      const decision = "DECISION";
      const nonce = "nonce_correct";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);

      await expect(
        contract.reveal(0, decision, "nonce_correcT")
      ).to.be.revertedWith("Hash mismatch");
    });

    it("should reject reveal with single-character decision difference", async function () {
      const decision = "BUY_BNB";
      const nonce = "mynonce";
      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);

      await expect(
        contract.reveal(0, "BUY_BNb", nonce)
      ).to.be.revertedWith("Hash mismatch");
    });

    it("should handle multiple sequential commits and reveals", async function () {
      const entries = [
        { decision: "DECISION_0", nonce: "nonce_0" },
        { decision: "DECISION_1", nonce: "nonce_1" },
        { decision: "DECISION_2", nonce: "nonce_2" },
      ];

      // Commit all
      for (const entry of entries) {
        const hash = ethers.solidityPackedKeccak256(
          ["string", "string"],
          [entry.decision, entry.nonce]
        );
        await contract.commit(hash);
      }

      expect(await contract.commitCount()).to.equal(3);

      // Reveal all
      for (let i = 0; i < entries.length; i++) {
        await contract.reveal(i, entries[i].decision, entries[i].nonce);
        expect(await contract.verify(i)).to.equal(true);
      }
    });

    it("should maintain hash integrity for JSON-encoded AI decisions", async function () {
      const aiDecision = {
        prompt: "Evaluate market conditions",
        output: "SELL_50_BNB",
        model: "gpt-4-turbo",
        confidence: 0.87,
      };
      const decision = JSON.stringify(aiDecision);
      const nonce = "ai-pipeline-nonce-" + Date.now();

      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );

      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      const c = await contract.getCommitment(0);
      const replayHash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [c.decision, c.nonce]
      );

      expect(replayHash).to.equal(c.hash);
      expect(JSON.parse(c.decision)).to.deep.equal(aiDecision);
    });
  });

  describe("replay verification independence", function () {
    it("should allow any address to verify via computeHash", async function () {
      const [, addr1] = await ethers.getSigners();
      const decision = "OWNER_DECISION";
      const nonce = "owner-nonce";

      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );
      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      // addr1 (non-committer) can compute and verify
      const replayHash = await contract.connect(addr1).computeHash(decision, nonce);
      const c = await contract.connect(addr1).getCommitment(0);
      expect(replayHash).to.equal(c.hash);
    });

    it("should verify purely off-chain without contract call", async function () {
      const decision = "OFFCHAIN_TEST";
      const nonce = "offchain-nonce";

      const hash = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [decision, nonce]
      );
      await contract.commit(hash);
      await contract.reveal(0, decision, nonce);

      const c = await contract.getCommitment(0);

      // Pure off-chain verification (no contract.verify call)
      const offchainReplay = ethers.solidityPackedKeccak256(
        ["string", "string"],
        [c.decision, c.nonce]
      );
      expect(offchainReplay).to.equal(c.hash);
    });
  });
});
