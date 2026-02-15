#!/usr/bin/env node

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

function usage() {
  console.log(`Usage:
  node scripts/integration/fetch-pr-artifact.js --repo <OWNER/REPO> --pr-number <PR_NUMBER> [--name <ARTIFACT_NAME>] [--out-dir <DIR>]

Notes:
- Requires gh CLI and GH_TOKEN/GITHUB_TOKEN auth.
- Downloads latest non-expired artifact zip and extracts it into out-dir.
- Prints "FOUND_ARTIFACT_FILE=<path>" on success.`);
}

function parseArgs(argv) {
  const args = {
    repo: "",
    prNumber: "",
    name: "",
    outDir: ".clawcommit/openclaw",
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    switch (arg) {
      case "--repo":
        args.repo = argv[++i] || "";
        break;
      case "--pr-number":
        args.prNumber = argv[++i] || "";
        break;
      case "--name":
        args.name = argv[++i] || "";
        break;
      case "--out-dir":
        args.outDir = argv[++i] || args.outDir;
        break;
      case "-h":
      case "--help":
        usage();
        process.exit(0);
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.repo) {
    throw new Error("--repo is required");
  }
  if (!/^\d+$/.test(args.prNumber)) {
    throw new Error("--pr-number must be a numeric value");
  }
  if (!args.name) {
    args.name = `clawcommit-openclaw-pr-${args.prNumber}-latest`;
  }
  return args;
}

function ensureGhAuth() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || "";
  if (!token) {
    throw new Error("Set GH_TOKEN or GITHUB_TOKEN for GitHub API authentication");
  }
}

function ghApiJson(pathArg) {
  const output = execFileSync("gh", ["api", pathArg], { encoding: "utf8" });
  return JSON.parse(output);
}

function findArtifact(repo, artifactName) {
  let page = 1;
  let best = null;
  while (page <= 10) {
    const data = ghApiJson(`repos/${repo}/actions/artifacts?per_page=100&page=${page}`);
    const artifacts = Array.isArray(data.artifacts) ? data.artifacts : [];
    for (const artifact of artifacts) {
      if (artifact.name !== artifactName || artifact.expired) {
        continue;
      }
      if (!best || new Date(artifact.created_at) > new Date(best.created_at)) {
        best = artifact;
      }
    }
    if (artifacts.length < 100) {
      break;
    }
    page += 1;
  }
  return best;
}

function collectFilesRecursive(dir) {
  const out = [];
  const stack = [dir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile()) {
        out.push(full);
      }
    }
  }
  return out;
}

function main() {
  ensureGhAuth();
  const args = parseArgs(process.argv.slice(2));
  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const artifact = findArtifact(args.repo, args.name);
  if (!artifact) {
    throw new Error(
      `No non-expired artifact found with name '${args.name}' in ${args.repo}`
    );
  }

  const tmpZip = path.join(os.tmpdir(), `clawcommit-artifact-${artifact.id}.zip`);
  const zipBytes = execFileSync(
    "gh",
    ["api", `repos/${args.repo}/actions/artifacts/${artifact.id}/zip`],
    { encoding: "buffer" }
  );
  fs.writeFileSync(tmpZip, zipBytes);

  execFileSync("unzip", ["-o", tmpZip, "-d", outDir], { stdio: "inherit" });
  fs.unlinkSync(tmpZip);

  const files = collectFilesRecursive(outDir);
  const match = files.find(
    (filePath) =>
      filePath.endsWith(`pr-${args.prNumber}-latest.json`) ||
      path.basename(filePath) === `${args.name}.json`
  );

  if (!match) {
    throw new Error(`Artifact extracted, but no PR JSON found in ${outDir}`);
  }

  console.log(`FOUND_ARTIFACT_ID=${artifact.id}`);
  console.log(`FOUND_ARTIFACT_NAME=${artifact.name}`);
  console.log(`FOUND_ARTIFACT_FILE=${match}`);
}

try {
  main();
} catch (error) {
  console.error(`[fetch-pr-artifact] ${error.message || error}`);
  process.exit(1);
}
