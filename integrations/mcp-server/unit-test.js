#!/usr/bin/env node

import assert from "assert";
import {
  BSC_MAINNET_CHAIN_ID,
  buildOpenClawDecisionPayload,
  computeDecisionHash,
  ensureWriteAllowed,
  formatSensitive,
  generateNonce,
  normalizeCommitId,
  OPENCLAW_PROMPT_TEMPLATE_VERSION,
  requireAddress,
  server,
} from "./index.js";

function testAddressValidation() {
  assert.strictEqual(
    requireAddress("0x0000000000000000000000000000000000000001"),
    "0x0000000000000000000000000000000000000001"
  );
  const hashLocator = "0x" + "11".repeat(32);
  assert.strictEqual(requireAddress(hashLocator), hashLocator);
  assert.throws(() => requireAddress("0x..."), /Invalid contract address/);
}

function testCommitIdNormalization() {
  assert.strictEqual(normalizeCommitId(12).toString(), "12");
  assert.strictEqual(normalizeCommitId("999999999999999999999").toString(), "999999999999999999999");
  assert.throws(() => normalizeCommitId("abc"), /commit_id must be/);
}

function testNonceAndHash() {
  const nonce = generateNonce();
  assert(/^0x[0-9a-fA-F]{64}$/.test(nonce), "nonce should be 32-byte hex");

  const hash1 = computeDecisionHash("p", "o", "m", nonce);
  const hash2 = computeDecisionHash("p", "o", "m", nonce);
  assert.strictEqual(hash1, hash2, "hash should be deterministic");
}

function testWriteGuard() {
  assert.throws(
    () => ensureWriteAllowed("bscMainnet", false),
    /Refusing state-changing operation on BSC mainnet/
  );
  assert.doesNotThrow(() => ensureWriteAllowed("bscMainnet", true));
  assert.doesNotThrow(() => ensureWriteAllowed("bscTestnet", false));
}

function testRedaction() {
  assert.strictEqual(formatSensitive("secret", false), "[REDACTED]");
  assert.strictEqual(formatSensitive("secret", true), "secret");
}

function testOpenClawPayloadDeterminism() {
  const baseInput = {
    model_version: "openclaw-agent-v1",
    context: {
      workflow: "openclaw-pr-validation",
      repository: "Armogida/ClawCommit",
      ref: "refs/pull/42/head",
      sha: "abc123",
      actor: "ci-bot",
    },
    validations: [
      { name: "unit-tests", passed: true, required: true, details: "146 passing" },
      { name: "compile", passed: true, required: true, details: "ok" },
      { name: "lint", passed: false, required: false, details: "warning only" },
    ],
  };

  const payloadA = buildOpenClawDecisionPayload(baseInput);
  const payloadB = buildOpenClawDecisionPayload({
    ...baseInput,
    validations: [...baseInput.validations].reverse(),
  });

  assert.strictEqual(payloadA.promptTemplateVersion, OPENCLAW_PROMPT_TEMPLATE_VERSION);
  assert.strictEqual(payloadA.prompt, payloadB.prompt, "prompt should be deterministic");
  assert.strictEqual(payloadA.promptDigest, payloadB.promptDigest, "digest should be deterministic");
  assert.strictEqual(payloadA.output, "OPENCLAW_APPROVE");
  assert.strictEqual(payloadA.validations[0].name, "compile");
  assert.strictEqual(payloadA.validations[1].name, "lint");
  assert.strictEqual(payloadA.validations[2].name, "unit-tests");

  const rejectPayload = buildOpenClawDecisionPayload({
    ...baseInput,
    validations: [{ name: "compile", passed: false, required: true, details: "failed" }],
  });
  assert.strictEqual(rejectPayload.output, "OPENCLAW_REJECT");
  assert.strictEqual(rejectPayload.requiredFailureCount, 1);
}

async function invokeTool(toolName, args) {
  const tool = server._registeredTools[toolName];
  if (!tool) {
    throw new Error(`MCP tool not found: ${toolName}`);
  }
  const validatedArgs = await server.validateToolInput(tool, args, toolName);
  return await server.executeToolHandler(tool, validatedArgs, {});
}

async function testOpenClawToolGuards() {
  const baseInput = {
    model_version: "openclaw-agent-v1",
    context: {
      workflow: "openclaw-pr-validation",
      repository: "Armogida/ClawCommit",
    },
    validations: [{ name: "compile", passed: true, required: true, details: "ok" }],
  };

  const buildResult = await invokeTool("clawcommit_openclaw_build_payload", {
    ...baseInput,
    log_sensitive: false,
  });
  const buildPayload = JSON.parse(buildResult.content[0].text);
  assert.strictEqual(buildPayload.success, true);
  assert.strictEqual(buildPayload.prompt, "[REDACTED]");
  assert.strictEqual(buildPayload.output, "OPENCLAW_APPROVE");

  const guardedCommit = await invokeTool("clawcommit_openclaw_commit", {
    ...baseInput,
    contract_address: "0x0000000000000000000000000000000000000001",
    network: "bscTestnet",
    allow_mainnet_writes: false,
    log_sensitive: false,
  });
  const guardedPayload = JSON.parse(guardedCommit.content[0].text);
  assert.strictEqual(guardedCommit.isError, true);
  assert.strictEqual(guardedPayload.success, false);
  assert.match(
    guardedPayload.error,
    /Auto-generated nonce would be redacted/,
    "OpenClaw commit should enforce nonce when sensitive logs are disabled"
  );
}

async function testGeminiTooling() {
  const buildResult = await invokeTool("clawcommit_openclaw_gemini_build_payload", {
    prompt: "Review PR #9",
    output: "OPENCLAW_APPROVE",
    model_version: "gemini-1.5-pro",
    generation_config: {
      temperature: 0.2,
      topP: 0.95,
      candidateCount: 2,
      stopSequences: ["END_REVIEW"],
      safetySettings: [
        {
          category: "HARM_CATEGORY_DANGEROUS_CONTENT",
          threshold: "BLOCK_MEDIUM_AND_ABOVE",
        },
      ],
    },
    nonce: "0x" + "11".repeat(32),
    log_sensitive: true,
  });
  const buildPayload = JSON.parse(buildResult.content[0].text);
  assert.strictEqual(buildPayload.success, true);
  assert.strictEqual(buildPayload.modelVersion, "gemini-1.5-pro");
  assert.strictEqual(buildPayload.generationConfig.candidateCount, 2);
  assert.match(buildPayload.prompt, /openclaw\.gemini\.template=/);
  assert.strictEqual(
    buildPayload.expandedAlgorithm,
    "keccak256(abi.encode(prompt, output, modelVersion, nonce, temperature, topP))"
  );

  const guardedCommit = await invokeTool("clawcommit_openclaw_gemini_commit", {
    prompt: "Review PR #10",
    output: "OPENCLAW_APPROVE",
    model_version: "gemini-1.5-pro",
    contract_address: "0x0000000000000000000000000000000000000001",
    network: "bscTestnet",
    allow_mainnet_writes: false,
    log_sensitive: false,
  });
  const guardedPayload = JSON.parse(guardedCommit.content[0].text);
  assert.strictEqual(guardedCommit.isError, true);
  assert.strictEqual(guardedPayload.success, false);
  assert.match(
    guardedPayload.error,
    /Auto-generated nonce would be redacted/,
    "Gemini commit should enforce nonce when sensitive logs are disabled"
  );
}

async function main() {
  assert.strictEqual(BSC_MAINNET_CHAIN_ID, 56n);
  testAddressValidation();
  testCommitIdNormalization();
  testNonceAndHash();
  testWriteGuard();
  testRedaction();
  testOpenClawPayloadDeterminism();
  await testOpenClawToolGuards();
  await testGeminiTooling();
  console.log("mcp-server unit tests passed");
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
