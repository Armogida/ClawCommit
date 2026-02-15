# AI Build Log

## Project

- Name: ClawCommit
- Version: V2 deterministic replay upgrade
- Stack: Solidity 0.8.24, Hardhat, TypeScript, ethers.js

## Scope Completed

1. Upgraded contract API from V1 to V2 structured reveal fields.
2. Replaced `abi.encodePacked(decision, nonce)` with `abi.encode(prompt, output, modelVersion, nonce)`.
3. Added standalone replay CLI (`npx ts-node scripts/replay.ts --tx ...`).
4. Added `bsc` network alias while preserving `bscMainnet`.
5. Updated commit/reveal/deploy/deployAndProve scripts to V2 interfaces.
6. Added deployment-proof artifact writer for required files.
7. Reworked tests to validate contract integrity and replay script failure modes.
8. Updated docs (`README.md`, `docs/PROJECT.md`, `docs/TECHNICAL.md`, `docs/REPLAY.md`).

## Key Technical Decisions

- Use typed ABI encoding (`abi.encode`) to make replay hashing unambiguous.
- Keep reveal plaintext fields onchain for transparent third-party verification.
- Implement custom errors for lower gas and clearer revert semantics.
- Keep replay validator independent from Hardhat runtime for operator-neutral verification.

## Security Notes

- No token logic.
- No governance logic.
- No upgrade proxy.
- Commitments remain append-only and replay-verifiable.

## Verification Focus

- Commit storage correctness.
- Reveal hash integrity across all reveal fields.
- Access control and anti-double-reveal.
- Standalone replay validator behavior for success and failure paths.
