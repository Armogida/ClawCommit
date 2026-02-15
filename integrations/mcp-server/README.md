# ClawCommit MCP Server

Model Context Protocol (MCP) server for ClawCommit - enables AI assistants like Claude Code to interact with the blockchain-based commit-reveal protocol for AI decision verification.

## Overview

This MCP server provides native blockchain integration for AI tools, allowing them to:

- **Commit** AI decisions with cryptographic privacy
- **Reveal** decisions with tamper-evident verification
- **Verify** any revealed commitment trustlessly
- **Compute** deterministic hashes off-chain

All operations are performed on BNB Chain (BSC Mainnet or Testnet).

## Installation

```bash
cd /Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server
npm install
```

## Environment Setup

Create a `.env` file in this directory (or use the root project `.env`):

```env
# Required for commit/reveal operations (transactions)
DEPLOYER_PRIVATE_KEY=your_private_key_here

# Optional: Custom RPC endpoints
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/
```

**Security Note**: The private key is only used when committing or revealing. Read-only operations (verify, compute_hash) work without it.

## Configure Claude Code

Add the MCP server to your Claude Code configuration at `/Users/luigiarmogida/Documents/projects/ClawCommit/.claude/settings.json`:

```json
{
  "mcpServers": {
    "clawcommit": {
      "command": "node",
      "args": [
        "/Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server/index.js"
      ],
      "env": {
        "DEPLOYER_PRIVATE_KEY": "your_private_key_here"
      }
    }
  }
}
```

Alternatively, if you have a global `.env` file configured:

```json
{
  "mcpServers": {
    "clawcommit": {
      "command": "node",
      "args": [
        "/Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server/index.js"
      ]
    }
  }
}
```

## Available Tools

### 1. clawcommit_commit

Commit an AI decision hash to BNB Chain. The decision remains private until revealed.

**Parameters:**
- `decision` (string, required): The AI decision or data to commit
- `nonce` (string, optional): Nonce for additional entropy (auto-generated if omitted)
- `contract_address` (string, required): ClawCommit contract address
- `network` (enum, default: "bscMainnet"): Network to use ("bscMainnet" or "bscTestnet")

**Returns:**
```json
{
  "success": true,
  "commitId": 42,
  "hash": "0x1234...",
  "nonce": "0x5678...",
  "txHash": "0xabcd...",
  "explorerUrl": "https://bscscan.com/tx/0xabcd...",
  "committer": "0x...",
  "message": "Decision committed successfully. Keep the nonce safe for reveal operation."
}
```

### 2. clawcommit_reveal

Reveal a previously committed decision. Only the original committer can reveal.

**Parameters:**
- `commit_id` (number, required): The commitment ID to reveal
- `decision` (string, required): The original decision string
- `nonce` (string, required): The nonce used during commitment
- `contract_address` (string, required): ClawCommit contract address
- `network` (enum, default: "bscMainnet"): Network to use

**Returns:**
```json
{
  "success": true,
  "commitId": 42,
  "decision": "Deploy model version 2.1.0",
  "txHash": "0xabcd...",
  "explorerUrl": "https://bscscan.com/tx/0xabcd...",
  "verified": true,
  "message": "Decision revealed and verified successfully"
}
```

### 3. clawcommit_verify

Verify a revealed commitment by replaying the hash computation. Zero gas, anyone can verify.

**Parameters:**
- `commit_id` (number, required): The commitment ID to verify
- `contract_address` (string, required): ClawCommit contract address
- `network` (enum, default: "bscMainnet"): Network to use

**Returns:**
```json
{
  "success": true,
  "commitId": 42,
  "decision": "Deploy model version 2.1.0",
  "nonce": "0x5678...",
  "storedHash": "0x1234...",
  "replayHash": "0x1234...",
  "verified": true,
  "timestamp": "2026-02-14T12:00:00.000Z",
  "committer": "0x...",
  "message": "Commitment verified successfully"
}
```

### 4. clawcommit_compute_hash

Compute the deterministic keccak256 hash for a decision and nonce. Off-chain, no gas cost.

**Parameters:**
- `decision` (string, required): The decision string to hash
- `nonce` (string, optional): Nonce for entropy (auto-generated if omitted)

**Returns:**
```json
{
  "success": true,
  "decision": "Deploy model version 2.1.0",
  "nonce": "0x5678...",
  "hash": "0x1234...",
  "algorithm": "keccak256(abi.encodePacked(decision, nonce))",
  "message": "Hash computed successfully. Use this hash for commit operations."
}
```

## Usage Examples in Claude Code

### Example 1: Commit a Decision

```
User: Commit my decision "Deploy model v3.0 to production" to the ClawCommit contract
at 0x1234567890123456789012345678901234567890 on BSC Mainnet.
```

Claude Code will use `clawcommit_commit` tool automatically and return the commitment ID and transaction details.

### Example 2: Reveal a Decision

```
User: Reveal commitment ID 42 with decision "Deploy model v3.0 to production"
and nonce "0x5678..." on contract 0x1234567890123456789012345678901234567890.
```

Claude Code will use `clawcommit_reveal` tool and verify the reveal was successful.

### Example 3: Verify a Commitment

```
User: Verify commitment ID 42 on contract 0x1234567890123456789012345678901234567890.
```

Claude Code will use `clawcommit_verify` tool to replay the hash and confirm integrity.

### Example 4: Pre-compute Hash

```
User: What hash would I get if I committed "Deploy model v3.0 to production"
with nonce "0x5678..."?
```

Claude Code will use `clawcommit_compute_hash` tool to show the hash without any blockchain interaction.

## Complete Workflow Example

```
User: I need to commit a decision privately and reveal it later.

Claude: I'll help you commit a decision to the blockchain. What decision would you like to commit?

User: "Approve budget increase to $50,000 for Q2"

Claude: [Uses clawcommit_commit tool]

Response:
{
  "commitId": 15,
  "hash": "0xa1b2c3...",
  "nonce": "0xd4e5f6...",
  "txHash": "0x123abc...",
  "message": "Decision committed successfully. Keep the nonce safe for reveal operation."
}

Your decision has been committed! The commitment ID is 15. I've saved the nonce: 0xd4e5f6...
When you're ready to reveal, just let me know.

[Later...]

User: Reveal commitment 15 now.

Claude: [Uses clawcommit_reveal tool with stored nonce]

Response:
{
  "commitId": 15,
  "decision": "Approve budget increase to $50,000 for Q2",
  "verified": true,
  "txHash": "0x456def...",
  "message": "Decision revealed and verified successfully"
}

Your decision has been revealed and verified on-chain! Anyone can now verify this commitment
was made at the original timestamp and hasn't been tampered with.
```

## Networks Supported

- **BSC Mainnet** (`bscMainnet`): Production environment
- **BSC Testnet** (`bscTestnet`): Testing environment

## Gas Requirements

Typical gas costs on BSC:

- **Commit**: ~50,000-80,000 gas (~$0.10-0.15 USD on BSC)
- **Reveal**: ~80,000-120,000 gas (~$0.15-0.25 USD on BSC)
- **Verify**: Free (read-only)
- **Compute Hash**: Free (off-chain)

Ensure your wallet has sufficient BNB for transaction fees.

## Security Best Practices

1. **Keep nonces private** until you're ready to reveal
2. **Store commitId** - you'll need it for reveal operations
3. **Verify locally** before revealing (the tool does this automatically)
4. **Use testnet first** when integrating new workflows
5. **Never commit sensitive keys** or credentials directly

## Troubleshooting

### "DEPLOYER_PRIVATE_KEY not found in environment"

You need to set your private key for commit/reveal operations. Add it to `.env` or Claude Code's MCP configuration.

### "Hash mismatch. Decision or nonce incorrect."

You're trying to reveal with a different decision or nonce than you committed. Double-check both values match exactly.

### "Only committer can reveal"

Only the address that created the commitment can reveal it. Verify you're using the correct private key.

### "Already revealed"

This commitment has already been revealed. You can verify it using `clawcommit_verify` but cannot reveal it again.

## Development

Test the server manually:

```bash
# Start the server
npm start

# The server communicates via stdio (MCP protocol)
# For testing, use an MCP client like Claude Code
```

## Architecture

The MCP server:
- Uses `ethers.js` v6 for blockchain interaction
- Implements MCP SDK for Claude Code integration
- Supports both mainnet and testnet
- Provides automatic nonce generation
- Validates operations before submitting transactions
- Returns detailed error messages for debugging

## Contract ABI

The server uses a minimal ABI for ClawCommit contract:
- `commit(bytes32)`: Create a commitment
- `reveal(uint256, string, string)`: Reveal a commitment
- `getCommitment(uint256)`: Read commitment data
- `verify(uint256)`: Verify revealed commitment
- `computeHash(string, string)`: Compute hash

## License

MIT

## Support

For issues or questions:
1. Check the ClawCommit main repository documentation
2. Review transaction on BSCScan for detailed error messages
3. Enable verbose logging in your MCP client
4. Verify your private key has sufficient BNB for gas

## Links

- [ClawCommit Repository](../../../)
- [BNB Chain Documentation](https://docs.bnbchain.org/)
- [Model Context Protocol Specification](https://modelcontextprotocol.io/)
- [BSCScan Explorer](https://bscscan.com/)
