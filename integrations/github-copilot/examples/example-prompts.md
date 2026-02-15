# ClawCommit + GitHub Copilot Example Prompts

## Basic Operations

### 1. Commit a Decision

```
@workspace Use the clawcommit MCP server to commit a decision:

Prompt: "Should we deploy feature-auth-v2 to production?"
Output: "APPROVE_DEPLOY"
Model Version: "github-copilot-2024-02"
Contract: 0xYourContractAddress
Network: bscTestnet
```

### 2. Reveal a Previous Commitment

```
@workspace Use the clawcommit MCP server to reveal commit ID 3:

Commit ID: 3
Prompt: "Should we deploy feature-auth-v2 to production?"
Output: "APPROVE_DEPLOY"
Model Version: "github-copilot-2024-02"
Nonce: 0xYourNonceFromCommit
Contract: 0xYourContractAddress
Network: bscTestnet
```

### 3. Verify a Commitment

```
@workspace Verify commitment ID 3 using the clawcommit MCP server at contract 0xYourContractAddress on bscTestnet
```

### 4. Compute Hash Locally

```
@workspace Use clawcommit to compute the decision hash for:

Prompt: "Should we merge PR #456?"
Output: "APPROVE_MERGE"
Model Version: "copilot-review-v1"
```

## Real-World Scenarios

### Code Review Approval

```
@workspace I just reviewed PR #789 about the database migration. The changes look good and tests are passing. 

Please use the clawcommit MCP server to commit this review decision:

Prompt: "Code review for PR #789: Database migration to support user preferences"
Output: "APPROVED - Tests passing, migration scripts verified, rollback plan documented"
Model Version: "github-copilot-code-review-v1.2"
Contract: 0xYourContractAddress
Network: bscTestnet

Store the commit ID and nonce for later reveal.
```

### Security Scan Result

```
@workspace Security scan completed for branch feature/oauth-integration. No critical vulnerabilities found.

Use clawcommit to commit this security decision:

Prompt: "Security scan results for feature/oauth-integration"
Output: "PASS - 0 critical, 0 high, 2 medium (non-blocking), 5 low"
Model Version: "copilot-security-scan-v2.0"
Contract: 0xYourContractAddress
Network: bscTestnet
```

### Deployment Decision

```
@workspace All staging tests passed. Ready to deploy to production.

Commit this deployment decision via clawcommit:

Prompt: "Production deployment approval for release v2.5.0"
Output: "APPROVED - All tests passed, staging validated, monitoring configured"
Model Version: "copilot-deployment-v1.0"
Contract: 0xYourContractAddress
Network: bscMainnet
Allow Mainnet Writes: true
```

### Multi-Step Workflow

**Step 1: Commit before action**
```
@workspace Before merging PR #123, commit the approval decision using clawcommit:

Prompt: "Final approval for PR #123: Authentication refactor"
Output: "APPROVED"
Model Version: "copilot-final-review-v1"
Contract: 0xYourContractAddress
Network: bscTestnet
```

**Step 2: Perform action**
```
(Merge the PR manually or via automation)
```

**Step 3: Reveal after action**
```
@workspace PR #123 has been merged. Now reveal the commitment using clawcommit:

Commit ID: 5
Prompt: "Final approval for PR #123: Authentication refactor"
Output: "APPROVED"
Model Version: "copilot-final-review-v1"
Nonce: 0xNonceFromPreviousCommit
Contract: 0xYourContractAddress
Network: bscTestnet
```

**Step 4: Verify**
```
@workspace Verify that commit ID 5 was revealed correctly using clawcommit
Contract: 0xYourContractAddress
Network: bscTestnet
```

## Batch Review Workflow

### Multiple PRs Review Session

```
@workspace I'm reviewing a batch of PRs. For each approved PR, commit the decision:

PR #101: Feature addition
Prompt: "Review PR #101: Add user profile page"
Output: "APPROVED"

PR #102: Bug fix
Prompt: "Review PR #102: Fix memory leak in cache"
Output: "APPROVED"

PR #103: Refactor
Prompt: "Review PR #103: Refactor API client"
Output: "CHANGES_REQUESTED - Add error handling"

Use model version: "copilot-batch-review-v1"
Contract: 0xYourContractAddress
Network: bscTestnet

Commit each decision separately and provide the commit IDs.
```

## Integration with Code Changes

### Track This Development Session

```
@workspace I'm about to implement a new feature. First, commit my plan using clawcommit:

Prompt: "Implementation plan for real-time notifications feature"
Output: "PLAN: WebSocket server + Redis pub/sub + React hooks integration. Estimated: 4 hours."
Model Version: "github-copilot-planning-v1"
Contract: 0xYourContractAddress
Network: bscTestnet

After implementation is complete, I'll reveal this commitment with actual results.
```

### Document Architectural Decision

```
@workspace Document this architectural decision using clawcommit:

Prompt: "Should we use microservices architecture for the new payment system?"
Output: "DECISION: Yes - Benefits: Scalability, isolation, independent deployment. Trade-offs: Complexity, network latency. Implementation: Start with 3 services (auth, payment, notification)"
Model Version: "copilot-architecture-v1"
Contract: 0xYourContractAddress
Network: bscTestnet
```

## Query and Verification

### Check Commitment Status

```
@workspace Get the details of commitment ID 7 from contract 0xYourContractAddress on bscTestnet using clawcommit
```

### Verify Recent Commitments

```
@workspace I need to verify the last 3 commitments (IDs 8, 9, 10) using clawcommit:

Contract: 0xYourContractAddress
Network: bscTestnet

Check if each has been revealed and if the hashes match.
```

## Tips for Effective Usage

1. **Be Specific**: Include all context in the prompt
2. **Use Consistent Versioning**: Track different agent types with version strings
3. **Store Nonces Safely**: Keep nonces in secure location for later reveal
4. **Test on Testnet First**: Always use bscTestnet before mainnet operations
5. **Descriptive Outputs**: Make outputs informative for future reference
6. **Link to PRs/Issues**: Include PR/issue numbers in prompts for traceability

## Advanced Patterns

### Conditional Deployment

```
@workspace Check if commit ID 12 has been revealed and approved. If yes, proceed with deployment. If not, wait for reveal.

Contract: 0xYourContractAddress
Network: bscTestnet
```

### Audit Trail Query

```
@workspace Generate a summary of all commitments for model version "copilot-review-v1" by:
1. Listing all commit IDs I've created
2. Checking reveal status for each
3. Verifying hash integrity
4. Creating an audit report

Contract: 0xYourContractAddress
Network: bscTestnet
```

### Chain of Custody

```
@workspace Create a chain of custody for release v3.0.0:

1. Commit: "Code review completed"
2. Commit: "Security scan passed"
3. Commit: "Staging tests successful"
4. Commit: "Production deployment approved"

Use model version: "copilot-release-chain-v1"
Contract: 0xYourContractAddress
Network: bscTestnet

Track all commit IDs for later reveal sequence.
```
