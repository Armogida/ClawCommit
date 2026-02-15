# ClawCommit Integrations

AI-native tooling for the ClawCommit commit-reveal protocol on BNB Chain.

## Overview

This directory contains integrations that make ClawCommit accessible to AI agents, CI/CD pipelines, and external applications. Each integration enables different use cases while maintaining the core commit-reveal guarantees.

## Available Integrations

### 1. MCP Server (`mcp-server/`)

**Purpose**: Enable AI assistants to interact with ClawCommit natively during conversations.

**Use Case**: Claude Code, Cursor, or other MCP-compatible AI tools can commit, reveal, and verify decisions directly on BNB Chain without manual intervention.

**Key Features**:
- 4 MCP tools: commit, reveal, verify, compute_hash
- Automatic nonce generation
- Support for BSC Mainnet and Testnet
- Zero configuration needed beyond private key

**Quick Start**:
```bash
cd mcp-server/
npm install
cp .env.example .env
# Edit .env with your DEPLOYER_PRIVATE_KEY
node test-tools.js
```

**Documentation**: [mcp-server/README.md](./mcp-server/README.md)

---

### 2. GitHub Action (`github-action/`)

**Purpose**: Integrate ClawCommit into CI/CD workflows for automated decision logging.

**Use Case**: Commit deployment decisions, release approvals, or configuration changes automatically during GitHub workflows.

**Key Features**:
- Simple YAML configuration
- Automatic commit on workflow trigger
- Optional reveal on completion/failure
- Built-in verification step

**Quick Start**:
```yaml
- name: Commit Deployment Decision
  uses: ./integrations/github-action
  with:
    action: commit
    decision: "Deploy v${{ github.ref_name }}"
    contract_address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
```

**Documentation**: [github-action/README.md](./github-action/README.md)

---

### 3. TypeScript SDK (`sdk/`)

**Purpose**: Programmatic access to ClawCommit for custom applications.

**Use Case**: Build custom AI pipelines, web applications, or backend services that need commit-reveal functionality.

**Key Features**:
- Full TypeScript support with types
- High-level API abstracting blockchain complexity
- Support for multiple networks
- Built-in retry and error handling

**Quick Start**:
```typescript
import { ClawCommit } from '@clawcommit/sdk';

const client = new ClawCommit({
  contractAddress: '0x...',
  network: 'bscMainnet',
  privateKey: process.env.PRIVATE_KEY
});

const { commitId, hash } = await client.commit('Deploy model v2.0');
// ... later ...
await client.reveal(commitId, 'Deploy model v2.0', hash.nonce);
```

**Documentation**: [sdk/README.md](./sdk/README.md)

---

### 4. AI Schemas (`ai-schemas/`)

**Purpose**: Structured schemas for AI agents to understand ClawCommit operations.

**Use Case**: Enable AI agents (Claude, GPT-4, etc.) to generate valid ClawCommit operations using function calling or tool use.

**Key Features**:
- OpenAI function calling schemas
- Anthropic tool use definitions
- JSON Schema validation
- Example prompts and responses

**Quick Start**:
```json
{
  "functions": [{
    "name": "commit_decision",
    "description": "Commit a decision to blockchain",
    "parameters": {
      "decision": { "type": "string" },
      "network": { "type": "string", "enum": ["mainnet", "testnet"] }
    }
  }]
}
```

**Documentation**: [ai-schemas/README.md](./ai-schemas/README.md)

---

## Integration Comparison

| Feature | MCP Server | GitHub Action | TypeScript SDK | AI Schemas |
|---------|------------|---------------|----------------|------------|
| **Primary Use** | AI assistants | CI/CD | Custom apps | AI function calling |
| **Installation** | npm install | Workflow YAML | npm install | Copy schemas |
| **Configuration** | .env file | Secrets | Constructor | N/A |
| **Language** | JavaScript | YAML/JS | TypeScript | JSON |
| **Blockchain Access** | Direct | Direct | Direct | Via SDK/API |
| **Best For** | Claude Code | GitHub workflows | Production apps | AI integrations |

## Common Workflows

### Workflow 1: AI-Driven Development with Claude Code

1. **Setup**: Install MCP server
2. **Commit**: AI commits decisions during development
3. **Deploy**: GitHub Action reveals on successful deployment
4. **Verify**: Anyone can verify via SDK or MCP

```
Developer → Claude Code (MCP) → Commit
                ↓
         Push to GitHub
                ↓
    GitHub Action → Reveal
                ↓
         Deployment Complete
                ↓
    Public → SDK/MCP → Verify
```

### Workflow 2: Automated Pipeline Integration

1. **Pre-deployment**: GitHub Action commits decision
2. **Deployment**: Application deploys
3. **Post-deployment**: GitHub Action reveals
4. **Audit**: SDK verifies all commitments

```
GitHub Workflow → Action Commit → Deploy → Action Reveal → SDK Verify
```

### Workflow 3: Custom Application

1. **Application**: Uses SDK for all operations
2. **AI Assistant**: Uses AI Schemas for function calling
3. **Verification**: MCP server for public audit

```
App (SDK) → Commit/Reveal
      ↓
AI (Schemas) → Generate operations
      ↓
Auditors (MCP) → Verify
```

## Installation

Each integration is independent. Install only what you need:

```bash
# For AI assistants
cd mcp-server/ && npm install

# For CI/CD
# Add to .github/workflows/*.yml

# For custom apps
cd sdk/ && npm install

# For AI function calling
# Copy schemas to your project
```

## Environment Variables

Most integrations share common environment variables:

```env
# Required for transactions
DEPLOYER_PRIVATE_KEY=0x...

# Optional: Custom RPC endpoints
BSC_RPC_URL=https://bsc-dataseed.binance.org/
BSC_TESTNET_RPC_URL=https://data-seed-prebsc-1-s1.binance.org:8545/

# Optional: Contract addresses
CLAWCOMMIT_CONTRACT_MAINNET=0x...
CLAWCOMMIT_CONTRACT_TESTNET=0x...
```

## Security Best Practices

1. **Private Keys**:
   - Never commit private keys to repositories
   - Use environment variables or secrets management
   - Separate keys for testnet and mainnet

2. **Nonces**:
   - Store nonces securely after committing
   - Required for reveal operations
   - Cannot be recovered if lost

3. **Network Selection**:
   - Test on BSC Testnet first
   - Use mainnet only for production
   - Verify contract addresses before operations

4. **Access Control**:
   - Only committer can reveal their commitments
   - Anyone can verify revealed commitments
   - Use appropriate permissions for CI/CD

## Gas Costs (BSC)

Typical costs on BNB Chain:

- **Commit**: ~50,000-80,000 gas (~$0.10-0.15 USD)
- **Reveal**: ~80,000-120,000 gas (~$0.15-0.25 USD)
- **Verify**: Free (read-only view function)
- **Compute Hash**: Free (off-chain computation)

Ensure wallets have sufficient BNB for operations.

## Network Support

All integrations support:

- **BSC Mainnet** (chainId: 56): Production environment
- **BSC Testnet** (chainId: 97): Testing environment

### Testnet Faucet

Get free testnet BNB: https://testnet.bnbchain.org/faucet-smart

### Block Explorers

- Mainnet: https://bscscan.com
- Testnet: https://testnet.bscscan.com

## Example Use Cases

### 1. AI Model Deployment Tracking

```javascript
// Commit before deployment
const { commitId } = await client.commit('Deploy GPT-4 fine-tune v2.1');

// Deploy model...

// Reveal after successful deployment
await client.reveal(commitId, 'Deploy GPT-4 fine-tune v2.1', nonce);
```

### 2. Governance Voting

```yaml
# Commit vote privately
- uses: ./integrations/github-action
  with:
    action: commit
    decision: "Vote YES on proposal #42"

# Reveal after voting period
- uses: ./integrations/github-action
  with:
    action: reveal
    commit_id: ${{ steps.commit.outputs.commitId }}
```

### 3. Audit Trail for AI Decisions

```typescript
// Create tamper-evident log
for (const decision of aiDecisions) {
  const { commitId } = await client.commit(decision);
  await client.reveal(commitId, decision, nonce);
}

// Later: verify all decisions
const verified = await client.verifyAll();
```

### 4. Claude Code Interactive Session

```
User: Commit my decision to increase training data by 50%

Claude: [Uses MCP tool to commit]
Committed with ID 15. Hash: 0xabc...
Keep this nonce safe: 0xdef...

User: Now reveal it

Claude: [Uses MCP tool to reveal]
Revealed successfully! Verification: ✓
View on BSCScan: https://testnet.bscscan.com/tx/0x...
```

## Troubleshooting

### "Private key not found"
- Set `DEPLOYER_PRIVATE_KEY` in environment
- Check `.env` file is in correct directory
- For GitHub Actions, add to repository secrets

### "Insufficient funds"
- Get testnet BNB from faucet
- Ensure wallet has BNB for gas fees
- Check you're on correct network (testnet vs mainnet)

### "Hash mismatch"
- Decision and nonce must match exactly
- Strings are case and whitespace sensitive
- Store nonces securely after committing

### "Contract not found"
- Verify contract address is correct
- Ensure you're on right network
- Check contract is deployed

## Contributing

Each integration has its own development setup. See individual README files for contribution guidelines.

## License

MIT License - see individual integrations for details.

## Links

- [ClawCommit Contract](../contracts/ClawCommit.sol)
- [Main Repository](../)
- [BNB Chain Documentation](https://docs.bnbchain.org/)
- [Model Context Protocol](https://modelcontextprotocol.io/)

## Support

For issues or questions:
1. Check integration-specific README
2. Review example code in each directory
3. Test on BSC Testnet first
4. Verify transactions on BSCScan

---

**Choose your integration and start building AI-native blockchain applications!**
