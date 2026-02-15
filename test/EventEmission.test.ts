import { expect } from "chai";
import { ethers } from "hardhat";
import { ClawCommit, ClawCommitBatch } from "../typechain-types";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";

function computeDecisionHash(prompt: string, output: string, modelVersion: string, nonce: string): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  return ethers.keccak256(encoded);
}

function keccakText(value: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(value));
}

describe("Event Emission Tests", function () {
  let clawCommit: ClawCommit;
  let clawCommitBatch: ClawCommitBatch;
  let owner: HardhatEthersSigner;
  let addr1: HardhatEthersSigner;
  let addr2: HardhatEthersSigner;

  const PROMPT = "Should we proceed with the upgrade?";
  const OUTPUT = "APPROVE_UPGRADE";
  const MODEL_VERSION = "clawcommit-v2.5";
  const NONCE = "nonce-xyz-789";

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const ClawCommitFactory = await ethers.getContractFactory("ClawCommit");
    clawCommit = await ClawCommitFactory.deploy();
    await clawCommit.waitForDeployment();

    const ClawCommitBatchFactory = await ethers.getContractFactory("ClawCommitBatch");
    clawCommitBatch = await ClawCommitBatchFactory.deploy();
    await clawCommitBatch.waitForDeployment();
  });

  describe("CommitRevealed Event", function () {
    it("emits CommitRevealed with all 5 args on successful reveal", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);

      await expect(clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE))
        .to.emit(clawCommit, "CommitRevealed")
        .withArgs(0, owner.address, PROMPT, OUTPUT, MODEL_VERSION);
    });

    it("does NOT emit CommitRevealed on failed reveal (wrong hash)", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);

      await expect(
        clawCommit.revealDecision(0, PROMPT, "WRONG_OUTPUT", MODEL_VERSION, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "HashMismatch")
        .withArgs(); // No events emitted

      // Verify no CommitRevealed event was emitted
      const filter = clawCommit.filters.CommitRevealed();
      const events = await clawCommit.queryFilter(filter);
      expect(events.length).to.equal(0);
    });

    it("does NOT emit CommitRevealed on failed reveal (wrong committer)", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);

      await expect(
        clawCommit.connect(addr1).revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "OnlyCommitter");

      const filter = clawCommit.filters.CommitRevealed();
      const events = await clawCommit.queryFilter(filter);
      expect(events.length).to.equal(0);
    });

    it("does NOT emit CommitRevealed on failed reveal (already revealed)", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      // Attempt second reveal
      await expect(
        clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE)
      )
        .to.be.revertedWithCustomError(clawCommit, "AlreadyRevealed");

      // Should only have 1 CommitRevealed event (from first reveal)
      const filter = clawCommit.filters.CommitRevealed();
      const events = await clawCommit.queryFilter(filter);
      expect(events.length).to.equal(1);
    });
  });

  describe("Timestamp Verification", function () {
    it("CommitCreated timestamp matches block.timestamp", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      const tx = await clawCommit.commitDecision(hash);
      const receipt = await tx.wait();

      // Get the block for this transaction
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      // Extract event
      const event = receipt!.logs[0];
      const parsedEvent = clawCommit.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });

      // Verify timestamp argument matches block timestamp
      expect(parsedEvent!.args[3]).to.equal(block!.timestamp);
    });

    it("BatchCommitted timestamp matches block.timestamp", async function () {
      const root = keccakText("batch-root-test");
      const manifestHash = keccakText("manifest-test");

      const tx = await clawCommitBatch.commitBatch(root, 5, MODEL_VERSION, manifestHash);
      const receipt = await tx.wait();

      // Get the block for this transaction
      const block = await ethers.provider.getBlock(receipt!.blockNumber);

      // Extract event
      const event = receipt!.logs[0];
      const parsedEvent = clawCommitBatch.interface.parseLog({
        topics: event.topics as string[],
        data: event.data,
      });

      // Verify timestamp argument (last arg, index 6) matches block timestamp
      expect(parsedEvent!.args[6]).to.equal(block!.timestamp);
    });
  });

  describe("Sequential IDs in Events", function () {
    it("emits sequential commitIds (0, 1, 2) for 3 commits", async function () {
      const hash1 = computeDecisionHash("prompt1", "output1", "v1", "nonce1");
      const hash2 = computeDecisionHash("prompt2", "output2", "v2", "nonce2");
      const hash3 = computeDecisionHash("prompt3", "output3", "v3", "nonce3");

      await expect(clawCommit.commitDecision(hash1))
        .to.emit(clawCommit, "CommitCreated")
        .withArgs(0, owner.address, hash1, anyValue);

      await expect(clawCommit.commitDecision(hash2))
        .to.emit(clawCommit, "CommitCreated")
        .withArgs(1, owner.address, hash2, anyValue);

      await expect(clawCommit.commitDecision(hash3))
        .to.emit(clawCommit, "CommitCreated")
        .withArgs(2, owner.address, hash3, anyValue);

      // Verify all events are present with correct IDs
      const filter = clawCommit.filters.CommitCreated();
      const events = await clawCommit.queryFilter(filter);
      expect(events.length).to.equal(3);
      expect(events[0].args[0]).to.equal(0); // commitId
      expect(events[1].args[0]).to.equal(1);
      expect(events[2].args[0]).to.equal(2);
    });

    it("emits sequential batchIds (0, 1, 2) for 3 batch commits", async function () {
      const root1 = keccakText("root1");
      const root2 = keccakText("root2");
      const root3 = keccakText("root3");
      const manifest = keccakText("manifest");

      await expect(clawCommitBatch.commitBatch(root1, 1, "v1", manifest))
        .to.emit(clawCommitBatch, "BatchCommitted")
        .withArgs(0, owner.address, root1, 1, "v1", manifest, anyValue);

      await expect(clawCommitBatch.commitBatch(root2, 2, "v2", manifest))
        .to.emit(clawCommitBatch, "BatchCommitted")
        .withArgs(1, owner.address, root2, 2, "v2", manifest, anyValue);

      await expect(clawCommitBatch.commitBatch(root3, 3, "v3", manifest))
        .to.emit(clawCommitBatch, "BatchCommitted")
        .withArgs(2, owner.address, root3, 3, "v3", manifest, anyValue);

      // Verify all events are present with correct IDs
      const filter = clawCommitBatch.filters.BatchCommitted();
      const events = await clawCommitBatch.queryFilter(filter);
      expect(events.length).to.equal(3);
      expect(events[0].args[0]).to.equal(0); // batchId
      expect(events[1].args[0]).to.equal(1);
      expect(events[2].args[0]).to.equal(2);
    });
  });

  describe("Event Args Match Stored State", function () {
    it("CommitRevealed event args match getCommitment returned values", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);

      const tx = await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      const receipt = await tx.wait();

      // Extract event args
      const event = receipt!.logs.find(
        log => clawCommit.interface.parseLog({ topics: log.topics as string[], data: log.data })?.name === "CommitRevealed"
      );
      const parsedEvent = clawCommit.interface.parseLog({
        topics: event!.topics as string[],
        data: event!.data,
      });

      // Get stored commitment
      const commitment = await clawCommit.getCommitment(0);

      // Verify event args match stored state
      expect(parsedEvent!.args[0]).to.equal(0); // commitId
      expect(parsedEvent!.args[1]).to.equal(commitment.committer);
      expect(parsedEvent!.args[2]).to.equal(commitment.prompt);
      expect(parsedEvent!.args[3]).to.equal(commitment.output);
      expect(parsedEvent!.args[4]).to.equal(commitment.modelVersion);
    });
  });

  describe("Indexed Field Filtering", function () {
    it("filters CommitCreated events by indexed committer address", async function () {
      const hash1 = computeDecisionHash("owner-prompt", "owner-output", "v1", "nonce1");
      const hash2 = computeDecisionHash("addr1-prompt", "addr1-output", "v2", "nonce2");
      const hash3 = computeDecisionHash("owner-prompt2", "owner-output2", "v3", "nonce3");

      // Owner makes 2 commits
      await clawCommit.connect(owner).commitDecision(hash1);
      await clawCommit.connect(owner).commitDecision(hash3);

      // Addr1 makes 1 commit
      await clawCommit.connect(addr1).commitDecision(hash2);

      // Filter for only addr1's commits
      const filter = clawCommit.filters.CommitCreated(null, addr1.address);
      const addr1Events = await clawCommit.queryFilter(filter);

      expect(addr1Events.length).to.equal(1);
      expect(addr1Events[0].args[1]).to.equal(addr1.address); // committer
      expect(addr1Events[0].args[0]).to.equal(2); // commitId should be 2 (third commit overall)

      // Filter for owner's commits
      const ownerFilter = clawCommit.filters.CommitCreated(null, owner.address);
      const ownerEvents = await clawCommit.queryFilter(ownerFilter);

      expect(ownerEvents.length).to.equal(2);
      expect(ownerEvents[0].args[1]).to.equal(owner.address);
      expect(ownerEvents[1].args[1]).to.equal(owner.address);
      expect(ownerEvents[0].args[0]).to.equal(0); // First commit
      expect(ownerEvents[1].args[0]).to.equal(1); // Second commit
    });
  });

  describe("Commit and Reveal Events for Same ID", function () {
    it("emits both CommitCreated and CommitRevealed for commitId 0 with matching committer", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      // Commit
      await clawCommit.commitDecision(hash);

      // Reveal
      await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      // Check CommitCreated event
      const commitFilter = clawCommit.filters.CommitCreated(0);
      const commitEvents = await clawCommit.queryFilter(commitFilter);
      expect(commitEvents.length).to.equal(1);
      expect(commitEvents[0].args[0]).to.equal(0); // commitId
      expect(commitEvents[0].args[1]).to.equal(owner.address); // committer

      // Check CommitRevealed event
      const revealFilter = clawCommit.filters.CommitRevealed(0);
      const revealEvents = await clawCommit.queryFilter(revealFilter);
      expect(revealEvents.length).to.equal(1);
      expect(revealEvents[0].args[0]).to.equal(0); // commitId
      expect(revealEvents[0].args[1]).to.equal(owner.address); // committer

      // Verify both events have the same committer
      expect(commitEvents[0].args[1]).to.equal(revealEvents[0].args[1]);
    });
  });

  describe("No Extra Events Emitted", function () {
    it("single commit produces exactly 1 CommitCreated event", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);

      const tx = await clawCommit.commitDecision(hash);
      const receipt = await tx.wait();

      // Count events
      const commitCreatedEvents = receipt!.logs.filter(log => {
        try {
          const parsed = clawCommit.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "CommitCreated";
        } catch {
          return false;
        }
      });

      expect(commitCreatedEvents.length).to.equal(1);
      expect(receipt!.logs.length).to.equal(1); // Total logs should also be 1
    });

    it("single reveal produces exactly 1 CommitRevealed event", async function () {
      const hash = computeDecisionHash(PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      await clawCommit.commitDecision(hash);

      const tx = await clawCommit.revealDecision(0, PROMPT, OUTPUT, MODEL_VERSION, NONCE);
      const receipt = await tx.wait();

      // Count events
      const revealedEvents = receipt!.logs.filter(log => {
        try {
          const parsed = clawCommit.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "CommitRevealed";
        } catch {
          return false;
        }
      });

      expect(revealedEvents.length).to.equal(1);
      expect(receipt!.logs.length).to.equal(1); // Total logs should also be 1
    });

    it("single batch commit produces exactly 1 BatchCommitted event", async function () {
      const root = keccakText("batch-root");
      const manifest = keccakText("manifest");

      const tx = await clawCommitBatch.commitBatch(root, 3, MODEL_VERSION, manifest);
      const receipt = await tx.wait();

      // Count events
      const batchEvents = receipt!.logs.filter(log => {
        try {
          const parsed = clawCommitBatch.interface.parseLog({ topics: log.topics as string[], data: log.data });
          return parsed?.name === "BatchCommitted";
        } catch {
          return false;
        }
      });

      expect(batchEvents.length).to.equal(1);
      expect(receipt!.logs.length).to.equal(1); // Total logs should also be 1
    });
  });
});
