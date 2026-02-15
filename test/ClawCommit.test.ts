import { expect } from "chai";
import { ethers } from "hardhat";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
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

describe("ClawCommit", function () {
  let clawCommit: ClawCommit;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;

  const PROMPT = "Should we rebalance treasury this epoch?";
  const OUTPUT = "APPROVE_REBALANCE_5_PERCENT";
  const MODEL_VERSION = "clawcommit-agent-v2.1.0";
  const NONCE = "randomNonce123abc";

  beforeEach(async function () {
    [owner, addr1] = await ethers.getSigners();
    const factory = await ethers.getContractFactory("ClawCommit");
    clawCommit = await factory.deploy();
    await clawCommit.waitForDeployment();
  });

  describe("commitDecision", function () {
    it("stores commitment with correct hash and committer", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await clawCommit.commitDecision(hash);

      const c = await clawCommit.getCommitment(0);
      expect(c.hash).to.equal(hash);
      expect(c.committer).to.equal(owner.address);
      expect(c.revealed).to.equal(false);
      expect(c.prompt).to.equal("");
      expect(c.output).to.equal("");
      expect(c.modelVersion).to.equal("");
      expect(c.nonce).to.equal("");
    });

    it("emits CommitCreated event", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await expect(clawCommit.commitDecision(hash))
        .to.emit(clawCommit, "CommitCreated")
        .withArgs(0, owner.address, hash, anyValue);
    });

    it("increments commitCount", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await clawCommit.commitDecision(hash);
      expect(await clawCommit.commitCount()).to.equal(1);

      await clawCommit.commitDecision(hash);
      expect(await clawCommit.commitCount()).to.equal(2);
    });

    it("allows multiple commits from different addresses", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await clawCommit.connect(owner).commitDecision(hash);
      await clawCommit.connect(addr1).commitDecision(hash);

      const c0 = await clawCommit.getCommitment(0);
      const c1 = await clawCommit.getCommitment(1);
      expect(c0.committer).to.equal(owner.address);
      expect(c1.committer).to.equal(addr1.address);
    });
  });

  describe("revealDecision", function () {
    let hash: string;

    beforeEach(async function () {
      hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);
    });

    it("reveals with correct prompt/output/modelVersion/nonce", async function () {
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      const c = await clawCommit.getCommitment(0);
      expect(c.revealed).to.equal(true);
      expect(c.prompt).to.equal(PROMPT);
      expect(c.output).to.equal(OUTPUT);
      expect(c.modelVersion).to.equal(MODEL_VERSION);
      expect(c.nonce).to.equal(NONCE);
    });

    it("emits CommitRevealed event", async function () {
      await expect(
        clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE)
      )
        .to.emit(clawCommit, "CommitRevealed")
        .withArgs(0, owner.address, PROMPT, OUTPUT, MODEL_VERSION);
    });

    it("reverts with HashMismatch for incorrect reveal payload", async function () {
      await expect(
        clawCommit.revealDecision(0, PROMPT, "WRONG_OUTPUT", MODEL_VERSION, NONCE)
      ).to.be.revertedWithCustomError(clawCommit, "HashMismatch");
    });

    it("reverts with OnlyCommitter for non-committer", async function () {
      await expect(
        clawCommit
          .connect(addr1)
          .revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE)
      ).to.be.revertedWithCustomError(clawCommit, "OnlyCommitter");
    });

    it("reverts with AlreadyRevealed for second reveal", async function () {
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      await expect(
        clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE)
      ).to.be.revertedWithCustomError(clawCommit, "AlreadyRevealed");
    });
  });

  describe("verifyReplay", function () {
    it("returns true for correctly revealed commitment", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      expect(await clawCommit.verifyReplay(0)).to.equal(true);
    });

    it("reverts with NotRevealed when commitment not revealed", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);

      await expect(clawCommit.verifyReplay(0)).to.be.revertedWithCustomError(
        clawCommit,
        "NotRevealed"
      );
    });

    it("allows any address to call verifyReplay", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      expect(await clawCommit.connect(addr1).verifyReplay(0)).to.equal(true);
    });
  });

  describe("computeDecisionHash", function () {
    it("matches off-chain deterministic hash computation", async function () {
      const contractHash = await clawCommit.computeDecisionHash(
        PROMPT,
        OUTPUT,
        MODEL_VERSION,
        NONCE
      );
      const localHash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      expect(contractHash).to.equal(localHash);
    });

    it("returns different hashes for different input tuples", async function () {
      const hash1 = await clawCommit.computeDecisionHash(
        "PROMPT_A",
        "OUTPUT_A",
        "MODEL_A",
        "nonce1"
      );
      const hash2 = await clawCommit.computeDecisionHash(
        "PROMPT_B",
        "OUTPUT_B",
        "MODEL_B",
        "nonce2"
      );
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe("full lifecycle", function () {
    it("completes commit -> reveal -> verifyReplay cycle", async function () {
      const prompt = "Should we publish model release notes now?";
      const output = "APPROVE_RELEASE_NOTES";
      const modelVersion = "clawcommit-agent-v2.2.0";
      const nonce = "lifecycle-nonce-abc123";

      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      const commitTx = await clawCommit.commitDecision(hash);
      await commitTx.wait();
      expect(await clawCommit.commitCount()).to.equal(1);

      const revealTx = await clawCommit.revealDecision(
        0,
        prompt,
        output,
        modelVersion,
        nonce
      );
      await revealTx.wait();

      expect(await clawCommit.verifyReplay(0)).to.equal(true);

      const c = await clawCommit.getCommitment(0);
      const replayHash = computeDecisionHash(c.prompt, c.output, c.modelVersion, c.nonce);
      expect(replayHash).to.equal(c.hash);
      expect(c.revealed).to.equal(true);
      expect(c.prompt).to.equal(prompt);
      expect(c.output).to.equal(output);
      expect(c.modelVersion).to.equal(modelVersion);
    });
  });
});
