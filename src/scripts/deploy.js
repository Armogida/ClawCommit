const hre = require("hardhat");

async function main() {
  console.log("Deploying ClawCommit...");

  const ClawCommit = await hre.ethers.getContractFactory("ClawCommit");
  const clawCommit = await ClawCommit.deploy();
  await clawCommit.waitForDeployment();

  const address = await clawCommit.getAddress();
  console.log("ClawCommit deployed to:", address);
  console.log("Network:", hre.network.name);
  console.log(
    "Chain ID:",
    (await hre.ethers.provider.getNetwork()).chainId.toString()
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
