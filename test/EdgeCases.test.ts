import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit } from "../typechain-types";
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

describe("ClawCommit Edge Cases", function () {
  let contract: ClawCommit;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;
  let addr3: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ClawCommit");
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  describe("Large and Complex Inputs", function () {
    it("handles 10KB output payloads", async function () {
      const prompt = "Review generated strategy";
      const output = "x".repeat(10000);
      const modelVersion = "stress-model-v1";
      const nonce = "large-output-nonce";
      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      await contract.commitDecision(hash);
      await contract.revealDecision(0, prompt, output, modelVersion, nonce);
      expect(await contract.verifyReplay(0)).to.equal(true);
    });

    it("handles mixed unicode + whitespace reliably", async function () {
      const prompt = "\u7528\u6237\u98ce\u9669\u8bc4\u4f30\n\twith tabs";
      const output = "APPROVE \ud83d\udfe2\r\nNEXT_STEP";
      const modelVersion = "unicode-model-v3";
      const nonce = "unicode-nonce";
      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      await contract.commitDecision(hash);
      await contract.revealDecision(0, prompt, output, modelVersion, nonce);

      const c = await contract.getCommitment(0);
      expect(c.prompt).to.equal(prompt);
      expect(c.output).to.equal(output);
      expect(await contract.verifyReplay(0)).to.equal(true);
    });

    it("supports empty prompt/output/modelVersion with non-empty nonce", async function () {
      const hash = computeDecisionHash("", "", "", "nonce-only");

      await contract.commitDecision(hash);
      await contract.revealDecision(0, "", "", "", "nonce-only");

      const c = await contract.getCommitment(0);
      expect(c.prompt).to.equal("");
      expect(c.output).to.equal("");
      expect(c.modelVersion).to.equal("");
      expect(c.nonce).to.equal("nonce-only");
      expect(await contract.verifyReplay(0)).to.equal(true);
    });
  });

  describe("Access Control and Isolation", function () {
    it("prevents non-committer reveal even with correct payload", async function () {
      const prompt = "private prompt";
      const output = "SECRET_OUTPUT";
      const modelVersion = "agent-v2";
      const nonce = "private-nonce";
      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      await contract.connect(addr1).commitDecision(hash);

      await expect(
        contract
          .connect(addr2)
          .revealDecision(0, prompt, output, modelVersion, nonce)
      ).to.be.revertedWithCustomError(contract, "OnlyCommitter");
    });

    it("keeps commitments isolated across different signers", async function () {
      const entries = [
        { signer: addr1, prompt: "P1", output: "O1", model: "M1", nonce: "N1" },
        { signer: addr2, prompt: "P2", output: "O2", model: "M2", nonce: "N2" },
        { signer: addr3, prompt: "P3", output: "O3", model: "M3", nonce: "N3" },
      ];

      for (const entry of entries) {
        const hash = computeDecisionHash(
          entry.prompt,
          entry.output,
          entry.model,
          entry.nonce
        );
        await contract.connect(entry.signer).commitDecision(hash);
      }

      expect(await contract.commitCount()).to.equal(3);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        await contract
          .connect(entry.signer)
          .revealDecision(i, entry.prompt, entry.output, entry.model, entry.nonce);
      }

      for (let i = 0; i < entries.length; i++) {
        const c = await contract.getCommitment(i);
        expect(c.committer).to.equal(entries[i].signer.address);
        expect(c.prompt).to.equal(entries[i].prompt);
        expect(c.output).to.equal(entries[i].output);
        expect(await contract.verifyReplay(i)).to.equal(true);
      }
    });
  });

  describe("State Invariants", function () {
    it("never decreases commitCount", async function () {
      const hash = computeDecisionHash("p", "o", "m", "n");
      await contract.commitDecision(hash);
      await contract.commitDecision(hash);
      await contract.commitDecision(hash);

      expect(await contract.commitCount()).to.equal(3);
      expect(await contract.commitCount()).to.equal(3);
    });

    it("returns default-empty commitment for non-existent commit id", async function () {
      const c = await contract.getCommitment(42);
      expect(c.hash).to.equal(ethers.ZeroHash);
      expect(c.timestamp).to.equal(0);
      expect(c.committer).to.equal(ethers.ZeroAddress);
      expect(c.revealed).to.equal(false);
      expect(c.prompt).to.equal("");
      expect(c.output).to.equal("");
      expect(c.modelVersion).to.equal("");
      expect(c.nonce).to.equal("");
    });

    it("rejects revealing unknown commit ids", async function () {
      await expect(
        contract.revealDecision(999, "p", "o", "m", "n")
      ).to.be.revertedWithCustomError(contract, "OnlyCommitter");
    });

    it("rejects double reveal attempts regardless of payload", async function () {
      const prompt = "policy prompt";
      const output = "APPROVE";
      const modelVersion = "agent-v2";
      const nonce = "nonce-a";
      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      await contract.commitDecision(hash);
      await contract.revealDecision(0, prompt, output, modelVersion, nonce);

      await expect(
        contract.revealDecision(0, "different", "payload", "values", "nonce")
      ).to.be.revertedWithCustomError(contract, "AlreadyRevealed");
    });

    it("requires reveal before verifyReplay", async function () {
      const hash = computeDecisionHash("p", "o", "m", "n");
      await contract.commitDecision(hash);

      await expect(contract.verifyReplay(0)).to.be.revertedWithCustomError(
        contract,
        "NotRevealed"
      );
    });
  });
});
