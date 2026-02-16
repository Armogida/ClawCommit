import { writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { Contract, Interface, JsonRpcProvider, getAddress, isAddress } from "ethers";
import {
  BAS_DECISION_SCHEMA_NAME,
  encodeBasDecisionClaim,
} from "./bas";
import { parseNonNegativeBigInt } from "../common/safety";

const CLAWCOMMIT_ABI = [
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))",
  "function verifyReplay(uint256 _commitId) external view returns (bool)",
] as const;

const REVEAL_ABI = [
  "function revealDecision(uint256 _commitId, string _prompt, string _output, string _modelVersion, string _nonce)",
] as const;

const HEX_32_REGEX = /^0x[0-9a-fA-F]{64}$/;

interface Args {
  contract: string;
  commitId: bigint;
  revealTx: string;
  network: string;
  rpcUrl: string;
  verifier?: string;
  recipient?: string;
  schemaUid?: string;
  metadataUri: string;
  out?: string;
  verifiedAt?: string;
}

function usage(): string {
  return [
    "Usage:",
    "  npx ts-node scripts/integration/buildBasAttestation.ts \\",
    "    --contract <CLAWCOMMIT_ADDRESS> \\",
    "    --commit-id <COMMIT_ID> \\",
    "    --reveal-tx <REVEAL_TX_HASH> \\",
    "    [--network <bsc|bscMainnet|bscTestnet|localhost>] \\",
    "    [--rpc <RPC_URL>] \\",
    "    [--verifier <EVM_ADDRESS>] \\",
    "    [--recipient <EVM_ADDRESS>] \\",
    "    [--schema-uid <0xBYTES32>] \\",
    "    [--metadata-uri <URI>] \\",
    "    [--verified-at <UNIX_SECONDS>] \\",
    "    [--out <OUTPUT_JSON>]",
    "",
    "Produces a BAS-compatible attestation payload for ClawCommit commitment verification.",
    "This script is ABI-agnostic for BAS submission and emits encoded attestation data.",
  ].join("\n");
}

function normalizeAddress(value: string, label: string): string {
  const normalized = String(value || "").trim();
  if (!isAddress(normalized)) {
    throw new Error(`${label} must be a valid EVM address`);
  }
  return getAddress(normalized);
}

function parseArgs(argv: string[]): Args {
  let contract = "";
  let commitId: bigint | undefined;
  let revealTx = "";
  let network = "bscTestnet";
  let rpcUrl = "";
  let verifier: string | undefined;
  let recipient: string | undefined;
  let schemaUid: string | undefined;
  let metadataUri = "";
  let out: string | undefined;
  let verifiedAt: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--contract" && argv[i + 1]) {
      contract = normalizeAddress(argv[++i], "--contract");
    } else if (arg === "--commit-id" && argv[i + 1]) {
      commitId = parseNonNegativeBigInt(argv[++i], "--commit-id");
    } else if (arg === "--reveal-tx" && argv[i + 1]) {
      revealTx = argv[++i];
    } else if (arg === "--network" && argv[i + 1]) {
      network = argv[++i];
    } else if (arg === "--rpc" && argv[i + 1]) {
      rpcUrl = argv[++i];
    } else if (arg === "--verifier" && argv[i + 1]) {
      verifier = normalizeAddress(argv[++i], "--verifier");
    } else if (arg === "--recipient" && argv[i + 1]) {
      recipient = normalizeAddress(argv[++i], "--recipient");
    } else if (arg === "--schema-uid" && argv[i + 1]) {
      schemaUid = argv[++i];
    } else if (arg === "--metadata-uri" && argv[i + 1]) {
      metadataUri = argv[++i];
    } else if (arg === "--out" && argv[i + 1]) {
      out = argv[++i];
    } else if (arg === "--verified-at" && argv[i + 1]) {
      verifiedAt = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!contract || commitId === undefined || !revealTx) {
    throw new Error(`Missing required arguments.\n\n${usage()}`);
  }
  if (!HEX_32_REGEX.test(revealTx)) {
    throw new Error("--reveal-tx must be a 0x-prefixed 32-byte transaction hash");
  }
  if (schemaUid && !HEX_32_REGEX.test(schemaUid)) {
    throw new Error("--schema-uid must be a 0x-prefixed 32-byte value");
  }

  const networkRpc: Record<string, string> = {
    localhost: "http://127.0.0.1:8545/",
    bsc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
    bscMainnet: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
    bscTestnet:
      process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
  };

  return {
    contract,
    commitId,
    revealTx,
    network,
    rpcUrl: rpcUrl || networkRpc[network] || networkRpc.bsc,
    verifier,
    recipient,
    schemaUid,
    metadataUri,
    out,
    verifiedAt,
  };
}

function toIsoFromUnixSeconds(value: bigint): string {
  return new Date(Number(value) * 1000).toISOString();
}

function getExplorerBase(network: string): string {
  if (network === "bsc" || network === "bscMainnet") {
    return "https://bscscan.com";
  }
  if (network === "bscTestnet") {
    return "https://testnet.bscscan.com";
  }
  return "";
}

function serializeBigints<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (_key, item) => (typeof item === "bigint" ? item.toString() : item))
  ) as T;
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const provider = new JsonRpcProvider(args.rpcUrl);

  const revealTx = await provider.getTransaction(args.revealTx);
  if (!revealTx) {
    throw new Error(`Reveal transaction not found: ${args.revealTx}`);
  }
  if (!revealTx.to) {
    throw new Error(`Reveal transaction has no target contract: ${args.revealTx}`);
  }
  if (revealTx.to.toLowerCase() !== args.contract.toLowerCase()) {
    throw new Error(
      [
        "Reveal transaction target mismatch",
        `Expected contract: ${args.contract}`,
        `Transaction to:    ${revealTx.to}`,
      ].join("\n")
    );
  }

  const revealReceipt = await provider.getTransactionReceipt(args.revealTx);
  if (!revealReceipt || revealReceipt.status !== 1) {
    throw new Error(`Reveal transaction failed onchain: ${args.revealTx}`);
  }

  const iface = new Interface(REVEAL_ABI);
  const fn = iface.getFunction("revealDecision");
  if (!fn || !revealTx.data.startsWith(fn.selector)) {
    throw new Error("Reveal transaction is not revealDecision()");
  }
  const decoded = iface.decodeFunctionData(fn, revealTx.data);
  const txCommitId = decoded[0] as bigint;
  if (txCommitId !== args.commitId) {
    throw new Error(
      [
        "Commit ID mismatch between --commit-id and reveal tx payload",
        `--commit-id: ${args.commitId.toString()}`,
        `tx commitId: ${txCommitId.toString()}`,
      ].join("\n")
    );
  }

  const contract = new Contract(args.contract, CLAWCOMMIT_ABI, provider);
  const commitment = await contract.getCommitment(args.commitId);
  if (!commitment.revealed) {
    throw new Error(`Commitment ${args.commitId.toString()} is not revealed`);
  }

  const replayVerified = await contract.verifyReplay(args.commitId);
  const verifiedAt = args.verifiedAt || Math.floor(Date.now() / 1000).toString();
  const verifier = args.verifier || commitment.committer;
  const recipient = args.recipient || commitment.committer;
  const encoded = encodeBasDecisionClaim({
    clawContract: args.contract,
    commitId: args.commitId,
    commitmentHash: commitment.hash,
    revealTxHash: args.revealTx,
    modelVersion: commitment.modelVersion,
    replayVerified: Boolean(replayVerified),
    verifier,
    metadataURI: args.metadataUri,
    verifiedAt,
  });

  const explorerBase = getExplorerBase(args.network);

  const output = {
    success: true,
    network: args.network,
    rpcUrl: args.rpcUrl,
    schemaName: BAS_DECISION_SCHEMA_NAME,
    schemaHash: encoded.schemaHash,
    schemaUid: args.schemaUid || null,
    note:
      "Submit attestationRequest.data to BAS attest() using your BAS SDK/contract and schema UID. BAS contract ABIs can vary, so this script stays BAS ABI-agnostic.",
    references: {
      contractAddress: args.contract,
      commitId: args.commitId.toString(),
      commitmentHash: commitment.hash,
      revealTxHash: args.revealTx,
      modelVersion: commitment.modelVersion,
      committer: commitment.committer,
      revealedAt: toIsoFromUnixSeconds(BigInt(commitment.timestamp)),
      replayVerified: Boolean(replayVerified),
      contractExplorer: explorerBase ? `${explorerBase}/address/${args.contract}` : "",
      revealTxExplorer: explorerBase ? `${explorerBase}/tx/${args.revealTx}` : "",
    },
    claimDigest: encoded.claimDigest,
    claim: {
      ...encoded.claim,
      verifiedAtISO: toIsoFromUnixSeconds(encoded.claim.verifiedAt),
    },
    attestationRequest: {
      recipient,
      expirationTime: 0,
      revocable: true,
      refUID: "0x0000000000000000000000000000000000000000000000000000000000000000",
      data: encoded.encodedData,
      value: "0",
    },
  };

  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(serializeBigints(output), null, 2)}\n`, "utf8");
    console.log(`BAS attestation payload written: ${outPath}`);
  }

  console.log(JSON.stringify(serializeBigints(output), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
