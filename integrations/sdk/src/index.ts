import { ethers } from "ethers";
import { randomBytes } from "crypto";

export interface ClawCommitConfig {
  contractAddress: string;
  rpcUrl?: string;
  privateKey?: string;
}

export interface DecisionPayload {
  prompt: string;
  output: string;
  modelVersion: string;
}

export interface CommitResult extends DecisionPayload {
  commitId: string;
  hash: string;
  nonce: string;
  txHash: string;
  explorerUrl: string;
}

export interface RevealResult {
  commitId: string;
  txHash: string;
  verified: boolean;
  explorerUrl: string;
}

export interface VerifyResult extends DecisionPayload {
  commitId: string;
  decision: string;
  nonce: string;
  storedHash: string;
  replayHash: string;
  verified: boolean;
  timestamp: string;
  committer: string;
  revealed: boolean;
}

const CLAWCOMMIT_ABI = [
  "function commitDecision(bytes32 _hash) external returns (uint256 commitId)",
  "function revealDecision(uint256 _commitId, string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external",
  "function verifyReplay(uint256 _commitId) external view returns (bool)",
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))",
  "function commitCount() external view returns (uint256)",
  "function computeDecisionHash(string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external pure returns (bytes32)",
  "event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)",
  "event CommitRevealed(uint256 indexed commitId, address indexed committer, string prompt, string output, string modelVersion)"
];

const DEFAULT_RPC_URLS = {
  mainnet: "https://bsc-dataseed1.binance.org",
  testnet: "https://data-seed-prebsc-1-s1.binance.org:8545"
};

const EXPLORER_URLS = {
  mainnet: "https://bscscan.com",
  testnet: "https://testnet.bscscan.com"
};

export class ClawCommit {
  private contract: ethers.Contract;
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private explorerBase: string;

  constructor(config: ClawCommitConfig) {
    const rpcUrl = config.rpcUrl || DEFAULT_RPC_URLS.mainnet;
    const isTestnet = rpcUrl.includes("testnet") || rpcUrl.includes("test-rpc");
    this.explorerBase = isTestnet ? EXPLORER_URLS.testnet : EXPLORER_URLS.mainnet;

    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(config.contractAddress, CLAWCOMMIT_ABI, this.signer);
    } else {
      this.contract = new ethers.Contract(config.contractAddress, CLAWCOMMIT_ABI, this.provider);
    }
  }

  async commit(
    payloadOrDecision: DecisionPayload | string,
    nonce?: string
  ): Promise<CommitResult> {
    if (!this.signer) {
      throw new Error("Private key required for commit operation. Initialize SDK with privateKey.");
    }

    const payload = ClawCommit.normalizePayload(payloadOrDecision);
    const { hash, nonce: finalNonce } = ClawCommit.computeDecisionHash(payload, nonce);

    const tx = await this.contract.commitDecision(hash);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction failed - no receipt");
    }

    const commitCreatedEvent = receipt.logs
      .map((log: ethers.Log) => {
        try {
          return this.contract.interface.parseLog({
            topics: [...log.topics],
            data: log.data
          });
        } catch {
          return null;
        }
      })
      .find((event: ethers.LogDescription | null) => event?.name === "CommitCreated");

    if (!commitCreatedEvent) {
      throw new Error("CommitCreated event not found in transaction receipt");
    }

    const commitId = commitCreatedEvent.args.commitId.toString();

    return {
      commitId,
      hash,
      nonce: finalNonce,
      prompt: payload.prompt,
      output: payload.output,
      modelVersion: payload.modelVersion,
      txHash: receipt.hash,
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  async reveal(
    commitId: number,
    payloadOrDecision: DecisionPayload | string,
    nonce: string
  ): Promise<RevealResult> {
    if (!this.signer) {
      throw new Error("Private key required for reveal operation. Initialize SDK with privateKey.");
    }

    const payload = ClawCommit.normalizePayload(payloadOrDecision);

    const tx = await this.contract.revealDecision(
      commitId,
      payload.prompt,
      payload.output,
      payload.modelVersion,
      nonce
    );
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction failed - no receipt");
    }

    const verifyResult = await this.verify(commitId);

    return {
      commitId: commitId.toString(),
      txHash: receipt.hash,
      verified: verifyResult.verified,
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  async verify(commitId: number): Promise<VerifyResult> {
    const commitment = await this.contract.getCommitment(commitId);

    if (!commitment.revealed) {
      throw new Error(`Commitment ${commitId} has not been revealed yet`);
    }

    const replayHash = ClawCommit.computeDecisionHash(
      {
        prompt: commitment.prompt,
        output: commitment.output,
        modelVersion: commitment.modelVersion
      },
      commitment.nonce
    ).hash;

    const contractVerified = await this.contract.verifyReplay(commitId);
    const verified = contractVerified && commitment.hash === replayHash;

    return {
      commitId: commitId.toString(),
      prompt: commitment.prompt,
      output: commitment.output,
      modelVersion: commitment.modelVersion,
      decision: commitment.output,
      nonce: commitment.nonce,
      storedHash: commitment.hash,
      replayHash,
      verified,
      timestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
      committer: commitment.committer,
      revealed: commitment.revealed
    };
  }

  async getCommitCount(): Promise<number> {
    const count = await this.contract.commitCount();
    return Number(count);
  }

  async getCommitment(commitId: number): Promise<{
    hash: string;
    timestamp: bigint;
    committer: string;
    revealed: boolean;
    prompt: string;
    output: string;
    modelVersion: string;
    nonce: string;
    decision: string;
  }> {
    const commitment = await this.contract.getCommitment(commitId);
    return {
      hash: commitment.hash,
      timestamp: commitment.timestamp,
      committer: commitment.committer,
      revealed: commitment.revealed,
      prompt: commitment.prompt,
      output: commitment.output,
      modelVersion: commitment.modelVersion,
      nonce: commitment.nonce,
      decision: commitment.output
    };
  }

  static computeDecisionHash(
    payloadOrDecision: DecisionPayload | string,
    nonce?: string
  ): { hash: string; nonce: string } {
    const payload = ClawCommit.normalizePayload(payloadOrDecision);
    const finalNonce = nonce || ClawCommit.generateNonce();

    const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
      ["string", "string", "string", "string"],
      [payload.prompt, payload.output, payload.modelVersion, finalNonce]
    );
    const hash = ethers.keccak256(encoded);

    return { hash, nonce: finalNonce };
  }

  static computeHash(
    decision: string,
    nonce?: string
  ): { hash: string; nonce: string } {
    return ClawCommit.computeDecisionHash(decision, nonce);
  }

  static generateNonce(): string {
    return randomBytes(32).toString("hex");
  }

  private static normalizePayload(
    payloadOrDecision: DecisionPayload | string
  ): DecisionPayload {
    if (typeof payloadOrDecision === "string") {
      return {
        prompt: "",
        output: payloadOrDecision,
        modelVersion: "legacy-v1"
      };
    }
    return payloadOrDecision;
  }

  getContractAddress(): string {
    return this.contract.target as string;
  }

  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  getSigner(): ethers.Wallet | undefined {
    return this.signer;
  }

  isReadOnly(): boolean {
    return !this.signer;
  }
}

export default ClawCommit;
