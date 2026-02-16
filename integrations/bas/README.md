# BAS Compatibility Layer

ClawCommit provides a BAS-compatible attestation payload builder that converts a revealed
ClawCommit commitment into structured claim data for BNB Attestation Service (BAS).

What this layer does:
- reads on-chain ClawCommit commitment state (`getCommitment`, `verifyReplay`)
- validates a reveal transaction hash against contract and commit ID
- encodes deterministic BAS claim bytes
- emits a submission-ready attestation request payload (`data` + metadata)
- supports direct BAS submission for EAS-compatible BAS contracts

What this layer does not do:
- it does not hardcode BAS contract ABIs or BAS network addresses
- it does not infer schema UIDs or BAS contract addresses automatically

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

## Direct Submit (EAS-Compatible BAS)

If your BAS deployment exposes an EAS-compatible `attest(...)` method, submit directly:

```bash
npm run bas:submit -- \
  --payload deployment-proof/bas-attestation.json \
  --bas-contract <BAS_CONTRACT_ADDRESS> \
  --schema-uid <BAS_SCHEMA_UID> \
  --network bscTestnet \
  --allow-mainnet-writes false \
  --out deployment-proof/bas-submit-result.json
```

Optional:
- `--abi-mode eas|flat` (default `eas`)
- `--private-key <HEX_KEY>` (otherwise `BAS_ATTESTER_PRIVATE_KEY` or `DEPLOYER_PRIVATE_KEY`)
- `--dry-run` to print call payload without sending a transaction

Mainnet safety:
- mainnet writes are blocked by default
- pass `--allow-mainnet-writes true` explicitly to submit on mainnet

## GitHub Actions Auto Artifact / Submit

`openclaw-merge-reveal.yml` includes optional BAS steps:
- auto-build BAS payload artifact after successful reveal + verify
- optional on-chain BAS submit when explicitly enabled

Required secrets for payload generation:
- `BAS_SCHEMA_UID`

Additional secrets for auto-submit:
- `BAS_AUTO_SUBMIT` (must be `"true"`)
- `BAS_CONTRACT_ADDRESS`
- `BAS_ATTESTER_PRIVATE_KEY`

## Suggested BAS Submission Flow

1. Register BAS schema for `AI_DECISION_VERIFIED_V1`.
2. Generate payload with `npm run bas:build`.
3. Submit with `npm run bas:submit` or your BAS SDK/client.
4. Store BAS attestation UID next to ClawCommit artifacts.
