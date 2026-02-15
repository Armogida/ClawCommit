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
    includePrompt: false,
    promptMaxChars: 1200,
    redact: true,
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
      case "--include-prompt":
        args.includePrompt = true;
        break;
      case "--prompt-max-chars":
        args.promptMaxChars = Number(argv[++i] || "1200");
        break;
      case "--no-redact":
        args.redact = false;
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

function redactIfNeeded(value, redact) {
  if (!redact || !value) {
    return value;
  }

  return String(value)
    .replace(/0x[a-fA-F0-9]{64}/g, "0x[REDACTED_64HEX]")
    .replace(
      /(DEPLOYER_PRIVATE_KEY|PRIVATE_KEY|SECRET|TOKEN|API_KEY)\s*[:=]\s*[^\s]+/gi,
      "$1=[REDACTED]"
    )
    .replace(
      /-----BEGIN [A-Z ]+ PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+ PRIVATE KEY-----/g,
      "[REDACTED_PRIVATE_KEY_BLOCK]"
    );
}

function truncateText(value, maxChars) {
  if (!value || typeof value !== "string") {
    return value || "";
  }
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars)}\n...(truncated, ${value.length} chars)`;
}

function renderPromptSection(artifact, opts) {
  const prompt = typeof artifact.prompt === "string" ? artifact.prompt : "";
  const output = typeof artifact.output === "string" ? artifact.output : "";
  const modelVersion = typeof artifact.modelVersion === "string" ? artifact.modelVersion : "";

  if (!prompt && !output && !modelVersion) {
    return "";
  }

  const safePrompt = truncateText(redactIfNeeded(prompt, opts.redact), opts.promptMaxChars);
  const safeOutput = truncateText(redactIfNeeded(output, opts.redact), opts.promptMaxChars);
  const safeModel = redactIfNeeded(modelVersion, opts.redact);

  return [
    "",
    "<details>",
    "<summary><strong>Decision Payload (Prompt/Output)</strong></summary>",
    "",
    safeModel ? `**modelVersion:** \`${safeModel}\`` : "",
    "",
    safePrompt ? "```text\n" + safePrompt + "\n```" : "",
    safeOutput ? "**output:**\n```text\n" + safeOutput + "\n```" : "",
    "</details>",
  ]
    .filter(Boolean)
    .join("\n");
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

function buildMarkdown({ artifactPath, artifact, title, opts }) {
  const explorerBase = getExplorerBase(artifact.network, artifact.chainId);
  const artifactLabel = path.relative(process.cwd(), artifactPath) || artifactPath;
  const deployTx = artifact.deployTx || artifact.deploymentTx || "";
  const commitTx = artifact.commitTx || "";
  const revealTx = artifact.revealTx || "";
  const output = artifact.output || artifact.decision || "n/a";
  const modelVersion = artifact.modelVersion || "n/a";
  const promptDigest = artifact.promptDigest || "n/a";
  const validationSummary = buildValidationSummary(artifact);
  const promptSection = opts.includePrompt ? renderPromptSection(artifact, opts) : "";

  const lines = [
    `## ${title}`,
    "",
    `Artifact written: \`${artifactLabel}\``,
    "",
    "### Explorer links",
    `- Deploy Tx: ${txLink(explorerBase, deployTx)}`,
    `- Commit Tx: ${txLink(explorerBase, commitTx)}`,
    `- Reveal Tx: ${txLink(explorerBase, revealTx)}`,
    promptSection,
    "",
    "### Summary",
    `- Network: ${artifact.network || "n/a"}`,
    `- Chain ID: ${artifact.chainId || "n/a"}`,
    `- Contract: ${artifact.contract || "n/a"}`,
    `- Contract Explorer: ${addressLink(explorerBase, artifact.contract)}`,
    `- Commit ID: ${artifact.commitId || "n/a"}`,
    `- Decision: ${output}`,
    `- Model Version: ${modelVersion}`,
    `- Prompt Digest: ${promptDigest}`,
    `- Validation Summary: ${validationSummary}`,
    `- On-chain verify: ${artifact.onchainVerify || "n/a"}`,
    `- Replay: ${artifact.replay || "n/a"}`,
  ];

  return `${lines.join("\n")}\n`;
}

function buildValidationSummary(artifact) {
  if (typeof artifact.validationSummary === "string" && artifact.validationSummary.trim()) {
    return artifact.validationSummary.trim();
  }

  if (!Array.isArray(artifact.validations) || artifact.validations.length === 0) {
    return "n/a";
  }

  const normalized = artifact.validations.map((entry) => ({
    name: String(entry.name || "").trim() || "unnamed",
    required: entry.required !== false,
    passed: Boolean(entry.passed),
  }));
  const required = normalized.filter((entry) => entry.required);
  const requiredFailures = required.filter((entry) => !entry.passed);
  const failedNames = requiredFailures.slice(0, 5).map((entry) => entry.name);
  const suffix =
    requiredFailures.length > failedNames.length
      ? ` (+${requiredFailures.length - failedNames.length} more)`
      : "";

  return `required_failed=${requiredFailures.length}/${required.length}; total=${normalized.length}; failed=[${failedNames.join(", ")}]${suffix}`;
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
    opts: args,
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
