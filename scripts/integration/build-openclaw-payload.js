#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

function usage() {
  console.log(`Usage:
  node scripts/integration/build-openclaw-payload.js --input <INPUT_JSON> [--out <OUTPUT_JSON>] [--log-sensitive <true|false>]

Input JSON schema:
{
  "modelVersion": "openclaw-agent-v1",
  "context": {
    "workflow": "openclaw-pr-validation",
    "repository": "owner/repo",
    "ref": "refs/pull/1/head",
    "sha": "abc123",
    "actor": "github-actions[bot]",
    "runId": "12345",
    "runUrl": "https://github.com/owner/repo/actions/runs/12345"
  },
  "validations": [
    { "name": "compile", "passed": true, "required": true, "details": "ok" }
  ]
}`);
}

function parseArgs(argv) {
  const args = {
    input: "",
    out: "",
    logSensitive: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--input") {
      args.input = argv[++i] || "";
    } else if (arg === "--out") {
      args.out = argv[++i] || "";
    } else if (arg === "--log-sensitive") {
      const value = (argv[++i] || "").trim().toLowerCase();
      args.logSensitive = ["1", "true", "yes", "on"].includes(value);
    } else if (arg === "-h" || arg === "--help") {
      usage();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.input) {
    throw new Error("--input is required");
  }
  return args;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const inputPath = path.resolve(args.input);
  if (!fs.existsSync(inputPath)) {
    throw new Error(`Input file not found: ${inputPath}`);
  }

  const sdkEntry = path.resolve(__dirname, "../../integrations/sdk/dist/index.js");
  if (!fs.existsSync(sdkEntry)) {
    throw new Error(
      `SDK build not found at ${sdkEntry}. Run: npm ci --prefix integrations/sdk && npm run build --prefix integrations/sdk`
    );
  }

  const { buildOpenClawDecisionPayload } = require(sdkEntry);
  if (typeof buildOpenClawDecisionPayload !== "function") {
    throw new Error("buildOpenClawDecisionPayload export not found in SDK build");
  }

  const input = readJson(inputPath);
  const payload = buildOpenClawDecisionPayload({
    modelVersion: input.modelVersion,
    context: input.context,
    validations: input.validations,
  });

  const outputPath = args.out ? path.resolve(args.out) : "";
  if (outputPath) {
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(`Payload written: ${outputPath}`);
  }

  const preview = {
    prompt: args.logSensitive ? payload.prompt : "[REDACTED]",
    output: payload.output,
    modelVersion: payload.modelVersion,
    promptTemplateVersion: payload.promptTemplateVersion,
    promptDigest: payload.promptDigest,
    requiredValidationCount: payload.requiredValidationCount,
    requiredFailureCount: payload.requiredFailureCount,
  };

  console.log(JSON.stringify(preview, null, 2));
}

try {
  main();
} catch (error) {
  console.error(`[openclaw-payload] ${error.message || error}`);
  process.exit(1);
}
