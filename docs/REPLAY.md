# Replay Validator CLI

## Purpose

`/scripts/replay.ts` independently verifies that a reveal transaction matches the original onchain commitment.

It validates:
1. reveal transaction exists and succeeded,
2. calldata decodes to `revealDecision(...)`,
3. offchain recomputed hash equals stored commitment hash.

## Command

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH
```

Optional RPC override:

```bash
npx ts-node scripts/replay.ts --tx 0xREVEAL_TX_HASH --rpc https://bsc-dataseed.binance.org/
```

## Success Output

```text
✓ Deterministic Replay Verified
Commit hash matches reveal.
```

## Failure Modes

The script exits with code `1` and an explicit error message when:
- transaction is not found,
- receipt is missing,
- receipt status is failed/reverted,
- tx does not target `revealDecision` (wrong selector),
- commitment is not revealed,
- recomputed hash differs from onchain hash.

## Deterministic Hash Function

The replay hash formula is:

`keccak256(abi.encode(prompt, output, modelVersion, nonce))`

The script uses Ethers `AbiCoder` to mirror Solidity `abi.encode` exactly.
