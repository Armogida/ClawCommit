import { ethers, network, run } from "hardhat";
import { randomBytes } from "crypto";
import * as fs from "fs";
import * as path from "path";
import {
  assertMainnetWriteAllowed,
  parseBooleanFlag,
} from "./common/safety";

function computeDecisionHash(
  prompt: string,
  output: string,
  modelVersion: string,
  nonce: string
): string {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );

  return ethers.keccak256(encoded);
}

function writeProofFile(
  proofDir: string,
  filename: string,
  firstLineValue: string,
  metadata: Record<string, string>
): void {
  const lines = [firstLineValue, ...Object.entries(metadata).map(([k, v]) => `${k}=${v}`)];
  fs.writeFileSync(path.join(proofDir, filename), `${lines.join("\n")}\n`);
}

function isMainnetNetworkName(name: string): boolean {
  return name === "bsc" || name === "bscMainnet";
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const allowMainnetWrites = parseBooleanFlag(argv, "--allow-mainnet-writes");

  const proofDir = path.join(process.cwd(), "deployment-proof");
  fs.mkdirSync(proofDir, { recursive: true });

  console.log("=== ClawCommit V2 Deployment + Proof ===");
  console.log("Network:", network.name);

  const providerNetwork = await ethers.provider.getNetwork();
  const chainId = providerNetwork.chainId.toString();
  assertMainnetWriteAllowed(providerNetwork.chainId, allowMainnetWrites, "deployAndProve script");
  const [deployer] = await ethers.getSigners();

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(balance), "BNB");

  const Factory = await ethers.getContractFactory("ClawCommit");
  const contract = await Factory.deploy();
  await contract.waitForDeployment();

  const contractAddress = await contract.getAddress();
  const deployTxHash = contract.deploymentTransaction()?.hash || "";

  console.log("Contract:", contractAddress);
  console.log("Deploy Tx:", deployTxHash);

  writeProofFile(proofDir, "contract.txt", contractAddress, {
    network: network.name,
    chain_id: chainId,
    explorer: `https://bscscan.com/address/${contractAddress}`,
    generated_at: new Date().toISOString(),
  });

  if (!deployTxHash) {
    throw new Error("Deployment transaction hash unavailable");
  }

  writeProofFile(proofDir, "deploy-tx.txt", deployTxHash, {
    contract: contractAddress,
    explorer: `https://bscscan.com/tx/${deployTxHash}`,
    generated_at: new Date().toISOString(),
  });

  const prompt = "Should ClawCommit publish deterministic replay verification for judges?";
  const output = "APPROVE_REPLAY_VALIDATOR";
  const modelVersion = "clawcommit-v2-demo";
  const nonce = randomBytes(32).toString("hex");
  const hash = computeDecisionHash(prompt, output, modelVersion, nonce);

  console.log("Committing decision hash...");
  const commitTx = await contract.commitDecision(hash);
  const commitReceipt = await commitTx.wait();
  const commitTxHash = commitReceipt?.hash || "";

  if (!commitTxHash) {
    throw new Error("Commit transaction hash unavailable");
  }

  let commitId = BigInt(0);
  if (commitReceipt) {
    for (const log of commitReceipt.logs) {
      try {
        const parsed = contract.interface.parseLog({
          topics: log.topics as string[],
          data: log.data,
        });
        if (parsed?.name === "CommitCreated") {
          commitId = parsed.args.commitId as bigint;
          break;
        }
      } catch {
        // ignore logs from other contracts
      }
    }
  }

  console.log("Commit Tx:", commitTxHash);
  console.log("Commit ID:", commitId.toString());

  writeProofFile(proofDir, "commit-tx.txt", commitTxHash, {
    contract: contractAddress,
    commit_id: commitId.toString(),
    hash,
    explorer: `https://bscscan.com/tx/${commitTxHash}`,
    generated_at: new Date().toISOString(),
  });

  console.log("Revealing decision...");
  const revealTx = await contract.revealDecision(
    commitId,
    prompt,
    output,
    modelVersion,
    nonce
  );
  const revealReceipt = await revealTx.wait();
  const revealTxHash = revealReceipt?.hash || "";

  if (!revealTxHash) {
    throw new Error("Reveal transaction hash unavailable");
  }

  console.log("Reveal Tx:", revealTxHash);

  writeProofFile(proofDir, "reveal-tx.txt", revealTxHash, {
    contract: contractAddress,
    commit_id: commitId.toString(),
    prompt,
    output,
    model_version: modelVersion,
    nonce,
    explorer: `https://bscscan.com/tx/${revealTxHash}`,
    generated_at: new Date().toISOString(),
  });

  const revealTxOnchain = await ethers.provider.getTransaction(revealTxHash);
  if (!revealTxOnchain?.data) {
    throw new Error("Unable to fetch reveal transaction for replay verification");
  }

  const decoded = contract.interface.parseTransaction({ data: revealTxOnchain.data });
  if (!decoded || decoded.name !== "revealDecision") {
    throw new Error("Reveal transaction does not call revealDecision");
  }

  const replayHash = computeDecisionHash(
    decoded.args[1] as string,
    decoded.args[2] as string,
    decoded.args[3] as string,
    decoded.args[4] as string
  );

  const commitment = await contract.getCommitment(decoded.args[0] as bigint);
  if (replayHash !== commitment.hash) {
    throw new Error("Replay verification failed: recomputed hash does not match onchain hash");
  }

  console.log("✓ Deterministic Replay Verified");
  console.log("Commit hash matches reveal.");

  if (isMainnetNetworkName(network.name)) {
    try {
      console.log("Verifying contract on BscScan...");
      await new Promise((resolve) => setTimeout(resolve, 15000));
      await run("verify:verify", {
        address: contractAddress,
        constructorArguments: [],
      });
      console.log("Contract verified on BscScan.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log("BscScan verification skipped/failure:", message);
    }
  }

  console.log("Proof artifacts written:");
  console.log("  deployment-proof/contract.txt");
  console.log("  deployment-proof/deploy-tx.txt");
  console.log("  deployment-proof/commit-tx.txt");
  console.log("  deployment-proof/reveal-tx.txt");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error.message || error);
    process.exit(1);
  });
