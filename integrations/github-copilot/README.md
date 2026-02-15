# ClawCommit for GitHub Copilot

Use ClawCommit directly from GitHub Copilot to create tamper-evident logs of AI decisions during code development.

## Overview

GitHub Copilot can connect to ClawCommit via the Model Context Protocol (MCP), enabling you to:
- Commit AI decisions during code reviews
- Create cryptographic proofs of deployment approvals
- Build verifiable audit trails for AI-assisted development
- Track agent decisions with blockchain-backed commitments

## Quick Start

### 1. Prerequisites

- GitHub Copilot subscription
- Node.js 20.x (see `.nvmrc` in repo root)
- BSC wallet with testnet BNB for testing

### 2. Installation

From the ClawCommit repository root:

```bash
npm install
npm run mcp:setup
```

### 3. Configuration

Create or update your GitHub Copilot settings to include the ClawCommit MCP server.

**For GitHub Copilot (VS Code Extension)**:

Add to your VS Code `settings.json`:

```json
{
  "github.copilot.chat.mcp.servers": {
    "clawcommit": {
      "command": "node",
      "args": [
        "/absolute/path/to/ClawCommit/integrations/mcp-server/index.js"
      ],
      "env": {
        "DEPLOYER_PRIVATE_KEY": "your_private_key_here",
        "BSC_RPC_URL": "https://bsc-dataseed.binance.org/",
        "BSC_TESTNET_RPC_URL": "https://data-seed-prebsc-1-s1.binance.org:8545/"
      }
    }
  }
}
```

**For GitHub Copilot CLI**:

Create a config file at `~/.github-copilot/mcp-servers.json`:

```json
{
  "mcpServers": {
    "clawcommit": {
      "command": "node",
      "args": [
        "/absolute/path/to/ClawCommit/integrations/mcp-server/index.js"
      ],
      "env": {
        "DEPLOYER_PRIVATE_KEY": "your_private_key_here",
        "BSC_RPC_URL": "https://bsc-dataseed.binance.org/",
        "BSC_TESTNET_RPC_URL": "https://data-seed-prebsc-1-s1.binance.org:8545/"
      }
    }
  }
}
```

### 4. Get Testnet BNB

Visit the BSC testnet faucet: https://testnet.bnbchain.org/faucet-smart

Request testnet BNB for your wallet address.

### 5. Deploy Contract (Optional)

If you don't have a contract address yet:

```bash
cd /path/to/ClawCommit
cp .env.example .env
# Edit .env with your DEPLOYER_PRIVATE_KEY
npx hardhat run scripts/deploy.ts --network bscTestnet
```

Save the contract address for use in Copilot commands.

## Usage in GitHub Copilot

Once configured, you can use ClawCommit operations directly in Copilot:

### Commit a Decision

```
@workspace Use the clawcommit MCP server to commit this decision:
Prompt: "Should we merge PR #123 with the authentication refactor?"
Output: "APPROVE_MERGE"
Model Version: "copilot-code-review-v1"
Contract: 0xYourContractAddress
Network: bscTestnet
```

The MCP server will:
1. Generate a secure nonce
2. Compute the commitment hash
3. Submit transaction to BSC
4. Return commit ID and transaction hash

### Reveal a Decision

```
@workspace Use the clawcommit MCP server to reveal commit ID 5 with:
Prompt: "Should we merge PR #123 with the authentication refactor?"
Output: "APPROVE_MERGE"
Model Version: "copilot-code-review-v1"
Nonce: 0xYourNonceFromCommit
Contract: 0xYourContractAddress
Network: bscTestnet
```

### Verify a Commitment

```
@workspace Use the clawcommit MCP server to verify commit ID 5 at contract 0xYourContractAddress on bscTestnet
```

### Compute Hash Locally

```
@workspace Use the clawcommit MCP server to compute the decision hash for:
Prompt: "Should we deploy to production?"
Output: "APPROVE_DEPLOY"
Model Version: "deployment-agent-v2"
```

## Available MCP Tools

The ClawCommit MCP server exposes these tools to GitHub Copilot:

| Tool | Description |
|------|-------------|
| `clawcommit_commit` | Commit a decision to blockchain |
| `clawcommit_reveal` | Reveal a previously committed decision |
| `clawcommit_verify` | Verify a commitment matches its reveal |
| `clawcommit_get_commitment` | Get commitment details by ID |
| `clawcommit_compute_hash` | Compute decision hash locally |

## Example Workflows

### 1. PR Review with Tamper-Evident Log

```
1. Review code changes
2. Ask Copilot to commit approval decision
3. Merge PR
4. Ask Copilot to reveal the decision
5. Anyone can verify the decision on BSCScan
```

### 2. Deployment Approval Chain

```
1. Complete staging tests
2. Commit deployment approval via Copilot
3. Deploy to production
4. Reveal decision after successful deployment
5. Link transaction in deployment documentation
```

### 3. Multi-Agent Decision Tracking

```
1. Multiple agents review different aspects
2. Each agent commits their decision
3. Final decision aggregates all commits
4. All decisions revealed and verified
5. Create audit trail with all transaction links
```

## Integration with GitHub Workflows

Combine GitHub Copilot with GitHub Actions for complete automation:

**copilot-commit.yml**:
```yaml
name: Copilot Decision Tracking

on:
  pull_request:
    types: [opened, synchronize]

jobs:
  track-review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: '20'
      
      - name: Install Dependencies
        run: npm install
      
      - name: Commit Decision
        uses: ./integrations/github-action
        with:
          action: commit
          prompt: "Review PR #${{ github.event.pull_request.number }}"
          output: "REVIEW_COMPLETE"
          model-version: "copilot-review-v1"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
          network: bscTestnet
```

## Security Considerations

1. **Private Keys**: Never commit private keys to repositories
   - Use environment variables
   - Use GitHub Secrets for Actions
   - Separate keys for testnet and mainnet

2. **Nonce Storage**: Store nonces securely after committing
   - Required for reveal operations
   - Cannot be recovered if lost
   - Consider using GitHub Actions artifacts

3. **Network Selection**: Always test on testnet first
   - Use `bscTestnet` for development
   - Use `bsc` or `bscMainnet` only for production
   - Verify contract addresses before operations

4. **Sensitive Data**: Be careful with prompts and outputs
   - Don't include secrets in decision text
   - Consider using `log_sensitive: false` (default)
   - Prompts and outputs are public after reveal

## Gas Costs

Typical costs on BNB Chain:

- **Commit**: ~50,000-80,000 gas (~$0.10-0.15 USD)
- **Reveal**: ~80,000-120,000 gas (~$0.15-0.25 USD)
- **Verify**: Free (read-only)
- **Compute Hash**: Free (off-chain)

Testnet operations use free testnet BNB with no real-world cost.

## Troubleshooting

### MCP Server Not Found

Check that:
1. Path to `index.js` is absolute and correct
2. Node.js is in your PATH
3. Dependencies are installed (`npm install` in `integrations/mcp-server`)

### Private Key Errors

Ensure:
1. `DEPLOYER_PRIVATE_KEY` is set in environment or config
2. Private key includes `0x` prefix
3. Wallet has testnet BNB for gas

### Transaction Failures

Verify:
1. Correct network selected (testnet vs mainnet)
2. Contract address is correct
3. Wallet has sufficient BNB for gas
4. RPC URL is accessible

### Hash Mismatch on Reveal

Check:
1. Prompt, output, and model version match exactly
2. Using correct nonce from commit
3. No extra whitespace or formatting changes

## Advanced Usage

### Custom Model Versions

Use descriptive model version strings to track different agents:

```
copilot-code-review-v1.0
copilot-security-scan-v2.1
copilot-deployment-approval-v1
github-copilot-chat-2024-02
```

### Batch Operations

For multiple related decisions, use consistent prefixes:

```
PR-123-security-review
PR-123-performance-review
PR-123-final-approval
```

### Integration Testing

Test the MCP server independently:

```bash
cd integrations/mcp-server
npm test
node test-tools.js "" bscTestnet
```

## Links

- [MCP Server Documentation](../mcp-server/README.md)
- [MCP Server Quickstart](../mcp-server/QUICKSTART.md)
- [GitHub Action Integration](../github-action/README.md)
- [ClawCommit Contract](../../contracts/ClawCommit.sol)
- [BSC Testnet Explorer](https://testnet.bscscan.com)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Support

For issues or questions:
1. Test MCP server independently first
2. Verify configuration paths are absolute
3. Check wallet has testnet BNB
4. Review transaction on BSCScan explorer

## License

MIT License - see [LICENSE](../../LICENSE) for details.
