# ClawCommit AI Tool Integration Schemas

This directory contains production-ready function calling schemas that enable AI models (OpenAI GPT, Google Gemini, Anthropic Claude, and other LLMs) to use ClawCommit as a native tool for blockchain-based commit-reveal operations.

## Overview

ClawCommit provides tamper-evident, auditable AI decision logging via a commit-reveal protocol on BNB Smart Chain. These schemas allow AI agents to:

1. **Commit** decisions privately to the blockchain (hash only)
2. **Reveal** decisions publicly when ready
3. **Verify** that revealed decisions match original commitments
4. **Compute** hashes locally for testing
5. **Retrieve** commitment data from the blockchain

## Available Schemas

### 1. OpenAI Function Calling Format
**File**: `openai-tools.json`

Compatible with:
- GPT-4, GPT-3.5 with function calling
- OpenAI Assistants API
- Azure OpenAI Service

### 2. Google Gemini Function Declarations
**File**: `gemini-tools.json`

Compatible with:
- Gemini Pro API
- Vertex AI Gemini models
- Google AI Studio

### 3. Anthropic Claude Tool Use
**File**: `anthropic-tools.json`

Compatible with:
- Claude 3 Opus, Sonnet, Haiku
- Claude API with tool use
- Claude SDK

## Tool Definitions

All schema files include these 5 tools:

| Tool | Description | Write Operation |
|------|-------------|-----------------|
| `clawcommit_commit` | Commit a decision hash to blockchain | Yes (requires gas) |
| `clawcommit_reveal` | Reveal a previously committed decision | Yes (requires gas) |
| `clawcommit_verify` | Verify a revealed commitment matches its hash | No (read-only) |
| `clawcommit_compute_hash` | Compute hash locally without blockchain | No (pure function) |
| `clawcommit_get_commitment` | Retrieve commitment data from blockchain | No (read-only) |

## Integration Examples

### OpenAI Integration (Python)

```python
import json
import openai
from web3 import Web3
from eth_account import Account
import secrets

# Load ClawCommit tool schemas
with open('integrations/ai-schemas/openai-tools.json') as f:
    clawcommit_tools = json.load(f)

# Initialize OpenAI client
client = openai.OpenAI(api_key="your-api-key")

# Tool implementation functions
def clawcommit_commit(decision, contract_address, private_key, nonce=None, rpc_url=None):
    """Execute ClawCommit commit operation"""
    if rpc_url is None:
        rpc_url = "https://bsc-dataseed1.binance.org/"

    # Generate nonce if not provided
    if nonce is None:
        nonce = secrets.token_hex(32)

    # Connect to BSC
    w3 = Web3(Web3.HTTPProvider(rpc_url))
    account = Account.from_key(private_key)

    # Load contract ABI (simplified for example)
    contract_abi = [
        {
            "inputs": [{"name": "_hash", "type": "bytes32"}],
            "name": "commit",
            "outputs": [{"name": "commitId", "type": "uint256"}],
            "stateMutability": "nonpayable",
            "type": "function"
        },
        {
            "inputs": [{"name": "_decision", "type": "string"}, {"name": "_nonce", "type": "string"}],
            "name": "computeHash",
            "outputs": [{"name": "", "type": "bytes32"}],
            "stateMutability": "pure",
            "type": "function"
        }
    ]

    contract = w3.eth.contract(address=contract_address, abi=contract_abi)

    # Compute hash
    decision_hash = contract.functions.computeHash(decision, nonce).call()

    # Build transaction
    txn = contract.functions.commit(decision_hash).build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gas': 200000,
        'gasPrice': w3.eth.gas_price
    })

    # Sign and send
    signed_txn = account.sign_transaction(txn)
    tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    # Parse commit ID from logs
    commit_id = contract.events.CommitCreated().process_receipt(receipt)[0]['args']['commitId']

    return {
        "success": True,
        "commit_id": commit_id,
        "nonce": nonce,
        "tx_hash": tx_hash.hex(),
        "decision_hash": decision_hash.hex()
    }

def clawcommit_reveal(commit_id, decision, nonce, contract_address, private_key, rpc_url=None):
    """Execute ClawCommit reveal operation"""
    if rpc_url is None:
        rpc_url = "https://bsc-dataseed1.binance.org/"

    w3 = Web3(Web3.HTTPProvider(rpc_url))
    account = Account.from_key(private_key)

    contract_abi = [
        {
            "inputs": [
                {"name": "_commitId", "type": "uint256"},
                {"name": "_decision", "type": "string"},
                {"name": "_nonce", "type": "string"}
            ],
            "name": "reveal",
            "outputs": [],
            "stateMutability": "nonpayable",
            "type": "function"
        }
    ]

    contract = w3.eth.contract(address=contract_address, abi=contract_abi)

    txn = contract.functions.reveal(commit_id, decision, nonce).build_transaction({
        'from': account.address,
        'nonce': w3.eth.get_transaction_count(account.address),
        'gas': 200000,
        'gasPrice': w3.eth.gas_price
    })

    signed_txn = account.sign_transaction(txn)
    tx_hash = w3.eth.send_raw_transaction(signed_txn.rawTransaction)
    receipt = w3.eth.wait_for_transaction_receipt(tx_hash)

    return {
        "success": True,
        "commit_id": commit_id,
        "tx_hash": tx_hash.hex()
    }

def clawcommit_verify(commit_id, contract_address, rpc_url=None):
    """Verify a revealed commitment"""
    if rpc_url is None:
        rpc_url = "https://bsc-dataseed1.binance.org/"

    w3 = Web3(Web3.HTTPProvider(rpc_url))

    contract_abi = [
        {
            "inputs": [{"name": "_commitId", "type": "uint256"}],
            "name": "verify",
            "outputs": [{"name": "", "type": "bool"}],
            "stateMutability": "view",
            "type": "function"
        }
    ]

    contract = w3.eth.contract(address=contract_address, abi=contract_abi)
    is_valid = contract.functions.verify(commit_id).call()

    return {
        "success": True,
        "commit_id": commit_id,
        "is_valid": is_valid
    }

# Map tool names to implementation functions
available_functions = {
    "clawcommit_commit": clawcommit_commit,
    "clawcommit_reveal": clawcommit_reveal,
    "clawcommit_verify": clawcommit_verify
}

# Create AI agent with ClawCommit tools
messages = [
    {
        "role": "system",
        "content": "You are an AI trading assistant with access to ClawCommit for tamper-evident decision logging on BNB Chain."
    },
    {
        "role": "user",
        "content": "I'm about to execute a trade. Commit my decision 'BUY_ETH_1000_USD' to the blockchain."
    }
]

response = client.chat.completions.create(
    model="gpt-4",
    messages=messages,
    tools=clawcommit_tools,
    tool_choice="auto"
)

# Process tool calls
response_message = response.choices[0].message
tool_calls = response_message.tool_calls

if tool_calls:
    messages.append(response_message)

    for tool_call in tool_calls:
        function_name = tool_call.function.name
        function_args = json.loads(tool_call.function.arguments)

        # Execute the ClawCommit function
        function_response = available_functions[function_name](**function_args)

        messages.append({
            "tool_call_id": tool_call.id,
            "role": "tool",
            "name": function_name,
            "content": json.dumps(function_response)
        })

    # Get final response
    final_response = client.chat.completions.create(
        model="gpt-4",
        messages=messages
    )

    print(final_response.choices[0].message.content)
```

### Google Gemini Integration (Python)

```python
import json
import google.generativeai as genai
from web3 import Web3
import secrets

# Load ClawCommit tool schemas
with open('integrations/ai-schemas/gemini-tools.json') as f:
    clawcommit_tools = json.load(f)

# Configure Gemini
genai.configure(api_key="your-api-key")

# Tool implementation (same as OpenAI example)
def clawcommit_commit(decision, contract_address, private_key, nonce=None, rpc_url=None):
    # Implementation same as OpenAI example
    pass

# Create Gemini model with tools
model = genai.GenerativeModel(
    model_name='gemini-1.5-pro',
    tools=clawcommit_tools
)

# Start conversation
chat = model.start_chat(enable_automatic_function_calling=False)

response = chat.send_message(
    "Commit my AI decision 'APPROVE_LOAN_ID_12345' to the blockchain using ClawCommit."
)

# Process function calls
for part in response.parts:
    if fn := part.function_call:
        function_name = fn.name
        function_args = dict(fn.args)

        # Execute ClawCommit function
        if function_name == "clawcommit_commit":
            result = clawcommit_commit(**function_args)

            # Return result to Gemini
            response = chat.send_message(
                genai.protos.Content(
                    parts=[genai.protos.Part(
                        function_response=genai.protos.FunctionResponse(
                            name=function_name,
                            response={'result': result}
                        )
                    )]
                )
            )

            print(response.text)
```

### Anthropic Claude Integration (Python)

```python
import json
import anthropic
from web3 import Web3
import secrets

# Load ClawCommit tool schemas
with open('integrations/ai-schemas/anthropic-tools.json') as f:
    clawcommit_tools = json.load(f)

# Initialize Claude client
client = anthropic.Anthropic(api_key="your-api-key")

# Tool implementation (same as OpenAI example)
def clawcommit_commit(decision, contract_address, private_key, nonce=None, rpc_url=None):
    # Implementation same as OpenAI example
    pass

def clawcommit_reveal(commit_id, decision, nonce, contract_address, private_key, rpc_url=None):
    # Implementation same as OpenAI example
    pass

# Process tool implementations
def process_tool_call(tool_name, tool_input):
    """Execute ClawCommit tools"""
    tool_functions = {
        "clawcommit_commit": clawcommit_commit,
        "clawcommit_reveal": clawcommit_reveal,
        "clawcommit_verify": clawcommit_verify
    }

    if tool_name in tool_functions:
        return tool_functions[tool_name](**tool_input)
    else:
        return {"error": f"Unknown tool: {tool_name}"}

# Create message with ClawCommit tools
messages = [
    {
        "role": "user",
        "content": "I need to commit my decision 'REJECT_TRANSACTION_999' to the blockchain for audit purposes."
    }
]

response = client.messages.create(
    model="claude-3-opus-20240229",
    max_tokens=4096,
    tools=clawcommit_tools,
    messages=messages
)

# Process tool use
while response.stop_reason == "tool_use":
    tool_use = next(block for block in response.content if block.type == "tool_use")
    tool_name = tool_use.name
    tool_input = tool_use.input

    # Execute the tool
    tool_result = process_tool_call(tool_name, tool_input)

    # Append assistant response and tool result
    messages.append({"role": "assistant", "content": response.content})
    messages.append({
        "role": "user",
        "content": [
            {
                "type": "tool_result",
                "tool_use_id": tool_use.id,
                "content": json.dumps(tool_result)
            }
        ]
    })

    # Get next response
    response = client.messages.create(
        model="claude-3-opus-20240229",
        max_tokens=4096,
        tools=clawcommit_tools,
        messages=messages
    )

# Extract final text response
final_text = next(
    (block.text for block in response.content if hasattr(block, "text")),
    None
)
print(final_text)
```

## Usage Patterns

### Pattern 1: Commit-Then-Reveal Workflow

```python
# Step 1: AI commits a decision
commit_result = clawcommit_commit(
    decision="APPROVE_TRADE_XYZ",
    contract_address="0x...",
    private_key="0x..."
)
# Save: commit_result['commit_id'] and commit_result['nonce']

# Step 2: Later, AI reveals the decision
reveal_result = clawcommit_reveal(
    commit_id=commit_result['commit_id'],
    decision="APPROVE_TRADE_XYZ",
    nonce=commit_result['nonce'],
    contract_address="0x...",
    private_key="0x..."
)

# Step 3: Anyone can verify
verify_result = clawcommit_verify(
    commit_id=commit_result['commit_id'],
    contract_address="0x..."
)
# Returns: {"is_valid": true}
```

### Pattern 2: Audit Trail Verification

```python
# Retrieve commitment data
commitment = clawcommit_get_commitment(
    commit_id=42,
    contract_address="0x..."
)

# Verify it matches the hash
is_valid = clawcommit_verify(
    commit_id=42,
    contract_address="0x..."
)

# Audit output
print(f"Decision: {commitment['decision']}")
print(f"Timestamp: {commitment['timestamp']}")
print(f"Committer: {commitment['committer']}")
print(f"Valid: {is_valid}")
```

### Pattern 3: Pre-Commitment Hash Preview

```python
# Compute hash locally before committing
preview_hash = clawcommit_compute_hash(
    decision="TEST_DECISION",
    nonce="test_nonce_123",
    contract_address="0x..."
)

print(f"Hash preview: {preview_hash}")
# Then commit with same decision and nonce
```

## Security Considerations

### Private Key Management
**CRITICAL**: Never expose private keys in logs, responses, or client-side code.

- Store private keys in secure environment variables
- Use hardware wallets or key management services in production
- Rotate keys regularly
- Use different keys for different AI agents

### Nonce Storage
- Store nonces securely (database, encrypted storage)
- Never commit the same nonce twice
- Use cryptographically secure random nonce generation
- Back up nonces before committing

### Gas Management
- Monitor gas prices on BSC
- Set reasonable gas limits (200k typically sufficient)
- Implement retry logic for failed transactions
- Use transaction monitoring for confirmations

## Network Configuration

### BNB Smart Chain RPCs

**Mainnet**:
```
https://bsc-dataseed1.binance.org/
https://bsc-dataseed2.binance.org/
https://bsc-dataseed3.binance.org/
```

**Testnet** (for development):
```
https://data-seed-prebsc-1-s1.binance.org:8545/
https://data-seed-prebsc-2-s1.binance.org:8545/
```

### Chain IDs
- Mainnet: 56
- Testnet: 97

## Error Handling

Common errors and solutions:

| Error | Cause | Solution |
|-------|-------|----------|
| "Only committer can reveal" | Wrong wallet revealing | Use original committer wallet |
| "Already revealed" | Commitment already revealed | Check commitment status first |
| "Hash mismatch" | Wrong decision or nonce | Verify decision and nonce match original |
| "Not yet revealed" | Verifying unrevealed commitment | Reveal commitment first |

## Full Contract ABI

For complete contract integration, the full ClawCommit ABI is:

```json
[
  {
    "inputs": [{"name": "_hash", "type": "bytes32"}],
    "name": "commit",
    "outputs": [{"name": "commitId", "type": "uint256"}],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "_commitId", "type": "uint256"},
      {"name": "_decision", "type": "string"},
      {"name": "_nonce", "type": "string"}
    ],
    "name": "reveal",
    "outputs": [],
    "stateMutability": "nonpayable",
    "type": "function"
  },
  {
    "inputs": [{"name": "_commitId", "type": "uint256"}],
    "name": "verify",
    "outputs": [{"name": "", "type": "bool"}],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "inputs": [
      {"name": "_decision", "type": "string"},
      {"name": "_nonce", "type": "string"}
    ],
    "name": "computeHash",
    "outputs": [{"name": "", "type": "bytes32"}],
    "stateMutability": "pure",
    "type": "function"
  },
  {
    "inputs": [{"name": "_commitId", "type": "uint256"}],
    "name": "getCommitment",
    "outputs": [
      {
        "components": [
          {"name": "hash", "type": "bytes32"},
          {"name": "timestamp", "type": "uint256"},
          {"name": "committer", "type": "address"},
          {"name": "revealed", "type": "bool"},
          {"name": "decision", "type": "string"},
          {"name": "nonce", "type": "string"}
        ],
        "name": "",
        "type": "tuple"
      }
    ],
    "stateMutability": "view",
    "type": "function"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "commitId", "type": "uint256"},
      {"indexed": true, "name": "committer", "type": "address"},
      {"indexed": false, "name": "hash", "type": "bytes32"},
      {"indexed": false, "name": "timestamp", "type": "uint256"}
    ],
    "name": "CommitCreated",
    "type": "event"
  },
  {
    "anonymous": false,
    "inputs": [
      {"indexed": true, "name": "commitId", "type": "uint256"},
      {"indexed": true, "name": "committer", "type": "address"},
      {"indexed": false, "name": "decision", "type": "string"}
    ],
    "name": "CommitRevealed",
    "type": "event"
  },
  {
    "inputs": [],
    "name": "commitCount",
    "outputs": [{"name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }
]
```

## Support and Resources

- Contract Source: `/contracts/ClawCommit.sol`
- Deployment Scripts: `/scripts/`
- Test Suite: `/test/`
- Documentation: `/README.md`

## License

MIT License - See LICENSE file for details.
