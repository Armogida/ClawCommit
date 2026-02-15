# ClawCommit GitHub Action

A GitHub Action for automatically committing AI decisions to BNB Chain using the ClawCommit commit-reveal protocol. Integrate blockchain-based AI decision auditing directly into your CI/CD pipeline.

## Features

- **Commit**: Create tamper-evident commitments of AI decisions on-chain
- **Reveal**: Reveal previously committed decisions when ready
- **Verify**: Verify the integrity of revealed commitments
- **Automatic Nonce Generation**: Secure random nonce generation for commits
- **CI/CD Integration**: Seamlessly integrate with GitHub workflows
- **Production Ready**: Built with error handling and comprehensive logging

## Quick Start

### 1. Setup GitHub Secrets

Add these secrets to your repository (`Settings` → `Secrets and variables` → `Actions`):

- `CLAWCOMMIT_CONTRACT`: The ClawCommit contract address on BSC
- `DEPLOYER_PRIVATE_KEY`: Private key for transaction signing (keep secure!)

### 2. Basic Workflow Example

```yaml
name: AI Decision Audit
on: [pull_request]

jobs:
  commit-ai-review:
    runs-on: ubuntu-latest
    steps:
      - name: Commit AI Review Decision
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "AI_REVIEW_APPROVED_PR_${{ github.event.pull_request.number }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

## Usage Examples

### Example 1: Commit AI Code Review Decision

Automatically commit AI review decisions for every pull request:

```yaml
name: AI Code Review Audit
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  ai-review-commit:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Run AI Code Review
        id: ai-review
        run: |
          # Your AI review logic here
          REVIEW_RESULT="APPROVED"
          echo "result=$REVIEW_RESULT" >> $GITHUB_OUTPUT

      - name: Commit Review Decision to Blockchain
        id: commit
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "AI_REVIEW_${{ steps.ai-review.outputs.result }}_PR_${{ github.event.pull_request.number }}_SHA_${{ github.event.pull_request.head.sha }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}

      - name: Comment PR with Commit ID
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: '🔒 AI Review committed to blockchain!\n\n' +
                    `**Commit ID**: ${{ steps.commit.outputs.commit-id }}\n` +
                    `**Hash**: ${{ steps.commit.outputs.hash }}\n` +
                    `**Nonce**: ${{ steps.commit.outputs.nonce }}\n` +
                    `**Transaction**: https://bscscan.com/tx/${{ steps.commit.outputs.tx-hash }}`
            })
```

### Example 2: Reveal Decision After Merge

Reveal the AI decision after a PR is merged:

```yaml
name: Reveal AI Decision
on:
  pull_request:
    types: [closed]

jobs:
  reveal-if-merged:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Reveal AI Decision
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: reveal
          commit-id: ${{ secrets.PR_COMMIT_ID }}  # Store from commit step
          decision: "AI_REVIEW_APPROVED_PR_${{ github.event.pull_request.number }}"
          nonce: ${{ secrets.PR_NONCE }}  # Store from commit step
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### Example 3: Two-Stage Commit-Reveal Workflow

Complete commit-reveal flow with secure storage:

```yaml
name: Complete AI Audit Flow
on:
  pull_request:
    types: [opened, closed]

jobs:
  commit-stage:
    if: github.event.action == 'opened'
    runs-on: ubuntu-latest
    steps:
      - name: Commit AI Decision
        id: commit
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "AI_SECURITY_SCAN_PASSED_PR_${{ github.event.pull_request.number }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}

      - name: Store Commit Data
        run: |
          # Store commit-id and nonce for later reveal
          # In production, use a secure key-value store or artifact
          echo "COMMIT_ID=${{ steps.commit.outputs.commit-id }}" >> commit_data.txt
          echo "NONCE=${{ steps.commit.outputs.nonce }}" >> commit_data.txt
          echo "DECISION=AI_SECURITY_SCAN_PASSED_PR_${{ github.event.pull_request.number }}" >> commit_data.txt

      - name: Upload Commit Data
        uses: actions/upload-artifact@v4
        with:
          name: commit-data-pr-${{ github.event.pull_request.number }}
          path: commit_data.txt
          retention-days: 90

  reveal-stage:
    if: github.event.action == 'closed' && github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - name: Download Commit Data
        uses: actions/download-artifact@v4
        with:
          name: commit-data-pr-${{ github.event.pull_request.number }}

      - name: Read Commit Data
        id: read
        run: |
          COMMIT_ID=$(grep COMMIT_ID commit_data.txt | cut -d'=' -f2)
          NONCE=$(grep NONCE commit_data.txt | cut -d'=' -f2)
          DECISION=$(grep DECISION commit_data.txt | cut -d'=' -f2)
          echo "commit_id=$COMMIT_ID" >> $GITHUB_OUTPUT
          echo "nonce=$NONCE" >> $GITHUB_OUTPUT
          echo "decision=$DECISION" >> $GITHUB_OUTPUT

      - name: Reveal AI Decision
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: reveal
          commit-id: ${{ steps.read.outputs.commit_id }}
          decision: ${{ steps.read.outputs.decision }}
          nonce: ${{ steps.read.outputs.nonce }}
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### Example 4: Verify Commitment Integrity

Verify a commitment without needing private keys:

```yaml
name: Verify AI Decision
on:
  workflow_dispatch:
    inputs:
      commit-id:
        description: 'Commit ID to verify'
        required: true

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - name: Verify Commitment
        id: verify
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: verify
          commit-id: ${{ github.event.inputs.commit-id }}
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}

      - name: Check Verification Result
        run: |
          if [ "${{ steps.verify.outputs.verified }}" == "true" ]; then
            echo "✓ Commitment verified successfully"
            exit 0
          else
            echo "✗ Commitment verification failed"
            exit 1
          fi
```

### Example 5: AI Model Deployment Audit

Audit AI model deployments to production:

```yaml
name: AI Model Deployment Audit
on:
  release:
    types: [published]

jobs:
  commit-deployment:
    runs-on: ubuntu-latest
    steps:
      - name: Commit Model Deployment
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "MODEL_DEPLOYED_v${{ github.event.release.tag_name }}_SHA_${{ github.sha }}_TIME_${{ github.event.release.published_at }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
          rpc-url: https://bsc-dataseed.binance.org/
```

### Example 6: Scheduled AI Audit Verification

Periodically verify all AI decisions are intact:

```yaml
name: Periodic Audit Verification
on:
  schedule:
    - cron: '0 0 * * 0'  # Weekly on Sunday at midnight

jobs:
  verify-audits:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        commit-id: [1, 2, 3, 4, 5]  # Your commit IDs to verify
    steps:
      - name: Verify Commitment
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: verify
          commit-id: ${{ matrix.commit-id }}
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
```

## Input Parameters

| Input | Description | Required | Default |
|-------|-------------|----------|---------|
| `action` | Action to perform: `commit`, `reveal`, or `verify` | Yes | - |
| `decision` | The AI decision string to commit | For commit/reveal | - |
| `nonce` | Nonce for commit/reveal (auto-generated if omitted) | No | Auto-generated |
| `commit-id` | Commit ID for reveal/verify operations | For reveal/verify | - |
| `contract-address` | ClawCommit contract address on BSC | Yes | - |
| `rpc-url` | BSC RPC URL | No | `https://bsc-dataseed.binance.org/` |
| `private-key` | Private key for signing transactions | For commit/reveal | - |

## Output Parameters

| Output | Description | Available For |
|--------|-------------|---------------|
| `commit-id` | The commit ID from the operation | commit, reveal, verify |
| `hash` | The keccak256 hash | commit, reveal, verify |
| `nonce` | The nonce used | commit |
| `tx-hash` | Transaction hash | commit, reveal |
| `verified` | Verification result (true/false) | verify |

## Actions

### Commit

Creates a new commitment on-chain. The decision is hashed with a nonce before being stored.

**Required Inputs**: `action`, `decision`, `contract-address`, `private-key`

**Outputs**: `commit-id`, `hash`, `nonce`, `tx-hash`

### Reveal

Reveals a previously committed decision by providing the original decision and nonce.

**Required Inputs**: `action`, `commit-id`, `decision`, `nonce`, `contract-address`, `private-key`

**Outputs**: `commit-id`, `hash`, `tx-hash`

### Verify

Verifies the integrity of a revealed commitment (read-only operation).

**Required Inputs**: `action`, `commit-id`, `contract-address`

**Outputs**: `commit-id`, `verified`, `hash`

## Security Best Practices

### 1. Never Hardcode Private Keys

Always use GitHub Secrets for sensitive data:

```yaml
# ✗ BAD - Never do this!
private-key: "0x1234567890abcdef..."

# ✓ GOOD - Use secrets
private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### 2. Secure Nonce Storage

Store commit data securely between commit and reveal stages:

- Use GitHub Actions artifacts (temporary)
- Use encrypted environment variables
- Use secure key-value stores (production)
- Never log nonces in public workflows

### 3. Limit Private Key Permissions

Create a dedicated wallet for GitHub Actions:

- Use a separate wallet from your main deployment wallet
- Fund it with minimal BNB for gas fees only
- Rotate keys periodically
- Monitor transaction activity

### 4. Validate Inputs

Always validate commit IDs and decision formats before operations.

### 5. Use Environment-Specific Secrets

Different environments should use different secrets:

```yaml
# Development
contract-address: ${{ secrets.DEV_CLAWCOMMIT_CONTRACT }}

# Production
contract-address: ${{ secrets.PROD_CLAWCOMMIT_CONTRACT }}
```

## Custom RPC URLs

For better reliability, use premium RPC providers:

```yaml
- uses: Armogida/ClawCommit/integrations/github-action@main
  with:
    action: commit
    decision: "AI_DECISION"
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
    rpc-url: https://bsc-mainnet.nodereal.io/v1/YOUR_API_KEY
```

**Recommended RPC Providers**:
- NodeReal: `https://bsc-mainnet.nodereal.io/v1/YOUR_API_KEY`
- Ankr: `https://rpc.ankr.com/bsc/YOUR_API_KEY`
- QuickNode: `https://YOUR_ENDPOINT.bsc.quiknode.pro/YOUR_API_KEY`

## Troubleshooting

### Transaction Failed

```
Error: transaction failed
```

**Solutions**:
- Ensure wallet has sufficient BNB for gas
- Verify contract address is correct
- Check RPC URL is accessible

### Hash Mismatch on Reveal

```
Error: Hash mismatch! Expected: 0x..., Got: 0x...
```

**Solutions**:
- Verify decision string matches exactly (including whitespace)
- Ensure nonce matches the one used during commit
- Check for encoding issues

### Private Key Issues

```
Error: invalid private key
```

**Solutions**:
- Ensure private key includes `0x` prefix
- Verify secret is correctly set in GitHub
- Check for extra spaces or newlines in secret

## Development

### Local Testing

```bash
# Install dependencies
npm install

# Set environment variables
export INPUT_ACTION="commit"
export INPUT_DECISION="TEST_DECISION"
export INPUT_CONTRACT_ADDRESS="0x..."
export INPUT_PRIVATE_KEY="0x..."

# Run action locally
node index.js
```

### Building and Publishing

This action uses Node.js dependencies. Before publishing:

```bash
# Install production dependencies
npm install --production

# Commit node_modules for GitHub Actions
git add -f node_modules/
git commit -m "Add dependencies for GitHub Action"
```

## Contract Information

**ClawCommit Contract**: Deployed on BNB Smart Chain

See [ClawCommit.sol](../../contracts/ClawCommit.sol) for contract source code.

**Verified Contract**: Check BSCScan for contract verification and transaction history.

## License

MIT License - See [LICENSE](../../LICENSE) for details.

## Support

- **Documentation**: [ClawCommit Docs](../../docs/)
- **Issues**: [GitHub Issues](https://github.com/Armogida/ClawCommit/issues)
- **Contract**: [contracts/ClawCommit.sol](../../contracts/ClawCommit.sol)

## Examples Repository

For more complex integration examples, see the [examples directory](../../docs/examples/).

---

Built with ClawCommit - Deterministic AI Decision Auditing on BNB Chain
