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

## Step 1: Install Dependencies (30 seconds)

```bash
cd /Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server
npm install
```

Expected output:
```
added 45 packages in 12s
```

## Step 2: Configure Environment (1 minute)

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and add your private key:

```env
DEPLOYER_PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE
```

**Where to get your private key:**
- MetaMask: Account menu → Account details → Export private key
- Other wallets: Check wallet documentation

**Security:** Never commit `.env` to git. It's already in `.gitignore`.

## Step 3: Test the Setup (30 seconds)

Run the test script to verify everything works:

```bash
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

## Step 4: Deploy ClawCommit Contract (Optional, if not already deployed)

If you don't have a contract deployed yet:

```bash
cd ../..
npm run deploy:testnet
```

Save the deployed contract address from the output.

## Step 5: Add to Claude Code (2 minutes)

Edit `/Users/luigiarmogida/Documents/projects/ClawCommit/.claude/settings.json`:

```json
{
  "mcpServers": {
    "clawcommit": {
      "command": "node",
      "args": [
        "/Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server/index.js"
      ],
      "env": {
        "DEPLOYER_PRIVATE_KEY": "0xYOUR_PRIVATE_KEY_HERE"
      }
    }
  }
}
```

Or create a global config at `~/.config/claude-code/settings.json` (macOS/Linux) or `%APPDATA%\claude-code\settings.json` (Windows).

## Step 6: Restart Claude Code

Restart Claude Code to load the MCP server. Look for "ClawCommit MCP Server running" in the logs.

## Step 7: Test in Claude Code (1 minute)

Open a new conversation in Claude Code and try:

```
Use the clawcommit_compute_hash tool to compute a hash for the decision
"Deploy model v1.0" with an auto-generated nonce.
```

Expected response:
```json
{
  "success": true,
  "decision": "Deploy model v1.0",
  "nonce": "0x...",
  "hash": "0x...",
  "message": "Hash computed successfully. Use this hash for commit operations."
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
  "commitId": 7,
  "hash": "0xabc123...",
  "nonce": "0xdef456...",
  "txHash": "0x789ghi...",
  "explorerUrl": "https://testnet.bscscan.com/tx/0x789ghi...",
  "message": "Decision committed successfully. Keep the nonce safe for reveal operation."
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
  "commitId": 7,
  "decision": "Increase GPU allocation to 8x H100s for training",
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
  "commitId": 7,
  "decision": "Increase GPU allocation to 8x H100s for training",
  "verified": true,
  "timestamp": "2026-02-14T15:30:00.000Z",
  "committer": "0xYourAddress...",
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
- Faucet: https://testnet.bnbchain.org/faucet-smart
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
- Get testnet BNB from faucet: https://testnet.bnbchain.org/faucet-smart
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
4. **Verify hashes locally** before revealing (tools do this automatically)
5. **Use separate wallets** for different environments
6. **Monitor transactions** on BSCScan for unexpected behavior
7. **Keep dependencies updated** for security patches

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
