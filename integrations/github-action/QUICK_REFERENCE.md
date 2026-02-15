# GitHub Action Quick Reference (v2)

Primary reference: `README.md` in this folder.

## Required Inputs by Action
### `commit`
- `action: commit`
- `prompt`
- `output`
- `model-version`
- `contract-address`
- `private-key`

Optional: `nonce`, `rpc-url`

### `reveal`
- `action: reveal`
- `commit-id`
- `prompt`
- `output`
- `model-version`
- `nonce`
- `contract-address`
- `private-key`

Optional: `rpc-url`

### `verify`
- `action: verify`
- `commit-id`
- `contract-address`

Optional: `rpc-url`

## Hash Formula
`keccak256(abi.encode(prompt, output, modelVersion, nonce))`
