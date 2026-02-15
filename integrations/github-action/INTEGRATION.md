# ClawCommit GitHub Action Integration Guide

Complete guide for integrating the ClawCommit GitHub Action into your repository for AI decision auditing.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Quick Setup](#quick-setup)
3. [Configuration](#configuration)
4. [Integration Patterns](#integration-patterns)
5. [Advanced Usage](#advanced-usage)
6. [Troubleshooting](#troubleshooting)
7. [Best Practices](#best-practices)

## Prerequisites

Before integrating the ClawCommit GitHub Action, ensure you have:

### 1. Smart Contract Deployment

Deploy the ClawCommit contract to BNB Smart Chain:

```bash
# From the ClawCommit repository root
npm install
npx hardhat run scripts/deploy.ts --network bsc

# Save the deployed contract address
```

### 2. Wallet Setup

Create a dedicated wallet for GitHub Actions:

```bash
# Generate new wallet (or use existing)
# Fund it with ~0.1 BNB for gas fees
# Never reuse your main deployment wallet
```

### 3. GitHub Repository Access

Ensure you have admin access to configure secrets and workflows.

## Quick Setup

### Step 1: Add GitHub Secrets

Navigate to: `Repository Settings` → `Secrets and variables` → `Actions` → `New repository secret`

Add these secrets:

| Secret Name | Value | Description |
|-------------|-------|-------------|
| `CLAWCOMMIT_CONTRACT` | `0x...` | Deployed contract address on BSC |
| `DEPLOYER_PRIVATE_KEY` | `0x...` | Private key for signing transactions |
| `BSC_RPC_URL` | URL | (Optional) Premium RPC endpoint |

### Step 2: Create Workflow File

Create `.github/workflows/ai-audit.yml`:

```yaml
name: AI Decision Audit
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "AI_REVIEW_PR_${{ github.event.pull_request.number }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### Step 3: Test the Integration

1. Create a test pull request
2. Verify the workflow runs successfully
3. Check the transaction on BSCScan
4. Confirm commit ID is generated

## Configuration

### Environment-Specific Configuration

Use different contracts and wallets for different environments:

```yaml
# .github/workflows/ai-audit-dev.yml
on:
  pull_request:
    branches: [develop]

jobs:
  audit:
    steps:
      - uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          contract-address: ${{ secrets.DEV_CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEV_PRIVATE_KEY }}
          rpc-url: https://bsc-testnet.public.blastapi.io
```

```yaml
# .github/workflows/ai-audit-prod.yml
on:
  pull_request:
    branches: [main]

jobs:
  audit:
    steps:
      - uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          contract-address: ${{ secrets.PROD_CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.PROD_PRIVATE_KEY }}
          rpc-url: ${{ secrets.BSC_RPC_URL }}
```

### RPC Provider Configuration

For production workloads, use premium RPC providers:

**NodeReal**:
```yaml
rpc-url: https://bsc-mainnet.nodereal.io/v1/${{ secrets.NODEREAL_API_KEY }}
```

**Ankr**:
```yaml
rpc-url: https://rpc.ankr.com/bsc/${{ secrets.ANKR_API_KEY }}
```

**QuickNode**:
```yaml
rpc-url: https://${{ secrets.QUICKNODE_ENDPOINT }}.bsc.quiknode.pro/${{ secrets.QUICKNODE_API_KEY }}
```

## Integration Patterns

### Pattern 1: Commit on PR Open, Reveal on Merge

**Workflow 1: Commit** (`.github/workflows/commit-review.yml`)

```yaml
name: Commit AI Review
on:
  pull_request:
    types: [opened, synchronize]

jobs:
  commit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Run AI Review
        id: review
        run: |
          # Your AI review logic
          echo "result=APPROVED" >> $GITHUB_OUTPUT

      - name: Commit to Blockchain
        id: commit
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "REVIEW_${{ steps.review.outputs.result }}_PR_${{ github.event.pull_request.number }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}

      - name: Save Commit Data
        run: |
          mkdir -p .clawcommit
          echo "${{ steps.commit.outputs.commit-id }}" > .clawcommit/commit-id.txt
          echo "${{ steps.commit.outputs.nonce }}" > .clawcommit/nonce.txt

      - uses: actions/upload-artifact@v4
        with:
          name: clawcommit-pr-${{ github.event.pull_request.number }}
          path: .clawcommit/
```

**Workflow 2: Reveal** (`.github/workflows/reveal-review.yml`)

```yaml
name: Reveal AI Review
on:
  pull_request:
    types: [closed]

jobs:
  reveal:
    if: github.event.pull_request.merged == true
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
        with:
          name: clawcommit-pr-${{ github.event.pull_request.number }}

      - name: Read Commit Data
        id: data
        run: |
          echo "commit_id=$(cat commit-id.txt)" >> $GITHUB_OUTPUT
          echo "nonce=$(cat nonce.txt)" >> $GITHUB_OUTPUT

      - name: Reveal on Blockchain
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: reveal
          commit-id: ${{ steps.data.outputs.commit_id }}
          decision: "REVIEW_APPROVED_PR_${{ github.event.pull_request.number }}"
          nonce: ${{ steps.data.outputs.nonce }}
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### Pattern 2: Immediate Commit-Reveal

For cases where decisions should be immediately public:

```yaml
name: Public AI Audit
on: [pull_request]

jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - name: Commit Decision
        id: commit
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "AI_DECISION_${{ github.event.pull_request.number }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}

      - name: Immediate Reveal
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: reveal
          commit-id: ${{ steps.commit.outputs.commit-id }}
          decision: "AI_DECISION_${{ github.event.pull_request.number }}"
          nonce: ${{ steps.commit.outputs.nonce }}
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### Pattern 3: Batch Verification

Regularly verify all commitments:

```yaml
name: Weekly Audit Verification
on:
  schedule:
    - cron: '0 0 * * 0'

jobs:
  verify:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        commit-id: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    steps:
      - uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: verify
          commit-id: ${{ matrix.commit-id }}
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
```

## Advanced Usage

### Custom Decision Formats

Structure decisions for specific use cases:

```yaml
# Security audit
decision: "SECURITY_SCAN_PASSED_VULNERABILITIES_0_SEVERITY_NONE_SHA_${{ github.sha }}"

# Performance benchmark
decision: "PERF_TEST_LATENCY_45ms_THROUGHPUT_1000rps_MEMORY_512MB"

# Compliance check
decision: "COMPLIANCE_GDPR_PASSED_PII_ENCRYPTED_AUDIT_LOG_ENABLED"

# Model evaluation
decision: "MODEL_EVAL_ACCURACY_0.95_PRECISION_0.93_RECALL_0.94_F1_0.935"
```

### Dynamic Nonce Generation

Generate nonces based on workflow context:

```yaml
- name: Generate Contextual Nonce
  id: nonce
  run: |
    NONCE=$(echo -n "${{ github.sha }}${{ github.run_id }}$(date +%s)" | sha256sum | cut -d' ' -f1)
    echo "value=$NONCE" >> $GITHUB_OUTPUT

- uses: Armogida/ClawCommit/integrations/github-action@main
  with:
    action: commit
    decision: "AI_DECISION"
    nonce: ${{ steps.nonce.outputs.value }}
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### Error Handling and Retries

Implement retry logic for reliability:

```yaml
- name: Commit with Retry
  uses: nick-fields/retry@v2
  with:
    timeout_minutes: 10
    max_attempts: 3
    retry_wait_seconds: 30
    command: |
      cd $GITHUB_WORKSPACE
      echo "Committing to blockchain..."
      # Use the action via npx or direct node execution
```

### Conditional Execution

Only commit for specific conditions:

```yaml
jobs:
  audit:
    if: |
      github.event.pull_request.base.ref == 'main' &&
      !contains(github.event.pull_request.labels.*.name, 'skip-audit')
    steps:
      - uses: Armogida/ClawCommit/integrations/github-action@main
        # ... configuration
```

## Troubleshooting

### Issue: Transaction Fails with "Insufficient Funds"

**Solution**:
```bash
# Check wallet balance
# Fund wallet with at least 0.01 BNB
# Typical gas cost: ~0.001 BNB per transaction
```

### Issue: Hash Mismatch on Reveal

**Cause**: Decision string or nonce doesn't match commit

**Solution**:
```yaml
# Ensure exact match (including spaces, case)
# Store both values securely
# Use artifacts or encrypted secrets
```

### Issue: Action Times Out

**Cause**: RPC endpoint is slow or rate-limited

**Solution**:
```yaml
# Use premium RPC provider
# Increase timeout in workflow
timeout-minutes: 15
```

### Issue: Cannot Find Artifact

**Cause**: Artifact expired or workflow failed

**Solution**:
```yaml
# Increase retention period
retention-days: 90

# Add error handling
continue-on-error: true
```

## Best Practices

### 1. Security

- **Never hardcode private keys** in workflows
- **Use environment-specific secrets** for dev/staging/prod
- **Rotate keys regularly** (quarterly recommended)
- **Use dedicated wallets** for GitHub Actions
- **Enable branch protection** for workflow files

### 2. Reliability

- **Use premium RPC endpoints** for production
- **Implement retry logic** for critical operations
- **Monitor gas prices** and adjust accordingly
- **Set appropriate timeouts** (5-10 minutes)
- **Store artifacts redundantly** (artifacts + external storage)

### 3. Cost Optimization

- **Batch operations** when possible
- **Use verify action** (read-only, no gas)
- **Cache artifacts** to avoid duplicate commits
- **Monitor wallet balance** with alerts

### 4. Compliance

- **Log all operations** for audit trails
- **Store commit metadata** in multiple locations
- **Implement regular verification** schedules
- **Document decision formats** in repository
- **Maintain deployment records** for 1+ years

### 5. Monitoring

Set up alerts for:

```yaml
# Low wallet balance
if: wallet_balance < 0.01 BNB

# Failed commitments
if: commitment_failed

# Verification failures
if: verification_failed

# Unusual gas costs
if: gas_cost > 0.01 BNB
```

## Example: Complete Production Setup

```yaml
# .github/workflows/production-ai-audit.yml
name: Production AI Audit

on:
  pull_request:
    branches: [main]
    types: [opened, synchronize, reopened]

env:
  NODE_VERSION: '20'

jobs:
  ai-review-and-commit:
    runs-on: ubuntu-latest
    timeout-minutes: 15
    permissions:
      pull-requests: write
      contents: read

    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: ${{ env.NODE_VERSION }}

      - name: Run AI Security Scan
        id: scan
        run: |
          # Your AI security scan
          echo "result=PASSED" >> $GITHUB_OUTPUT
          echo "score=95" >> $GITHUB_OUTPUT

      - name: Create Decision String
        id: decision
        run: |
          DECISION="AI_SECURITY_SCAN_${{ steps.scan.outputs.result }}_SCORE_${{ steps.scan.outputs.score }}_PR_${{ github.event.pull_request.number }}_SHA_${{ github.sha }}_TIME_$(date -u +%Y%m%d%H%M%S)"
          echo "value=$DECISION" >> $GITHUB_OUTPUT

      - name: Commit to Blockchain
        id: commit
        uses: nick-fields/retry@v2
        with:
          timeout_minutes: 10
          max_attempts: 3
          retry_wait_seconds: 30
          command: |
            # This would execute the action
            echo "Committing: ${{ steps.decision.outputs.value }}"

      - name: Verify Commitment
        uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: verify
          commit-id: ${{ steps.commit.outputs.commit-id }}
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}

      - name: Store Audit Trail
        run: |
          mkdir -p audit-trail
          cat > audit-trail/pr-${{ github.event.pull_request.number }}.json <<EOF
          {
            "pr_number": ${{ github.event.pull_request.number }},
            "commit_id": "${{ steps.commit.outputs.commit-id }}",
            "hash": "${{ steps.commit.outputs.hash }}",
            "nonce": "${{ steps.commit.outputs.nonce }}",
            "decision": "${{ steps.decision.outputs.value }}",
            "tx_hash": "${{ steps.commit.outputs.tx-hash }}",
            "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
          }
          EOF

      - name: Upload Audit Trail
        uses: actions/upload-artifact@v4
        with:
          name: audit-trail-pr-${{ github.event.pull_request.number }}
          path: audit-trail/
          retention-days: 365

      - name: Comment on PR
        uses: actions/github-script@v7
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: `## 🔒 AI Security Audit Complete

              **Result**: ${{ steps.scan.outputs.result }}
              **Score**: ${{ steps.scan.outputs.score }}/100

              ### Blockchain Commitment
              - **Commit ID**: ${{ steps.commit.outputs.commit-id }}
              - **Transaction**: [View on BSCScan](https://bscscan.com/tx/${{ steps.commit.outputs.tx-hash }})

              This audit result is cryptographically secured on BNB Chain.
              `
            });
```

## Support

For issues or questions:

- **Documentation**: [Main README](README.md)
- **Examples**: [examples/](examples/)
- **Issues**: [GitHub Issues](https://github.com/Armogida/ClawCommit/issues)

---

Built with ClawCommit - Deterministic AI Decision Auditing
