import { expect } from "chai";
import {
  assertMainnetWriteAllowed,
  formatSensitive,
  parseBooleanFlag,
  parseNonNegativeBigInt,
  requireAddress,
} from "../scripts/common/safety";

describe("Script Safety Helpers", function () {
  it("parses boolean flags with and without explicit values", async function () {
    expect(parseBooleanFlag(["--log-sensitive"], "--log-sensitive")).to.equal(true);
    expect(
      parseBooleanFlag(["--allow-mainnet-writes", "false"], "--allow-mainnet-writes")
    ).to.equal(false);
    expect(parseBooleanFlag([], "--allow-mainnet-writes")).to.equal(false);
  });

  it("rejects write operations on mainnet by default", async function () {
    expect(() =>
      assertMainnetWriteAllowed(56n, false, "test script")
    ).to.throw("refused write on BSC mainnet");
    expect(() => assertMainnetWriteAllowed(56n, true, "test script")).to.not.throw();
    expect(() => assertMainnetWriteAllowed(97n, false, "test script")).to.not.throw();
  });

  it("redacts sensitive fields by default", async function () {
    expect(formatSensitive("secret", false)).to.equal("[REDACTED]");
    expect(formatSensitive("secret", true)).to.equal("secret");
  });

  it("parses large non-negative bigint identifiers safely", async function () {
    const parsed = parseNonNegativeBigInt(
      "1234567890123456789012345678901234567890",
      "--commit-id"
    );
    expect(parsed.toString()).to.equal("1234567890123456789012345678901234567890");
  });

  it("validates addresses", async function () {
    expect(() =>
      requireAddress("0x0000000000000000000000000000000000000001", "--contract")
    ).to.not.throw();
    expect(() => requireAddress("0x...", "--contract")).to.throw(
      "--contract must be a valid EVM address"
    );
  });
});
