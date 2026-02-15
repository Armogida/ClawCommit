#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  setup-local.sh [--skip-install] [--skip-test] [--configure-env]

Sets up ClawCommit MCP integration for this repository by:
1) installing integrations/mcp-server dependencies,
2) creating integrations/mcp-server/.env if missing,
3) writing/updating .claude/settings.json with a clawcommit MCP entry.
4) optionally running an interactive env wizard.
USAGE
}

skip_install="false"
skip_test="false"
configure_env="false"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --skip-install) skip_install="true"; shift ;;
    --skip-test) skip_test="true"; shift ;;
    --configure-env) configure_env="true"; shift ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
MCP_DIR="$REPO_ROOT/integrations/mcp-server"
ENV_FILE="$MCP_DIR/.env"
ENV_EXAMPLE="$MCP_DIR/.env.example"
CLAUDE_DIR="$REPO_ROOT/.claude"
CLAUDE_SETTINGS="$CLAUDE_DIR/settings.json"
RUN_SCRIPT="$MCP_DIR/run-mcp.sh"
ENV_WIZARD="$MCP_DIR/configure-env.sh"

if [[ ! -f "$MCP_DIR/package.json" ]]; then
  echo "error: mcp-server package.json not found at $MCP_DIR" >&2
  exit 1
fi

if [[ "$skip_install" != "true" ]]; then
  echo "[mcp-setup] Installing mcp-server dependencies"
  (cd "$MCP_DIR" && npm install)
else
  echo "[mcp-setup] Skipping dependency install"
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "[mcp-setup] Creating $ENV_FILE from .env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
else
  echo "[mcp-setup] Reusing existing $ENV_FILE"
fi

mkdir -p "$CLAUDE_DIR"

node - "$CLAUDE_SETTINGS" "$RUN_SCRIPT" <<'NODE'
const fs = require("fs");
const path = require("path");

const settingsPath = process.argv[2];
const runScript = process.argv[3];

let settings = {};
if (fs.existsSync(settingsPath)) {
  const raw = fs.readFileSync(settingsPath, "utf8").trim();
  if (raw.length > 0) {
    settings = JSON.parse(raw);
  }
}

if (typeof settings !== "object" || settings === null || Array.isArray(settings)) {
  throw new Error("Existing settings.json must contain a JSON object.");
}

if (!settings.mcpServers || typeof settings.mcpServers !== "object") {
  settings.mcpServers = {};
}

settings.mcpServers.clawcommit = {
  command: "bash",
  args: [runScript],
};

fs.writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`);
console.log(`[mcp-setup] Updated ${settingsPath}`);
NODE

chmod +x "$RUN_SCRIPT"
chmod +x "$ENV_WIZARD"

if [[ "$skip_test" != "true" ]]; then
  echo "[mcp-setup] Running unit tests"
  (cd "$MCP_DIR" && npm test)
else
  echo "[mcp-setup] Skipping unit tests"
fi

if [[ "$configure_env" == "true" ]]; then
  echo "[mcp-setup] Launching interactive env wizard"
  bash "$ENV_WIZARD" --env-file "$ENV_FILE"
fi

if grep -q "0x1234567890abcdef" "$ENV_FILE"; then
  echo "[mcp-setup] WARNING: DEPLOYER_PRIVATE_KEY is still example value in $ENV_FILE"
  echo "[mcp-setup]          Update it before commit/reveal operations."
fi

echo "[mcp-setup] Done"
echo "[mcp-setup] Claude settings: $CLAUDE_SETTINGS"
echo "[mcp-setup] MCP launcher:    $RUN_SCRIPT"
