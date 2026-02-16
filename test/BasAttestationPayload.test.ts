import { expect } from "chai";
import {
  BAS_DECISION_SCHEMA_HASH,
  BAS_DECISION_SCHEMA_NAME,
  encodeBasDecisionClaim,
} from "../scripts/integration/bas";

describe("BAS Attestation Payload", function () {
  const baseInput = {
    clawContract: "0x0000000000000000000000000000000000000001",
    commitId: 42n,
    commitmentHash: "0x" + "11".repeat(32),
    revealTxHash: "0x" + "22".repeat(32),
    modelVersion: "clawcommit-v2-test",
    replayVerified: true,
    verifier: "0x0000000000000000000000000000000000000002",
    metadataURI: "ipfs://clawcommit/bas-demo",
    verifiedAt: 1735689600n,
  };

  it("encodes deterministic BAS-compatible claim data", async function () {
    const encodedA = encodeBasDecisionClaim(baseInput);
    const encodedB = encodeBasDecisionClaim(baseInput);

    expect(encodedA.schemaName).to.equal(BAS_DECISION_SCHEMA_NAME);
    expect(encodedA.schemaHash).to.equal(BAS_DECISION_SCHEMA_HASH);
    expect(encodedA.encodedData).to.equal(encodedB.encodedData);
    expect(encodedA.claimDigest).to.equal(encodedB.claimDigest);
    expect(encodedA.claim.commitId).to.equal(42n);
    expect(encodedA.claim.replayVerified).to.equal(true);
  });

  it("changes claim digest when attestation-critical fields change", async function () {
    const encodedA = encodeBasDecisionClaim(baseInput);
    const encodedB = encodeBasDecisionClaim({
      ...baseInput,
      revealTxHash: "0x" + "33".repeat(32),
    });

    expect(encodedA.claimDigest).to.not.equal(encodedB.claimDigest);
  });

  it("rejects invalid bytes32 fields", async function () {
    expect(() =>
      encodeBasDecisionClaim({
        ...baseInput,
        revealTxHash: "0x1234",
      })
    ).to.throw("revealTxHash must be a 0x-prefixed 32-byte hex value");
  });
});
