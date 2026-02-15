#!/usr/bin/env node

/**
 * Render and optionally post a ClawCommit decision-cycle link report.
 *
 * Example:
 *   node scripts/integration/post-cycle-links.js \
 *     --artifact deployment-proof/mainnet-decision-cycle.json \
 *     --out deployment-proof/mainnet-decision-cycle.md \
 *     --post-gh-pr 42 \
 *     --repo owner/repo
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function usage() {
  console.log(`Usage:
  node scripts/integration/post-cycle-links.js --artifact <PATH>
    [--title <TITLE>]
    [--out <PATH>]
    [--post-gh-pr <PR_NUMBER>]
    [--repo <OWNER/REPO>]
    [--append-step-summary]

Reads a decision-cycle JSON artifact and builds a Markdown report with BscScan links.
Optionally writes the report to disk and posts it to a GitHub PR comment via gh CLI.`);
}

function parseArgs(argv) {
  const args = {
    artifact: "",
    title: "ClawCommit Decision Cycle",
    out: "",
    postGhPr: "",
    repo: "",
    appendStepSummary: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--artifact":
        args.artifact = argv[++i] || "";
        break;
      case "--title":
        args.title = argv[++i] || args.title;
        break;
      case "--out":
        args.out = argv[++i] || "";
        break;
      case "--post-gh-pr":
        args.postGhPr = argv[++i] || "";
        break;
      case "--repo":
        args.repo = argv[++i] || "";
        break;
      case "--append-step-summary":
        args.appendStepSummary = true;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.artifact) {
    throw new Error("--artifact is required");
  }

  if (args.postGhPr && !/^\d+$/.test(args.postGhPr)) {
    throw new Error("--post-gh-pr must be a PR number");
  }

  return args;
}

function readArtifact(artifactPath) {
  const raw = fs.readFileSync(artifactPath, "utf8");
  return JSON.parse(raw);
}

function getExplorerBase(network, chainId) {
  const n = String(network || "").toLowerCase();
  const c = String(chainId || "");

  if (n.includes("testnet") || c === "97") {
    return "https://testnet.bscscan.com";
  }
  return "https://bscscan.com";
}

function txLink(base, txHash) {
  if (!txHash) {
    return "n/a";
  }
  return `${base}/tx/${txHash}`;
}

function addressLink(base, address) {
  if (!address) {
    return "n/a";
  }
  return `${base}/address/${address}`;
}

function buildMarkdown({ artifactPath, artifact, title }) {
  const explorerBase = getExplorerBase(artifact.network, artifact.chainId);
  const artifactLabel = path.relative(process.cwd(), artifactPath) || artifactPath;
  const deployTx = artifact.deployTx || artifact.deploymentTx || "";
  const commitTx = artifact.commitTx || "";
  const revealTx = artifact.revealTx || "";

  const lines = [
    `## ${title}`,
    "",
    `Artifact written: \`${artifactLabel}\``,
    "",
    "### Explorer links",
    `- Deploy Tx: ${txLink(explorerBase, deployTx)}`,
    `- Commit Tx: ${txLink(explorerBase, commitTx)}`,
    `- Reveal Tx: ${txLink(explorerBase, revealTx)}`,
    "",
    "### Summary",
    `- Network: ${artifact.network || "n/a"}`,
    `- Chain ID: ${artifact.chainId || "n/a"}`,
    `- Contract: ${artifact.contract || "n/a"}`,
    `- Contract Explorer: ${addressLink(explorerBase, artifact.contract)}`,
    `- Commit ID: ${artifact.commitId || "n/a"}`,
    `- On-chain verify: ${artifact.onchainVerify || "n/a"}`,
    `- Replay: ${artifact.replay || "n/a"}`,
  ];

  return `${lines.join("\n")}\n`;
}

function writeOut(filePath, markdown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, markdown);
  console.error(`[post-cycle-links] wrote ${filePath}`);
}

function appendStepSummary(markdown) {
  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) {
    return;
  }
  fs.appendFileSync(summaryPath, `${markdown}\n`);
  console.error(`[post-cycle-links] appended to ${summaryPath}`);
}

function postPrComment(prNumber, markdown, repo) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "clawcommit-links-"));
  const bodyPath = path.join(tmpDir, "comment.md");
  fs.writeFileSync(bodyPath, markdown);

  const args = ["pr", "comment", prNumber, "--body-file", bodyPath];
  if (repo) {
    args.push("--repo", repo);
  }

  execFileSync("gh", args, { stdio: "inherit" });
  console.error(`[post-cycle-links] posted PR comment to #${prNumber}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const artifactPath = path.resolve(args.artifact);

  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Artifact file not found: ${artifactPath}`);
  }

  const artifact = readArtifact(artifactPath);
  const markdown = buildMarkdown({
    artifactPath,
    artifact,
    title: args.title,
  });

  process.stdout.write(markdown);

  if (args.out) {
    writeOut(path.resolve(args.out), markdown);
  }

  if (args.appendStepSummary) {
    appendStepSummary(markdown);
  }

  if (args.postGhPr) {
    postPrComment(args.postGhPr, markdown, args.repo);
  }
}

try {
  main();
} catch (error) {
  console.error(`[post-cycle-links] error: ${error.message || error}`);
  process.exit(1);
}
