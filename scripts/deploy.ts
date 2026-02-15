import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  console.log("Deploying ClawCommit...");
  console.log("Network:", network.name);

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const clawCommit = await ClawCommit.deploy();
  await clawCommit.waitForDeployment();

  const address = await clawCommit.getAddress();
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("ClawCommit deployed to:", address);
  console.log("Chain ID:", chainId.toString());
  console.log("");
  console.log("Update bsc.address with:");
  console.log(`  Contract Address: ${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message || error);
    if (error.message?.includes("insufficient funds")) {
      console.error("Hint: Deployer account needs BNB for gas fees");
    }
    if (error.message?.includes("could not detect network")) {
      console.error("Hint: Check BSC_RPC_URL in .env");
    }
    process.exit(1);
  });
