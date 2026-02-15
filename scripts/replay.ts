import { AbiCoder, Contract, Interface, JsonRpcProvider, Provider, keccak256 } from "ethers";

const DEFAULT_BSC_RPC = "https://bsc-dataseed.binance.org/";

const CLAW_COMMIT_ABI = [
  "function revealDecision(uint256 commitId,string prompt,string output,string modelVersion,string nonce)",
  "function getCommitment(uint256 commitId) view returns ((bytes32 hash,uint256 timestamp,address committer,bool revealed,string prompt,string output,string modelVersion,string nonce))",
] as const;

export interface ReplayArgs {
  txHash: string;
  rpcUrl: string;
}

export interface DecodedRevealData {
  commitId: bigint;
  prompt: string;
  output: string;
  modelVersion: string;
  nonce: string;
}

export interface ReplayVerificationResult {
  contractAddress: string;
  commitId: bigint;
  recomputedHash: string;
  storedHash: string;
  decodedReveal: DecodedRevealData;
}

export interface ReplayVerificationOptions {
  rpcUrl?: string;
  provider?: Provider;
}

export function computeDecisionHash(
  prompt: string,
  output: string,
  modelVersion: string,
  nonce: string
): string {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );

  return keccak256(encoded);
}

export function decodeRevealTransactionData(data: string): DecodedRevealData {
  const iface = new Interface(CLAW_COMMIT_ABI);
  const revealFragment = iface.getFunction("revealDecision");
  if (!revealFragment) {
    throw new Error("Replay ABI missing revealDecision definition");
  }

  if (!data.startsWith(revealFragment.selector)) {
    throw new Error("Transaction is not revealDecision(): wrong function selector");
  }

  const decoded = iface.decodeFunctionData(revealFragment, data);

  return {
    commitId: decoded[0] as bigint,
    prompt: decoded[1] as string,
    output: decoded[2] as string,
    modelVersion: decoded[3] as string,
    nonce: decoded[4] as string,
  };
}

export function parseArgs(argv: string[]): ReplayArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const txHash = get("--tx");
  const rpcUrl = get("--rpc") || process.env.BSC_RPC_URL || DEFAULT_BSC_RPC;

  if (!txHash) {
    throw new Error(
      "Usage: npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH> [--rpc <RPC_URL>]"
    );
  }

  return { txHash, rpcUrl };
}

export async function verifyRevealTransaction(
  txHash: string,
  options?: ReplayVerificationOptions
): Promise<ReplayVerificationResult> {
  const provider =
    options?.provider ||
    new JsonRpcProvider(
      options?.rpcUrl || process.env.BSC_RPC_URL || DEFAULT_BSC_RPC
    );

  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    throw new Error(`Transaction not found: ${txHash}`);
  }

  if (!tx.to) {
    throw new Error(`Transaction has no target contract address: ${txHash}`);
  }

  const receipt = await provider.getTransactionReceipt(txHash);
  if (!receipt) {
    throw new Error(`Transaction receipt not found: ${txHash}`);
  }

  if (receipt.status !== 1) {
    throw new Error(`Reveal transaction failed onchain: ${txHash}`);
  }

  const decoded = decodeRevealTransactionData(tx.data);

  const contract = new Contract(tx.to, CLAW_COMMIT_ABI, provider);
  const commitment = await contract.getCommitment(decoded.commitId);

  if (!commitment.revealed) {
    throw new Error(
      `Commitment ${decoded.commitId.toString()} is not revealed; replay cannot be verified`
    );
  }

  const recomputedHash = computeDecisionHash(
    decoded.prompt,
    decoded.output,
    decoded.modelVersion,
    decoded.nonce
  );

  const storedHash = commitment.hash as string;

  if (recomputedHash !== storedHash) {
    throw new Error(
      [
        "Deterministic replay failed: hash mismatch",
        `Recomputed: ${recomputedHash}`,
        `Onchain:    ${storedHash}`,
      ].join("\n")
    );
  }

  return {
    contractAddress: tx.to,
    commitId: decoded.commitId,
    recomputedHash,
    storedHash,
    decodedReveal: decoded,
  };
}

async function main(): Promise<void> {
  const { txHash, rpcUrl } = parseArgs(process.argv.slice(2));
  const result = await verifyRevealTransaction(txHash, { rpcUrl });

  console.log(`Contract: ${result.contractAddress}`);
  console.log(`Commit ID: ${result.commitId.toString()}`);
  console.log(`Reveal Tx: ${txHash}`);
  console.log("✓ Deterministic Replay Verified");
  console.log("Commit hash matches reveal.");
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error("Replay verification failed.");
      console.error(error.message || error);
      process.exit(1);
    });
}
