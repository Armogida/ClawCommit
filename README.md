Modern AI agents aren't just answering questions anymore. They're writing, reviewing, merging, and deploying code that underpins vital systems - finance platforms, healthcare backends, compliance engines, and critical infrastructure.

When a coding agent approves a pull request or triggers a production deployment, that decision can move real money, affect real users, and alter real systems.

But there's a problem.

Those decisions are logged in mutable files under operator control. There is no independent, cryptographic proof that a pull-request approval, a deployment trigger, or a treasury rebalance wasn't altered after the fact.

Logs can be edited. Databases can be rewritten. Screenshots can be faked.

Until now.

ClawCommit turns AI decisions into cryptographic commitments.

It implements a deterministic commit-reveal protocol on BNB Chain:

1. The agent computes:
   `keccak256(abi.encode(prompt, output, modelVersion, nonce))`
2. The resulting hash is committed on-chain.
3. Later, the agent reveals the full decision data.
4. Anyone can recompute the hash and verify it matches the on-chain commitment.

If the hashes match, the decision is cryptographically proven to be unchanged since commitment time.  
If they don't match, tampering is immediately detectable.

The result is a tamper-evident audit trail for AI decisions - whether that's:

- Approving a PR
- Promoting a container to production
- Flagging a compliance issue
- Executing a treasury rebalance

No API keys. No centralized trust. Just math.

And here's the meta-twist.

ClawCommit itself was built by AI.

Using Claude Code CLI's experimental team-spawning feature, a lead orchestrator agent spun up 15+ specialist agents working in parallel across four build phases:

- Smart contracts
- TypeScript backend + SDK
- Integrations (MCP server, GitHub Actions, schemas)
- Documentation and testing

What would normally require about 40 hours of sequential human work was compressed into about 4 hours of parallel AI execution.

The result:

- 64+ files generated
- ~4,200+ lines of code
- 56 passing tests across 8 test suites
- Full commit -> reveal -> replay verification coverage
- Deterministic standalone replay validator
- TypeScript SDK, MCP server, GitHub Action, and multi-provider function schemas

This "OpenClaw" build demonstrates two things simultaneously:

1. AI decisions can be made cryptographically tamper-evident.
2. Orchestrated AI teams can build infrastructure-grade systems faster and more rigorously than traditional sequential workflows.

ClawCommit isn't just infrastructure for verifying AI.

It's proof that AI can build verifiable infrastructure for itself.

Built by agents.  
For agents.  
Verified by anyone.

# ClawCommit

Deterministic AI decision commit-reveal protocol with independent replay verification on BNB Chain.

## What It Proves

ClawCommit V2 proves:
- the AI decision can be replayed offchain,
- the recomputed hash matches the onchain commit,
- reveal integrity is cryptographically sound.

This project upgrades commit-reveal into a deterministic verification primitive suitable for infra-grade audit trails.

## Real-World Use Case: AI Review Audit Trail

When ClawCommit is integrated into PR workflows, the "chain" of AI decisions does not live in Git commit history.  
It lives on BNB Chain as on-chain commit/reveal records.

How it works:

1. AI system decides (for example, approve/reject a PR).
2. Decision is hashed deterministically:
   `keccak256(abi.encode(prompt, output, modelVersion, nonce))`
3. Hash is committed on-chain, returning:
   - `commitId`
   - commitment hash
   - transaction hash
4. Reviewers use PR comments + CI artifacts to inspect commit metadata.
5. Optional reveal (for example, on merge) publishes `prompt/output/modelVersion/nonce`.
6. Anyone verifies integrity using:
   - contract methods (`getCommitment`, `verifyReplay`)
   - GitHub Action verify flow
   - standalone replay CLI.

Where reviewers/auditors look:

- PR automation example (commit + PR comment + artifact):  
  `integrations/github-action/examples/ai-review.yml`
- Optional reveal-on-merge example:  
  `integrations/github-action/examples/reveal-on-merge.yml`
- Verification workflow example:  
  `integrations/github-action/examples/verify-audit.yml`
- Public transaction history on BscScan.

## Deterministic Replay Verification

ClawCommit includes a replay validator CLI that independently recomputes AI decision hashes from onchain data. This ensures third parties can cryptographically verify agent integrity without trusting the operator.

## Hashing Model (V2)

The commitment hash is:

`keccak256(abi.encode(prompt, output, modelVersion, nonce))`

Inputs are revealed later via `revealDecision(...)`. Anyone can decode the reveal transaction, recompute the hash, and compare it to contract state.

## Contract API (V2)

- `commitDecision(bytes32 commitHash) returns (uint256 commitId)`
- `revealDecision(uint256 commitId, string prompt, string output, string modelVersion, string nonce)`
- `getCommitment(uint256 commitId) returns (Commitment)`
- `verifyReplay(uint256 commitId) returns (bool)`
- `computeDecisionHash(string prompt, string output, string modelVersion, string nonce) returns (bytes32)`

## Quick Start

```bash
git clone https://github.com/Armogida/ClawCommit.git
cd ClawCommit
npm install
npx hardhat compile
npm test
```

## Codex Skill (Public)

This repository includes a reusable Codex skill at `skills/clawcommit`.

Install it with the system skill installer:

```bash
python "$CODEX_HOME/skills/.system/skill-installer/scripts/install-skill-from-github.py" \
  --repo Armogida/ClawCommit \
  --path skills/clawcommit
```

After installing a skill: restart Codex to load it.

## Network Config

Mainnet alias is available as `bsc` (same endpoint/chain as `bscMainnet`).

```bash
npx hardhat run scripts/deploy.ts --network bsc
```

## CLI Usage

### 1. Deploy

```bash
npx hardhat run scripts/deploy.ts --network bsc
```

### 2. Commit

```bash
HARDHAT_NETWORK=bscTestnet npx ts-node scripts/commit.ts \
  --contract <CONTRACT_ADDRESS> \
  --prompt "Should we rebalance treasury?" \
  --output "APPROVE_REBALANCE" \
  --model-version "clawcommit-v2.0" \
  --nonce "0x<32-byte-hex-nonce>" \
  --log-sensitive true
```

### 3. Reveal

```bash
HARDHAT_NETWORK=bscTestnet npx ts-node scripts/reveal.ts \
  --contract <CONTRACT_ADDRESS> \
  --commit-id 0 \
  --prompt "Should we rebalance treasury?" \
  --output "APPROVE_REBALANCE" \
  --model-version "clawcommit-v2.0" \
  --nonce "0x<32-byte-hex-nonce>" \
  --log-sensitive true
```

For BSC mainnet writes, add:

```bash
--allow-mainnet-writes true
```

### Mainnet Flow (Explicit Write Flags)

Use this exact sequence for production writes on BSC mainnet:

```bash
# 1) Deploy (state-changing, explicit allow flag required)
HARDHAT_NETWORK=bsc npx ts-node scripts/deploy.ts --allow-mainnet-writes true

# 2) Commit
HARDHAT_NETWORK=bsc npx ts-node scripts/commit.ts \
  --contract <CONTRACT_ADDRESS> \
  --prompt "Mainnet integration test from terminal" \
  --output "APPROVE_TEST" \
  --model-version "clawcommit-mainnet-test-v1" \
  --nonce "0x<32-byte-hex-nonce>" \
  --allow-mainnet-writes true \
  --log-sensitive true

# 3) Reveal (must reuse identical prompt/output/model-version/nonce)
HARDHAT_NETWORK=bsc npx ts-node scripts/reveal.ts \
  --contract <CONTRACT_ADDRESS> \
  --commit-id <COMMIT_ID> \
  --prompt "Mainnet integration test from terminal" \
  --output "APPROVE_TEST" \
  --model-version "clawcommit-mainnet-test-v1" \
  --nonce "0x<32-byte-hex-nonce>" \
  --allow-mainnet-writes true \
  --log-sensitive true

# 4) Replay verification
npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH> --rpc https://bsc-dataseed.binance.org/
```

### Automated Link Posting (Artifact + PR Comment)

Use the report helper to convert a decision artifact JSON into shareable explorer links:

```bash
node scripts/integration/post-cycle-links.js \
  --artifact deployment-proof/mainnet-decision-cycle.json \
  --out deployment-proof/mainnet-decision-cycle.md
```

Post the same report directly to a pull request comment with GitHub CLI:

```bash
node scripts/integration/post-cycle-links.js \
  --artifact deployment-proof/mainnet-decision-cycle.json \
  --post-gh-pr <PR_NUMBER> \
  --repo <OWNER/REPO>
```

`skills/operate-clawcommit/scripts/decision_cycle.sh` can call this automatically by passing:
- `--deploy-tx <DEPLOY_TX_HASH>`
- `--json-out <PATH>`
- `--links-out <PATH>`
- `--post-gh-pr <PR_NUMBER>` (optional)
- `--gh-repo <OWNER/REPO>` (optional)

## OpenClaw Native (PR + Merge Tracking)

OpenClaw Native is an additive profile that keeps existing `clawcommit_*` APIs intact while adding deterministic PR-validation payload tooling and CI workflows.

What is added:
- SDK helpers: `buildOpenClawDecisionPayload`, `commitOpenClawDecision`, `revealOpenClawDecision`
- MCP tools: `clawcommit_openclaw_build_payload`, `clawcommit_openclaw_commit`, `clawcommit_openclaw_reveal`
- AI schemas for OpenAI/Anthropic/Gemini with matching OpenClaw tool definitions
- OpenClaw adapter surface under `integrations/openclaw/`:
  - `openclaw-decision.schema.json`
  - `convert-to-clawcommit.js`
  - `openclaw.js`
- GitHub workflows:
  - `.github/workflows/openclaw-pr-commit.yml`
  - `.github/workflows/openclaw-merge-reveal.yml`
  - `.github/workflows/openclaw-pr-attest.yml`
  - `.github/workflows/openclaw-merge-attest.yml`

Required repo secrets:
- `CLAWCOMMIT_CONTRACT`
- `DEPLOYER_PRIVATE_KEY`
- `E2E_TESTNET_RPC_URL` or `BSC_TESTNET_RPC_URL`

Artifact contract:
- `.clawcommit/openclaw/pr-<PR_NUMBER>-latest.json` (full prompt/output/nonce + validation metadata)
- `.clawcommit/openclaw/pr-<PR_NUMBER>-revealed.json` (includes reveal tx + verify status)

Safety defaults:
- Writes default to `bscTestnet`.
- Mainnet writes remain blocked unless explicitly enabled.
- PR comments are redacted; full payload remains artifact-only.

Adapter quick start:

```bash
node integrations/openclaw/convert-to-clawcommit.js \
  --input artifacts/openclaw-run.json \
  --out .clawcommit/decision.json

npm run openclaw:attest -- \
  --repo . \
  --network bscTestnet \
  --contract "$CLAWCOMMIT_CONTRACT_TESTNET" \
  --decision-json .clawcommit/decision.json \
  --json-out .clawcommit/openclaw-cycle.json \
  --json-include-prompt \
  --links-out .clawcommit/openclaw-cycle.md \
  --links-include-prompt
```

### 4. Replay Validator (Standalone)

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH
```

Optional custom RPC:

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH --rpc https://bsc-dataseed.binance.org/
```

Gemini input-integrity mode:

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH --model gemini-1.5-pro
```

In Gemini mode, replay verifies commit/reveal integrity and canonical metadata integrity.
It does not require deterministic token-level regeneration of the model output.

On success it prints:

```text
✓ Deterministic Replay Verified
Commit hash matches reveal.
```

## One-Shot Deployment + Proof Artifacts

```bash
npx hardhat run scripts/deployAndProve.ts --network bsc
```

This writes:

- `deployment-proof/contract.txt`
- `deployment-proof/deploy-tx.txt`
- `deployment-proof/commit-tx.txt`
- `deployment-proof/reveal-tx.txt`

## Merkle Batching (Wave 2)

Wave 2 extends root-level commitments with multi-leaf reveal writes in one transaction.
Wave 1 primitives remain fully backwards compatible.

Batch leaf formula:

`keccak256(abi.encode(prompt, output, modelVersion, nonce, leafIndex))`

Merkle parent formula:

`keccak256(abi.encode(left, right))`

Odd-width levels duplicate the last node.

## Gemini Native Support

First-class Gemini support now lives in `integrations/openclaw/`:

- `GeminiAdapter.ts`: canonical Gemini prompt envelope + nonce strategy (`random` or `counter`).
- `GeminiProvider.ts`: TypeScript wrapper to call Gemini and commit before returning output.
- `gemini_provider.py`: Python wrapper with the same conversion + decision-cycle flow.
- `.github/workflows/gemini-pr-audit.yml`: PR workflow that runs Gemini audit, commits on testnet, and comments explorer links.

Expanded Gemini attestation hash:

`keccak256(abi.encode(prompt, output, modelVersion, nonce, temperature, topP))`

`candidateCount`, `stopSequences`, and `safetySettings` are normalized into the canonical prompt envelope
so they remain covered by on-chain replay verification with the existing contract interface.

### Build a batch manifest from NDJSON

```bash
npx ts-node scripts/batch/build.ts \
  --in data/decisions-batch-001.ndjson \
  --out artifacts/batches/batch-001.manifest.json \
  --model-version clawcommit-v2.0
```

### Recompute root from manifest

```bash
npx ts-node scripts/batch/recomputeRoot.ts \
  --manifest artifacts/batches/batch-001.manifest.json
```

### Commit batch root onchain

Deploy the batch contract first:

```bash
npx hardhat run scripts/batch/deployBatch.ts --network bsc
```

Then commit:

```bash
HARDHAT_NETWORK=bscTestnet npx ts-node scripts/batch/commitBatch.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --manifest artifacts/batches/batch-001.manifest.json
```

### Read committed batch

```bash
HARDHAT_NETWORK=bscTestnet npx ts-node scripts/batch/getBatch.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id 0
```

### Generate inclusion proof JSON

```bash
npx ts-node scripts/batch/generateProof.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --leaf-index 1 \
  --out artifacts/batches/batch-001-leaf-1.proof.json
```

`scripts/batch/generateProof.ts` blocks sensitive stdout by default.
Use `--out <path>` (recommended) or explicitly pass `--log-sensitive true`.

### Reveal a batch leaf onchain (with proof)

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/revealLeaf.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id 0 \
  --leaf-index 1 \
  --manifest artifacts/batches/batch-001.manifest.json \
  --allow-mainnet-writes true
```

### Reveal multiple leaves onchain (single transaction)

```bash
HARDHAT_NETWORK=bsc npx ts-node scripts/batch/revealLeaves.ts \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id 0 \
  --leaf-indexes 0,2,3 \
  --manifest artifacts/batches/batch-001.manifest.json \
  --allow-mainnet-writes true
```

### Replay batch determinism

Local (manifest-only):

```bash
npx ts-node scripts/batch/replayBatch.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --local
```

On-chain (root/hash cross-check):

```bash
npx ts-node scripts/batch/replayBatch.ts \
  --manifest artifacts/batches/batch-001.manifest.json \
  --contract <BATCH_CONTRACT_ADDRESS> \
  --batch-id 0 \
  --network bsc
```

### One-command local stage demo

```bash
npm run batch:demo:local
```

This executes the exact sequence:
`build -> generateProof -> commitBatch -> revealLeaf -> replayBatch`
and writes a clean transcript to:
`deployment-proof/batch-demo-transcript.txt`.

## Mainnet Runbook

1. Set `.env` from `.env.example`:
   - `BSC_RPC_URL`
   - `DEPLOYER_PRIVATE_KEY`
   - `BSCSCAN_API_KEY`
2. Run:
   - `npm install && npx hardhat compile && npm test`
   - `npx hardhat run scripts/deploy.ts --network bscTestnet`
   - commit + reveal using scripts above
   - `npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH>`
   - `npx hardhat run scripts/verifyContract.ts --network bsc -- --address <CONTRACT_ADDRESS>` (mainnet)
3. Persist values in `deployment-proof/` and `bsc.address`.

## Practical Cost Notes (Risk/Reward)

ClawCommit is designed to make AI decisions tamper-evident without breaking your budget.
In production, you pay gas only when you write to chain state.

Typical cost ranges on BNB Chain:

- Commit (log a decision): ~50,000-80,000 gas (about $0.10-$0.15)
- Reveal (publish prompt/output/modelVersion/nonce): ~80,000-120,000 gas (about $0.15-$0.25)
- Verify/hash checks: free (read-only or off-chain)
- `bscTestnet`: free (testnet BNB has no monetary value)

Practical budgeting:

- A full commit + reveal cycle is often around $0.25 total.
- 100 committed and revealed decisions is roughly $25 at similar gas/BNB conditions.
- Actual USD cost varies with BNB price and gas conditions.
- BNB Chain was chosen for low fees and fast block times, so runaway costs are less likely for normal usage.
- Wave 2 batch writes (`revealBatchLeaves`) reduce per-leaf reveal overhead.

Risks and overhead:

- Gas expenditure: commit/reveal requires funded BNB wallets; low balance or fee spikes can stall writes.
- Private key management: signing keys must be handled securely; do not expose keys in logs or source control.
- Nonce/payload discipline: reveal must use the exact original prompt/output/modelVersion/nonce or verification fails.
- Operational complexity: CI workflows need artifact storage (commit IDs/nonces) and retry logic for RPC failures.
- Mainnet safety: keep explicit guards like `--allow-mainnet-writes true` for production writes.

Rewards and benefits:

- Tamper-evident, immutable decision logs with deterministic replay.
- Trust-minimized verification by third parties without private keys.
- Consistent transparency across CLI, MCP, GitHub Actions, and SDK flows.
- Cost is usually negligible compared to model inference and deployment risk.

Verdict:

For most engineering teams, the reward outweighs the risk.
With standard DevOps hygiene (secure keys, nonce tracking, testnet-first rollout), ClawCommit provides strong auditability for cents per decision.

## Transparency

This project uses standard Solidity tooling with Hardhat and ethers.js. The current contract intentionally avoids token/governance logic and keeps minimal attack surface.

## MCP Integration Quickstart

ClawCommit provides native Model Context Protocol (MCP) server support for AI assistants including Claude Code, GitHub Copilot, and other MCP-compatible tools.

### For GitHub Copilot

Quick setup for GitHub Copilot integration:

```bash
npm run mcp:setup
```

Then add to your GitHub Copilot settings (VS Code or CLI). See:
- [GitHub Copilot Integration Guide](integrations/github-copilot/README.md)
- [GitHub Copilot Quickstart](integrations/github-copilot/QUICKSTART.md)

### For Claude Code and Other MCP Clients

For MCP server setup, env configuration, testnet faucet steps, and terminal verification:

- `/Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server/README.md`
- `/Users/luigiarmogida/Documents/projects/ClawCommit/integrations/mcp-server/QUICKSTART.md`

## Repo Layout

- `contracts/ClawCommit.sol` - V2 deterministic commit-reveal contract
- `contracts/ClawCommitBatch.sol` - Wave 2 Merkle batch commitment + multi-reveal contract
- `scripts/deploy.ts` - deploy script
- `scripts/commit.ts` - commit CLI
- `scripts/reveal.ts` - reveal CLI
- `scripts/replay.ts` - standalone replay validator (`ts-node`)
- `scripts/batch/build.ts` - NDJSON to manifest/tree builder
- `scripts/batch/recomputeRoot.ts` - deterministic root recomputation
- `scripts/batch/commitBatch.ts` - batch root commit script
- `scripts/batch/getBatch.ts` - batch read script
- `scripts/batch/revealLeaves.ts` - batch multi-leaf reveal script
- `scripts/deployAndProve.ts` - one-shot deploy + proof files
- `scripts/verifyContract.ts` - BscScan verification helper
- `backend/aiPipeline.ts` - AI decision lifecycle demo
- `test/` - contract + replay script tests
- `docs/PROJECT.md` - problem/impact narrative
- `docs/TECHNICAL.md` - protocol and architecture details
- `docs/REPLAY.md` - replay validator behavior and failure modes
- `docs/AI_BUILD_LOG.md` - build/change log
- `deployment-proof/` - deployment artifacts

## Standalone Verification (Zero Trust)

Any person can verify any ClawCommit commitment independently. No wallet needed. No trust required.

### Verify by Reveal Transaction Hash

```bash
npx ts-node scripts/replay.ts --tx <REVEAL_TX_HASH> --rpc <BSC_RPC_URL>
```

Validator steps:
1. Read the commitment data from BSC (public, free)
2. Decode reveal payload (`prompt/output/modelVersion/nonce`)
3. Recompute `keccak256(abi.encode(prompt, output, modelVersion, nonce))` locally
4. Compare against the stored hash
5. If match → decision is cryptographically proven authentic

## Hackathon Submission Compliance

### Onchain Proof
- **Contract Address**: See `bsc.address` for deployed address
- **Network**: BNB Smart Chain (BSC) Mainnet — Chain ID 56
- **Explorer**: https://bscscan.com/address/[CONTRACT_ADDRESS]
- **Proof Artifacts**: See `deployment-proof/` directory for deploy, commit, and reveal transaction hashes

### Reproducibility
- **Public Repository**: https://github.com/Armogida/ClawCommit
- **Setup Time**: 5 minutes (local), 15 minutes (BSC testnet)
- **Reproduction Steps**:
  1. `git clone https://github.com/Armogida/ClawCommit.git && cd ClawCommit`
  2. `npm install && npx hardhat compile`
  3. `npm test`
  4. `npx hardhat run scripts/deployAndProve.ts` — full proof cycle locally
  5. For BSC: `cp .env.example .env` → add keys → `npm run deploy:mainnet`

### No Token Policy
This project contains **zero token logic**. No ERC20, no ERC721, no minting, no transfers, no liquidity pools, no airdrops, no governance tokens. The smart contract (`contracts/ClawCommit.sol`) exclusively implements commit-reveal storage and verification. There is no financial mechanism of any kind.

### AI Build Log
See [`docs/AI_BUILD_LOG.md`](docs/AI_BUILD_LOG.md) for detailed documentation of how Claude Code CLI (Claude Opus 4.6) was used with experimental team agent spawning to build this project. 15+ specialist agents were spawned across 4 build phases.
