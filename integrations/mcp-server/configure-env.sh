#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage:
  configure-env.sh [--env-file <PATH>] [--private-key <HEX>] [--bsc-rpc-url <URL>] [--bsc-testnet-rpc-url <URL>]

Interactive wizard for integrations/mcp-server/.env.
- Prompts for DEPLOYER_PRIVATE_KEY (input hidden on TTY)
- Prompts for BSC_RPC_URL
- Prompts for BSC_TESTNET_RPC_URL
- Validates and writes values safely
USAGE
}

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ENV_FILE="$SCRIPT_DIR/.env"
ENV_EXAMPLE="$SCRIPT_DIR/.env.example"
DEFAULT_BSC_RPC_URL="https://bsc-dataseed.binance.org/"
DEFAULT_BSC_TESTNET_RPC_URL="https://data-seed-prebsc-1-s1.binance.org:8545/"

arg_private_key=""
arg_bsc_rpc_url=""
arg_bsc_testnet_rpc_url=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --env-file) ENV_FILE="$2"; shift 2 ;;
    --private-key) arg_private_key="$2"; shift 2 ;;
    --bsc-rpc-url) arg_bsc_rpc_url="$2"; shift 2 ;;
    --bsc-testnet-rpc-url) arg_bsc_testnet_rpc_url="$2"; shift 2 ;;
    -h|--help) usage; exit 0 ;;
    *)
      echo "error: unknown argument '$1'" >&2
      usage
      exit 1
      ;;
  esac
done

if [[ ! -f "$ENV_FILE" ]]; then
  if [[ -f "$ENV_EXAMPLE" ]]; then
    mkdir -p "$(dirname "$ENV_FILE")"
    cp "$ENV_EXAMPLE" "$ENV_FILE"
    echo "[mcp-env] Created $ENV_FILE from $ENV_EXAMPLE"
  else
    mkdir -p "$(dirname "$ENV_FILE")"
    touch "$ENV_FILE"
    echo "[mcp-env] Created empty env file at $ENV_FILE"
  fi
fi

get_env_value() {
  local key="$1"
  local line
  line="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 || true)"
  if [[ -z "$line" ]]; then
    echo ""
  else
    echo "${line#*=}"
  fi
}

set_env_value() {
  local key="$1"
  local value="$2"
  local tmp
  tmp="$(mktemp)"
  awk -v k="$key" -v v="$value" '
    BEGIN { updated = 0 }
    $0 ~ ("^" k "=") {
      print k "=" v
      updated = 1
      next
    }
    { print }
    END {
      if (!updated) {
        print k "=" v
      }
    }
  ' "$ENV_FILE" > "$tmp"
  mv "$tmp" "$ENV_FILE"
}

strip_wrapping_quotes() {
  local v="$1"
  if [[ "${v:0:1}" == "\"" && "${v: -1}" == "\"" ]]; then
    v="${v:1:${#v}-2}"
  fi
  if [[ "${v:0:1}" == "'" && "${v: -1}" == "'" ]]; then
    v="${v:1:${#v}-2}"
  fi
  echo "$v"
}

strip_all_whitespace() {
  local v="$1"
  # Remove spaces, tabs, newlines, and other whitespace from pasted input.
  printf '%s' "$v" | tr -d '[:space:]'
}

normalize_private_key() {
  local v
  v="$(strip_wrapping_quotes "$1")"
  v="$(strip_all_whitespace "$v")"
  v="${v//$'\r'/}"

  # Accept common paste patterns like:
  # - raw 64 hex chars
  # - 0x + 64 hex chars
  # - text that includes either of the above
  if [[ "$v" =~ (0x[0-9a-fA-F]{64}) ]]; then
    v="${BASH_REMATCH[1]}"
  elif [[ "$v" =~ ([0-9a-fA-F]{64}) ]]; then
    v="0x${BASH_REMATCH[1]}"
  fi

  if [[ "$v" =~ ^[0-9a-fA-F]{64}$ ]]; then
    v="0x$v"
  fi

  echo "$v"
}

validate_private_key() {
  local v="$1"
  if [[ ! "$v" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
    return 1
  fi
}

mask_private_key() {
  local v="$1"
  if [[ ${#v} -lt 12 ]]; then
    echo "[REDACTED]"
    return
  fi
  printf "%s...%s" "${v:0:6}" "${v: -4}"
}

prompt_text() {
  local label="$1"
  local default_value="$2"
  local answer=""
  if [[ -t 0 ]]; then
    read -r -p "$label [$default_value]: " answer
  else
    read -r answer
  fi

  if [[ -z "$answer" ]]; then
    answer="$default_value"
  fi
  echo "$answer"
}

prompt_secret() {
  local label="$1"
  local current_value="$2"
  local answer=""

  if [[ -t 0 ]]; then
    if [[ -n "$current_value" ]]; then
      local masked
      masked="$(mask_private_key "$current_value")"
      echo "[mcp-env] Current $label is set to $masked"
      read -r -s -p "Paste new $label (press Enter to keep current): " answer
      echo ""
      if [[ -z "$answer" ]]; then
        answer="$current_value"
      fi
    else
      read -r -s -p "Paste $label: " answer
      echo ""
    fi
  else
    read -r answer
    if [[ -z "$answer" && -n "$current_value" ]]; then
      answer="$current_value"
    fi
  fi

  echo "$answer"
}

current_private_key="$(get_env_value "DEPLOYER_PRIVATE_KEY")"
current_bsc_rpc_url="$(get_env_value "BSC_RPC_URL")"
current_bsc_testnet_rpc_url="$(get_env_value "BSC_TESTNET_RPC_URL")"

if [[ -z "$current_bsc_rpc_url" ]]; then
  current_bsc_rpc_url="$DEFAULT_BSC_RPC_URL"
fi
if [[ -z "$current_bsc_testnet_rpc_url" ]]; then
  current_bsc_testnet_rpc_url="$DEFAULT_BSC_TESTNET_RPC_URL"
fi

echo "[mcp-env] Configuring $ENV_FILE"
echo "[mcp-env] Paste private key from your wallet export."
echo "[mcp-env] Accepted formats: 64 hex chars, or 0x + 64 hex chars."
echo "[mcp-env] Extra spaces/newlines are stripped automatically."

private_key_input="${arg_private_key}"
if [[ -z "$private_key_input" ]]; then
  while true; do
    private_key_input="$(prompt_secret "DEPLOYER_PRIVATE_KEY" "$current_private_key")"
    private_key_input="$(normalize_private_key "$private_key_input")"
    if [[ -z "$private_key_input" ]]; then
      echo "[mcp-env] DEPLOYER_PRIVATE_KEY cannot be empty." >&2
      continue
    fi
    if ! validate_private_key "$private_key_input"; then
      echo "[mcp-env] Invalid private key format. Expect 0x + 64 hex chars." >&2
      continue
    fi
    break
  done
else
  private_key_input="$(normalize_private_key "$private_key_input")"
  if ! validate_private_key "$private_key_input"; then
    echo "[mcp-env] Invalid --private-key format. Expect 0x + 64 hex chars." >&2
    exit 1
  fi
fi

bsc_rpc_url="${arg_bsc_rpc_url}"
if [[ -z "$bsc_rpc_url" ]]; then
  bsc_rpc_url="$(prompt_text "BSC_RPC_URL" "$current_bsc_rpc_url")"
fi

bsc_testnet_rpc_url="${arg_bsc_testnet_rpc_url}"
if [[ -z "$bsc_testnet_rpc_url" ]]; then
  bsc_testnet_rpc_url="$(prompt_text "BSC_TESTNET_RPC_URL" "$current_bsc_testnet_rpc_url")"
fi

set_env_value "DEPLOYER_PRIVATE_KEY" "$private_key_input"
set_env_value "BSC_RPC_URL" "$bsc_rpc_url"
set_env_value "BSC_TESTNET_RPC_URL" "$bsc_testnet_rpc_url"

echo "[mcp-env] Saved values:"
echo "  DEPLOYER_PRIVATE_KEY=$(mask_private_key "$private_key_input")"
echo "  BSC_RPC_URL=$bsc_rpc_url"
echo "  BSC_TESTNET_RPC_URL=$bsc_testnet_rpc_url"
echo "[mcp-env] Updated $ENV_FILE"
