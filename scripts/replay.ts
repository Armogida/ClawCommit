import { ethers } from "hardhat";

interface ReplayArgs {
  contract: string;
  commitId?: number;
  txHash?: string;
}

function parseArgs(): ReplayArgs {
  const args = process.argv.slice(2);
  const get = (flag: string): string | undefined => {
    const idx = args.indexOf(flag);
    return idx !== -1 ? args[idx + 1] : undefined;
  };

  const contract = get("--contract");
  const commitIdStr = get("--commit-id");
  const txHash = get("--tx-hash");

  if (!contract || (!commitIdStr && !txHash)) {
    console.error(
      "Usage: npx hardhat run scripts/replay.ts --network <NETWORK> -- --contract <ADDR> [--commit-id <ID> | --tx-hash <TX>]"
    );
    process.exit(1);
  }

  return {
    contract,
    commitId: commitIdStr ? parseInt(commitIdStr) : undefined,
    txHash,
  };
}

async function replayByCommitId(
  contractAddress: string,
  commitId: number
): Promise<void> {
  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const commitment = await contract.getCommitment(commitId);

  console.log("--- Commitment Data ---");
  console.log("Commit ID: ", commitId);
  console.log("Hash:      ", commitment.hash);
  console.log(
    "Timestamp: ",
    new Date(Number(commitment.timestamp) * 1000).toISOString()
  );
  console.log("Committer: ", commitment.committer);
  console.log("Revealed:  ", commitment.revealed);

  if (!commitment.revealed) {
    console.log("\nNot yet revealed. Cannot replay verify.");
    return;
  }

  console.log("Decision:  ", commitment.decision);
  console.log("Nonce:     ", commitment.nonce);

  const replayHash = ethers.solidityPackedKeccak256(
    ["string", "string"],
    [commitment.decision, commitment.nonce]
  );

  console.log("\n--- Replay Verification ---");
  console.log("Recomputed Hash:", replayHash);
  console.log("Stored Hash:    ", commitment.hash);

  const verified = replayHash === commitment.hash;
  console.log("Match:          ", verified);
  console.log(
    "\nVERDICT:",
    verified ? "VERIFIED" : "FAILED - hash mismatch"
  );
}

async function replayByTxHash(
  contractAddress: string,
  txHash: string
): Promise<void> {
  const tx = await ethers.provider.getTransaction(txHash);
  if (!tx) {
    console.error("Transaction not found:", txHash);
    process.exit(1);
  }

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const iface = ClawCommit.interface;

  const decoded = iface.parseTransaction({ data: tx.data });
  if (!decoded || decoded.name !== "reveal") {
    console.error("Not a reveal() transaction. Found:", decoded?.name);
    process.exit(1);
  }

  const commitId = Number(decoded.args[0]);
  const decision: string = decoded.args[1];
  const nonce: string = decoded.args[2];

  console.log("--- Decoded from Reveal Tx ---");
  console.log("Commit ID:", commitId);
  console.log("Decision: ", decision);
  console.log("Nonce:    ", nonce);

  const replayHash = ethers.solidityPackedKeccak256(
    ["string", "string"],
    [decision, nonce]
  );

  const contract = ClawCommit.attach(contractAddress);
  const commitment = await contract.getCommitment(commitId);

  console.log("\n--- Replay Verification ---");
  console.log("Recomputed Hash:", replayHash);
  console.log("Stored Hash:    ", commitment.hash);

  const verified = replayHash === commitment.hash;
  console.log("Match:          ", verified);
  console.log(
    "\nVERDICT:",
    verified ? "VERIFIED" : "FAILED - hash mismatch"
  );
}

async function main(): Promise<void> {
  const { contract, commitId, txHash } = parseArgs();

  if (txHash) {
    await replayByTxHash(contract, txHash);
  } else if (commitId !== undefined) {
    await replayByCommitId(contract, commitId);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
