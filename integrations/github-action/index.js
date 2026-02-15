const core = require('@actions/core');
const { ethers } = require('ethers');

// ClawCommit contract ABI (minimal interface)
const CLAWCOMMIT_ABI = [
  'function commit(bytes32 _hash) external returns (uint256 commitId)',
  'function reveal(uint256 _commitId, string calldata _decision, string calldata _nonce) external',
  'function verify(uint256 _commitId) external view returns (bool)',
  'function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string decision, string nonce))',
  'function computeHash(string calldata _decision, string calldata _nonce) external pure returns (bytes32)',
  'event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)',
  'event CommitRevealed(uint256 indexed commitId, address indexed committer, string decision)'
];

/**
 * Generate a random nonce for commit operations
 */
function generateNonce() {
  return ethers.hexlify(ethers.randomBytes(32));
}

/**
 * Compute hash locally (matches Solidity keccak256(abi.encodePacked(decision, nonce)))
 */
function computeHash(decision, nonce) {
  return ethers.keccak256(ethers.toUtf8Bytes(decision + nonce));
}

/**
 * Commit action: Create a new commitment on-chain
 */
async function commitAction(contract, decision, nonce) {
  core.info(`Creating commitment for decision: ${decision}`);

  // Use provided nonce or generate a new one
  const finalNonce = nonce || generateNonce();
  core.info(`Using nonce: ${finalNonce}`);

  // Compute hash
  const hash = computeHash(decision, finalNonce);
  core.info(`Computed hash: ${hash}`);

  // Submit commit transaction
  core.info('Submitting commit transaction...');
  const tx = await contract.commit(hash);
  core.info(`Transaction submitted: ${tx.hash}`);

  // Wait for confirmation
  const receipt = await tx.wait();
  core.info(`Transaction confirmed in block ${receipt.blockNumber}`);

  // Parse commit ID from event
  const commitEvent = receipt.logs.find(
    log => log.topics[0] === ethers.id('CommitCreated(uint256,address,bytes32,uint256)')
  );

  if (!commitEvent) {
    throw new Error('CommitCreated event not found in transaction receipt');
  }

  const commitId = ethers.toNumber(commitEvent.topics[1]);
  core.info(`Commitment created with ID: ${commitId}`);

  // Set outputs
  core.setOutput('commit-id', commitId.toString());
  core.setOutput('hash', hash);
  core.setOutput('nonce', finalNonce);
  core.setOutput('tx-hash', tx.hash);

  core.info('✓ Commit operation successful');
  return { commitId, hash, nonce: finalNonce, txHash: tx.hash };
}

/**
 * Reveal action: Reveal a previously committed decision
 */
async function revealAction(contract, commitId, decision, nonce) {
  if (!commitId) {
    throw new Error('commit-id is required for reveal action');
  }
  if (!decision) {
    throw new Error('decision is required for reveal action');
  }
  if (!nonce) {
    throw new Error('nonce is required for reveal action');
  }

  core.info(`Revealing commitment ID: ${commitId}`);
  core.info(`Decision: ${decision}`);
  core.info(`Nonce: ${nonce}`);

  // Verify hash locally before submitting
  const hash = computeHash(decision, nonce);
  const commitment = await contract.getCommitment(commitId);

  if (commitment.hash !== hash) {
    throw new Error(`Hash mismatch! Expected: ${commitment.hash}, Got: ${hash}`);
  }

  core.info('Hash verification successful');

  // Submit reveal transaction
  core.info('Submitting reveal transaction...');
  const tx = await contract.reveal(commitId, decision, nonce);
  core.info(`Transaction submitted: ${tx.hash}`);

  // Wait for confirmation
  const receipt = await tx.wait();
  core.info(`Transaction confirmed in block ${receipt.blockNumber}`);

  // Set outputs
  core.setOutput('commit-id', commitId.toString());
  core.setOutput('hash', hash);
  core.setOutput('tx-hash', tx.hash);

  core.info('✓ Reveal operation successful');
  return { commitId, hash, txHash: tx.hash };
}

/**
 * Verify action: Verify a revealed commitment
 */
async function verifyAction(contract, commitId) {
  if (!commitId) {
    throw new Error('commit-id is required for verify action');
  }

  core.info(`Verifying commitment ID: ${commitId}`);

  // Get commitment data
  const commitment = await contract.getCommitment(commitId);

  if (!commitment.revealed) {
    throw new Error('Commitment has not been revealed yet');
  }

  core.info(`Stored hash: ${commitment.hash}`);
  core.info(`Decision: ${commitment.decision}`);
  core.info(`Nonce: ${commitment.nonce}`);

  // Verify on-chain
  const isValid = await contract.verify(commitId);

  // Verify locally as well
  const localHash = computeHash(commitment.decision, commitment.nonce);
  const localValid = commitment.hash === localHash;

  core.info(`On-chain verification: ${isValid}`);
  core.info(`Local verification: ${localValid}`);

  if (isValid && localValid) {
    core.info('✓ Verification successful - commitment is valid');
  } else {
    core.warning('✗ Verification failed - commitment may be tampered');
  }

  // Set outputs
  core.setOutput('commit-id', commitId.toString());
  core.setOutput('verified', isValid.toString());
  core.setOutput('hash', commitment.hash);

  return { commitId, verified: isValid, hash: commitment.hash };
}

/**
 * Main action entry point
 */
async function run() {
  try {
    // Get inputs
    const action = core.getInput('action', { required: true });
    const decision = core.getInput('decision');
    const nonce = core.getInput('nonce');
    const commitIdInput = core.getInput('commit-id');
    const contractAddress = core.getInput('contract-address', { required: true });
    const rpcUrl = core.getInput('rpc-url') || 'https://bsc-dataseed.binance.org/';
    const privateKey = core.getInput('private-key');

    core.info(`ClawCommit GitHub Action - Action: ${action}`);
    core.info(`Contract address: ${contractAddress}`);
    core.info(`RPC URL: ${rpcUrl}`);

    // Validate action type
    if (!['commit', 'reveal', 'verify'].includes(action)) {
      throw new Error(`Invalid action: ${action}. Must be 'commit', 'reveal', or 'verify'`);
    }

    // Setup provider
    const provider = new ethers.JsonRpcProvider(rpcUrl);

    // Setup wallet and contract
    let contract;
    if (action === 'verify') {
      // Read-only operations don't need private key
      contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, provider);
    } else {
      // Write operations require private key
      if (!privateKey) {
        throw new Error('private-key is required for commit and reveal actions');
      }
      const wallet = new ethers.Wallet(privateKey, provider);
      core.info(`Using wallet address: ${wallet.address}`);
      contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, wallet);
    }

    // Parse commit ID if provided
    const commitId = commitIdInput ? parseInt(commitIdInput) : null;

    // Execute action
    let result;
    switch (action) {
      case 'commit':
        result = await commitAction(contract, decision, nonce);
        break;
      case 'reveal':
        result = await revealAction(contract, commitId, decision, nonce);
        break;
      case 'verify':
        result = await verifyAction(contract, commitId);
        break;
    }

    core.info('Action completed successfully');

  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

// Run the action
run();
