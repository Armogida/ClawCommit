import { expect } from "chai";
import { buildBasSubmitCall } from "../scripts/integration/basSubmit";

describe("BAS Submit Call Builder", function () {
  const payload = {
    schemaUid: "0x" + "11".repeat(32),
    attestationRequest: {
      recipient: "0x0000000000000000000000000000000000000001",
      expirationTime: "0",
      revocable: true,
      refUID: "0x" + "00".repeat(32),
      data: "0x1234",
      value: "0",
    },
  };

  it("builds nested EAS request format", async function () {
    const call = buildBasSubmitCall({
      payload,
      abiMode: "eas",
    });

    expect(call.abiMode).to.equal("eas");
    expect(call.schemaUid).to.equal(payload.schemaUid);
    expect(call.txValue).to.equal(0n);
    expect((call.request as { schema: string }).schema).to.equal(payload.schemaUid);
  });

  it("builds flat request format", async function () {
    const call = buildBasSubmitCall({
      payload,
      abiMode: "flat",
      valueOverride: "5",
    });

    expect(call.abiMode).to.equal("flat");
    expect(call.txValue).to.equal(5n);
    const request = call.request as { value: bigint };
    expect(request.value).to.equal(5n);
  });

  it("rejects missing schema uid", async function () {
    expect(() =>
      buildBasSubmitCall({
        payload: {
          ...payload,
          schemaUid: "",
        },
        abiMode: "eas",
      })
    ).to.throw("schemaUid must be a 0x-prefixed 32-byte hex value");
  });
});
