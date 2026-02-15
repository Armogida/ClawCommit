# ClawCommit: Project Documentation

**Deterministic AI Decision Commit-Reveal Protocol for BNB Chain**

---

## Problem Statement

Autonomous AI agents increasingly make consequential decisions in production systems -- from algorithmic trading and content moderation to resource allocation and execution authorization. These decisions shape outcomes that affect users, markets, and systems at scale. However, the industry lacks a standardized, verifiable mechanism to prove that a specific decision was made at a specific time and was not altered afterward.

Current decision logging systems are centralized and mutable. Operators and system administrators can modify decision records, insert false entries, or delete inconvenient logs after deployment. This creates fundamental accountability gaps: auditors cannot independently verify decision authenticity, regulators cannot establish ground truth for compliance review, and stakeholders cannot distinguish between genuine AI decisions and retroactive fabrications.

These gaps have material consequences. In regulated domains (finance, healthcare, legal discovery), mutable logs fail compliance requirements. In decentralized systems (autonomous protocols, multi-agent coordination), participants cannot trust each other's decision records. Without a tamper-evident, immutable, independently verifiable decision log, AI systems cannot achieve the transparency and auditability that users, regulators, and operators require.

---

## Why BNB Chain

BNB Smart Chain provides the technical foundation for scalable, verifiable AI decision logging.

**Economic Viability.** Transaction costs on BSC are significantly lower than Ethereum mainnet. This makes per-decision commitment economically feasible, even for high-frequency AI systems. An agent can commit thousands of decisions daily without prohibitive gas costs, enabling continuous auditability rather than batch-mode compliance. At typical BSC gas prices (3-5 gwei), a commit-reveal cycle costs fractions of a cent.

**Speed and Finality.** BNB Chain achieves ~3-second block times with a large validator set. This enables near-real-time commitment -- decisions are finalized onchain within seconds, providing immediate tamper evidence. Fast finality reduces the attack surface between decision and commitment.

**EVM Compatibility.** BSC is fully EVM-compatible. Solidity contracts work without modification. Standard development tools (Hardhat, OpenZeppelin), security frameworks, and auditing practices apply directly. Engineers can build without learning new languages or primitives.

**Ecosystem Positioning.** BNB Chain's growth in AI and machine learning infrastructure, combined with its builder community and low-cost execution, positions it as a natural home for trustless AI agent infrastructure.

---

## How Deterministic Commit-Reveal Works

### The Commitment Phase

An AI agent makes an autonomous decision. Rather than logging the decision to a mutable database, the agent performs the following sequence:

1. **Decision Formulation.** The agent derives a decision output, encoded as a string. For example: `"SELL_100_BNBUSDT"` or `"APPROVE_LOAN_001"`.

2. **Nonce Generation.** The agent generates a cryptographically secure random nonce to ensure uniqueness and prevent pre-image attacks. The nonce should have sufficient entropy (minimum 128 bits) to make brute-force attacks computationally infeasible. The nonce remains secret during the commitment phase.

3. **Hash Computation.** The agent computes a deterministic commitment hash:
   ```
   hash = keccak256(abi.encodePacked(decision, nonce))
   ```
   This hash is computed off-chain and serves as a cryptographic commitment to the decision. The output is 32 bytes (256 bits) and is collision-resistant.

4. **Onchain Commit.** The agent calls the contract's `commit(bytes32 hash)` function. The contract stores the hash, the current `block.timestamp`, and the committer's address. Only the hash is recorded onchain -- the decision and nonce remain private, preventing frontrunning or interference.

### The Reveal Phase

After the commitment has been recorded onchain, the agent reveals the original decision:

1. **Plaintext Disclosure.** The agent calls `reveal(commitId, decision, nonce)`, providing the original decision and nonce.

2. **Onchain Verification.** The contract recomputes: `keccak256(abi.encodePacked(decision, nonce))` and verifies it matches the stored hash.

3. **Hash Matching.** If the hashes match, the reveal succeeds: the plaintext decision and nonce are stored onchain, and the commitment is marked as revealed. If the hashes do not match, the transaction reverts.

4. **Access Control.** Only the original committer can reveal their own commitment, preventing third-party interference.

### Why This Is Deterministic

The protocol is deterministic because keccak256 and `abi.encodePacked` are both deterministic operations: given the same decision and nonce inputs, they always produce the same hash output. There are no random operations, no state-dependent behaviors, and no conditional branches that vary between executions. This determinism is the core property that enables trustless replay verification.

### The Role of the Nonce

The nonce serves multiple security purposes:

- **Uniqueness.** Even if an agent makes the same decision twice, different nonces produce different hashes. This prevents deduplication attacks and ensures each commitment is independently auditable.

- **Pre-Image Resistance.** Without a nonce, an adversary could reverse-engineer the decision by hashing candidate decisions and comparing to the commitment. The nonce makes this computationally infeasible.

- **Commitment Binding.** The nonce binds the agent to its original decision. Attempting to reveal a different decision with the same nonce will produce a different hash, and the reveal will fail.

---

## Replay Verification

Replay verification is ClawCommit's core property: verification that requires no trust in any operator.

### How It Works

An auditor, regulator, or any third party can perform verification:

1. **Obtain Public Data.** Retrieve the commitment hash and reveal data from BNB Chain (publicly available via RPC or block explorers). These data are immutable once finalized.

2. **Independent Computation.** Using the plaintext decision and nonce from the reveal, compute:
   ```
   replayHash = keccak256(abi.encodePacked(decision, nonce))
   ```
   This computation uses only standard cryptographic primitives and does not require running the contract or any privileged access.

3. **Hash Comparison.** Compare the independently computed hash against the onchain commitment hash. If they are identical, the decision is cryptographically proven authentic and unaltered.

### Trust Model

The verifier does not need to trust the contract developer, the deployer, the chain validators, the RPC provider, or the agent operator. The verifier only needs to trust the keccak256 hash function (which is battle-tested in cryptographic practice and EVM consensus) and their own computation. This makes verification trust-free and decentralized by design.

### Practical Application

Consider an AI trading bot that commits a decision before executing an order. If a dispute arises about whether the decision preceded certain market conditions, an auditor can retrieve the commitment (immutable, timestamped), retrieve the reveal, recompute the hash, verify the match, and establish with mathematical certainty that the decision was made at the time of the original commitment.

---

## Security Principles

- **Cryptographic Collision Resistance.** keccak256 is collision-resistant under current cryptanalysis. Computing two distinct inputs that produce the same hash requires approximately 2^128 operations. BNB Chain consensus itself depends on keccak256's integrity.

- **Nonce-Based Uniqueness.** Random nonces ensure different commitments for identical decisions, prevent pre-image attacks, and bind agents to their original decisions.

- **Immutable Contract Design.** No upgrade path, no proxy, no admin functions, no parameter changes. The deployed code is the code that executes for all future transactions. Functions can only append data, never modify or delete existing records.

- **Minimal Surface Area.** The contract implements only commit, reveal, and read-only query functions. No other operations are possible. This minimalism reduces the attack surface and makes the contract fully auditable.

- **No Token Logic.** No ERC20, ERC721, or any token standard. No minting, no balance transfers, no financial mechanisms. This eliminates reentrancy, flash loan, and token theft attack vectors by design.

- **No Governance.** No voting, no parameter adjustments, no governance tokens. Once deployed, the contract's behavior is fixed and predictable.

- **Trust-Free Replay Verification.** Verification is independent of the contract state, the contract deployment, or any centralized authority. Anyone can perform off-chain hash computation and verify authenticity independently.

---

## Future Extensions

The following are potential future development directions. **None are implemented in the current version.**

### Merkle Batching for Gas Optimization

**Concept.** Multiple decisions could be hashed into a Merkle tree, with the root committed onchain in a single transaction. This would reduce per-decision gas costs from ~50,000 gas to ~1,000 gas (Merkle inclusion proof verification), enabling orders-of-magnitude higher throughput.

**Status:** Conceptual only. Not implemented.

### Multi-Agent Coordination

**Concept.** Multiple agents could contribute decisions to a shared audit log, each committing independently but creating a coordinated record.

**Status:** Conceptual only. Not implemented.

### Threshold-Based Reveal

**Concept.** A decision could require N-of-M agents to reveal before the decision is publicized, enabling escrow and multi-signature semantics for high-stakes decisions.

**Status:** Conceptual only. Not implemented.

### Zero-Knowledge Proof Integration

**Concept.** Agents could prove properties of a decision (e.g., "this decision respects the risk limit") using zero-knowledge proofs without revealing the decision itself.

**Status:** Conceptual only. Not implemented.

### Cross-Chain Verification

**Concept.** A commitment made on BNB Chain could be verified on other EVM chains by bridging the commitment hash, enabling multi-chain AI agent coordination.

**Status:** Conceptual only. Not implemented.

---

## Impact

### Accountability for Autonomous Decision-Making

AI agents that make autonomous decisions at scale currently operate with no verifiable decision record. ClawCommit provides an immutable, tamper-evident log that can be audited, reviewed, and challenged -- creating accountability that did not previously exist.

### Regulatory Compliance and Auditability

Financial regulators, data protection authorities, and compliance frameworks (MiFID II, GDPR, Fair Lending Laws) increasingly require audit trails that prove decision provenance and integrity. ClawCommit provides a cryptographically verifiable audit trail that satisfies these requirements without requiring trust in a central operator.

### Trust Infrastructure for Decentralized Agents

In systems where multiple autonomous agents coordinate without a central authority, agents cannot trust each other's claims about past decisions. ClawCommit provides a shared, verifiable source of truth, enabling agents to build trust relationships and coordinate reliably.

### Applicable Domains

- **Autonomous Trading Systems** -- Prove trading decisions preceded market-moving events.
- **Content Moderation** -- Immutable record of moderation decisions for external review.
- **Resource Allocation** -- Prove allocation decisions (loan approval, hiring) were made fairly and consistently.
- **Distributed Protocol Execution** -- Prove protocols executed decisions as specified.
- **Compliance and Risk Management** -- Audit trails satisfying regulatory requirements.
- **Multi-Agent Coordination** -- Agents prove past decisions to each other without centralized coordination.

---

## Technical Specifications

- **Network:** BNB Smart Chain (BSC) Mainnet
- **Language:** Solidity 0.8.24
- **Framework:** Hardhat
- **Hash Function:** keccak256
- **Encoding:** abi.encodePacked
- **Contract Verification:** BscScan

See [docs/TECHNICAL.md](./TECHNICAL.md) for full technical specification.
