import { ethers } from "hardhat";
import * as fs from "fs";
import { BatchManifest, validateManifest } from "./merkle";
import {
  assertMainnetWriteAllowed,
  parseBooleanFlag,
  requireAddress,
} from "../common/safety";

interface CommitBatchArgs {
  contract: string;
  manifestPath: string;
  allowMainnetWrites: boolean;
  logSensitive: boolean;
}

function parseArgs(argv: string[]): CommitBatchArgs {
  const get = (flag: string): string | undefined => {
    const idx = argv.indexOf(flag);
    return idx !== -1 ? argv[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const manifestPath = get("--manifest");
  const allowMainnetWrites = parseBooleanFlag(argv, "--allow-mainnet-writes");
  const logSensitive = parseBooleanFlag(argv, "--log-sensitive");

  if (!contract || !manifestPath) {
    throw new Error(
      "Usage: npx hardhat run scripts/batch/commitBatch.ts --network <NETWORK> -- --contract <ADDR> --manifest <MANIFEST_JSON> [--allow-mainnet-writes <true|false>] [--log-sensitive <true|false>]"
    );
  }

  return {
    contract: requireAddress(contract, "--contract"),
    manifestPath,
    allowMainnetWrites,
    logSensitive,
  };
}

function loadManifest(manifestPath: string): { parsed: BatchManifest } {
  const raw = fs.readFileSync(manifestPath, "utf8");
  const parsed = JSON.parse(raw) as BatchManifest;

  return { parsed };
}

async function main(): Promise<void> {
  const {
    contract: contractAddress,
    manifestPath,
    allowMainnetWrites,
    logSensitive,
  } = parseArgs(process.argv.slice(2));
  const { parsed } = loadManifest(manifestPath);
  const validated = validateManifest(parsed);

  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "batch commit script");

  const Factory = await ethers.getContractFactory("ClawCommitBatch");
  const contract = Factory.attach(contractAddress);

  const tx = await contract.commitBatch(
    validated.manifest.root,
    validated.manifest.leafCount,
    validated.manifest.modelVersion,
    validated.manifestHash
  );
  const receipt = await tx.wait();

  let batchId: bigint | undefined;
  if (receipt) {
    for (const log of receipt.logs) {
      try {
        const parsedLog = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsedLog?.name === "BatchCommitted") {
          batchId = parsedLog.args.batchId as bigint;
          break;
        }
      } catch {
        // Skip non-contract logs.
      }
    }
  }

  console.log("Batch committed.");
  console.log("Manifest:", manifestPath);
  console.log("Root:", validated.manifest.root);
  console.log("Leaf count:", validated.manifest.leafCount);
  console.log("Manifest hash:", validated.manifestHash);
  if (!logSensitive) {
    console.log("Sensitive leaf payload logging disabled.");
  }
  console.log("Commit Tx:", receipt?.hash || tx.hash);
  if (batchId !== undefined) {
    console.log("Batch ID:", batchId.toString());
  }
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
