import { ethers } from "ethers";
import type { DecisionPayload } from "@/lib/types";

const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;

function asNonEmptyString(value: unknown, label: string): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) {
    throw new Error(`${label} is required`);
  }
  return normalized;
}

export function parseDecisionPayload(input: unknown): DecisionPayload {
  if (!input || typeof input !== "object") {
    throw new Error("payload is required");
  }

  const source = input as Record<string, unknown>;
  const prompt = asNonEmptyString(source.prompt, "prompt");
  const output = asNonEmptyString(source.output, "output");
  const modelVersion = asNonEmptyString(source.modelVersion, "modelVersion");
  const nonce = asNonEmptyString(source.nonce, "nonce");

  if (!HEX_32_REGEX.test(nonce)) {
    throw new Error("nonce must be a 32-byte hex string (0x + 64 hex chars)");
  }

  return {
    prompt,
    output,
    modelVersion,
    nonce,
  };
}

export function parseCommitId(value: unknown): string {
  const commitId = asNonEmptyString(value, "commitId");
  if (!/^\d+$/.test(commitId)) {
    throw new Error("commitId must be a non-negative integer string");
  }
  return commitId;
}

export function parseOptionalToken(value: string | null): string | undefined {
  const token = String(value || "").trim();
  return token || undefined;
}

export function normalizeOwner(value: string | null): string {
  return asNonEmptyString(value, "owner");
}

export function normalizeRepo(value: string | null): string {
  return asNonEmptyString(value, "repo");
}

export function normalizePullNumber(value: string | null): number {
  const normalized = asNonEmptyString(value, "pr");
  const parsed = Number(normalized);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error("pr must be a positive integer");
  }
  return parsed;
}

export function normalizeModelVersion(value: string | null, fallback: string): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function normalizeOutput(value: string | null, fallback: string): string {
  const normalized = String(value || "").trim();
  return normalized || fallback;
}

export function requireContractAddress(value: string): string {
  if (!ethers.isAddress(value)) {
    throw new Error("Contract must be a valid 42-character EVM address");
  }
  return value;
}
