const hre = require("hardhat");

async function main() {
  const args = process.argv.slice(2);
  const decisionIdx = args.indexOf("--decision");
  const nonceIdx = args.indexOf("--nonce");
  const addressIdx = args.indexOf("--contract");

  if (decisionIdx === -1 || nonceIdx === -1 || addressIdx === -1) {
    console.error(
      "Usage: node src/scripts/commit.js --contract <ADDRESS> --decision <DECISION> --nonce <NONCE>"
    );
    process.exit(1);
  }

  const contractAddress = args[addressIdx + 1];
  const decision = args[decisionIdx + 1];
  const nonce = args[nonceIdx + 1];

  const ClawCommit = await hre.ethers.getContractFactory("ClawCommit");
  const contract = ClawCommit.attach(contractAddress);

  const hash = hre.ethers.solidityPackedKeccak256(
    ["string", "string"],
    [decision, nonce]
  );

  console.log("Decision:", decision);
  console.log("Nonce:", nonce);
  console.log("Hash:", hash);

  const tx = await contract.commit(hash);
  const receipt = await tx.wait();
  console.log("Commit Tx:", receipt.hash);

  const event = receipt.logs.find(
    (log) => contract.interface.parseLog(log)?.name === "CommitCreated"
  );
  if (event) {
    const parsed = contract.interface.parseLog(event);
    console.log("Commit ID:", parsed.args.commitId.toString());
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
