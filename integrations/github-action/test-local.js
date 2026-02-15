#!/usr/bin/env node

/**
 * Local testing script for ClawCommit GitHub Action
 *
 * Usage:
 *   node test-local.js commit "AI_DECISION" <contract-address> <private-key>
 *   node test-local.js reveal <commit-id> "AI_DECISION" <nonce> <contract-address> <private-key>
 *   node test-local.js verify <commit-id> <contract-address>
 */

const { ethers } = require('ethers');

const CLAWCOMMIT_ABI = [
  'function commit(bytes32 _hash) external returns (uint256 commitId)',
  'function reveal(uint256 _commitId, string calldata _decision, string calldata _nonce) external',
  'function verify(uint256 _commitId) external view returns (bool)',
  'function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string decision, string nonce))',
  'function computeHash(string calldata _decision, string calldata _nonce) external pure returns (bytes32)',
  'event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)',
  'event CommitRevealed(uint256 indexed commitId, address indexed committer, string decision)'
];

function generateNonce() {
  return ethers.hexlify(ethers.randomBytes(32));
}

function computeHash(decision, nonce) {
  return ethers.keccak256(ethers.toUtf8Bytes(decision + nonce));
}

async function testCommit(decision, contractAddress, privateKey, rpcUrl = 'https://bsc-dataseed.binance.org/') {
  console.log('\n=== Testing Commit Action ===');
  console.log('Decision:', decision);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, wallet);

  console.log('Wallet address:', wallet.address);

  const nonce = generateNonce();
  console.log('Generated nonce:', nonce);

  const hash = computeHash(decision, nonce);
  console.log('Computed hash:', hash);

  console.log('Submitting commit transaction...');
  const tx = await contract.commit(hash);
  console.log('Transaction hash:', tx.hash);

  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);

  const commitEvent = receipt.logs.find(
    log => log.topics[0] === ethers.id('CommitCreated(uint256,address,bytes32,uint256)')
  );

  const commitId = ethers.toNumber(commitEvent.topics[1]);
  console.log('Commit ID:', commitId);

  console.log('\n✓ Commit successful!');
  console.log('\nOutputs:');
  console.log('  commit-id:', commitId);
  console.log('  hash:', hash);
  console.log('  nonce:', nonce);
  console.log('  tx-hash:', tx.hash);

  return { commitId, hash, nonce, txHash: tx.hash };
}

async function testReveal(commitId, decision, nonce, contractAddress, privateKey, rpcUrl = 'https://bsc-dataseed.binance.org/') {
  console.log('\n=== Testing Reveal Action ===');
  console.log('Commit ID:', commitId);
  console.log('Decision:', decision);
  console.log('Nonce:', nonce);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, wallet);

  console.log('Wallet address:', wallet.address);

  const hash = computeHash(decision, nonce);
  console.log('Computed hash:', hash);

  console.log('Fetching commitment...');
  const commitment = await contract.getCommitment(commitId);
  console.log('Stored hash:', commitment.hash);

  if (commitment.hash !== hash) {
    throw new Error(`Hash mismatch! Expected: ${commitment.hash}, Got: ${hash}`);
  }

  console.log('Hash verification successful');

  console.log('Submitting reveal transaction...');
  const tx = await contract.reveal(commitId, decision, nonce);
  console.log('Transaction hash:', tx.hash);

  console.log('Waiting for confirmation...');
  const receipt = await tx.wait();
  console.log('Confirmed in block:', receipt.blockNumber);

  console.log('\n✓ Reveal successful!');
  console.log('\nOutputs:');
  console.log('  commit-id:', commitId);
  console.log('  hash:', hash);
  console.log('  tx-hash:', tx.hash);

  return { commitId, hash, txHash: tx.hash };
}

async function testVerify(commitId, contractAddress, rpcUrl = 'https://bsc-dataseed.binance.org/') {
  console.log('\n=== Testing Verify Action ===');
  console.log('Commit ID:', commitId);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, provider);

  console.log('Fetching commitment...');
  const commitment = await contract.getCommitment(commitId);

  if (!commitment.revealed) {
    throw new Error('Commitment has not been revealed yet');
  }

  console.log('Stored hash:', commitment.hash);
  console.log('Decision:', commitment.decision);
  console.log('Nonce:', commitment.nonce);

  console.log('Verifying on-chain...');
  const isValid = await contract.verify(commitId);

  const localHash = computeHash(commitment.decision, commitment.nonce);
  const localValid = commitment.hash === localHash;

  console.log('On-chain verification:', isValid);
  console.log('Local verification:', localValid);

  if (isValid && localValid) {
    console.log('\n✓ Verification successful!');
  } else {
    console.log('\n✗ Verification failed!');
  }

  console.log('\nOutputs:');
  console.log('  commit-id:', commitId);
  console.log('  verified:', isValid);
  console.log('  hash:', commitment.hash);

  return { commitId, verified: isValid, hash: commitment.hash };
}

async function main() {
  const args = process.argv.slice(2);
  const action = args[0];

  try {
    switch (action) {
      case 'commit':
        if (args.length < 4) {
          console.error('Usage: node test-local.js commit "DECISION" <contract-address> <private-key> [rpc-url]');
          process.exit(1);
        }
        await testCommit(args[1], args[2], args[3], args[4]);
        break;

      case 'reveal':
        if (args.length < 6) {
          console.error('Usage: node test-local.js reveal <commit-id> "DECISION" <nonce> <contract-address> <private-key> [rpc-url]');
          process.exit(1);
        }
        await testReveal(parseInt(args[1]), args[2], args[3], args[4], args[5], args[6]);
        break;

      case 'verify':
        if (args.length < 3) {
          console.error('Usage: node test-local.js verify <commit-id> <contract-address> [rpc-url]');
          process.exit(1);
        }
        await testVerify(parseInt(args[1]), args[2], args[3]);
        break;

      default:
        console.error('Invalid action. Use: commit, reveal, or verify');
        console.error('\nExamples:');
        console.error('  node test-local.js commit "AI_DECISION" 0x... 0x...');
        console.error('  node test-local.js reveal 0 "AI_DECISION" 0x... 0x... 0x...');
        console.error('  node test-local.js verify 0 0x...');
        process.exit(1);
    }
  } catch (error) {
    console.error('\n✗ Error:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}

module.exports = { testCommit, testReveal, testVerify, computeHash, generateNonce };
