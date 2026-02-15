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
  rpcUrl: 'https://bsc-dataseed.binance.org/',
  privateKey: process.env.PRIVATE_KEY
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
await claw.reveal(Number(commit.commitId), payload, commit.nonce);
```

## Verify
```ts
const proof = await claw.verify(Number(commit.commitId));
console.log(proof.verified);
```

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
