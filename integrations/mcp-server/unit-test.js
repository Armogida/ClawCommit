#!/usr/bin/env node

import assert from "assert";
import {
  BSC_MAINNET_CHAIN_ID,
  computeDecisionHash,
  ensureWriteAllowed,
  formatSensitive,
  generateNonce,
  normalizeCommitId,
  requireAddress,
} from "./index.js";

function testAddressValidation() {
  assert.strictEqual(
    requireAddress("0x0000000000000000000000000000000000000001"),
    "0x0000000000000000000000000000000000000001"
  );
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

function main() {
  assert.strictEqual(BSC_MAINNET_CHAIN_ID, 56n);
  testAddressValidation();
  testCommitIdNormalization();
  testNonceAndHash();
  testWriteGuard();
  testRedaction();
  console.log("mcp-server unit tests passed");
}

main();
