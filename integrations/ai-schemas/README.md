# ClawCommit AI Schemas

Schemas for function-calling/tool-use with ClawCommit v2.

## Files
- `openai-tools.json`
- `anthropic-tools.json`
- `gemini-tools.json`

## Decision Payload Model
All schemas use the same deterministic fields:
- `prompt`
- `output`
- `model_version`
- `nonce`

Hash formula:

```text
keccak256(abi.encode(prompt, output, modelVersion, nonce))
```

## Primary Tool Names
- `clawcommit_commit`
- `clawcommit_reveal`
- `clawcommit_verify`
- `clawcommit_compute_hash`
- `clawcommit_get_commitment`
- `clawcommit_openclaw_build_payload`
- `clawcommit_openclaw_commit`
- `clawcommit_openclaw_reveal`

## Usage Notes
- Keep `nonce` from commit response for later reveal.
- Reveal must use exact original payload fields and nonce.
- Verify succeeds only after reveal.
- OpenClaw payload generation is deterministic: validations are sorted by name and rendered with prompt template `openclaw-prompt-v1`.
