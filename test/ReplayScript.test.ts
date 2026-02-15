import { expect } from "chai";
import { ethers } from "hardhat";
import {
  computeDecisionHash,
  decodeRevealTransactionData,
  verifyRevealTransaction,
} from "../scripts/replay";

async function expectFailure(
  action: () => Promise<unknown>,
  expectedMessage: string
): Promise<void> {
  let failed = false;

  try {
    await action();
  } catch (error) {
    failed = true;
    const message = error instanceof Error ? error.message : String(error);
    expect(message).to.contain(expectedMessage);
  }

  expect(failed).to.equal(true, "expected action to fail");
}

describe("Replay Script", function () {
  it("computes ABI-encoded deterministic hash", async function () {
    const hash = computeDecisionHash("p", "o", "m", "n");
    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "string", "string"],
      ["p", "o", "m", "n"]
    );
    expect(hash).to.equal(ethers.keccak256(encoded));
  });

  it("fails on wrong function selector", async function () {
    expect(() => decodeRevealTransactionData("0x12345678deadbeef")).to.throw(
      "wrong function selector"
    );
  });

  it("fails when transaction hash is missing", async function () {
    await expectFailure(
      async () => {
        await verifyRevealTransaction(`0x${"11".repeat(32)}`, {
          provider: ethers.provider,
        });
      },
      "Transaction not found"
    );
  });

  it("fails when tx is not revealDecision", async function () {
    const Factory = await ethers.getContractFactory("ClawCommit");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();

    const hash = computeDecisionHash("prompt", "output", "v2", "nonce");
    const commitTx = await contract.commitDecision(hash);
    const commitReceipt = await commitTx.wait();
    const commitTxHash = commitReceipt?.hash as string;

    await expectFailure(
      async () => {
        await verifyRevealTransaction(commitTxHash, { provider: ethers.provider });
      },
      "wrong function selector"
    );
  });

  it("fails when reveal transaction reverted onchain", async function () {
    const fakeProvider = {
      getTransaction: async () => ({
        hash: "0xreverted",
        to: "0x0000000000000000000000000000000000000001",
        data: "0x",
      }),
      getTransactionReceipt: async () => ({
        status: 0,
      }),
    };

    await expectFailure(
      async () => {
        await verifyRevealTransaction("0xreverted", {
          provider: fakeProvider as any,
        });
      },
      "failed onchain"
    );
  });

  it("fails on hash mismatch", async function () {
    const Factory = await ethers.getContractFactory("ReplayMismatchMock");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();

    const tx = await contract.revealDecision(
      0,
      "prompt",
      "output",
      "v2",
      "nonce"
    );
    const receipt = await tx.wait();

    await expectFailure(
      async () => {
        await verifyRevealTransaction(receipt?.hash as string, {
          provider: ethers.provider,
        });
      },
      "hash mismatch"
    );
  });

  it("verifies a valid reveal transaction", async function () {
    const Factory = await ethers.getContractFactory("ClawCommit");
    const contract = await Factory.deploy();
    await contract.waitForDeployment();

    const prompt = "Should we ship deterministic replay?";
    const output = "APPROVE";
    const modelVersion = "v2";
    const nonce = "nonce-ok";

    const hash = computeDecisionHash(prompt, output, modelVersion, nonce);
    await contract.commitDecision(hash);

    const revealTx = await contract.revealDecision(
      0,
      prompt,
      output,
      modelVersion,
      nonce
    );
    const revealReceipt = await revealTx.wait();

    const result = await verifyRevealTransaction(revealReceipt?.hash as string, {
      provider: ethers.provider,
    });

    expect(result.commitId).to.equal(0n);
    expect(result.storedHash).to.equal(hash);
    expect(result.recomputedHash).to.equal(hash);
  });
});
