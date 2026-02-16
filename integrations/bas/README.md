# BAS Compatibility Layer

ClawCommit provides a BAS-compatible attestation payload builder that converts a revealed
ClawCommit commitment into structured claim data for BNB Attestation Service (BAS).

What this layer does:
- reads on-chain ClawCommit commitment state (`getCommitment`, `verifyReplay`)
- validates a reveal transaction hash against contract and commit ID
- encodes deterministic BAS claim bytes
- emits a submission-ready attestation request payload (`data` + metadata)

What this layer does not do:
- it does not hardcode BAS contract ABIs or BAS network addresses
- it does not submit the attestation transaction directly

Why:
- BAS contract interfaces can vary across environments.
- This keeps ClawCommit portable while still producing canonical, schema-aligned payloads.

## Schema

Canonical schema name:

`AI_DECISION_VERIFIED_V1`

Canonical schema hash:

`keccak256("AI_DECISION_VERIFIED_V1")` (UTF-8 bytes)

Encoded fields in `attestationRequest.data`:

1. `bytes32 schemaHash`
2. `address clawContract`
3. `uint256 commitId`
4. `bytes32 commitmentHash`
5. `bytes32 revealTxHash`
6. `string modelVersion`
7. `bool replayVerified`
8. `uint64 verifiedAt`
9. `address verifier`
10. `string metadataURI`

## Build Payload

```bash
npm run bas:build -- \
  --contract <CLAWCOMMIT_ADDRESS> \
  --commit-id <COMMIT_ID> \
  --reveal-tx <REVEAL_TX_HASH> \
  --network bscTestnet \
  --schema-uid <BAS_SCHEMA_UID> \
  --metadata-uri "ipfs://<CID>" \
  --out deployment-proof/bas-attestation.json
```

The output includes:
- `claimDigest` (hash of encoded claim bytes)
- `claim` (human-readable structured fields)
- `attestationRequest` (BAS-ready request object)

## Suggested BAS Submission Flow

1. Register BAS schema for `AI_DECISION_VERIFIED_V1`.
2. Generate payload with `npm run bas:build`.
3. Submit `attestationRequest` using your BAS SDK/contract client.
4. Store BAS attestation UID next to ClawCommit artifacts.
