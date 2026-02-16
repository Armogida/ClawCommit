import { readFileSync, writeFileSync, mkdirSync } from "fs";
import { dirname, resolve } from "path";
import { Contract, Interface, JsonRpcProvider, Wallet, formatEther, isAddress } from "ethers";
import { assertMainnetWriteAllowed } from "../common/safety";
import { BasAbiMode, buildBasSubmitCall } from "./basSubmit";

const EAS_ABI = [
  "function attest((bytes32 schema,(address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) data) request) external payable returns (bytes32)",
  "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
] as const;

const FLAT_ABI = [
  "function attest((bytes32 schema,address recipient,uint64 expirationTime,bool revocable,bytes32 refUID,bytes data,uint256 value) request) external payable returns (bytes32)",
  "event Attested(address indexed recipient,address indexed attester,bytes32 uid,bytes32 indexed schema)",
] as const;

interface Args {
  payloadPath: string;
  basContract: string;
  schemaUid?: string;
  abiMode: BasAbiMode;
  network: string;
  rpcUrl: string;
  privateKey?: string;
  recipient?: string;
  value?: string;
  out?: string;
  dryRun: boolean;
  allowMainnetWrites: boolean;
}

function usage(): string {
  return [
    "Usage:",
    "  npx ts-node scripts/integration/submitBasAttestation.ts \\",
    "    --payload <BAS_PAYLOAD_JSON> \\",
    "    --bas-contract <BAS_CONTRACT_ADDRESS> \\",
    "    [--schema-uid <BAS_SCHEMA_UID>] \\",
    "    [--abi-mode <eas|flat>] \\",
    "    [--network <bsc|bscMainnet|bscTestnet|localhost>] \\",
    "    [--rpc <RPC_URL>] \\",
    "    [--private-key <HEX_KEY>] \\",
    "    [--recipient <EVM_ADDRESS>] \\",
    "    [--value <WEI>] \\",
    "    [--allow-mainnet-writes <true|false>] \\",
    "    [--dry-run] \\",
    "    [--out <OUTPUT_JSON>]",
    "",
    "Requires BAS to expose an EAS-compatible attest() method.",
  ].join("\n");
}

function parseBoolean(value: string | undefined, label: string): boolean {
  if (value === undefined) {
    return false;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`${label} must be boolean`);
}

function parseArgs(argv: string[]): Args {
  let payloadPath = "";
  let basContract = "";
  let schemaUid: string | undefined;
  let abiMode: BasAbiMode = "eas";
  let network = "bscTestnet";
  let rpcUrl = "";
  let privateKey: string | undefined;
  let recipient: string | undefined;
  let value: string | undefined;
  let out: string | undefined;
  let dryRun = false;
  let allowMainnetWrites = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--payload" && argv[i + 1]) {
      payloadPath = argv[++i];
    } else if (arg === "--bas-contract" && argv[i + 1]) {
      basContract = argv[++i];
    } else if (arg === "--schema-uid" && argv[i + 1]) {
      schemaUid = argv[++i];
    } else if (arg === "--abi-mode" && argv[i + 1]) {
      const mode = argv[++i];
      if (mode !== "eas" && mode !== "flat") {
        throw new Error("--abi-mode must be eas or flat");
      }
      abiMode = mode;
    } else if (arg === "--network" && argv[i + 1]) {
      network = argv[++i];
    } else if (arg === "--rpc" && argv[i + 1]) {
      rpcUrl = argv[++i];
    } else if (arg === "--private-key" && argv[i + 1]) {
      privateKey = argv[++i];
    } else if (arg === "--recipient" && argv[i + 1]) {
      recipient = argv[++i];
    } else if (arg === "--value" && argv[i + 1]) {
      value = argv[++i];
    } else if (arg === "--allow-mainnet-writes" && argv[i + 1]) {
      allowMainnetWrites = parseBoolean(argv[++i], "--allow-mainnet-writes");
    } else if (arg === "--dry-run") {
      dryRun = true;
    } else if (arg === "--out" && argv[i + 1]) {
      out = argv[++i];
    } else if (arg === "-h" || arg === "--help") {
      console.log(usage());
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!payloadPath || !basContract) {
    throw new Error(`Missing required args.\n\n${usage()}`);
  }
  if (!isAddress(basContract)) {
    throw new Error("--bas-contract must be a valid EVM address");
  }

  const rpcMap: Record<string, string> = {
    localhost: "http://127.0.0.1:8545/",
    bsc: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
    bscMainnet: process.env.BSC_RPC_URL || "https://bsc-dataseed.binance.org/",
    bscTestnet:
      process.env.BSC_TESTNET_RPC_URL || "https://data-seed-prebsc-1-s1.binance.org:8545/",
  };

  return {
    payloadPath,
    basContract,
    schemaUid,
    abiMode,
    network,
    rpcUrl: rpcUrl || rpcMap[network] || rpcMap.bsc,
    privateKey,
    recipient,
    value,
    out,
    dryRun,
    allowMainnetWrites,
  };
}

function toExplorer(network: string, txHash: string): string {
  if (network === "bsc" || network === "bscMainnet") {
    return `https://bscscan.com/tx/${txHash}`;
  }
  if (network === "bscTestnet") {
    return `https://testnet.bscscan.com/tx/${txHash}`;
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
  const payload = JSON.parse(readFileSync(resolve(args.payloadPath), "utf8"));
  const submitCall = buildBasSubmitCall({
    payload,
    abiMode: args.abiMode,
    schemaUidOverride: args.schemaUid,
    recipientOverride: args.recipient,
    valueOverride: args.value,
  });

  if (args.dryRun) {
    console.log(
      JSON.stringify(
        serializeBigints({
          dryRun: true,
          network: args.network,
          rpcUrl: args.rpcUrl,
          basContract: args.basContract,
          abiMode: args.abiMode,
          schemaUid: submitCall.schemaUid,
          request: submitCall.request,
          txValue: submitCall.txValue,
        }),
        null,
        2
      )
    );
    return;
  }

  const privateKey =
    args.privateKey || process.env.BAS_ATTESTER_PRIVATE_KEY || process.env.DEPLOYER_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error(
      "Missing private key. Provide --private-key or BAS_ATTESTER_PRIVATE_KEY or DEPLOYER_PRIVATE_KEY"
    );
  }

  const provider = new JsonRpcProvider(args.rpcUrl);
  const chainId = (await provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, args.allowMainnetWrites, "submitBasAttestation script");

  const signer = new Wallet(privateKey, provider);
  const abi = args.abiMode === "eas" ? EAS_ABI : FLAT_ABI;
  const contract = new Contract(args.basContract, abi, signer);
  const iface = new Interface(abi);

  const balanceBefore = await provider.getBalance(signer.address);
  console.log("BAS contract:", args.basContract);
  console.log("Attester:", signer.address);
  console.log("Network:", args.network, `chainId=${chainId.toString()}`);
  console.log("Balance:", formatEther(balanceBefore), "BNB");
  console.log("Schema UID:", submitCall.schemaUid);
  console.log("ABI mode:", args.abiMode);

  let staticUid = "";
  try {
    staticUid = await contract.attest.staticCall(submitCall.request, { value: submitCall.txValue });
    console.log("Static UID:", staticUid);
  } catch (error) {
    console.log("Static call skipped/failure:", (error as Error).message || error);
  }

  const tx = await contract.attest(submitCall.request, { value: submitCall.txValue });
  console.log("Submit Tx:", tx.hash);
  const receipt = await tx.wait();

  let eventUid = "";
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsed = iface.parseLog(log);
        if (parsed && parsed.name === "Attested") {
          eventUid = String(parsed.args.uid);
          break;
        }
      } catch {
        // ignore non-BAS logs
      }
    }
  }

  const result = {
    success: true,
    network: args.network,
    chainId: chainId.toString(),
    basContract: args.basContract,
    schemaUid: submitCall.schemaUid,
    abiMode: args.abiMode,
    attester: signer.address,
    txHash: tx.hash,
    explorerUrl: toExplorer(args.network, tx.hash),
    blockNumber: receipt?.blockNumber?.toString() || "",
    staticUid,
    eventUid,
    attestationUid: eventUid || staticUid,
    txValue: submitCall.txValue,
    request: submitCall.request,
  };

  if (args.out) {
    const outPath = resolve(args.out);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, `${JSON.stringify(serializeBigints(result), null, 2)}\n`, "utf8");
    console.log(`BAS submission result written: ${outPath}`);
  }

  console.log(JSON.stringify(serializeBigints(result), null, 2));
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
  });
}
