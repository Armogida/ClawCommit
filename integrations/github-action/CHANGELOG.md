# Changelog

All notable changes to the ClawCommit GitHub Action will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-14

### Added

#### Core Features
- **Commit Action**: Create tamper-evident commitments of AI decisions on BNB Chain
- **Reveal Action**: Reveal previously committed decisions with nonce verification
- **Verify Action**: Verify the integrity of revealed commitments (read-only)
- **Automatic Nonce Generation**: Secure random nonce generation for commit operations
- **Hash Verification**: Local and on-chain hash verification for data integrity

#### GitHub Action Integration
- `action.yml`: Complete action metadata with inputs/outputs definition
- `index.js`: Full-featured action implementation using @actions/core and ethers.js
- Support for Node.js 20 runtime
- Comprehensive error handling and logging
- Transaction confirmation and event parsing

#### Documentation
- `README.md`: Complete usage guide with 6 example workflows
- `INTEGRATION.md`: Detailed integration guide for production deployments
- Example workflows for:
  - AI code review with blockchain audit
  - Reveal on PR merge
  - Verification workflows (manual and scheduled)
  - AI model deployment auditing
- Security best practices documentation
- Troubleshooting guide
- Cost optimization strategies

#### Testing
- `test-local.js`: Local testing script for all three actions
- Support for commit, reveal, and verify operations
- Command-line interface for manual testing
- Validation of hash computation and nonce generation

#### Examples
- `examples/ai-review.yml`: Complete PR review workflow with blockchain commitment
- `examples/reveal-on-merge.yml`: Automatic reveal on PR merge
- `examples/verify-audit.yml`: Single and batch verification workflows
- `examples/model-deployment.yml`: AI model deployment audit with checksums

#### Configuration
- `.gitignore`: Proper exclusions for node_modules, logs, and sensitive files
- `package.json`: Dependencies and test scripts
- Support for custom RPC URLs
- Environment-specific configuration examples

### Features

#### Security
- Secure nonce generation using ethers.js randomBytes
- Local hash verification before blockchain submission
- Support for GitHub Secrets for sensitive data
- Private key validation
- Transaction signing with wallet authentication

#### Reliability
- Transaction confirmation waiting
- Event parsing for commit ID extraction
- Comprehensive error messages
- Input validation for all actions
- Network error handling

#### Flexibility
- Support for custom RPC providers (NodeReal, Ankr, QuickNode)
- Configurable gas settings via RPC provider
- Optional nonce parameter (auto-generated if omitted)
- Read-only verify action (no private key required)

#### Developer Experience
- Clear action outputs for all operations
- GitHub Step Summary integration
- PR commenting examples
- Artifact storage patterns
- Local testing capabilities

### Outputs

All actions provide relevant outputs:

**Commit**:
- `commit-id`: The blockchain commit ID
- `hash`: The keccak256 hash of the commitment
- `nonce`: The nonce used (for later reveal)
- `tx-hash`: Transaction hash on BSCScan

**Reveal**:
- `commit-id`: The revealed commit ID
- `hash`: The verified hash
- `tx-hash`: Reveal transaction hash

**Verify**:
- `commit-id`: The verified commit ID
- `verified`: Boolean verification result
- `hash`: The commitment hash

### Dependencies

- `@actions/core`: ^1.10.0 - GitHub Actions toolkit
- `ethers`: ^6.13.0 - Ethereum/BNB Chain interaction

### Known Issues

- None

### Migration Guide

Not applicable (initial release)

## [Unreleased]

### Planned Features

- Support for batch commit operations
- Gas price optimization strategies
- Webhook integration for external systems
- Multi-chain support (Ethereum, Polygon, Arbitrum)
- Enhanced analytics and reporting
- GraphQL API for querying commitments
- Integration with popular AI platforms (OpenAI, Anthropic)

### Under Consideration

- Support for encrypted decisions
- Zero-knowledge proof integration
- IPFS storage for large decision payloads
- Time-locked reveals
- Multi-signature support
- Governance token integration

---

## Release Notes

### v1.0.0 - Production Ready

This is the first production-ready release of the ClawCommit GitHub Action. It provides complete functionality for committing, revealing, and verifying AI decisions on BNB Chain as part of GitHub CI/CD workflows.

**Key Highlights**:

1. **Battle-Tested**: Uses established libraries (ethers.js, @actions/core)
2. **Secure**: Implements cryptographic best practices
3. **Documented**: Comprehensive guides and examples
4. **Flexible**: Works with any AI decision format
5. **Reliable**: Handles errors gracefully with retries

**Use Cases**:

- AI code review auditing
- Model deployment tracking
- Security scan commitments
- Compliance documentation
- Performance benchmark logging
- Quality assurance records

**Getting Started**:

```yaml
- uses: Armogida/ClawCommit/integrations/github-action@v1.0.0
  with:
    action: commit
    decision: "AI_DECISION"
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

**Upgrading**:

Not applicable for initial release.

**Breaking Changes**:

None.

---

For support and questions, please open an issue on GitHub:
https://github.com/Armogida/ClawCommit/issues
