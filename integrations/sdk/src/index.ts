import { ethers } from "ethers";
import { randomBytes } from "crypto";

/**
 * Configuration for initializing ClawCommit SDK
 */
export interface ClawCommitConfig {
  /** Contract address on BNB Chain */
  contractAddress: string;
  /** RPC URL (defaults to BSC mainnet) */
  rpcUrl?: string;
  /** Private key for signing transactions (required for commit/reveal, optional for verify) */
  privateKey?: string;
}

/**
 * Result of a commit operation
 */
export interface CommitResult {
  /** Unique commitment ID */
  commitId: string;
  /** Computed hash of decision + nonce */
  hash: string;
  /** Generated or provided nonce */
  nonce: string;
  /** Transaction hash */
  txHash: string;
  /** Block explorer URL */
  explorerUrl: string;
}

/**
 * Result of a reveal operation
 */
export interface RevealResult {
  /** Commitment ID that was revealed */
  commitId: string;
  /** Transaction hash */
  txHash: string;
  /** Whether verification succeeded after reveal */
  verified: boolean;
  /** Block explorer URL */
  explorerUrl: string;
}

/**
 * Result of a verification check
 */
export interface VerifyResult {
  /** Commitment ID */
  commitId: string;
  /** Revealed decision string */
  decision: string;
  /** Revealed nonce */
  nonce: string;
  /** Hash stored in contract */
  storedHash: string;
  /** Hash recomputed from decision + nonce */
  replayHash: string;
  /** Whether hashes match */
  verified: boolean;
  /** Timestamp of original commit */
  timestamp: string;
  /** Address that created the commitment */
  committer: string;
  /** Whether commitment has been revealed */
  revealed: boolean;
}

/**
 * Minimal ABI for ClawCommit contract
 */
const CLAWCOMMIT_ABI = [
  "function commit(bytes32 _hash) external returns (uint256 commitId)",
  "function reveal(uint256 _commitId, string calldata _decision, string calldata _nonce) external",
  "function verify(uint256 _commitId) external view returns (bool)",
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string decision, string nonce))",
  "function commitCount() external view returns (uint256)",
  "function computeHash(string calldata _decision, string calldata _nonce) external pure returns (bytes32)",
  "event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)",
  "event CommitRevealed(uint256 indexed commitId, address indexed committer, string decision)"
];

/**
 * Default RPC URLs for BNB Chain
 */
const DEFAULT_RPC_URLS = {
  mainnet: "https://bsc-dataseed1.binance.org",
  testnet: "https://data-seed-prebsc-1-s1.binance.org:8545"
};

/**
 * Block explorer URLs
 */
const EXPLORER_URLS = {
  mainnet: "https://bscscan.com",
  testnet: "https://testnet.bscscan.com"
};

/**
 * ClawCommit SDK - TypeScript interface for AI Decision Commit-Reveal Protocol
 *
 * @example
 * ```typescript
 * // Initialize with private key (for commit/reveal)
 * const claw = new ClawCommit({
 *   contractAddress: "0x...",
 *   privateKey: process.env.PRIVATE_KEY
 * });
 *
 * // Commit a decision
 * const result = await claw.commit("APPROVE_TRADE_42");
 * console.log("Commit ID:", result.commitId);
 *
 * // Reveal later
 * await claw.reveal(0, "APPROVE_TRADE_42", result.nonce);
 *
 * // Verify
 * const proof = await claw.verify(0);
 * console.log("Verified:", proof.verified);
 * ```
 */
export class ClawCommit {
  private contract: ethers.Contract;
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private explorerBase: string;
  private isTestnet: boolean;

  /**
   * Initialize ClawCommit SDK
   * @param config Configuration object
   */
  constructor(config: ClawCommitConfig) {
    // Determine network from RPC URL
    const rpcUrl = config.rpcUrl || DEFAULT_RPC_URLS.mainnet;
    this.isTestnet = rpcUrl.includes("testnet") || rpcUrl.includes("test-rpc");
    this.explorerBase = this.isTestnet ? EXPLORER_URLS.testnet : EXPLORER_URLS.mainnet;

    // Initialize provider
    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    // Initialize signer if private key provided
    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(
        config.contractAddress,
        CLAWCOMMIT_ABI,
        this.signer
      );
    } else {
      // Read-only mode
      this.contract = new ethers.Contract(
        config.contractAddress,
        CLAWCOMMIT_ABI,
        this.provider
      );
    }
  }

  /**
   * Commit a decision to the blockchain
   *
   * @param decision The decision string to commit
   * @param nonce Optional nonce (auto-generated if not provided)
   * @returns Commit result including commitId, hash, nonce, and transaction details
   * @throws Error if no private key configured or transaction fails
   *
   * @example
   * ```typescript
   * const result = await claw.commit("APPROVE_TRADE_42");
   * // Save result.nonce securely - you'll need it for reveal!
   * ```
   */
  async commit(decision: string, nonce?: string): Promise<CommitResult> {
    if (!this.signer) {
      throw new Error("Private key required for commit operation. Initialize SDK with privateKey.");
    }

    // Auto-generate nonce if not provided
    const finalNonce = nonce || ClawCommit.generateNonce();

    // Compute hash using Solidity's abi.encodePacked equivalent
    const hash = ethers.solidityPackedKeccak256(
      ["string", "string"],
      [decision, finalNonce]
    );

    // Send transaction
    const tx = await this.contract.commit(hash);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction failed - no receipt");
    }

    // Parse CommitCreated event to get commitId
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
      txHash: receipt.hash,
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  /**
   * Reveal a previously committed decision
   *
   * @param commitId The commitment ID to reveal
   * @param decision The original decision string
   * @param nonce The nonce used during commitment
   * @returns Reveal result including verification status
   * @throws Error if not the original committer, already revealed, hash mismatch, or transaction fails
   *
   * @example
   * ```typescript
   * await claw.reveal(0, "APPROVE_TRADE_42", savedNonce);
   * ```
   */
  async reveal(commitId: number, decision: string, nonce: string): Promise<RevealResult> {
    if (!this.signer) {
      throw new Error("Private key required for reveal operation. Initialize SDK with privateKey.");
    }

    // Send transaction
    const tx = await this.contract.reveal(commitId, decision, nonce);
    const receipt = await tx.wait();

    if (!receipt) {
      throw new Error("Transaction failed - no receipt");
    }

    // Verify the commitment after reveal
    const verifyResult = await this.verify(commitId);

    return {
      commitId: commitId.toString(),
      txHash: receipt.hash,
      verified: verifyResult.verified,
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`
    };
  }

  /**
   * Verify a revealed commitment by replaying the hash computation
   *
   * @param commitId The commitment ID to verify
   * @returns Verification result with full commitment details
   * @throws Error if commitment doesn't exist or hasn't been revealed
   *
   * @example
   * ```typescript
   * const proof = await claw.verify(0);
   * console.log("Decision:", proof.decision);
   * console.log("Verified:", proof.verified);
   * console.log("Timestamp:", proof.timestamp);
   * ```
   */
  async verify(commitId: number): Promise<VerifyResult> {
    // Read commitment data from contract
    const commitment = await this.contract.getCommitment(commitId);

    if (!commitment.revealed) {
      throw new Error(`Commitment ${commitId} has not been revealed yet`);
    }

    // Recompute hash from revealed data
    const replayHash = ethers.solidityPackedKeccak256(
      ["string", "string"],
      [commitment.decision, commitment.nonce]
    );

    // Compare with stored hash
    const verified = commitment.hash === replayHash;

    return {
      commitId: commitId.toString(),
      decision: commitment.decision,
      nonce: commitment.nonce,
      storedHash: commitment.hash,
      replayHash,
      verified,
      timestamp: new Date(Number(commitment.timestamp) * 1000).toISOString(),
      committer: commitment.committer,
      revealed: commitment.revealed
    };
  }

  /**
   * Get the total number of commits in the contract
   *
   * @returns Total commit count
   *
   * @example
   * ```typescript
   * const count = await claw.getCommitCount();
   * console.log(`Total commits: ${count}`);
   * ```
   */
  async getCommitCount(): Promise<number> {
    const count = await this.contract.commitCount();
    return Number(count);
  }

  /**
   * Get raw commitment data from contract
   *
   * @param commitId The commitment ID
   * @returns Raw commitment data
   *
   * @example
   * ```typescript
   * const data = await claw.getCommitment(0);
   * console.log("Committer:", data.committer);
   * console.log("Revealed:", data.revealed);
   * ```
   */
  async getCommitment(commitId: number): Promise<{
    hash: string;
    timestamp: bigint;
    committer: string;
    revealed: boolean;
    decision: string;
    nonce: string;
  }> {
    return await this.contract.getCommitment(commitId);
  }

  /**
   * Compute hash for a decision and nonce (static utility - no blockchain needed)
   *
   * @param decision The decision string
   * @param nonce Optional nonce (auto-generated if not provided)
   * @returns Object containing hash and nonce
   *
   * @example
   * ```typescript
   * const { hash, nonce } = ClawCommit.computeHash("APPROVE_TRADE_42");
   * console.log("Hash:", hash);
   * console.log("Nonce:", nonce);
   * ```
   */
  static computeHash(decision: string, nonce?: string): { hash: string; nonce: string } {
    const finalNonce = nonce || ClawCommit.generateNonce();
    const hash = ethers.solidityPackedKeccak256(
      ["string", "string"],
      [decision, finalNonce]
    );
    return { hash, nonce: finalNonce };
  }

  /**
   * Generate a cryptographically secure random nonce
   *
   * @returns 64-character hex string (32 bytes)
   *
   * @example
   * ```typescript
   * const nonce = ClawCommit.generateNonce();
   * console.log("Nonce:", nonce);
   * ```
   */
  static generateNonce(): string {
    return randomBytes(32).toString("hex");
  }

  /**
   * Get the contract address
   *
   * @returns Contract address
   */
  getContractAddress(): string {
    return this.contract.target as string;
  }

  /**
   * Get the provider being used
   *
   * @returns Ethers provider instance
   */
  getProvider(): ethers.JsonRpcProvider {
    return this.provider;
  }

  /**
   * Get the signer (if configured)
   *
   * @returns Ethers wallet instance or undefined
   */
  getSigner(): ethers.Wallet | undefined {
    return this.signer;
  }

  /**
   * Check if SDK is in read-only mode
   *
   * @returns True if no signer configured
   */
  isReadOnly(): boolean {
    return !this.signer;
  }
}

// Re-export types for convenience
export type {
  ClawCommitConfig,
  CommitResult,
  RevealResult,
  VerifyResult
};

// Default export
export default ClawCommit;
