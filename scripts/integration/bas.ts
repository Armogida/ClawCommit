import { AbiCoder, getAddress, isAddress, keccak256, toUtf8Bytes } from "ethers";

const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;
const MAX_UINT64 = 18446744073709551615n;

export const BAS_DECISION_SCHEMA_NAME = "AI_DECISION_VERIFIED_V1";
export const BAS_DECISION_SCHEMA_HASH = keccak256(toUtf8Bytes(BAS_DECISION_SCHEMA_NAME));

export interface BasDecisionClaimInput {
  clawContract: string;
  commitId: bigint | number | string;
  commitmentHash: string;
  revealTxHash: string;
  modelVersion: string;
  replayVerified: boolean;
  verifier: string;
  metadataURI?: string;
  verifiedAt?: bigint | number | string;
}

export interface BasDecisionClaim {
  clawContract: string;
  commitId: bigint;
  commitmentHash: string;
  revealTxHash: string;
  modelVersion: string;
  replayVerified: boolean;
  verifier: string;
  metadataURI: string;
  verifiedAt: bigint;
}

export interface BasEncodedDecisionClaim {
  schemaName: string;
  schemaHash: string;
  claim: BasDecisionClaim;
  encodedData: string;
  claimDigest: string;
}

function normalizeAddress(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!isAddress(normalized)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
  return getAddress(normalized);
}

function normalizeHex32(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!HEX_32_REGEX.test(normalized)) {
    throw new Error(`${label} must be a 0x-prefixed 32-byte hex value`);
  }
  return normalized;
}

function normalizeNonEmptyText(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

function normalizeCommitId(value: BasDecisionClaimInput["commitId"]): bigint {
  if (typeof value === "bigint") {
    if (value < 0n) {
      throw new Error("commitId must be non-negative");
    }
    return value;
  }
  if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("commitId must be a non-negative safe integer");
    }
    return BigInt(value);
  }
  const normalized = String(value || "").trim();
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`commitId must be a non-negative integer. Received: ${value}`);
  }
  return BigInt(normalized);
}

function normalizeVerifiedAt(value?: BasDecisionClaimInput["verifiedAt"]): bigint {
  if (value === undefined || value === null || value === "") {
    return BigInt(Math.floor(Date.now() / 1000));
  }

  let parsed: bigint;
  if (typeof value === "bigint") {
    parsed = value;
  } else if (typeof value === "number") {
    if (!Number.isSafeInteger(value) || value < 0) {
      throw new Error("verifiedAt must be a non-negative safe integer");
    }
    parsed = BigInt(value);
  } else {
    const normalized = String(value).trim();
    if (!/^\d+$/.test(normalized)) {
      throw new Error(`verifiedAt must be a non-negative integer. Received: ${value}`);
    }
    parsed = BigInt(normalized);
  }

  if (parsed > MAX_UINT64) {
    throw new Error("verifiedAt exceeds uint64 max");
  }
  return parsed;
}

export function normalizeBasDecisionClaim(input: BasDecisionClaimInput): BasDecisionClaim {
  return {
    clawContract: normalizeAddress(input.clawContract, "clawContract"),
    commitId: normalizeCommitId(input.commitId),
    commitmentHash: normalizeHex32(input.commitmentHash, "commitmentHash"),
    revealTxHash: normalizeHex32(input.revealTxHash, "revealTxHash"),
    modelVersion: normalizeNonEmptyText(input.modelVersion, "modelVersion"),
    replayVerified: Boolean(input.replayVerified),
    verifier: normalizeAddress(input.verifier, "verifier"),
    metadataURI: String(input.metadataURI || "").trim(),
    verifiedAt: normalizeVerifiedAt(input.verifiedAt),
  };
}

export function encodeBasDecisionClaim(input: BasDecisionClaimInput): BasEncodedDecisionClaim {
  const claim = normalizeBasDecisionClaim(input);
  const encodedData = AbiCoder.defaultAbiCoder().encode(
    [
      "bytes32",
      "address",
      "uint256",
      "bytes32",
      "bytes32",
      "string",
      "bool",
      "uint64",
      "address",
      "string",
    ],
    [
      BAS_DECISION_SCHEMA_HASH,
      claim.clawContract,
      claim.commitId,
      claim.commitmentHash,
      claim.revealTxHash,
      claim.modelVersion,
      claim.replayVerified,
      claim.verifiedAt,
      claim.verifier,
      claim.metadataURI,
    ]
  );

  return {
    schemaName: BAS_DECISION_SCHEMA_NAME,
    schemaHash: BAS_DECISION_SCHEMA_HASH,
    claim,
    encodedData,
    claimDigest: keccak256(encodedData),
  };
}
