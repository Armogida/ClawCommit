import { ethers, network } from "hardhat";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";

async function main(): Promise<void> {
  const proofDir = path.join(__dirname, "..", "deployment-proof");
  if (!fs.existsSync(proofDir)) {
    fs.mkdirSync(proofDir, { recursive: true });
  }

  console.log("=== ClawCommit BSC Mainnet Deployment + Proof ===\n");
  console.log("Network:", network.name);
  const chainId = (await ethers.provider.getNetwork()).chainId;
  console.log("Chain ID:", chainId.toString());

  // Step 1: Deploy
  console.log("\n--- Step 1: Deploy Contract ---");
  const Factory = await ethers.getContractFactory("ClawCommit");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployTx = contract.deploymentTransaction();
  const deployTxHash = deployTx?.hash || "unknown";

  console.log("Contract Address:", contractAddress);
  console.log("Deploy Tx Hash:", deployTxHash);

  fs.writeFileSync(
    path.join(proofDir, "mainnet-address.txt"),
    `ClawCommit Contract Address (BSC Mainnet)\n` +
    `Chain ID: ${chainId}\n` +
    `Address: ${contractAddress}\n` +
    `Explorer: https://bscscan.com/address/${contractAddress}\n` +
    `Deploy Tx: ${deployTxHash}\n` +
    `Timestamp: ${new Date().toISOString()}\n`
  );

  // Step 2: Example Commit
  console.log("\n--- Step 2: Example Commit ---");
  const decision = JSON.stringify({
    prompt: "Evaluate BNB staking reward adjustment",
    output: "APPROVE_RATE_INCREASE_5PCT",
    modelVersion: "clawcommit-agent-v1.0",
    timestamp: new Date().toISOString(),
  });
  const nonce = randomBytes(32).toString("hex");
  const hash = ethers.solidityPackedKeccak256(
    ["string", "string"],
    [decision, nonce]
  );

  console.log("Decision:", decision);
  console.log("Nonce:", nonce);
  console.log("Hash:", hash);

  const commitTx = await contract.commit(hash);
  const commitReceipt = await commitTx.wait();
  const commitTxHash = commitReceipt?.hash || "unknown";
  console.log("Commit Tx Hash:", commitTxHash);

  fs.writeFileSync(
    path.join(proofDir, "commit-tx.txt"),
    `ClawCommit Example Commit (BSC Mainnet)\n` +
    `Contract: ${contractAddress}\n` +
    `Commit ID: 0\n` +
    `Decision: ${decision}\n` +
    `Nonce: ${nonce}\n` +
    `Hash: ${hash}\n` +
    `Tx Hash: ${commitTxHash}\n` +
    `Explorer: https://bscscan.com/tx/${commitTxHash}\n` +
    `Timestamp: ${new Date().toISOString()}\n`
  );

  // Step 3: Reveal
  console.log("\n--- Step 3: Reveal Decision ---");
  const revealTx = await contract.reveal(0, decision, nonce);
  const revealReceipt = await revealTx.wait();
  const revealTxHash = revealReceipt?.hash || "unknown";
  console.log("Reveal Tx Hash:", revealTxHash);

  fs.writeFileSync(
    path.join(proofDir, "reveal-tx.txt"),
    `ClawCommit Example Reveal (BSC Mainnet)\n` +
    `Contract: ${contractAddress}\n` +
    `Commit ID: 0\n` +
    `Decision: ${decision}\n` +
    `Nonce: ${nonce}\n` +
    `Tx Hash: ${revealTxHash}\n` +
    `Explorer: https://bscscan.com/tx/${revealTxHash}\n` +
    `Timestamp: ${new Date().toISOString()}\n`
  );

  // Step 4: Verify
  console.log("\n--- Step 4: Replay Verification ---");
  const commitment = await contract.getCommitment(0);
  const replayHash = ethers.solidityPackedKeccak256(
    ["string", "string"],
    [commitment.decision, commitment.nonce]
  );
  const verified = replayHash === commitment.hash;
  console.log("Replay Hash:", replayHash);
  console.log("Stored Hash:", commitment.hash);
  console.log("Verified:", verified);

  const onchainVerified = await contract.verify(0);
  console.log("On-chain verify():", onchainVerified);

  // Write summary
  const summary =
    `=== ClawCommit Deployment Proof (BSC Mainnet) ===\n\n` +
    `Network: BSC Mainnet (Chain ID ${chainId})\n` +
    `Timestamp: ${new Date().toISOString()}\n\n` +
    `Contract Address: ${contractAddress}\n` +
    `Explorer: https://bscscan.com/address/${contractAddress}\n\n` +
    `Deploy Tx: ${deployTxHash}\n` +
    `  https://bscscan.com/tx/${deployTxHash}\n\n` +
    `Commit Tx: ${commitTxHash}\n` +
    `  https://bscscan.com/tx/${commitTxHash}\n\n` +
    `Reveal Tx: ${revealTxHash}\n` +
    `  https://bscscan.com/tx/${revealTxHash}\n\n` +
    `Replay Verified: ${verified}\n` +
    `On-chain Verified: ${onchainVerified}\n\n` +
    `Decision: ${decision}\n` +
    `Nonce: ${nonce}\n` +
    `Hash: ${hash}\n`;

  fs.writeFileSync(path.join(proofDir, "PROOF_SUMMARY.txt"), summary);

  console.log("\n=== Proof artifacts written to deployment-proof/ ===");
  console.log("Files:");
  console.log("  deployment-proof/mainnet-address.txt");
  console.log("  deployment-proof/commit-tx.txt");
  console.log("  deployment-proof/reveal-tx.txt");
  console.log("  deployment-proof/PROOF_SUMMARY.txt");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
