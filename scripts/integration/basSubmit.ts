import { getAddress, isAddress } from "ethers";

const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const HEX_REGEX = /^0x[0-9a-fA-F]*$/;
const UINT64_MAX = 18446744073709551615n;

export type BasAbiMode = "eas" | "flat";

export interface BasAttestationRequestLike {
  recipient: string;
  expirationTime: bigint | number | string;
  revocable: boolean;
  refUID: string;
  data: string;
  value: bigint | number | string;
}

export interface BasPayloadLike {
  schemaUid?: string | null;
  attestationRequest: BasAttestationRequestLike;
}

export interface NormalizedBasAttestationRequest {
  recipient: string;
  expirationTime: bigint;
  revocable: boolean;
  refUID: string;
  data: string;
  value: bigint;
}

export interface BasSubmitCall {
  abiMode: BasAbiMode;
  schemaUid: string;
  request:
    | {
        schema: string;
        data: {
          recipient: string;
          expirationTime: bigint;
          revocable: boolean;
          refUID: string;
          data: string;
          value: bigint;
        };
      }
    | {
        schema: string;
        recipient: string;
        expirationTime: bigint;
        revocable: boolean;
        refUID: string;
        data: string;
        value: bigint;
      };
  txValue: bigint;
}

function parseNonNegativeBigInt(value: bigint | number | string, label: string): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error(`${label} must be non-negative`);
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${label} must be a non-negative safe integer`);
    }
    return BigInt(value);
  }
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`${label} must be a non-negative integer`);
  }
  return BigInt(normalized);
}

function normalizeAddress(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!isAddress(normalized)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
  return getAddress(normalized);
}

function normalizeBytes32(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!HEX_32_REGEX.test(normalized)) {
    throw new Error(`${label} must be a 0x-prefixed 32-byte hex value`);
  }
  return normalized;
}

function normalizeHexData(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!normalized || !HEX_REGEX.test(normalized) || normalized.length % 2 !== 0) {
    throw new Error(`${label} must be a valid 0x-prefixed hex string`);
  }
  return normalized;
}

export function normalizeBasAttestationRequest(
  request: BasAttestationRequestLike
): NormalizedBasAttestationRequest {
  const expirationTime = parseNonNegativeBigInt(request.expirationTime, "expirationTime");
  if (expirationTime > UINT64_MAX) {
    throw new Error("expirationTime exceeds uint64 max");
  }

  return {
    recipient: normalizeAddress(request.recipient, "recipient"),
    expirationTime,
    revocable: Boolean(request.revocable),
    refUID: normalizeBytes32(request.refUID, "refUID"),
    data: normalizeHexData(request.data, "data"),
    value: parseNonNegativeBigInt(request.value, "value"),
  };
}

export function buildBasSubmitCall(params: {
  payload: BasPayloadLike;
  abiMode: BasAbiMode;
  schemaUidOverride?: string;
  recipientOverride?: string;
  valueOverride?: bigint | number | string;
}): BasSubmitCall {
  const { payload, abiMode, schemaUidOverride, recipientOverride, valueOverride } = params;
  if (!payload || typeof payload !== "object" || !payload.attestationRequest) {
    throw new Error("payload must include attestationRequest");
  }

  const schemaUid = normalizeBytes32(
    String(schemaUidOverride || payload.schemaUid || "").trim(),
    "schemaUid"
  );
  const normalized = normalizeBasAttestationRequest(payload.attestationRequest);

  const recipient = recipientOverride
    ? normalizeAddress(recipientOverride, "recipientOverride")
    : normalized.recipient;
  const txValue =
    valueOverride === undefined
      ? normalized.value
      : parseNonNegativeBigInt(valueOverride, "valueOverride");

  if (abiMode === "eas") {
    return {
      abiMode,
      schemaUid,
      request: {
        schema: schemaUid,
        data: {
          recipient,
          expirationTime: normalized.expirationTime,
          revocable: normalized.revocable,
          refUID: normalized.refUID,
          data: normalized.data,
          value: txValue,
        },
      },
      txValue,
    };
  }

  return {
    abiMode,
    schemaUid,
    request: {
      schema: schemaUid,
      recipient,
      expirationTime: normalized.expirationTime,
      revocable: normalized.revocable,
      refUID: normalized.refUID,
      data: normalized.data,
      value: txValue,
    },
    txValue,
  };
}
