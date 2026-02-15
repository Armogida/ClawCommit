const core = require('@actions/core');
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

async function commitAction(contract, prompt, output, modelVersion, nonce) {
  if (!prompt || !output || !modelVersion) {
    throw new Error('prompt, output, and model-version are required for commit action');
  }

  core.info(`Creating commitment for prompt: ${prompt}`);
  core.info(`Output: ${output}`);
  core.info(`Model version: ${modelVersion}`);

  const finalNonce = nonce || generateNonce();
  core.info(`Using nonce: ${finalNonce}`);

  const hash = computeDecisionHash(prompt, output, modelVersion, finalNonce);
  core.info(`Computed hash: ${hash}`);

  core.info('Submitting commit transaction...');
  const tx = await contract.commitDecision(hash);
  core.info(`Transaction submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  core.info(`Transaction confirmed in block ${receipt.blockNumber}`);

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
    throw new Error('CommitCreated event not found in transaction receipt');
  }

  const commitId = Number(commitEvent.args.commitId);
  core.info(`Commitment created with ID: ${commitId}`);

  core.setOutput('commit-id', commitId.toString());
  core.setOutput('hash', hash);
  core.setOutput('nonce', finalNonce);
  core.setOutput('tx-hash', tx.hash);

  core.info('Commit operation successful');
  return { commitId, hash, nonce: finalNonce, txHash: tx.hash };
}

async function revealAction(contract, commitId, prompt, output, modelVersion, nonce) {
  if (!commitId && commitId !== 0) {
    throw new Error('commit-id is required for reveal action');
  }
  if (!prompt || !output || !modelVersion || !nonce) {
    throw new Error('prompt, output, model-version, and nonce are required for reveal action');
  }

  core.info(`Revealing commitment ID: ${commitId}`);

  const hash = computeDecisionHash(prompt, output, modelVersion, nonce);
  const commitment = await contract.getCommitment(commitId);

  if (commitment.hash !== hash) {
    throw new Error(`Hash mismatch! Expected: ${commitment.hash}, Got: ${hash}`);
  }

  core.info('Hash verification successful');

  core.info('Submitting reveal transaction...');
  const tx = await contract.revealDecision(commitId, prompt, output, modelVersion, nonce);
  core.info(`Transaction submitted: ${tx.hash}`);

  const receipt = await tx.wait();
  core.info(`Transaction confirmed in block ${receipt.blockNumber}`);

  core.setOutput('commit-id', commitId.toString());
  core.setOutput('hash', hash);
  core.setOutput('tx-hash', tx.hash);

  core.info('Reveal operation successful');
  return { commitId, hash, txHash: tx.hash };
}

async function verifyAction(contract, commitId) {
  if (!commitId && commitId !== 0) {
    throw new Error('commit-id is required for verify action');
  }

  core.info(`Verifying commitment ID: ${commitId}`);

  const commitment = await contract.getCommitment(commitId);

  if (!commitment.revealed) {
    throw new Error('Commitment has not been revealed yet');
  }

  core.info(`Stored hash: ${commitment.hash}`);
  core.info(`Prompt: ${commitment.prompt}`);
  core.info(`Output: ${commitment.output}`);
  core.info(`Model version: ${commitment.modelVersion}`);

  const isValid = await contract.verifyReplay(commitId);

  const localHash = computeDecisionHash(
    commitment.prompt,
    commitment.output,
    commitment.modelVersion,
    commitment.nonce
  );
  const localValid = commitment.hash === localHash;

  core.info(`On-chain verification: ${isValid}`);
  core.info(`Local verification: ${localValid}`);

  core.setOutput('commit-id', commitId.toString());
  core.setOutput('verified', (isValid && localValid).toString());
  core.setOutput('hash', commitment.hash);

  return { commitId, verified: isValid && localValid, hash: commitment.hash };
}

async function run() {
  try {
    const action = core.getInput('action', { required: true });
    const prompt = core.getInput('prompt');
    const output = core.getInput('output');
    const modelVersion = core.getInput('model-version');
    const nonce = core.getInput('nonce');
    const commitIdInput = core.getInput('commit-id');
    const contractAddress = core.getInput('contract-address', { required: true });
    const rpcUrl = core.getInput('rpc-url') || 'https://bsc-dataseed.binance.org/';
    const privateKey = core.getInput('private-key');

    core.info(`ClawCommit GitHub Action - Action: ${action}`);
    core.info(`Contract address: ${contractAddress}`);
    core.info(`RPC URL: ${rpcUrl}`);

    if (!['commit', 'reveal', 'verify'].includes(action)) {
      throw new Error(`Invalid action: ${action}. Must be 'commit', 'reveal', or 'verify'`);
    }

    const provider = new ethers.JsonRpcProvider(rpcUrl);

    let contract;
    if (action === 'verify') {
      contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, provider);
    } else {
      if (!privateKey) {
        throw new Error('private-key is required for commit and reveal actions');
      }
      const wallet = new ethers.Wallet(privateKey, provider);
      core.info(`Using wallet address: ${wallet.address}`);
      contract = new ethers.Contract(contractAddress, CLAWCOMMIT_ABI, wallet);
    }

    const commitId = commitIdInput ? parseInt(commitIdInput, 10) : null;

    switch (action) {
      case 'commit':
        await commitAction(contract, prompt, output, modelVersion, nonce);
        break;
      case 'reveal':
        await revealAction(contract, commitId, prompt, output, modelVersion, nonce);
        break;
      case 'verify':
        await verifyAction(contract, commitId);
        break;
      default:
        throw new Error(`Unsupported action: ${action}`);
    }

    core.info('Action completed successfully');
  } catch (error) {
    core.setFailed(`Action failed: ${error.message}`);
    if (error.stack) {
      core.debug(error.stack);
    }
  }
}

run();
