# GitHub Action Integration Guide (v2)

Use `integrations/github-action/README.md` as the authoritative guide.

## Core Contract Calls
- `commitDecision(bytes32)`
- `revealDecision(uint256,string,string,string,string)`
- `verifyReplay(uint256)`

## Input Model
Commit and reveal operations require deterministic payload fields:
- `prompt`
- `output`
- `model-version`
- `nonce`

The action computes:
`keccak256(abi.encode(prompt, output, modelVersion, nonce))`
