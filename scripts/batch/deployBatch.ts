import { ethers, network } from "hardhat";
import {
  assertMainnetWriteAllowed,
  parseBooleanFlag,
} from "../common/safety";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const allowMainnetWrites = parseBooleanFlag(argv, "--allow-mainnet-writes");
  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "batch deploy script");

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
