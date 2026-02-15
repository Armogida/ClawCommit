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

describe("Deterministic Hash Validation V2", function () {
  let contract: ClawCommit;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("ClawCommit");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  it("produces identical hash for identical inputs", async function () {
    const a = await contract.computeDecisionHash("p", "o", "m", "n");
    const b = await contract.computeDecisionHash("p", "o", "m", "n");
    expect(a).to.equal(b);
  });

  it("matches offchain ABI encoded hash", async function () {
    const prompt = "Should we open exposure?";
    const output = "REJECT";
    const modelVersion = "model-v2.3";
    const nonce = "nonce-777";

    const onchain = await contract.computeDecisionHash(prompt, output, modelVersion, nonce);
    const offchain = computeDecisionHash(prompt, output, modelVersion, nonce);

    expect(onchain).to.equal(offchain);
  });

  it("changes when any single field changes", async function () {
    const base = computeDecisionHash("prompt", "output", "v2", "nonce");
    expect(base).to.not.equal(computeDecisionHash("prompt*", "output", "v2", "nonce"));
    expect(base).to.not.equal(computeDecisionHash("prompt", "output*", "v2", "nonce"));
    expect(base).to.not.equal(computeDecisionHash("prompt", "output", "v2.1", "nonce"));
    expect(base).to.not.equal(computeDecisionHash("prompt", "output", "v2", "nonce*"));
  });

  it("handles long JSON prompt and unicode output", async function () {
    const prompt = JSON.stringify({
      role: "risk-controller",
      constraints: ["max_drawdown:5%", "no_new_short_positions"],
      context: "market_volatility_elevated",
      metadata: { traceId: "abc-123", at: "2026-02-15T12:00:00Z" },
    });
    const output = "APPROVE_REBALANCE_FOR_用户_€500";
    const modelVersion = "clawcommit-agent-v2.0.1";
    const nonce = "n".repeat(128);

    const onchain = await contract.computeDecisionHash(prompt, output, modelVersion, nonce);
    const offchain = computeDecisionHash(prompt, output, modelVersion, nonce);

    expect(onchain).to.equal(offchain);
  });

  it("preserves integrity through commit/reveal cycle", async function () {
    const prompt = "Should we rebalance?";
    const output = "APPROVE";
    const modelVersion = "v2";
    const nonce = "integrity-nonce";

    const hash = computeDecisionHash(prompt, output, modelVersion, nonce);
    await contract.commitDecision(hash);
    await contract.revealDecision(0, prompt, output, modelVersion, nonce);

    const c = await contract.getCommitment(0);
    expect(c.hash).to.equal(hash);
    expect(await contract.verifyReplay(0)).to.equal(true);
  });
});
