# GitHub Copilot Instructions for ClawCommit

## Project Overview

ClawCommit is a deterministic AI decision commit-reveal protocol built on BNB Chain. It provides cryptographic proof of AI decisions through on-chain commitments, making AI decisions tamper-evident and independently verifiable.

**Key Capabilities:**
- Commit-reveal protocol for AI decisions using `keccak256` hashing
- Deterministic replay verification for third-party auditing
- Batch commitment support with Merkle tree proofs (Wave 2)
- MCP server integration for AI assistants
- GitHub Actions integration for CI/CD workflows
- TypeScript SDK and CLI tools

## Tech Stack

- **Blockchain**: BNB Chain (BSC) - Solidity 0.8.24
- **Smart Contracts**: Hardhat 2.22.0 with Hardhat Toolbox
- **Language**: TypeScript 5.4.0 (strict mode enabled)
- **Runtime**: Node.js 20.x (enforced via .nvmrc and package.json)
- **Testing**: Hardhat test framework with ethers.js v6
- **Libraries**: ethers.js 6.13.4, dotenv 16.4.0

## Repository Structure

```
.
├── contracts/              # Solidity smart contracts
│   ├── ClawCommit.sol      # Core commit-reveal contract (V2)
│   └── ClawCommitBatch.sol # Merkle batch commitment contract
├── scripts/                # CLI tools and deployment scripts
│   ├── deploy.ts           # Contract deployment
│   ├── commit.ts           # Commit decision to chain
│   ├── reveal.ts           # Reveal committed decision
│   ├── replay.ts           # Standalone replay validator
│   └── batch/              # Batch operation scripts
├── backend/                # Backend integration utilities
│   └── aiPipeline.ts       # AI decision lifecycle demo
├── test/                   # Smart contract tests (14+ test suites)
├── integrations/           # External integrations
│   ├── github-action/      # GitHub Actions for CI/CD
│   ├── mcp-server/         # Model Context Protocol server
│   ├── github-copilot/     # Copilot integration
│   └── sdk/                # TypeScript SDK
├── docs/                   # Project documentation
└── deployment-proof/       # Deployment artifacts and proofs
```

## Development Workflow

### Initial Setup

```bash
# Use Node.js 20.x (required)
nvm use 20

# Install dependencies
npm install

# Compile contracts
npm run compile

# Run tests
npm test
```

### Environment Configuration

1. Copy `.env.example` to `.env`
2. Set required variables:
   - `BSC_RPC_URL` - BNB Chain mainnet RPC endpoint
   - `BSC_TESTNET_RPC_URL` - BNB Chain testnet RPC endpoint
   - `DEPLOYER_PRIVATE_KEY` - Private key for deployments (NEVER commit)
   - `BSCSCAN_API_KEY` - BscScan API key for contract verification

**Security Note**: Never commit `.env` or expose private keys in code or logs.

### Building and Testing

- **Compile contracts**: `npm run compile` or `npx hardhat compile`
- **Run all tests**: `npm test` or `npx hardhat test`
- **Test with gas reporting**: `npm run test:gas`
- **Coverage report**: `npm run coverage`

### Deployment

- **Local (Hardhat)**: `npm run deploy:local`
- **BSC Testnet**: `npm run deploy:testnet`
- **BSC Mainnet**: `npm run deploy:mainnet` (requires `--allow-mainnet-writes true` flag)

### Available NPM Scripts

Key scripts from package.json:
- `npm test` - Run all Hardhat tests
- `npm run compile` - Compile Solidity contracts
- `npm run deploy:testnet` - Deploy to BSC testnet
- `npm run commit` - Commit decision (testnet)
- `npm run reveal` - Reveal decision (testnet)
- `npm run replay` - Replay verification from transaction hash
- `npm run batch:*` - Batch operation commands (build, commit, reveal, replay)
- `npm run mcp:*` - MCP server setup and management

## Coding Standards

### TypeScript

- **Strict mode**: Always enabled in tsconfig.json
- **Target**: ES2020 with CommonJS modules
- **Style**: Follow existing patterns in the codebase
- **No `any` types**: Use proper typing or `unknown` if necessary
- **Error handling**: Always handle Promise rejections and errors
- **Imports**: Use explicit imports, avoid wildcard imports where possible

### Solidity

- **Version**: Solidity 0.8.24 (locked)
- **Optimizer**: Enabled with 200 runs
- **Style**: Follow Solidity style guide conventions
- **Security**: 
  - Use `abi.encode()` for deterministic hashing
  - Validate all inputs
  - Emit events for state changes
  - Follow checks-effects-interactions pattern
- **Comments**: Use NatSpec format for public/external functions

### Testing

- **Framework**: Hardhat with ethers.js v6
- **Coverage**: Aim for comprehensive test coverage
- **Test structure**: Use `describe` blocks to organize tests by feature
- **Assertions**: Use Chai matchers with Hardhat extensions
- **Gas reporting**: Use `REPORT_GAS=true` when optimizing

### Git Workflow

- **Branch naming**: Use descriptive names (e.g., `feature/batch-reveal`, `fix/gas-optimization`)
- **Commits**: Write clear, concise commit messages
- **Private keys**: Never commit private keys, use environment variables
- **Sensitive data**: Use `--log-sensitive true` flags cautiously; avoid in CI

## Architecture Patterns

### Commit-Reveal Protocol

The core protocol follows these steps:

1. **Commit Phase**: Hash decision data and store on-chain
   ```typescript
   keccak256(abi.encode(prompt, output, modelVersion, nonce))
   ```

2. **Reveal Phase**: Publish original data on-chain

3. **Verification**: Recompute hash and compare with stored commitment

### Deterministic Hashing

- All hashing uses `keccak256(abi.encode(...))` for determinism
- Hash inputs are always: `prompt, output, modelVersion, nonce` (in order)
- Nonces must be 32-byte hex strings
- Model versions are strings (e.g., "clawcommit-v2.0")

### Batch Operations (Wave 2)

- Merkle tree batching for efficient multi-decision commits
- Leaf hash includes `leafIndex` parameter
- Parent hash: `keccak256(abi.encode(left, right))`
- Odd-width levels duplicate last node

## Key Technical Constraints

### Network Configuration

- **Mainnet**: BNB Chain (chainId: 56) - alias `bsc` or `bscMainnet`
- **Testnet**: BNB Chain Testnet (chainId: 97) - alias `bscTestnet`
- **Local**: Hardhat Network (chainId: 31337)
- **Mainnet writes**: Require explicit `--allow-mainnet-writes true` flag

### Node.js Version

- **Required**: Node.js 20.x (enforced)
- Use `.nvmrc` file to switch versions
- `npm run check:node` validates version

### Gas Optimization

- Typical commit: ~50,000-80,000 gas (~$0.10-$0.15)
- Typical reveal: ~80,000-120,000 gas (~$0.15-$0.25)
- Full cycle: ~$0.25 on BNB Chain
- Use batch operations for cost efficiency with multiple decisions

## Security Considerations

### Private Key Management

- **Never** commit private keys to source control
- Use environment variables (`.env` file)
- Add `.env` to `.gitignore`
- Use separate keys for testnet and mainnet
- Limit access to production keys

### Sensitive Data Logging

- By default, scripts block sensitive data (prompt/output/nonce) from stdout
- Use `--log-sensitive true` flag explicitly when needed
- Avoid sensitive logging in CI/CD pipelines
- Use `--out <file>` to write sensitive data to files instead

### Mainnet Safeguards

- All mainnet write operations require `--allow-mainnet-writes true`
- Default behavior: reject mainnet writes without explicit flag
- Test on testnet first before mainnet deployment
- Verify contract source on BscScan after deployment

### Smart Contract Security

- No token logic (zero ERC20/ERC721)
- Minimal attack surface by design
- Public read functions for verification
- Events emitted for all state changes
- Input validation on all external functions

## Integration Points

### MCP Server

- Location: `integrations/mcp-server/`
- Setup: `npm run mcp:setup`
- Use for AI assistant integration (Claude, Copilot, etc.)
- See `integrations/mcp-server/README.md` for details

### GitHub Actions

- Location: `integrations/github-action/`
- Examples: commit, reveal, verify workflows
- Use in CI/CD for automated decision tracking

### TypeScript SDK

- Location: `integrations/sdk/`
- Programmatic access to ClawCommit functionality
- Use for building custom integrations

## Documentation

- **PROJECT.md**: Problem statement and impact narrative
- **TECHNICAL.md**: Protocol and architecture details
- **REPLAY.md**: Replay validator behavior and failure modes
- **AI_BUILD_LOG.md**: Build process and AI team spawning details
- **COMPLIANCE_AUDIT.md**: Hackathon submission compliance
- **README.md**: Quick start and usage guide

## Common Tasks

### Deploy and Prove End-to-End

```bash
# Local hardhat network
npx hardhat run scripts/deployAndProve.ts

# BSC testnet
npx hardhat run scripts/deployAndProve.ts --network bscTestnet

# BSC mainnet
npx hardhat run scripts/deployAndProve.ts --network bsc
```

### Verify a Decision

```bash
# Using reveal transaction hash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH

# With custom RPC
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH --rpc https://bsc-dataseed.binance.org/
```

### Batch Operations

```bash
# Build batch from NDJSON
npx ts-node scripts/batch/build.ts \
  --in data/decisions.ndjson \
  --out artifacts/batch.manifest.json \
  --model-version clawcommit-v2.0

# Commit batch root
HARDHAT_NETWORK=bscTestnet npx ts-node scripts/batch/commitBatch.ts \
  --contract <ADDRESS> \
  --manifest artifacts/batch.manifest.json

# Reveal multiple leaves
HARDHAT_NETWORK=bscTestnet npx ts-node scripts/batch/revealLeaves.ts \
  --contract <ADDRESS> \
  --batch-id 0 \
  --leaf-indexes 0,1,2 \
  --manifest artifacts/batch.manifest.json
```

## What NOT to Do

- ❌ Don't commit `.env` files or private keys
- ❌ Don't modify the core hashing formula without updating tests
- ❌ Don't use `any` types in TypeScript
- ❌ Don't write to mainnet without `--allow-mainnet-writes true`
- ❌ Don't log sensitive data (prompt/output/nonce) in CI/CD
- ❌ Don't add token logic (ERC20/ERC721) - this is intentionally not a token project
- ❌ Don't change Solidity compiler version without thorough testing
- ❌ Don't bypass mainnet write guards
- ❌ Don't use Node.js versions other than 20.x

## Project Philosophy

1. **Determinism First**: All operations must be reproducible
2. **Zero Trust Verification**: Anyone can verify without credentials
3. **Minimal Attack Surface**: Keep contracts simple and focused
4. **No Token Logic**: This is infrastructure, not finance
5. **Explicit Safety**: Mainnet operations require explicit flags
6. **Tamper Evidence**: Every decision is cryptographically provable

## Contributing

When working on ClawCommit:

1. **Read the docs**: Start with README.md, then TECHNICAL.md
2. **Follow patterns**: Look at existing code for style guidance
3. **Test thoroughly**: Add tests for new features, run full suite before PR
4. **Document changes**: Update relevant docs when changing behavior
5. **Security first**: Consider security implications of all changes
6. **Backward compatibility**: Maintain compatibility with existing deployments where possible

## Questions or Issues?

- Check existing documentation in `docs/`
- Review test files for usage examples
- Look at integration examples in `integrations/`
- Examine scripts in `scripts/` for CLI patterns
