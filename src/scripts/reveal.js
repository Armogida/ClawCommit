const hre = require("hardhat");

async function main() {
  const args = process.argv.slice(2);
  const commitIdIdx = args.indexOf("--commit-id");
  const decisionIdx = args.indexOf("--decision");
  const nonceIdx = args.indexOf("--nonce");
  const addressIdx = args.indexOf("--contract");

  if (
    commitIdIdx === -1 ||
    decisionIdx === -1 ||
    nonceIdx === -1 ||
    addressIdx === -1
  ) {
    console.error(
      "Usage: node src/scripts/reveal.js --contract <ADDRESS> --commit-id <ID> --decision <DECISION> --nonce <NONCE>"
    );
    process.exit(1);
  }

  const contractAddress = args[addressIdx + 1];
  const commitId = parseInt(args[commitIdIdx + 1]);
  const decision = args[decisionIdx + 1];
  const nonce = args[nonceIdx + 1];

  const ClawCommit = await hre.ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  console.log("Revealing commitment", commitId);
  console.log("Decision:", decision);
  console.log("Nonce:", nonce);

  const tx = await contract.reveal(commitId, decision, nonce);
  const receipt = await tx.wait();
  console.log("Reveal Tx:", receipt.hash);
  console.log("Reveal successful");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
