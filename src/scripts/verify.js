const hre = require("hardhat");

async function main() {
  const args = process.argv.slice(2);
  const commitIdIdx = args.indexOf("--commit-id");
  const addressIdx = args.indexOf("--contract");

  if (commitIdIdx === -1 || addressIdx === -1) {
    console.error(
      "Usage: node src/scripts/verify.js --contract <ADDRESS> --commit-id <ID>"
    );
    process.exit(1);
  }

  const contractAddress = args[addressIdx + 1];
  const commitId = parseInt(args[commitIdIdx + 1]);

  const ClawCommit = await hre.ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const commitment = await contract.getCommitment(commitId);

  console.log("Commitment ID:", commitId);
  console.log("Hash:", commitment.hash);
  console.log(
    "Timestamp:",
    new Date(Number(commitment.timestamp) * 1000).toISOString()
  );
  console.log("Committer:", commitment.committer);
  console.log("Revealed:", commitment.revealed);

  if (commitment.revealed) {
    console.log("Decision:", commitment.decision);
    console.log("Nonce:", commitment.nonce);

    const replayHash = hre.ethers.solidityPackedKeccak256(
      ["string", "string"],
      [commitment.decision, commitment.nonce]
    );

    console.log("Replay Hash:", replayHash);
    console.log("Stored Hash:", commitment.hash);
    console.log("Replay Verified:", replayHash === commitment.hash);
  } else {
    console.log("Not yet revealed — cannot replay verify");
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
