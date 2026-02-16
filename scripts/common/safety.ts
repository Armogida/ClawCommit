import { isAddress } from "ethers";

export const BSC_MAINNET_CHAIN_ID = 56n;

const TRUE_VALUES = new Set(["1", "true", "yes", "on"]);
const FALSE_VALUES = new Set(["0", "false", "no", "off"]);
const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;

export function parseBooleanFlag(args: string[], flag: string): boolean {
  const idx = args.indexOf(flag);
  if (idx === -1) {
    return false;
  }

  const maybeValue = args[idx + 1];
  if (!maybeValue || maybeValue.startsWith("--")) {
    return true;
  }

  const normalized = maybeValue.trim().toLowerCase();
  if (TRUE_VALUES.has(normalized)) {
    return true;
  }
  if (FALSE_VALUES.has(normalized)) {
    return false;
  }

  throw new Error(
    `${flag} must be a boolean value. Supported values: true/false, 1/0, yes/no, on/off`
  );
}

export function requireAddress(value: string, label: string): string {
  const normalized = value.trim();
  if (!isAddress(normalized) && !HEX_32_REGEX.test(normalized)) {
    throw new Error(`${label} must be a valid EVM address or 32-byte hex value`);
  }
  return normalized;
}

export function parseNonNegativeBigInt(value: string, label: string): bigint {
  if (!/^\d+$/.test(value)) {
    throw new Error(`${label} must be a non-negative integer`);
  }

  const parsed = BigInt(value);
  if (parsed < 0n) {
    throw new Error(`${label} must be a non-negative integer`);
  }

  return parsed;
}

export function assertMainnetWriteAllowed(
  chainId: bigint,
  allowMainnetWrites: boolean,
  source: string
): void {
  if (chainId === BSC_MAINNET_CHAIN_ID && !allowMainnetWrites) {
    throw new Error(
      `${source} refused write on BSC mainnet. Re-run with --allow-mainnet-writes true to continue.`
    );
  }
}

export function normalizeNonce(nonce: string): string {
  const trimmed = nonce.trim();
  if (!trimmed) {
    throw new Error("nonce must be a non-empty string");
  }
  return trimmed;
}

export function isCanonicalHexNonce(nonce: string): boolean {
  return HEX_32_REGEX.test(nonce);
}

export function formatSensitive(value: string, logSensitive: boolean): string {
  return logSensitive ? value : "[REDACTED]";
}
