import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommitBatch } from "../typechain-types";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

function keccakText(value: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

describe("ClawCommitBatch (Wave 1)", function () {
  let contract: ClawCommitBatch;

  beforeEach(async function () {
    const Factory = await ethers.getContractFactory("ClawCommitBatch");
    contract = await Factory.deploy();
    await contract.waitForDeployment();
  });

  it("stores a committed batch root", async function () {
    const [signer] = await ethers.getSigners();
    const root = keccakText("batch-root-1");
    const manifestHash = keccakText("manifest-1");

    await contract.commitBatch(root, 3, "clawcommit-v2-batch", manifestHash);

    const stored = await contract.getBatch(0);
    expect(stored.merkleRoot).to.equal(root);
    expect(stored.leafCount).to.equal(3);
    expect(stored.committer).to.equal(signer.address);
    expect(stored.modelVersion).to.equal("clawcommit-v2-batch");
    expect(stored.manifestHash).to.equal(manifestHash);
    expect(stored.timestamp).to.be.greaterThan(0);
  });

  it("emits BatchCommitted and increments batchCount", async function () {
    const [signer] = await ethers.getSigners();
    const root = keccakText("batch-root-2");
    const manifestHash = keccakText("manifest-2");

    await expect(contract.commitBatch(root, 2, "v2", manifestHash))
      .to.emit(contract, "BatchCommitted")
      .withArgs(0, signer.address, root, 2, "v2", manifestHash, anyValue);

    expect(await contract.batchCount()).to.equal(1);
  });

  it("reverts on zero root", async function () {
    await expect(
      contract.commitBatch(ethers.ZeroHash, 2, "v2", keccakText("manifest"))
    ).to.be.revertedWithCustomError(contract, "ZeroRoot");
  });

  it("reverts on zero leaf count", async function () {
    await expect(
      contract.commitBatch(keccakText("root"), 0, "v2", keccakText("manifest"))
    ).to.be.revertedWithCustomError(contract, "InvalidLeafCount");
  });

  it("computes leaf hash compatible with offchain encoding", async function () {
    const prompt = "Should we hedge?";
    const output = "APPROVE";
    const modelVersion = "v2";
    const nonce = "nonce-1";
    const leafIndex = 7;

    const onchain = await contract.computeLeafHash(
      prompt,
      output,
      modelVersion,
      nonce,
      leafIndex
    );

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "string", "string", "uint256"],
      [prompt, output, modelVersion, nonce, leafIndex]
    );
    const offchain = ethers.keccak256(encoded);

    expect(onchain).to.equal(offchain);
  });
});
