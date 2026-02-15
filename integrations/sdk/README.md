# @clawcommit/sdk

TypeScript SDK for ClawCommit v2.

## Install
```bash
npm install @clawcommit/sdk
```

## Initialize
```ts
import { ClawCommit } from '@clawcommit/sdk';

const claw = new ClawCommit({
  contractAddress: '0xYourContractAddress',
  rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545/', // defaults to bscTestnet if omitted
  privateKey: process.env.PRIVATE_KEY
});
```

Mainnet writes are blocked by default. To opt in:

```ts
const claw = new ClawCommit({
  contractAddress: '0xYourMainnetContractAddress',
  rpcUrl: 'https://bsc-dataseed.binance.org/',
  privateKey: process.env.PRIVATE_KEY,
  allowMainnetWrites: true
});
```

## Decision Payload
```ts
type DecisionPayload = {
  prompt: string;
  output: string;
  modelVersion: string;
};
```

## Commit
```ts
const payload = {
  prompt: 'Should we deploy model v2.1?',
  output: 'APPROVE_DEPLOY',
  modelVersion: 'deploy-agent-v2.1'
};

const commit = await claw.commit(payload);
```

## Reveal
```ts
await claw.reveal(commit.commitId, payload, commit.nonce);
```

## Verify
```ts
const proof = await claw.verify(commit.commitId);
console.log(proof.verified);
```

## OpenClaw Native Helpers

OpenClaw helpers build a deterministic payload from CI validation metadata,
then commit/reveal using the existing `ClawCommit` client.

```ts
import {
  ClawCommit,
  buildOpenClawDecisionPayload,
  commitOpenClawDecision,
  revealOpenClawDecision
} from "@clawcommit/sdk";

const input = {
  modelVersion: "openclaw-agent-v1",
  context: {
    workflow: "openclaw-pr-validation",
    repository: "owner/repo",
    ref: "refs/pull/42/head",
    sha: "abc123"
  },
  validations: [
    { name: "compile", required: true, passed: true, details: "ok" },
    { name: "unit-tests", required: true, passed: true, details: "146 passing" }
  ]
};

const payload = buildOpenClawDecisionPayload(input);
// payload.output => OPENCLAW_APPROVE | OPENCLAW_REJECT
// payload.promptTemplateVersion => openclaw-prompt-v1
// payload.promptDigest => keccak256(prompt)

const commit = await commitOpenClawDecision(claw, input);
await revealOpenClawDecision(claw, commit.commitId, payload, commit.nonce);
```

Deterministic guarantees:
- validations are sorted by `name` before prompt construction
- prompt template is fixed and versioned
- output is `OPENCLAW_REJECT` if any required validation fails, else `OPENCLAW_APPROVE`

## Static Hash Utility
```ts
const { hash, nonce } = ClawCommit.computeDecisionHash(payload);
```

## Hash Model
SDK uses deterministic v2 hash:

```text
keccak256(abi.encode(prompt, output, modelVersion, nonce))
```

## Legacy Compatibility
`commit()` and `reveal()` also accept a legacy string decision. In that mode SDK maps to:
- `prompt = ""`
- `output = <legacy decision string>`
- `modelVersion = "legacy-v1"`

For new integrations, use explicit payloads.
