#!/bin/bash
# commit-copilot-session.sh
# Script to commit this GitHub Copilot integration development session to ClawCommit

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo "=========================================="
echo "ClawCommit Session Commitment"
echo "GitHub Copilot Integration Development"
echo "=========================================="
echo ""

# Check if we're in the right directory
if [ ! -f "package.json" ] || ! grep -q "clawcommit" package.json; then
    echo -e "${RED}Error: Must run from ClawCommit repository root${NC}"
    exit 1
fi

# Check for required environment variables
if [ -z "$DEPLOYER_PRIVATE_KEY" ]; then
    echo -e "${YELLOW}Warning: DEPLOYER_PRIVATE_KEY not set${NC}"
    echo "Set it with: export DEPLOYER_PRIVATE_KEY=0xYourPrivateKey"
    exit 1
fi

# Configuration
NETWORK="${NETWORK:-bscTestnet}"
CONTRACT="${CONTRACT:-0xF05FbbB9Ba8509042E574428D5f7C6E73e302b1A}"
ALLOW_MAINNET="${ALLOW_MAINNET:-false}"

echo "Network: $NETWORK"
echo "Contract: $CONTRACT"
echo ""

# Session metadata
PROMPT="Build GitHub Copilot integration for ClawCommit - enable MCP-based blockchain commit-reveal operations from within GitHub Copilot"
OUTPUT="COMPLETED - Created full integration: README, QUICKSTART, examples (VS Code, CLI configs, prompts), updated main docs, added integration comparison"
MODEL_VERSION="github-copilot-agent-2026-02-15"

# Generate nonce if not provided
if [ -z "$NONCE" ]; then
    NONCE="0x$(openssl rand -hex 32)"
    echo -e "${GREEN}Generated nonce: $NONCE${NC}"
    echo "$NONCE" > /tmp/copilot-session-nonce.txt
    echo "Nonce saved to /tmp/copilot-session-nonce.txt"
else
    echo "Using provided nonce: $NONCE"
fi
echo ""

# Confirm before proceeding
if [ "$NETWORK" = "bsc" ] || [ "$NETWORK" = "bscMainnet" ]; then
    echo -e "${YELLOW}WARNING: This will write to BSC MAINNET${NC}"
    echo "This costs real BNB. Are you sure? (yes/no)"
    read -r CONFIRM
    if [ "$CONFIRM" != "yes" ]; then
        echo "Aborted."
        exit 0
    fi
    ALLOW_MAINNET="true"
fi

echo "Committing session to blockchain..."
echo ""

# Run the commit
HARDHAT_NETWORK=$NETWORK npx ts-node scripts/commit.ts \
    --contract "$CONTRACT" \
    --prompt "$PROMPT" \
    --output "$OUTPUT" \
    --model-version "$MODEL_VERSION" \
    --nonce "$NONCE" \
    --allow-mainnet-writes "$ALLOW_MAINNET" \
    --log-sensitive true

echo ""
echo -e "${GREEN}Session committed successfully!${NC}"
echo ""
echo "Next steps:"
echo "1. Save the commit ID printed above"
echo "2. After PR is merged, reveal with:"
echo ""
echo "   HARDHAT_NETWORK=$NETWORK npx ts-node scripts/reveal.ts \\"
echo "     --contract $CONTRACT \\"
echo "     --commit-id YOUR_COMMIT_ID \\"
echo "     --prompt \"$PROMPT\" \\"
echo "     --output \"$OUTPUT\" \\"
echo "     --model-version \"$MODEL_VERSION\" \\"
echo "     --nonce \"$NONCE\" \\"
echo "     --allow-mainnet-writes $ALLOW_MAINNET \\"
echo "     --log-sensitive true"
echo ""
echo "3. Verify with:"
echo "   npx ts-node scripts/replay.ts --tx YOUR_REVEAL_TX_HASH"
