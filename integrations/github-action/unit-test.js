#!/usr/bin/env node

const assert = require("assert");
const core = require("@actions/core");
const action = require("./index.js");

function withCoreMocks(run) {
  const originalInfo = core.info;
  const originalSetOutput = core.setOutput;
  const originalDebug = core.debug;

  const logs = [];
  const outputs = {};

  core.info = (message) => logs.push(String(message));
  core.setOutput = (key, value) => {
    outputs[key] = String(value);
  };
  core.debug = () => {};

  return run({ logs, outputs }).finally(() => {
    core.info = originalInfo;
    core.setOutput = originalSetOutput;
    core.debug = originalDebug;
  });
}

async function testBooleanParsing() {
  assert.strictEqual(action.parseBooleanInput("true", "x"), true);
  assert.strictEqual(action.parseBooleanInput("1", "x"), true);
  assert.strictEqual(action.parseBooleanInput("false", "x"), false);
  assert.strictEqual(action.parseBooleanInput("", "x"), false);
}

async function testCommitIdParsing() {
  assert.strictEqual(action.parseCommitId("0", true), 0n);
  assert.strictEqual(
    action.parseCommitId("123456789012345678901234567890", true).toString(),
    "123456789012345678901234567890"
  );
  assert.throws(() => action.parseCommitId("abc", true), /non-negative integer/);
}

async function testMainnetGuard() {
  await assert.rejects(
    async () => {
      await action.assertWriteNetworkSafety(
        {
          async getNetwork() {
            return { chainId: 56n };
          },
        },
        false
      );
    },
    /Refusing state-changing operation/
  );

  await action.assertWriteNetworkSafety(
    {
      async getNetwork() {
        return { chainId: 97n };
      },
    },
    false
  );
}

async function testCommitRedaction() {
  const prompt = "sensitive prompt";
  const output = "sensitive output";
  const nonce = "0x" + "11".repeat(32);

  const contract = {
    async commitDecision() {
      return {
        hash: "0xcommit",
        async wait() {
          return {
            blockNumber: 123,
            logs: [{ topics: [], data: "0x" }],
          };
        },
      };
    },
    interface: {
      parseLog() {
        return { name: "CommitCreated", args: { commitId: 9n } };
      },
    },
  };

  await withCoreMocks(async ({ logs, outputs }) => {
    await action.commitAction(contract, prompt, output, "model-v1", nonce, {
      logSensitive: false,
    });

    const joined = logs.join("\n");
    assert(!joined.includes(prompt), "prompt leaked to logs");
    assert(!joined.includes(output), "output leaked to logs");
    assert(!joined.includes(nonce), "nonce leaked to logs");
    assert.strictEqual(outputs["commit-id"], "9");
    assert.strictEqual(outputs.hash.startsWith("0x"), true);
    assert.strictEqual(outputs.nonce, nonce);
  });

  await withCoreMocks(async ({ logs }) => {
    await action.commitAction(contract, prompt, output, "model-v1", nonce, {
      logSensitive: true,
    });
    const joined = logs.join("\n");
    assert(joined.includes(prompt), "prompt not present when sensitive logging enabled");
    assert(joined.includes(output), "output not present when sensitive logging enabled");
    assert(joined.includes(nonce), "nonce not present when sensitive logging enabled");
  });
}

async function testVerifyRedaction() {
  const commitment = {
    hash: "0x" + "ab".repeat(32),
    revealed: true,
    prompt: "verify prompt",
    output: "verify output",
    modelVersion: "model-v2",
    nonce: "0x" + "22".repeat(32),
  };

  const contract = {
    async getCommitment() {
      return commitment;
    },
    async verifyReplay() {
      return true;
    },
  };

  await withCoreMocks(async ({ logs }) => {
    await action.verifyAction(contract, 1n, { logSensitive: false });
    const joined = logs.join("\n");
    assert(!joined.includes(commitment.prompt), "verify prompt leaked");
    assert(!joined.includes(commitment.output), "verify output leaked");
    assert(!joined.includes(commitment.nonce), "verify nonce leaked");
  });
}

async function main() {
  await testBooleanParsing();
  await testCommitIdParsing();
  await testMainnetGuard();
  await testCommitRedaction();
  await testVerifyRedaction();
  console.log("github-action unit tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
