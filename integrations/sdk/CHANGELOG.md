# Changelog

All notable changes to the ClawCommit SDK will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-02-14

### Added
- Initial release of ClawCommit TypeScript SDK
- Core functionality:
  - `commit()` - Commit decisions to blockchain
  - `reveal()` - Reveal previously committed decisions
  - `verify()` - Verify revealed commitments with cryptographic proof
- Read-only mode support (no private key required for verification)
- Automatic nonce generation
- Static utility methods:
  - `computeHash()` - Compute commitment hash offline
  - `generateNonce()` - Generate cryptographically secure nonce
- Full TypeScript type definitions
- Comprehensive error handling
- Block explorer URL generation
- Support for both BSC mainnet and testnet
- Helper methods:
  - `getCommitCount()` - Get total commitments
  - `getCommitment()` - Get raw commitment data
  - `getContractAddress()` - Get contract address
  - `getProvider()` - Get ethers provider
  - `getSigner()` - Get ethers signer
  - `isReadOnly()` - Check if SDK is read-only
- Complete documentation with examples
- Test suite
- Real-world usage examples

### Security
- Nonce auto-generation using crypto.randomBytes
- Strict TypeScript mode enabled
- No implicit any types
- Input validation
- Comprehensive error messages

### Documentation
- Complete API reference
- Quick start guide
- Real-world use case examples:
  - AI agent decision logging
  - Trading bot tamper-proof logs
  - Compliance auditing
  - Multi-signature systems
  - Time-locked decisions
  - Decision chains
  - Batch processing
- Security best practices
- TypeScript usage examples
