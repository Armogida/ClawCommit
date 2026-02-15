const hre = require("hardhat");

async function main() {
  const args = process.argv.slice(2);
  const txHashIdx = args.indexOf("--tx-hash");
  const addressIdx = args.indexOf("--contract");

  if (txHashIdx === -1 || addressIdx === -1) {
    console.error(
      "Usage: node src/scripts/replay.js --contract <ADDRESS> --tx-hash <REVEAL_TX_HASH>"
    );
    process.exit(1);
  }

  const contractAddress = args[txHashIdx + 1];
  const revealTxHash = args[addressIdx + 1];

  // Swap: --tx-hash value is the tx, --contract is the address
  const txHash = args[txHashIdx + 1];
  const contract_address = args[addressIdx + 1];

  const provider = hre.ethers.provider;

  // Step 1: Fetch the reveal transaction
  console.log("Fetching reveal transaction:", txHash);
  const tx = await provider.getTransaction(txHash);
  if (!tx) {
    console.error("Transaction not found");
    process.exit(1);
  }

  // Step 2: Decode the reveal transaction input data
  const ClawCommit = await hre.ethers.getContractFactory("ClawCommit");
  const iface = ClawCommit.interface;

  let decoded;
  try {
    decoded = iface.parseTransaction({ data: tx.data });
  } catch (e) {
    console.error("Failed to decode transaction data. Is this a reveal() tx?");
    process.exit(1);
  }

  if (decoded.name !== "reveal") {
    console.error("Transaction is not a reveal() call. Found:", decoded.name);
    process.exit(1);
  }

  const commitId = decoded.args[0];
  const decision = decoded.args[1];
  const nonce = decoded.args[2];

  console.log("\n--- Decoded Reveal Parameters ---");
  console.log("Commit ID:", commitId.toString());
  console.log("Decision:", decision);
  console.log("Nonce:", nonce);

  // Step 3: Recompute the hash independently
  const recomputedHash = hre.ethers.solidityPackedKeccak256(
    ["string", "string"],
    [decision, nonce]
  );
  console.log("\n--- Replay Verification ---");
  console.log("Recomputed Hash:", recomputedHash);

  // Step 4: Fetch the original commitment from the contract
  const contract = ClawCommit.attach(contract_address);
  const commitment = await contract.getCommitment(commitId);

  console.log("Stored Hash:    ", commitment.hash);
  console.log(
    "Commit Timestamp:",
    new Date(Number(commitment.timestamp) * 1000).toISOString()
  );
  console.log("Committer:      ", commitment.committer);

  // Step 5: Compare
  const verified = recomputedHash === commitment.hash;
  console.log("\n--- Result ---");
  console.log("Hashes Match:", verified);

  if (verified) {
    console.log(
      "VERIFIED: Decision integrity confirmed. The revealed decision matches the original commitment."
    );
  } else {
    console.log(
      "FAILED: Hash mismatch. The revealed data does not match the committed hash."
    );
  }

  // Step 6: Output structured result
  console.log("\n--- Verification Summary ---");
  console.log(JSON.stringify({
    commitId: commitId.toString(),
    decision: decision,
    nonce: nonce,
    recomputedHash: recomputedHash,
    storedHash: commitment.hash,
    committer: commitment.committer,
    commitTimestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
    verified: verified,
  }, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
