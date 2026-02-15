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
