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

describe("Hash Determinism and Collision Resistance", function () {
  let contract: ClawCommit;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("ClawCommit");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  describe("Parameter ordering matters", function () {
    it("reordering prompt and output produces different hash", async function () {
      const hashABCD = computeDecisionHash("A", "B", "C", "D");
      const hashBACD = computeDecisionHash("B", "A", "C", "D");
      expect(hashABCD).to.not.equal(hashBACD);
    });

    it("reordering prompt and modelVersion produces different hash", async function () {
      const hashABCD = computeDecisionHash("A", "B", "C", "D");
      const hashCBAD = computeDecisionHash("C", "B", "A", "D");
      expect(hashABCD).to.not.equal(hashCBAD);
    });

    it("reordering output and nonce produces different hash", async function () {
      const hashABCD = computeDecisionHash("A", "B", "C", "D");
      const hashADCB = computeDecisionHash("A", "D", "C", "B");
      expect(hashABCD).to.not.equal(hashADCB);
    });

    it("reordering modelVersion and nonce produces different hash", async function () {
      const hashABCD = computeDecisionHash("A", "B", "C", "D");
      const hashABDC = computeDecisionHash("A", "B", "D", "C");
      expect(hashABCD).to.not.equal(hashABDC);
    });
  });

  describe("ABI encoding boundary safety", function () {
    it("prevents collision: prompt='ab' output='cd' vs prompt='abc' output='d'", async function () {
      const hash1 = computeDecisionHash("ab", "cd", "v1", "n1");
      const hash2 = computeDecisionHash("abc", "d", "v1", "n1");
      expect(hash1).to.not.equal(hash2);
    });

    it("prevents collision: prompt='hello' output='world' vs prompt='hellow' output='orld'", async function () {
      const hash1 = computeDecisionHash("hello", "world", "v1", "n1");
      const hash2 = computeDecisionHash("hellow", "orld", "v1", "n1");
      expect(hash1).to.not.equal(hash2);
    });

    it("prevents collision: prompt='test' output='' vs prompt='' output='test'", async function () {
      const hash1 = computeDecisionHash("test", "", "v1", "n1");
      const hash2 = computeDecisionHash("", "test", "v1", "n1");
      expect(hash1).to.not.equal(hash2);
    });
  });

  describe("Empty vs non-empty fields", function () {
    it("all empty fields produces distinct hash", async function () {
      const allEmpty = computeDecisionHash("", "", "", "");
      const promptFilled = computeDecisionHash("a", "", "", "");
      const outputFilled = computeDecisionHash("", "a", "", "");
      const modelFilled = computeDecisionHash("", "", "a", "");
      const nonceFilled = computeDecisionHash("", "", "", "a");

      expect(allEmpty).to.not.equal(promptFilled);
      expect(allEmpty).to.not.equal(outputFilled);
      expect(allEmpty).to.not.equal(modelFilled);
      expect(allEmpty).to.not.equal(nonceFilled);
    });

    it("each position matters even when other fields are empty", async function () {
      const promptOnly = computeDecisionHash("prompt", "", "", "");
      const outputOnly = computeDecisionHash("", "output", "", "");
      const modelOnly = computeDecisionHash("", "", "model", "");
      const nonceOnly = computeDecisionHash("", "", "", "nonce");

      const hashes = [promptOnly, outputOnly, modelOnly, nonceOnly];
      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).to.equal(4);
    });
  });

  describe("Nonce uniqueness", function () {
    it("different nonces always produce different hashes", async function () {
      const prompt = "Should we execute trade?";
      const output = "APPROVE";
      const modelVersion = "v1.0.0";

      const nonces = ["nonce1", "nonce2", "nonce3", "nonce4", "nonce5"];
      const hashes = nonces.map((nonce) =>
        computeDecisionHash(prompt, output, modelVersion, nonce)
      );

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).to.equal(5);
    });

    it("numeric nonces produce distinct hashes", async function () {
      const prompt = "Risk check";
      const output = "PASS";
      const modelVersion = "v2";

      const nonces = ["0", "1", "2", "3", "4", "5"];
      const hashes = nonces.map((nonce) =>
        computeDecisionHash(prompt, output, modelVersion, nonce)
      );

      const uniqueHashes = new Set(hashes);
      expect(uniqueHashes.size).to.equal(6);
    });
  });

  describe("Large input determinism", function () {
    it("50KB prompt produces same hash when computed twice", async function () {
      const largePrompt = "a".repeat(50 * 1024);
      const output = "response";
      const modelVersion = "v1";
      const nonce = "nonce";

      const hash1 = computeDecisionHash(largePrompt, output, modelVersion, nonce);
      const hash2 = computeDecisionHash(largePrompt, output, modelVersion, nonce);

      expect(hash1).to.equal(hash2);
    });

    it("onchain and offchain match for large input", async function () {
      const largePrompt = "b".repeat(10 * 1024);
      const output = "APPROVE";
      const modelVersion = "v2.0";
      const nonce = "large-test";

      const offchain = computeDecisionHash(largePrompt, output, modelVersion, nonce);
      const onchain = await contract.computeDecisionHash(
        largePrompt,
        output,
        modelVersion,
        nonce
      );

      expect(onchain).to.equal(offchain);
    });
  });

  describe("Null bytes in strings", function () {
    it("strings containing null bytes produce valid distinct hashes", async function () {
      const withNull = computeDecisionHash("test\x00data", "output", "v1", "n1");
      const withoutNull = computeDecisionHash("testdata", "output", "v1", "n1");

      expect(withNull).to.not.equal(withoutNull);
      expect(withNull).to.match(/^0x[0-9a-f]{64}$/);
    });

    it("null bytes in different positions produce different hashes", async function () {
      const nullAtStart = computeDecisionHash("\x00test", "output", "v1", "n1");
      const nullAtMiddle = computeDecisionHash("te\x00st", "output", "v1", "n1");
      const nullAtEnd = computeDecisionHash("test\x00", "output", "v1", "n1");

      expect(nullAtStart).to.not.equal(nullAtMiddle);
      expect(nullAtMiddle).to.not.equal(nullAtEnd);
      expect(nullAtStart).to.not.equal(nullAtEnd);
    });
  });

  describe("Hash format validation", function () {
    it("hash is always exactly bytes32 (0x + 64 hex chars)", async function () {
      const hash1 = computeDecisionHash("prompt", "output", "v1", "n1");
      const hash2 = computeDecisionHash("", "", "", "");
      const hash3 = computeDecisionHash("x".repeat(1000), "y".repeat(1000), "z", "w");

      expect(hash1).to.match(/^0x[0-9a-f]{64}$/);
      expect(hash2).to.match(/^0x[0-9a-f]{64}$/);
      expect(hash3).to.match(/^0x[0-9a-f]{64}$/);
    });

    it("onchain hash format matches offchain format", async function () {
      const prompt = "test";
      const output = "result";
      const modelVersion = "v1.0";
      const nonce = "nonce123";

      const onchain = await contract.computeDecisionHash(prompt, output, modelVersion, nonce);
      const offchain = computeDecisionHash(prompt, output, modelVersion, nonce);

      expect(onchain).to.match(/^0x[0-9a-f]{64}$/);
      expect(offchain).to.match(/^0x[0-9a-f]{64}$/);
      expect(onchain).to.equal(offchain);
    });
  });

  describe("End-to-end hash verification", function () {
    it("commit with offchain hash and reveal succeeds", async function () {
      const prompt = "Execute trade for client XYZ?";
      const output = "APPROVE with conditions: max 1000 shares";
      const modelVersion = "risk-engine-v3.2.1";
      const nonce = "unique-nonce-12345";

      const offchainHash = computeDecisionHash(prompt, output, modelVersion, nonce);

      const tx = await contract.commitDecision(offchainHash);
      const receipt = await tx.wait();
      expect(receipt).to.not.be.null;

      await contract.revealDecision(0, prompt, output, modelVersion, nonce);

      const commitment = await contract.getCommitment(0);
      expect(commitment.revealed).to.equal(true);
      expect(commitment.hash).to.equal(offchainHash);
      expect(commitment.prompt).to.equal(prompt);
      expect(commitment.output).to.equal(output);
      expect(commitment.modelVersion).to.equal(modelVersion);
      expect(commitment.nonce).to.equal(nonce);
    });

    it("onchain computeDecisionHash matches commit hash verification", async function () {
      const prompt = "Risk assessment for portfolio rebalance";
      const output = "REJECT - volatility exceeds threshold";
      const modelVersion = "v4.0.0";
      const nonce = "replay-test-nonce";

      const onchainHash = await contract.computeDecisionHash(
        prompt,
        output,
        modelVersion,
        nonce
      );

      await contract.commitDecision(onchainHash);
      await contract.revealDecision(0, prompt, output, modelVersion, nonce);

      const verified = await contract.verifyReplay(0);
      expect(verified).to.equal(true);
    });
  });
});
