import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit } from "../typechain-types";

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

describe("Deterministic Hash Validation", function () {
  let contract: ClawCommit;

  beforeEach(async function () {
    const factory = await ethers.getContractFactory("ClawCommit");
    contract = await factory.deploy();
    await contract.waitForDeployment();
  });

  describe("computeDecisionHash determinism", function () {
    it("produces identical hashes for identical tuples", async function () {
      const prompt = "APPROVE_TRADE";
      const output = "BUY_10_BNB";
      const modelVersion = "agent-v2";
      const nonce = "nonce123";

      const hash1 = await contract.computeDecisionHash(
        prompt,
        output,
        modelVersion,
        nonce
      );
      const hash2 = await contract.computeDecisionHash(
        prompt,
        output,
        modelVersion,
        nonce
      );

      expect(hash1).to.equal(hash2);
    });

    it("matches off-chain abi.encode hash exactly", async function () {
      const prompt = "Should we deploy model patch?";
      const output = "APPROVE_DEPLOY";
      const modelVersion = "gpt-4.2-reasoning";
      const nonce = "abc123def456";

      const onchain = await contract.computeDecisionHash(
        prompt,
        output,
        modelVersion,
        nonce
      );
      const offchain = computeDecisionHash(prompt, output, modelVersion, nonce);

      expect(onchain).to.equal(offchain);
    });

    it("changes hash when any single field changes", async function () {
      const base = ["P", "O", "M", "N"] as const;
      const baseHash = await contract.computeDecisionHash(...base);

      const promptChanged = await contract.computeDecisionHash("P2", "O", "M", "N");
      const outputChanged = await contract.computeDecisionHash("P", "O2", "M", "N");
      const modelChanged = await contract.computeDecisionHash("P", "O", "M2", "N");
      const nonceChanged = await contract.computeDecisionHash("P", "O", "M", "N2");

      expect(baseHash).to.not.equal(promptChanged);
      expect(baseHash).to.not.equal(outputChanged);
      expect(baseHash).to.not.equal(modelChanged);
      expect(baseHash).to.not.equal(nonceChanged);
    });

    it("avoids encodePacked ambiguity by using abi.encode", async function () {
      // Packed representation collides for these two tuples
      const packed1 = ethers.solidityPackedKeccak256(
        ["string", "string", "string", "string"],
        ["ab", "c", "", ""]
      );
      const packed2 = ethers.solidityPackedKeccak256(
        ["string", "string", "string", "string"],
        ["a", "bc", "", ""]
      );
      expect(packed1).to.equal(packed2);

      const safe1 = await contract.computeDecisionHash("ab", "c", "", "");
      const safe2 = await contract.computeDecisionHash("a", "bc", "", "");
      expect(safe1).to.not.equal(safe2);
    });
  });

  describe("commit/reveal hash integrity", function () {
    it("verifies replay after successful reveal", async function () {
      const prompt = "Evaluate market regime";
      const output = "SELL_50_BNB";
      const modelVersion = "model-v2";
      const nonce = "integrity-nonce";
      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      await contract.commitDecision(hash);
      await contract.revealDecision(0, prompt, output, modelVersion, nonce);

      const c = await contract.getCommitment(0);
      expect(c.hash).to.equal(hash);
      expect(await contract.verifyReplay(0)).to.equal(true);
    });

    it("rejects reveal when one character differs", async function () {
      const prompt = "PROMPT";
      const output = "OUTPUT";
      const modelVersion = "MODEL";
      const nonce = "nonce_correct";
      const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

      await contract.commitDecision(hash);

      await expect(
        contract.revealDecision(0, prompt, output, modelVersion, "nonce_correcT")
      ).to.be.revertedWithCustomError(contract, "HashMismatch");
    });

    it("supports multiple sequential commitments", async function () {
      const entries = [
        { prompt: "P0", output: "O0", model: "M0", nonce: "N0" },
        { prompt: "P1", output: "O1", model: "M1", nonce: "N1" },
        { prompt: "P2", output: "O2", model: "M2", nonce: "N2" },
      ];

      for (const entry of entries) {
        const hash = computeDecisionHash(
          entry.prompt,
          entry.output,
          entry.model,
          entry.nonce
        );
        await contract.commitDecision(hash);
      }

      expect(await contract.commitCount()).to.equal(3);

      for (let i = 0; i < entries.length; i++) {
        const entry = entries[i];
        await contract.revealDecision(i, entry.prompt, entry.output, entry.model, entry.nonce);
        expect(await contract.verifyReplay(i)).to.equal(true);
      }
    });
  });
});
