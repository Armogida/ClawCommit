#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const Ajv2020 = require("ajv/dist/2020").default;
const addFormats = require("ajv-formats");

function usage() {
  console.log(`Usage:
  node integrations/openclaw/convert-to-clawcommit.js
    --input <OPENCLAW_LOG_JSON>
    --out <CLAWCOMMIT_DECISION_JSON>
    [--schema <SCHEMA_PATH>]
    [--run-decision-cycle|--clawcommit
      --repo <REPO_PATH>
      --network <bscTestnet|bscMainnet|bsc>
      --contract <CONTRACT_ADDRESS>
      [--rpc <RPC_URL>]
      [--allow-mainnet-writes <true|false>]
      [--json-out <CYCLE_ARTIFACT_JSON>]
      [--json-include-prompt]
      [--links-out <CYCLE_MARKDOWN>]
      [--links-title <TITLE>]
      [--links-include-prompt]
      [--links-prompt-max-chars <N>]
      [--links-no-redact]
      [--post-gh-pr <PR_NUMBER>]
      [--gh-repo <OWNER/REPO>]]

Converts provider-neutral OpenClaw decision logs into ClawCommit decision JSON.
Optionally runs the repo's decision cycle script to commit/reveal/replay on-chain.`);
}

function parseBoolean(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return fallback;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  throw new Error(`Invalid boolean value: ${value}`);
}

function parseArgs(argv) {
  const args = {
    input: "",
    out: "",
    schema: path.resolve(__dirname, "openclaw-decision.schema.json"),
    runDecisionCycle: false,
    repo: process.cwd(),
    network: "bscTestnet",
    contract: "",
    rpc: "",
    allowMainnetWrites: false,
    jsonOut: "",
    jsonIncludePrompt: false,
    linksOut: "",
    linksTitle: "OpenClaw Decision Cycle",
    linksIncludePrompt: false,
    linksPromptMaxChars: "1200",
    linksNoRedact: false,
    postGhPr: "",
    ghRepo: "",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--input":
        args.input = argv[++i] || "";
        break;
      case "--out":
        args.out = argv[++i] || "";
        break;
      case "--schema":
        args.schema = path.resolve(argv[++i] || args.schema);
        break;
      case "--run-decision-cycle":
      case "--clawcommit":
        args.runDecisionCycle = true;
        break;
      case "--repo":
        args.repo = path.resolve(argv[++i] || args.repo);
        break;
      case "--network":
        args.network = argv[++i] || args.network;
        break;
      case "--contract":
        args.contract = argv[++i] || "";
        break;
      case "--rpc":
        args.rpc = argv[++i] || "";
        break;
      case "--allow-mainnet-writes":
        args.allowMainnetWrites = parseBoolean(argv[++i], false);
        break;
      case "--json-out":
        args.jsonOut = argv[++i] || "";
        break;
      case "--json-include-prompt":
        args.jsonIncludePrompt = true;
        break;
      case "--links-out":
        args.linksOut = argv[++i] || "";
        break;
      case "--links-title":
        args.linksTitle = argv[++i] || args.linksTitle;
        break;
      case "--links-include-prompt":
        args.linksIncludePrompt = true;
        break;
      case "--links-prompt-max-chars":
        args.linksPromptMaxChars = argv[++i] || args.linksPromptMaxChars;
        break;
      case "--links-no-redact":
        args.linksNoRedact = true;
        break;
      case "--post-gh-pr":
        args.postGhPr = argv[++i] || "";
        break;
      case "--gh-repo":
        args.ghRepo = argv[++i] || "";
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input) {
    throw new Error("--input is required");
  }
  if (!args.out) {
    throw new Error("--out is required");
  }

  args.input = path.resolve(args.input);
  args.out = path.resolve(args.out);

  if (args.runDecisionCycle) {
    if (!args.contract) {
      throw new Error("--contract is required when --run-decision-cycle is set");
    }
    if (!args.jsonOut) {
      args.jsonOut = path.resolve(args.repo, "deployment-proof/openclaw-decision-cycle.json");
    } else {
      args.jsonOut = path.resolve(args.jsonOut);
    }
    if (args.linksOut) {
      args.linksOut = path.resolve(args.linksOut);
    }
  }

  return args;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function validateOpenClawLog(input, schemaPath) {
  if (!fs.existsSync(schemaPath)) {
    throw new Error(`Schema not found: ${schemaPath}`);
  }

  const schema = readJson(schemaPath);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  const validate = ajv.compile(schema);
  const valid = validate(input);

  if (!valid) {
    const details = (validate.errors || [])
      .map((entry) => `${entry.instancePath || "/"} ${entry.message}`)
      .join("; ");
    throw new Error(`Schema validation failed: ${details}`);
  }
}

function toClawCommitDecision(openclawLog) {
  const {
    sessionId,
    agentId,
    eventType,
    timestamp,
    prompt,
    output,
    modelVersion,
    nonce,
    metadata,
  } = openclawLog;

  return {
    prompt,
    output,
    modelVersion,
    nonce,
    metadata: {
      ...(metadata || {}),
      sessionId,
      agentId,
      eventType,
      timestamp,
    },
  };
}

function runDecisionCycle(args, decision) {
  const scriptPath = path.resolve(
    args.repo,
    "skills/operate-clawcommit/scripts/decision_cycle.sh"
  );
  if (!fs.existsSync(scriptPath)) {
    throw new Error(`decision_cycle.sh not found at: ${scriptPath}`);
  }

  const cmdArgs = [
    scriptPath,
    "--repo",
    args.repo,
    "--network",
    args.network,
    "--contract",
    args.contract,
    "--prompt",
    decision.prompt,
    "--output",
    decision.output,
    "--model-version",
    decision.modelVersion,
    "--nonce",
    decision.nonce,
    "--allow-mainnet-writes",
    args.allowMainnetWrites ? "true" : "false",
    "--json-out",
    args.jsonOut,
  ];

  if (args.rpc) {
    cmdArgs.push("--rpc", args.rpc);
  }
  if (args.jsonIncludePrompt) {
    cmdArgs.push("--json-include-prompt");
  }
  if (args.linksOut) {
    cmdArgs.push("--links-out", args.linksOut);
  }
  if (args.linksTitle) {
    cmdArgs.push("--links-title", args.linksTitle);
  }
  if (args.linksIncludePrompt) {
    cmdArgs.push("--links-include-prompt");
    cmdArgs.push("--links-prompt-max-chars", String(args.linksPromptMaxChars));
    if (args.linksNoRedact) {
      cmdArgs.push("--links-no-redact");
    }
  }
  if (args.postGhPr) {
    cmdArgs.push("--post-gh-pr", String(args.postGhPr));
  }
  if (args.ghRepo) {
    cmdArgs.push("--gh-repo", args.ghRepo);
  }

  const result = spawnSync("bash", cmdArgs, { stdio: "inherit" });
  if (typeof result.status === "number" && result.status !== 0) {
    throw new Error(`decision_cycle.sh exited with status ${result.status}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!fs.existsSync(args.input)) {
    throw new Error(`Input file not found: ${args.input}`);
  }

  const openclawLog = readJson(args.input);
  validateOpenClawLog(openclawLog, args.schema);
  const decision = toClawCommitDecision(openclawLog);

  fs.mkdirSync(path.dirname(args.out), { recursive: true });
  fs.writeFileSync(args.out, JSON.stringify(decision, null, 2) + "\n", "utf8");
  console.log(`Generated ClawCommit decision JSON: ${args.out}`);

  if (args.runDecisionCycle) {
    runDecisionCycle(args, decision);
  }
}

try {
  main();
} catch (error) {
  console.error(`[openclaw-converter] ${error.message || error}`);
  process.exit(1);
}
