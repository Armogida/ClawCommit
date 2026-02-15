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

describe("Edge Cases and Security V2", function () {
  let contract: ClawCommit;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;
  let addr3: HardhatEthersSigner;

  beforeEach(async function () {
    [owner, addr1, addr2, addr3] = await ethers.getSigners();
    const Factory = await ethers.getContractFactory("ClawCommit");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  it("handles large prompt/output strings", async function () {
    const prompt = "p".repeat(6000);
    const output = "o".repeat(6000);
    const modelVersion = "model-v2-large";
    const nonce = "n".repeat(1000);

    const hash = computeDecisionHash(prompt, output, modelVersion, nonce);
    await contract.commitDecision(hash);
    await contract.revealDecision(0, prompt, output, modelVersion, nonce);

    expect(await contract.verifyReplay(0)).to.equal(true);
  });

  it("keeps commitment isolation across multiple committers", async function () {
    const commitments = [
      { signer: addr1, prompt: "p1", output: "o1", modelVersion: "v2", nonce: "n1" },
      { signer: addr2, prompt: "p2", output: "o2", modelVersion: "v2", nonce: "n2" },
      { signer: addr3, prompt: "p3", output: "o3", modelVersion: "v2", nonce: "n3" },
    ];

    for (const item of commitments) {
      const hash = computeDecisionHash(item.prompt, item.output, item.modelVersion, item.nonce);
      await contract.connect(item.signer).commitDecision(hash);
    }

    for (let i = 0; i < commitments.length; i++) {
      const item = commitments[i];
      await contract
        .connect(item.signer)
        .revealDecision(i, item.prompt, item.output, item.modelVersion, item.nonce);
    }

    for (let i = 0; i < commitments.length; i++) {
      const c = await contract.getCommitment(i);
      expect(c.committer).to.equal(commitments[i].signer.address);
      expect(await contract.verifyReplay(i)).to.equal(true);
    }
  });

  it("prevents frontrunning reveal by non-committer", async function () {
    const hash = computeDecisionHash("prompt", "output", "v2", "nonce");
    await contract.connect(addr1).commitDecision(hash);

    await expect(
      contract.connect(addr2).revealDecision(0, "prompt", "output", "v2", "nonce")
    ).to.be.revertedWithCustomError(contract, "OnlyCommitter");
  });

  it("allows any address to read and verify revealed commitments", async function () {
    const hash = computeDecisionHash("prompt", "output", "v2", "nonce");
    await contract.connect(addr1).commitDecision(hash);
    await contract.connect(addr1).revealDecision(0, "prompt", "output", "v2", "nonce");

    const c = await contract.connect(addr2).getCommitment(0);
    expect(c.output).to.equal("output");
    expect(await contract.connect(owner).verifyReplay(0)).to.equal(true);
  });

  it("distinguishes whitespace variations", async function () {
    const hash = computeDecisionHash("prompt", "output", "v2", "nonce");
    await contract.commitDecision(hash);

    await expect(
      contract.revealDecision(0, "prompt ", "output", "v2", "nonce")
    ).to.be.revertedWithCustomError(contract, "HashMismatch");
  });

  it("records ascending timestamps for sequential commits", async function () {
    const hash1 = computeDecisionHash("p1", "o1", "v2", "n1");
    const hash2 = computeDecisionHash("p2", "o2", "v2", "n2");

    await contract.commitDecision(hash1);
    await contract.commitDecision(hash2);

    const c0 = await contract.getCommitment(0);
    const c1 = await contract.getCommitment(1);

    expect(c1.timestamp).to.be.greaterThanOrEqual(c0.timestamp);
  });
});
