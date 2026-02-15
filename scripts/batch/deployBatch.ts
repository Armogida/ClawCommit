import { ethers, network } from "hardhat";

async function main(): Promise<void> {
  console.log("Deploying ClawCommitBatch...");
  console.log("Network:", network.name);

  const Factory = await ethers.getContractFactory("ClawCommitBatch");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const address = await contract.getAddress();
  const txHash = contract.deploymentTransaction()?.hash || "unknown";
  const chainId = (await ethers.provider.getNetwork()).chainId;

  console.log("ClawCommitBatch deployed to:", address);
  console.log("Deployment Tx:", txHash);
  console.log("Chain ID:", chainId.toString());
}

main().catch((error) => {
  console.error("Error:", error.message || error);
  process.exit(1);
});
