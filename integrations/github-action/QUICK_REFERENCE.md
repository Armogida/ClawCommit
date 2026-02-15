# ClawCommit GitHub Action - Quick Reference

One-page reference for the ClawCommit GitHub Action.

## Installation

```yaml
- uses: Armogida/ClawCommit/integrations/github-action@main
  with:
    action: commit
    decision: "AI_DECISION"
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

## Actions

### Commit
```yaml
- uses: Armogida/ClawCommit/integrations/github-action@main
  id: commit
  with:
    action: commit
    decision: "AI_REVIEW_APPROVED"
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
    rpc-url: https://bsc-dataseed.binance.org/  # optional
    nonce: "0x..."  # optional, auto-generated if omitted
```

**Outputs**: `commit-id`, `hash`, `nonce`, `tx-hash`

### Reveal
```yaml
- uses: Armogida/ClawCommit/integrations/github-action@main
  with:
    action: reveal
    commit-id: "0"
    decision: "AI_REVIEW_APPROVED"
    nonce: ${{ secrets.COMMIT_NONCE }}
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

**Outputs**: `commit-id`, `hash`, `tx-hash`

### Verify
```yaml
- uses: Armogida/ClawCommit/integrations/github-action@main
  id: verify
  with:
    action: verify
    commit-id: "0"
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
```

**Outputs**: `commit-id`, `verified`, `hash`

**Note**: Verify doesn't need `private-key` (read-only)

## Inputs

| Input | Required | Default | Description |
|-------|----------|---------|-------------|
| `action` | Yes | - | `commit`, `reveal`, or `verify` |
| `decision` | Conditional | - | Required for commit/reveal |
| `nonce` | No | Auto-gen | Required for reveal, optional for commit |
| `commit-id` | Conditional | - | Required for reveal/verify |
| `contract-address` | Yes | - | ClawCommit contract on BSC |
| `rpc-url` | No | BSC public | RPC endpoint |
| `private-key` | Conditional | - | Required for commit/reveal |

## Outputs

| Output | commit | reveal | verify | Description |
|--------|--------|--------|--------|-------------|
| `commit-id` | ✓ | ✓ | ✓ | Commit ID number |
| `hash` | ✓ | ✓ | ✓ | keccak256 hash |
| `nonce` | ✓ | - | - | Generated/used nonce |
| `tx-hash` | ✓ | ✓ | - | Transaction hash |
| `verified` | - | - | ✓ | true/false |

## Common Patterns

### Pattern 1: Commit Only
```yaml
on: [pull_request]
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: Armogida/ClawCommit/integrations/github-action@main
        with:
          action: commit
          decision: "AI_DECISION_${{ github.sha }}"
          contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
          private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

### Pattern 2: Commit + Store for Later Reveal
```yaml
- id: commit
  uses: Armogida/ClawCommit/integrations/github-action@main
  with:
    action: commit
    decision: "AI_DECISION"
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}

- run: |
    echo "${{ steps.commit.outputs.commit-id }}" > commit-id.txt
    echo "${{ steps.commit.outputs.nonce }}" > nonce.txt

- uses: actions/upload-artifact@v4
  with:
    name: commit-data
    path: "*.txt"
```

### Pattern 3: Verify with Condition
```yaml
- id: verify
  uses: Armogida/ClawCommit/integrations/github-action@main
  with:
    action: verify
    commit-id: "0"
    contract-address: ${{ secrets.CLAWCOMMIT_CONTRACT }}

- if: steps.verify.outputs.verified != 'true'
  run: exit 1
```

### Pattern 4: Access Outputs
```yaml
- id: commit
  uses: Armogida/ClawCommit/integrations/github-action@main
  with:
    action: commit
    # ...

- run: |
    echo "Commit ID: ${{ steps.commit.outputs.commit-id }}"
    echo "Hash: ${{ steps.commit.outputs.hash }}"
    echo "Nonce: ${{ steps.commit.outputs.nonce }}"
    echo "TX: ${{ steps.commit.outputs.tx-hash }}"
```

## Required Secrets

Setup in: `Repository Settings` → `Secrets and variables` → `Actions`

| Secret | Example | Description |
|--------|---------|-------------|
| `CLAWCOMMIT_CONTRACT` | `0x1234...` | Contract address on BSC |
| `DEPLOYER_PRIVATE_KEY` | `0xabcd...` | Private key (starts with 0x) |
| `BSC_RPC_URL` | `https://...` | Optional premium RPC |

## Decision String Formats

```yaml
# Simple
decision: "APPROVED"

# With PR number
decision: "AI_REVIEW_PR_${{ github.event.pull_request.number }}"

# With commit SHA
decision: "DECISION_${{ github.sha }}"

# With timestamp
decision: "SCAN_$(date +%Y%m%d%H%M%S)"

# Complex metadata
decision: "MODEL_v1.2.3_ACCURACY_0.95_ENV_PROD_SHA_${{ github.sha }}"
```

## Error Handling

```yaml
- id: commit
  uses: Armogida/ClawCommit/integrations/github-action@main
  continue-on-error: true
  with:
    action: commit
    # ...

- if: failure()
  run: echo "Commit failed, handle gracefully"
```

## Retry Logic

```yaml
- uses: nick-fields/retry@v2
  with:
    timeout_minutes: 10
    max_attempts: 3
    retry_wait_seconds: 30
    command: |
      # Run action via script or directly
```

## Local Testing

```bash
# Install dependencies
npm install

# Test commit
node test-local.js commit "DECISION" <contract> <private-key>

# Test reveal
node test-local.js reveal <commit-id> "DECISION" <nonce> <contract> <private-key>

# Test verify
node test-local.js verify <commit-id> <contract>
```

## Troubleshooting

| Error | Solution |
|-------|----------|
| "Insufficient funds" | Fund wallet with ~0.01 BNB |
| "Hash mismatch" | Ensure decision and nonce match exactly |
| "Transaction timeout" | Use premium RPC or increase timeout |
| "Invalid private key" | Ensure key starts with `0x` |
| "Artifact not found" | Check artifact name matches exactly |

## BSCScan Links

```yaml
# Transaction
https://bscscan.com/tx/${{ steps.commit.outputs.tx-hash }}

# Contract
https://bscscan.com/address/${{ secrets.CLAWCOMMIT_CONTRACT }}
```

## Gas Costs

- **Commit**: ~0.0003 BNB (~$0.10)
- **Reveal**: ~0.0005 BNB (~$0.15)
- **Verify**: Free (read-only)

*Costs vary with network congestion*

## RPC Providers

```yaml
# Free (public)
rpc-url: https://bsc-dataseed.binance.org/

# NodeReal (premium)
rpc-url: https://bsc-mainnet.nodereal.io/v1/YOUR_KEY

# Ankr (premium)
rpc-url: https://rpc.ankr.com/bsc/YOUR_KEY

# QuickNode (premium)
rpc-url: https://YOUR_ENDPOINT.bsc.quiknode.pro/YOUR_KEY
```

## Best Practices

1. **Security**: Always use GitHub Secrets for private keys
2. **Reliability**: Use premium RPC for production
3. **Storage**: Store commit-id and nonce securely for reveal
4. **Verification**: Verify after reveal to ensure integrity
5. **Monitoring**: Alert on low wallet balance
6. **Testing**: Test on BSC testnet first

## Quick Links

- [Full README](README.md)
- [Integration Guide](INTEGRATION.md)
- [Examples](examples/)
- [Contract Source](../../contracts/ClawCommit.sol)
- [BSCScan](https://bscscan.com/)

---

**Version**: 1.0.0
**Last Updated**: 2026-02-14
