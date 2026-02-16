# ClawCommit: Project Overview

## Problem

AI agents make consequential decisions, but most decision logs are mutable and operator-controlled. Auditors and third parties cannot independently prove whether a decision was changed after the fact.

## Solution

ClawCommit is a deterministic commit-reveal protocol on BNB Chain.

Flow:
1. Agent computes `keccak256(abi.encode(prompt, output, modelVersion, nonce))`.
2. Agent commits the hash onchain via `commitDecision`.
3. Agent later reveals `prompt/output/modelVersion/nonce` via `revealDecision`.
4. Any verifier recomputes the same hash and compares against onchain commitment.

This creates a cryptographic, tamper-evident decision audit trail.

## Why BNB Chain

- Low transaction cost for per-decision commitments.
- Fast blocks for near-real-time attestations.
- EVM compatibility with standard Solidity/Hardhat workflows.

## Deterministic Replay Verification

ClawCommit includes a replay validator CLI that independently recomputes AI decision hashes from onchain data. This ensures third parties can cryptographically verify agent integrity without trusting the operator.

Command:

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH
```

Success output:

```text
✓ Deterministic Replay Verified
Commit hash matches reveal.
```

## Impact

- Infrastructure-grade integrity proofs for autonomous agent decisions.
- Independent replay without trust in operator infrastructure.
- Judge-aligned, reproducible verification path for commit/reveal integrity.

## Future Extensions

- Merkle batching for multi-decision aggregation into one root commitment.
- Root-based batch verification with inclusion proofs.
- Reduced gas overhead for high-frequency autonomous agents.
- Optional batch reveal flows for operational efficiency.
- Additional indexing and analytics over batch commitments.
- BAS attestation issuance for schema-based governance/compliance claims that reference verified commitments.

## BAS Compatibility (Implemented)

ClawCommit now includes a BAS-compatible attestation payload builder (`npm run bas:build`) that:
- validates reveal transaction + commitment linkage onchain,
- checks replay verification status,
- emits deterministic encoded claim data for BAS schemas (for example `AI_DECISION_VERIFIED_V1`).

This keeps ClawCommit as the integrity primitive and layers BAS as a structured attestation surface.

## Submission Criteria Compliance

### 1. Onchain Proof Required
ClawCommit is a deployed contract on BNB Smart Chain (BSC) Mainnet, Chain ID 56. Judges can verify the contract address in `/bsc.address` and explore it via BscScan (https://bscscan.com/address/[CONTRACT_ADDRESS]). The project provides deployment proof artifacts including deploy, commit, and reveal transaction hashes in the `deployment-proof/` directory. Every transaction is publicly auditable on the blockchain.

### 2. Must be Reproducible
The project is fully reproducible with public GitHub repository at https://github.com/Armogida/ClawCommit. Setup takes 5 minutes locally:
```bash
git clone https://github.com/Armogida/ClawCommit.git && cd ClawCommit
npm install && npx hardhat compile && npm test
```
All tests pass. The full commit-reveal-verify cycle works on local Hardhat network. For BSC deployment, see `README.md` "Mainnet Runbook" section. No external services required.

### 3. No Token Launches
This project implements **zero token logic**. The smart contract (`contracts/ClawCommit.sol`) exclusively provides commit-reveal storage and cryptographic verification primitives. No ERC20, ERC721, minting, transfers, liquidity pools, airdrops, or governance tokens exist. There is no financial mechanism of any kind. The project is purely a cryptographic integrity tool for autonomous agent decision attestation.

### 4. AI Build Log Bonus
See [`docs/AI_BUILD_LOG.md`](AI_BUILD_LOG.md) for comprehensive documentation of how Claude Code CLI (Claude Opus 4.6) was used to build this project with experimental team agent spawning. The build narrative shows how 15+ specialist agents were spawned across 4 build phases to architect, implement, test, and document the project.

### 5. Verifiability
If it can't be verified onchain or reproduced, it won't qualify. ClawCommit is **fully verifiable**:
- **Onchain**: Contract address on BSC Mainnet is public and verified
- **Reproducible**: All code is open-source, tests pass, documentation is complete
- **Independent Verification**: Judges can run `npm test` to verify contract logic locally, then use `npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH> --rpc <BSC_RPC_URL>` to independently verify any commitment on BSC
