# GitHub Copilot + ClawCommit Quickstart

Get started with ClawCommit in GitHub Copilot in 5 minutes.

## Step 1: Clone and Install

```bash
git clone https://github.com/Armogida/ClawCommit.git
cd ClawCommit
npm install
```

## Step 2: Setup MCP Server

```bash
npm run mcp:setup
```

This creates the MCP server configuration and installs dependencies.

## Step 3: Configure GitHub Copilot

### For VS Code

1. Open VS Code settings (Cmd/Ctrl + ,)
2. Search for "copilot mcp"
3. Click "Edit in settings.json"
4. Add this configuration:

```json
{
  "github.copilot.chat.mcp.servers": {
    "clawcommit": {
      "command": "node",
      "args": [
        "/full/path/to/ClawCommit/integrations/mcp-server/index.js"
      ],
      "env": {
        "DEPLOYER_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY_HERE",
        "BSC_RPC_URL": "https://bsc-dataseed.binance.org/",
        "BSC_TESTNET_RPC_URL": "https://data-seed-prebsc-1-s1.binance.org:8545/"
      }
    }
  }
}
```

Replace `/full/path/to/ClawCommit` with your actual path.

### For Copilot CLI

Create `~/.github-copilot/mcp-servers.json`:

```json
{
  "mcpServers": {
    "clawcommit": {
      "command": "node",
      "args": [
        "/full/path/to/ClawCommit/integrations/mcp-server/index.js"
      ],
      "env": {
        "DEPLOYER_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY_HERE",
        "BSC_RPC_URL": "https://bsc-dataseed.binance.org/",
        "BSC_TESTNET_RPC_URL": "https://data-seed-prebsc-1-s1.binance.org:8545/"
      }
    }
  }
}
```

## Step 4: Get Testnet BNB

1. Create a BSC wallet if you don't have one
2. Visit https://testnet.bnbchain.org/faucet-smart
3. Paste your wallet address
4. Request testnet BNB

## Step 5: Deploy Test Contract

```bash
cd ClawCommit
cp .env.example .env
# Edit .env and add your DEPLOYER_PRIVATE_KEY
npx hardhat run scripts/deploy.ts --network bscTestnet
```

Save the contract address printed at the end.

## Step 6: Test in Copilot

Open GitHub Copilot Chat and try:

```
@workspace Use clawcommit to commit this decision:
Prompt: "Test commit from GitHub Copilot"
Output: "SUCCESS"
Model Version: "github-copilot-quickstart-v1"
Contract: 0xYOUR_CONTRACT_ADDRESS
Network: bscTestnet
```

## Next Steps

- Read the [full documentation](README.md)
- Try [example workflows](examples/)
- Integrate with [GitHub Actions](../github-action/)
- Explore [batch operations](../../scripts/batch/)

## Troubleshooting

**"MCP server not found"**
- Restart VS Code after adding configuration
- Check path is absolute (not relative)
- Verify Node.js is in PATH

**"Private key error"**
- Ensure private key starts with `0x`
- Check wallet has testnet BNB
- Verify .env file is configured

**"Contract not found"**
- Deploy contract first
- Use correct contract address
- Select correct network (testnet/mainnet)

## Support

- [Main README](README.md)
- [MCP Server Docs](../mcp-server/README.md)
- [Troubleshooting Guide](README.md#troubleshooting)
