import { ClawCommit } from "@clawcommit/sdk";
import { ethers } from "ethers";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return fallback;
}

function requireEvmAddress(value: string, label: string): string {
  if (!ethers.isAddress(value)) {
    throw new Error(`${label} must be a valid 42-character EVM address`);
  }
  return value;
}

export function buildExplorerTxUrl(txHash: string): string | undefined {
  const base = process.env.MIDL_EXPLORER_BASE_URL?.trim();
  if (!base) {
    return undefined;
  }
  return `${base.replace(/\/$/, "")}/tx/${txHash}`;
}

export function getClawCommitClient(): ClawCommit {
  const contractAddress = requireEvmAddress(
    requiredEnv("CLAWCOMMIT_CONTRACT_ADDRESS"),
    "CLAWCOMMIT_CONTRACT_ADDRESS"
  );

  return new ClawCommit({
    contractAddress,
    rpcUrl: requiredEnv("MIDL_RPC_URL"),
    privateKey: requiredEnv("DEPLOYER_PRIVATE_KEY"),
    allowMainnetWrites: parseBoolean(process.env.ALLOW_MAINNET_WRITES, false),
  });
}
