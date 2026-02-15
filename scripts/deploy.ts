import { ethers, network } from "hardhat";
import {
  assertMainnetWriteAllowed,
  parseBooleanFlag,
} from "./common/safety";

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const allowMainnetWrites = parseBooleanFlag(argv, "--allow-mainnet-writes");

  const chainId = (await ethers.provider.getNetwork()).chainId;
  assertMainnetWriteAllowed(chainId, allowMainnetWrites, "deploy script");

  console.log("Deploying ClawCommit...");
  console.log("Network:", network.name);

  const ClawCommit = await ethers.getContractFactory("ClawCommit");
  const clawCommit = await ClawCommit.deploy();
  await clawCommit.waitForDeployment();

  const address = await clawCommit.getAddress();
  const deployTxHash = clawCommit.deploymentTransaction()?.hash;

  console.log("ClawCommit deployed to:", address);
  console.log("Deployment Tx:", deployTxHash || "unknown");
  console.log("Chain ID:", chainId.toString());
  console.log("");
  console.log("Update bsc.address with:");
  console.log(`  Contract Address: ${address}`);
  if (deployTxHash) {
    console.log(`  Deployment Tx: ${deployTxHash}`);
  }
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
