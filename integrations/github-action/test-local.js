#!/usr/bin/env node

/**
 * Local testing script for ClawCommit GitHub Action
 *
 * Usage:
 *   node test-local.js commit "PROMPT" "OUTPUT" "MODEL_VERSION" <contract-address> <private-key>
 *   node test-local.js reveal <commit-id> "PROMPT" "OUTPUT" "MODEL_VERSION" <nonce> <contract-address> <private-key>
 *   node test-local.js verify <commit-id> <contract-address>
 */

const { ethers } = require('ethers');

const CLAWCOMMIT_ABI = [
  'function commitDecision(bytes32 _hash) external returns (uint256 commitId)',
  'function revealDecision(uint256 _commitId, string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external',
  'function verifyReplay(uint256 _commitId) external view returns (bool)',
  'function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))',
  'function computeDecisionHash(string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external pure returns (bytes32)',
  'event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)',
  'event CommitRevealed(uint256 indexed commitId, address indexed committer, string prompt, string output, string modelVersion)'
];

function generateNonce() {
  return ethers.hexlify(ethers.randomBytes(32));
}

function computeDecisionHash(prompt, output, modelVersion, nonce) {
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ['string', 'string', 'string', 'string'],
    [prompt, output, modelVersion, nonce]
  );
  return ethers.keccak256(encoded);
}

async function testCommit(prompt, output, modelVersion, contractAddress, privateKey, rpcUrl = 'https://bsc-dataseed.binance.org/') {
  console.log('\n=== Testing Commit Action ===');
  console.log('Prompt:', prompt);
  console.log('Output:', output);
  console.log('Model Version:', modelVersion);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, wallet);

  console.log('Wallet address:', wallet.address);

  const nonce = generateNonce();
  console.log('Generated nonce:', nonce);

  const hash = computeDecisionHash(prompt, output, modelVersion, nonce);
  console.log('Computed hash:', hash);

  console.log('Submitting commit transaction...');
  const tx = await contract.commitDecision(hash);
  console.log('Transaction hash:', tx.hash);

  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);

  const commitEvent = receipt.logs
    .map(log => {
      try {
        return contract.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find(event => event && event.name === 'CommitCreated');

  if (!commitEvent) {
    throw new Error('CommitCreated event not found');
  }

  const commitId = Number(commitEvent.args.commitId);
  console.log('Commit ID:', commitId);

  return { commitId, hash, nonce, txHash: tx.hash };
}

async function testReveal(commitId, prompt, output, modelVersion, nonce, contractAddress, privateKey, rpcUrl = 'https://bsc-dataseed.binance.org/') {
  console.log('\n=== Testing Reveal Action ===');
  console.log('Commit ID:', commitId);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, wallet);

  const hash = computeDecisionHash(prompt, output, modelVersion, nonce);
  const commitment = await contract.getCommitment(commitId);

  if (commitment.hash !== hash) {
    throw new Error(`Hash mismatch! Expected: ${commitment.hash}, Got: ${hash}`);
  }

  console.log('Submitting reveal transaction...');
  const tx = await contract.revealDecision(commitId, prompt, output, modelVersion, nonce);
  console.log('Transaction hash:', tx.hash);

  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);

  return { commitId, hash, txHash: tx.hash };
}

async function testVerify(commitId, contractAddress, rpcUrl = 'https://bsc-dataseed.binance.org/') {
  console.log('\n=== Testing Verify Action ===');

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, provider);

  const commitment = await contract.getCommitment(commitId);

  if (!commitment.revealed) {
    throw new Error('Commitment has not been revealed yet');
  }

  const onchain = await contract.verifyReplay(commitId);
  const localHash = computeDecisionHash(
    commitment.prompt,
    commitment.output,
    commitment.modelVersion,
    commitment.nonce
  );
  const localValid = commitment.hash === localHash;

  console.log('On-chain verification:', onchain);
  console.log('Local verification:', localValid);

  return { commitId, verified: onchain && localValid, hash: commitment.hash };
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  try {
    switch (action) {
      case 'commit':
        if (args.length < 6) {
          console.error('Usage: node test-local.js commit "PROMPT" "OUTPUT" "MODEL_VERSION" <contract-address> <private-key> [rpc-url]');
          process.exit(1);
        }
        await testCommit(args[1], args[2], args[3], args[4], args[5], args[6]);
        break;

      case 'reveal':
        if (args.length < 9) {
          console.error('Usage: node test-local.js reveal <commit-id> "PROMPT" "OUTPUT" "MODEL_VERSION" <nonce> <contract-address> <private-key> [rpc-url]');
          process.exit(1);
        }
        await testReveal(parseInt(args[1], 10), args[2], args[3], args[4], args[5], args[6], args[7], args[8]);
        break;

      case 'verify':
        if (args.length < 3) {
          console.error('Usage: node test-local.js verify <commit-id> <contract-address> [rpc-url]');
          process.exit(1);
        }
        await testVerify(parseInt(args[1], 10), args[2], args[3]);
        break;

      default:
        console.error('Invalid action. Use: commit, reveal, or verify');
        process.exit(1);
    }
  } catch (error) {
    console.error('\nError:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  testCommit,
  testReveal,
  testVerify,
  computeDecisionHash,
  generateNonce
};
