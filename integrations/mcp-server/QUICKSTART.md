# ClawCommit MCP Server - Quick Start Guide

Get your AI assistant talking to the blockchain in 5 minutes.

## What You'll Build

Enable Claude Code (or any MCP-compatible AI) to:
1. Commit AI decisions privately to BNB Chain
2. Reveal them later with cryptographic proof
3. Verify any commitment trustlessly
4. Compute hashes off-chain without gas costs

## Prerequisites

- Node.js v18+ installed
- A BNB Chain wallet with small BNB balance (~0.01 BNB for testnet testing)
- Claude Code or another MCP-compatible AI client

## Step 1: One-command setup (recommended)

From repo root:

```bash
npm run mcp:setup
```

This sets up dependencies, creates `integrations/mcp-server/.env` if missing, and writes `.claude/settings.json`.

## Step 2: Configure Environment (1 minute)

Edit `integrations/mcp-server/.env` and add your private key:

```env
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

## Step 3: Test the Setup (30 seconds)

```bash
npm run mcp:test
```

Expected output:
```
mcp-server unit tests passed
```

Run deeper connectivity checks from the integration directory:

```bash
cd /Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server
node test-tools.js
```

Expected output:
```
ClawCommit MCP Server - Tool Verification
=========================================

=== Test 1: Compute Hash ===
Decision: Deploy AI model v2.1.0 to production
Nonce: 0x1234...
Hash: 0xabcd...
✓ Hash computed successfully (off-chain, no gas)

=== Test 2: Verify bscTestnet Connection ===
Network: bscTestnet
Chain ID: 97
Current Block: 12345678
✓ Connection successful

=== Test 3: Check Wallet Configuration ===
Wallet Address: 0xYourAddress...
Balance: 0.05 BNB
✓ Wallet configured and funded

=== Summary ===
✓ Hash computation: Working
✓ Network connection: Working
✓ Wallet: Configured
```

If you have a deployed contract, test with:

```bash
node test-tools.js 0xYourContractAddress bscTestnet
```

## Step 4: Fund Testnet Wallet (if balance is low)

If Test 3 shows low or zero `bscTestnet` balance, fund this wallet:

`0x6B13816852B65367a2c6B6e6C1583188C16AdA33`

1. Open the official BNB testnet faucet:
- https://www.bnbchain.org/en/testnet-faucet
2. Paste your wallet address and request `tBNB`.
3. Wait 10-60 seconds for confirmation.
4. Verify in terminal:

```bash
cd /Users/luigiarmogida/Documents/projects/ClawCommit
node integrations/mcp-server/test-tools.js "" bscTestnet
```

If the official faucet is busy, try one of these:
- QuickNode BSC testnet faucet: https://faucet.quicknode.com/binance-smart-chain/bnb-testnet
- Chainstack BNB testnet faucet: https://faucet.chainstack.com/bnb-testnet-faucet

## Step 5: Deploy ClawCommit Contract (Optional, if not already deployed)

If you don't have a contract deployed yet:

```bash
cd ../..
npm run deploy:testnet
```

Save the deployed contract address from the output.

## Step 6: Confirm Claude settings entry

`npm run mcp:setup` writes this entry to `/Users/luigiarmogida/Documents/projects/ClawCommit/.claude/settings.json`:

```json
{
  "mcpServers": {
    "clawcommit": {
      "command": "bash",
      "args": [
        "/Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server/run-mcp.sh"
      ]
    }
  }
}
```

The launcher script reads `integrations/mcp-server/.env`, so secrets are not stored in Claude settings.

## Step 7: Restart Claude Code

Restart Claude Code to load the MCP server. Look for "ClawCommit MCP Server running" in the logs.

## Step 8: Test in Claude Code (1 minute)

Open a new conversation in Claude Code and try:

```
Use the clawcommit_compute_hash tool to compute a hash for the decision
"Deploy model v1.0" with an auto-generated nonce.
```

Expected response:
```json
{
  "success": true,
  "prompt": "[REDACTED]",
  "output": "[REDACTED]",
  "nonce": "[REDACTED]",
  "hash": "0x...",
  "sensitiveFieldsRedacted": true,
  "message": "Hash computed successfully"
}
```

## Complete Workflow Example

### Scenario: Commit and Reveal an AI Decision

**Step 1 - Commit a private decision:**

```
User: Commit the decision "Increase GPU allocation to 8x H100s for training"
to contract 0x1234567890123456789012345678901234567890 on bscTestnet.
```

Claude Code response:
```json
{
  "success": true,
  "commitId": "7",
  "hash": "0xabc123...",
  "nonce": "[REDACTED]",
  "txHash": "0x789ghi...",
  "explorerUrl": "https://testnet.bscscan.com/tx/0x789ghi...",
  "sensitiveFieldsRedacted": true,
  "message": "Decision committed successfully. Sensitive fields are redacted."
}
```

**Step 2 - Later, reveal the decision:**

```
User: Reveal commitment 7 with decision "Increase GPU allocation to 8x H100s for training"
and nonce "0xdef456..." on contract 0x1234567890123456789012345678901234567890.
```

Claude Code response:
```json
{
  "success": true,
  "commitId": "7",
  "verified": true,
  "message": "Decision revealed and verified successfully"
}
```

**Step 3 - Anyone can verify:**

```
User: Verify commitment 7 on contract 0x1234567890123456789012345678901234567890.
```

Claude Code response:
```json
{
  "success": true,
  "commitId": "7",
  "prompt": "[REDACTED]",
  "output": "[REDACTED]",
  "nonce": "[REDACTED]",
  "verified": true,
  "timestamp": "2026-02-14T15:30:00.000Z",
  "committer": "0xYourAddress...",
  "sensitiveFieldsRedacted": true,
  "message": "Commitment verified successfully"
}
```

## Use Cases

### 1. AI Model Deployment Decisions
Commit deployment decisions before rollout, reveal after validation period.

### 2. Budget Approvals
Commit budget decisions privately, reveal after stakeholder alignment.

### 3. Feature Flag Decisions
Commit A/B test configurations before experiment, reveal after completion.

### 4. Security Decisions
Commit incident response plans before execution, reveal after resolution.

### 5. Compliance Logging
Create tamper-evident audit logs of AI decision-making processes.

## Network Selection

**BSC Testnet (Recommended for testing):**
- Network: `bscTestnet`
- Faucet: https://www.bnbchain.org/en/testnet-faucet
- Explorer: https://testnet.bscscan.com
- Cost: Free (testnet BNB)

**BSC Mainnet (Production):**
- Network: `bscMainnet`
- Cost: ~$0.10-0.25 per operation
- Explorer: https://bscscan.com

## Troubleshooting

### "DEPLOYER_PRIVATE_KEY not found"
- Check `.env` file exists in the mcp-server directory
- Verify private key is set correctly (no quotes needed)
- Restart Claude Code after changing environment variables

### "Insufficient funds for gas"
- Get testnet BNB from faucet: https://www.bnbchain.org/en/testnet-faucet
- Or fund mainnet wallet from an exchange

### "Hash mismatch" during reveal
- Ensure decision and nonce match EXACTLY what was committed
- Decision strings are case-sensitive and whitespace-sensitive
- Store the nonce securely after committing

### "ClawCommit server not responding"
- Check Claude Code logs for error messages
- Verify Node.js v18+ is installed: `node --version`
- Test manually: `node index.js` (should start without errors)

### "Contract not found at address"
- Verify you're on the correct network (mainnet vs testnet)
- Check contract address is correct
- Ensure contract is deployed (run deploy script if needed)

## Advanced Configuration

### Custom RPC Endpoints

Edit `.env` to use your own RPC endpoints:

```env
BSC_RPC_URL=https://your-custom-rpc.example.com
BSC_TESTNET_RPC_URL=https://your-testnet-rpc.example.com
```

### Using with Multiple Contracts

The MCP tools accept `contract_address` as a parameter, so you can interact with multiple contracts:

```
Commit to contract 0xContract1...
Commit to contract 0xContract2...
```

### Read-Only Operations

The `clawcommit_verify` and `clawcommit_compute_hash` tools work without a private key. Great for public verification:

```json
{
  "mcpServers": {
    "clawcommit-readonly": {
      "command": "node",
      "args": ["/path/to/index.js"]
    }
  }
}
```

## Security Best Practices

1. **Never commit private keys** to version control
2. **Store nonces securely** - you need them to reveal
3. **Test on testnet first** before using mainnet
4. **Set `allow_mainnet_writes=true` explicitly** before any mainnet write
5. **Verify hashes locally** before revealing (tools do this automatically)
6. **Use separate wallets** for different environments
7. **Monitor transactions** on BSCScan for unexpected behavior
8. **Keep dependencies updated** for security patches

## Next Steps

- Read the full [README.md](./README.md) for detailed API documentation
- Explore the [ClawCommit contract](../../contracts/ClawCommit.sol) source code
- Join discussions about AI + blockchain integration patterns
- Build custom workflows integrating ClawCommit into your AI pipelines

## Performance Tips

- **Batch operations** when possible to save gas
- **Use testnet** for development and testing
- **Cache contract ABIs** if building custom clients
- **Monitor gas prices** on BSC (usually very low)
- **Pre-compute hashes** off-chain when feasible

## Support Resources

- **BSC Testnet Faucet**: https://testnet.bnbchain.org/faucet-smart
- **BSCScan Explorer**: https://bscscan.com
- **BNB Chain Docs**: https://docs.bnbchain.org
- **MCP Specification**: https://modelcontextprotocol.io
- **Ethers.js Docs**: https://docs.ethers.org

## Example Prompts for Claude Code

Try these prompts after setup:

```
1. "Compute a hash for my decision to deploy model v2.0"

2. "Commit this decision privately: 'Approve $50k budget for Q2 GPU costs'"

3. "Reveal commitment ID 5 that I made yesterday"

4. "Verify commitment 10 and show me the timestamp and committer"

5. "What's the hash if I commit 'Enable feature flag X' with nonce 0x123...?"

6. "Show me the gas cost for committing a decision on mainnet"
```

## Success!

You're now ready to use ClawCommit with Claude Code. Your AI assistant can now interact with the blockchain to create tamper-evident decision logs.

**Happy committing!** 🎉
