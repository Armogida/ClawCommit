# ClawCommit GitHub Action

GitHub Action wrapper for ClawCommit v2 commit-reveal operations.

## Inputs
Required for all actions:
- `action`: `commit` | `reveal` | `verify`
- `contract-address`

Commit/reveal payload inputs:
- `prompt`
- `output`
- `model-version`
- `nonce` (optional for commit, required for reveal)
- `commit-id` (required for reveal/verify)

Optional:
- `rpc-url`
- `private-key` (required for commit/reveal)
- `allow-mainnet-writes` (defaults to `false`)
- `log-sensitive` (defaults to `false`)

## Example: Commit
```yaml
- uses: ./integrations/github-action
  id: claw_commit
  with:
    action: commit
    prompt: "Should we deploy model v2.1?"
    output: "APPROVE_DEPLOY"
    model-version: "deploy-agent-v2.1"
    contract-address: ${{ secrets.CLAW_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
    allow-mainnet-writes: "true" # required for BSC mainnet writes
    log-sensitive: "false"
```

## Example: Reveal
```yaml
- uses: ./integrations/github-action
  with:
    action: reveal
    commit-id: ${{ steps.claw_commit.outputs.commit-id }}
    prompt: "Should we deploy model v2.1?"
    output: "APPROVE_DEPLOY"
    model-version: "deploy-agent-v2.1"
    nonce: ${{ steps.claw_commit.outputs.nonce }}
    contract-address: ${{ secrets.CLAW_CONTRACT }}
    private-key: ${{ secrets.DEPLOYER_PRIVATE_KEY }}
```

## Example: Verify
```yaml
- uses: ./integrations/github-action
  with:
    action: verify
    commit-id: ${{ steps.claw_commit.outputs.commit-id }}
    contract-address: ${{ secrets.CLAW_CONTRACT }}
```

## Hash Model
Action computes:

```text
keccak256(abi.encode(prompt, output, modelVersion, nonce))
```

## Security Defaults
- Commit/reveal on BSC mainnet are blocked unless `allow-mainnet-writes: "true"` is set.
- Prompt/output/nonce are redacted in logs unless `log-sensitive: "true"` is set.
