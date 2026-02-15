import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

const PROMPT = "Should we hedge treasury exposure?";
const OUTPUT = "APPROVE_HEDGE_20_PERCENT";
const MODEL_VERSION = "clawcommit-v2.1";
const NONCE = "nonce-abc-123";

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

describe("ClawCommit V2", function () {
  let clawCommit: ClawCommit;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ClawCommit");
    clawCommit = await Factory.deploy();
    await clawCommit.waitForDeployment();
  });

  describe("commitDecision", function () {
    it("stores commitment with hash, timestamp, and committer", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await clawCommit.commitDecision(hash);

      const c = await clawCommit.getCommitment(0);
      expect(c.hash).to.equal(hash);
      expect(c.committer).to.equal(owner.address);
      expect(c.timestamp).to.be.greaterThan(0);
      expect(c.revealed).to.equal(false);
      expect(c.prompt).to.equal("");
      expect(c.output).to.equal("");
      expect(c.modelVersion).to.equal("");
      expect(c.nonce).to.equal("");
    });

    it("emits CommitCreated and increments commitCount", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await expect(clawCommit.commitDecision(hash))
        .to.emit(clawCommit, "CommitCreated")
        .withArgs(0, owner.address, hash, anyValue);

      expect(await clawCommit.commitCount()).to.equal(1);
    });
  });

  describe("revealDecision", function () {
    beforeEach(async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);
    });

    it("reveals stored fields when hash matches", async function () {
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      const c = await clawCommit.getCommitment(0);
      expect(c.revealed).to.equal(true);
      expect(c.prompt).to.equal(PROMPT);
      expect(c.output).to.equal(OUTPUT);
      expect(c.modelVersion).to.equal(MODEL_VERSION);
      expect(c.nonce).to.equal(NONCE);
    });

    it("rejects mutated prompt", async function () {
      await expect(
        clawCommit.revealDecision(0, `${PROMPT}!`, OUTPUT, MODEL_VERSION, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "HashMismatch");
    });

    it("rejects mutated output", async function () {
      await expect(
        clawCommit.revealDecision(0, PROMPT, `${OUTPUT}_ALT`, MODEL_VERSION, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "HashMismatch");
    });

    it("rejects mutated modelVersion", async function () {
      await expect(
        clawCommit.revealDecision(0, PROMPT, OUTPUT, `${MODEL_VERSION}.1`, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "HashMismatch");
    });

    it("rejects mutated nonce", async function () {
      await expect(
        clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, `${NONCE}x`)
      )
        .to.be.revertedWithCustomError(clawCommit, "HashMismatch");
    });

    it("rejects non-committer reveals", async function () {
      await expect(
        clawCommit.connect(addr1).revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "OnlyCommitter");
    });

    it("rejects double reveal", async function () {
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await expect(
        clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "AlreadyRevealed");
    });
  });

  describe("verifyReplay + computeDecisionHash", function () {
    it("verifyReplay returns true after successful reveal", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      expect(await clawCommit.verifyReplay(0)).to.equal(true);
    });

    it("verifyReplay reverts before reveal", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);

      await expect(clawCommit.verifyReplay(0))
        .to.be.revertedWithCustomError(clawCommit, "NotRevealed");
    });

    it("computeDecisionHash matches offchain ABI-encoded keccak", async function () {
      const onchain = await clawCommit.computeDecisionHash(
        PROMPT,
        OUTPUT,
        MODEL_VERSION,
        NONCE
      );
      const offchain = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      expect(onchain).to.equal(offchain);
    });
  });

  describe("full lifecycle", function () {
    it("completes commit -> reveal -> verifyReplay", async function () {
      const prompt = "Should we execute treasury rebalance now?";
      const output = "APPROVE_REBALANCE";
      const modelVersion = "clawcommit-v2.2";
      const nonce = "lifecycle-xyz";

      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      await clawCommit.commitDecision(hash);
      await clawCommit.revealDecision(0, prompt, output, modelVersion, nonce);

      const c = await clawCommit.getCommitment(0);
      const replay = computeDecisionHash(c.prompt, c.output, c.modelVersion, c.nonce);

      expect(c.hash).to.equal(replay);
      expect(await clawCommit.verifyReplay(0)).to.equal(true);
    });
  });
});
