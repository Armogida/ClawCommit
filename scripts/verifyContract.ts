import { run } from "hardhat";

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const addrIdx = args.indexOf("--address");

  if (addrIdx === -1) {
    console.error("Usage: npx hardhat run scripts/verifyContract.ts --network bsc -- --address <CONTRACT_ADDRESS>");
    process.exit(1);
  }

  const address = args[addrIdx + 1];
  console.log("Verifying contract at:", address);

  await run("verify:verify", {
    address: address,
    constructorArguments: [],
  });

  console.log("Contract verified on BscScan.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
