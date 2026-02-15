import { randomBytes } from "crypto";
import { ethers } from "ethers";

export interface ClawCommitConfig {
  contractAddress: string;
  rpcUrl?: string;
  privateKey?: string;
  allowMainnetWrites?: boolean;
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

export type CommitIdInput = bigint | number | string;

export interface OpenClawValidationResult {
  name: string;
  passed: boolean;
  required?: boolean;
  details?: string;
}

export interface OpenClawNormalizedValidationResult {
  name: string;
  passed: boolean;
  required: boolean;
  details: string;
}

export interface OpenClawBuildContext {
  workflow: string;
  repository: string;
  ref?: string;
  sha?: string;
  actor?: string;
  runId?: string;
  runUrl?: string;
}

export interface OpenClawDecisionInput {
  modelVersion: string;
  context: OpenClawBuildContext;
  validations: OpenClawValidationResult[];
}

export interface OpenClawDecisionPayload extends DecisionPayload {
  promptTemplateVersion: string;
  promptDigest: string;
  context: OpenClawBuildContext;
  validations: OpenClawNormalizedValidationResult[];
  requiredValidationCount: number;
  requiredFailureCount: number;
}

export interface GeminiSafetySetting {
  category: string;
  threshold: string;
}

export interface GeminiGenerationConfig {
  temperature?: number;
  topP?: number;
  candidateCount?: number;
  stopSequences?: string[];
  safetySettings?: GeminiSafetySetting[];
}

export interface GeminiNormalizedGenerationConfig {
  temperature: string;
  topP: string;
  candidateCount: number;
  stopSequences: string[];
  safetySettings: GeminiSafetySetting[];
  configDigest: string;
}

export interface GeminiDecisionInput {
  prompt: string;
  output: string;
  modelVersion?: string;
  generationConfig?: GeminiGenerationConfig;
}

export interface GeminiDecisionPayload extends DecisionPayload {
  promptTemplateVersion: string;
  promptDigest: string;
  inputPrompt: string;
  generationConfig: GeminiNormalizedGenerationConfig;
  expandedHash: string;
  expandedHashAlgorithm: string;
}

const CLAWCOMMIT_ABI = [
  "function commitDecision(bytes32 _hash) external returns (uint256 commitId)",
  "function revealDecision(uint256 _commitId, string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external",
  "function verifyReplay(uint256 _commitId) external view returns (bool)",
  "function getCommitment(uint256 _commitId) external view returns (tuple(bytes32 hash, uint256 timestamp, address committer, bool revealed, string prompt, string output, string modelVersion, string nonce))",
  "function commitCount() external view returns (uint256)",
  "function computeDecisionHash(string calldata _prompt, string calldata _output, string calldata _modelVersion, string calldata _nonce) external pure returns (bytes32)",
  "event CommitCreated(uint256 indexed commitId, address indexed committer, bytes32 hash, uint256 timestamp)",
  "event CommitRevealed(uint256 indexed commitId, address indexed committer, string prompt, string output, string modelVersion)",
];

const BSC_MAINNET_CHAIN_ID = 56n;

const DEFAULT_RPC_URLS = {
  mainnet: "https://bsc-dataseed1.binance.org",
  testnet: "https://data-seed-prebsc-1-s1.binance.org:8545",
};

const EXPLORER_URLS = {
  mainnet: "https://bscscan.com",
  testnet: "https://testnet.bscscan.com",
};

export const OPENCLAW_PROMPT_TEMPLATE_VERSION = "openclaw-prompt-v1";
export const GEMINI_PROMPT_TEMPLATE_VERSION = "gemini-context-v1";

const GEMINI_PRESETS = {
  geminiPro: {
    model: "gemini-1.5-pro",
    temperature: 0.2,
    topP: 0.95,
    candidateCount: 1,
    stopSequences: [] as string[],
    safetySettings: [] as GeminiSafetySetting[],
  },
  geminiFlash: {
    model: "gemini-1.5-flash",
    temperature: 0.3,
    topP: 0.9,
    candidateCount: 1,
    stopSequences: [] as string[],
    safetySettings: [] as GeminiSafetySetting[],
  },
} as const;

function requireNonEmptyText(value: string, label: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new Error(`${label} must be a non-empty string`);
  }
  return normalized;
}

function normalizeOpenClawValidationDetails(details?: string): string {
  if (!details) {
    return "";
  }
  return details.trim().replace(/\r?\n/g, "\\n");
}

function normalizeGeminiDecimal(value: number | undefined, fallback: number): string {
  const numeric = Number(value);
  const result = Number.isFinite(numeric) ? numeric : fallback;
  return result
    .toFixed(6)
    .replace(/(?:\.0+|(?<=\..*?)0+)$/g, "")
    .replace(/\.$/, "");
}

function normalizeGeminiCandidateCount(value: number | undefined, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Math.max(1, Math.floor(fallback));
  }
  return Math.max(1, Math.floor(numeric));
}

function normalizeGeminiStopSequences(stopSequences?: string[]): string[] {
  if (!Array.isArray(stopSequences)) {
    return [];
  }
  return [...new Set(stopSequences.map((entry) => String(entry || "").trim()))]
    .filter((entry) => entry.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeGeminiSafetySettings(
  safetySettings?: GeminiSafetySetting[]
): GeminiSafetySetting[] {
  if (!Array.isArray(safetySettings)) {
    return [];
  }

  return safetySettings
    .map((entry) => ({
      category: String(entry.category || "").trim(),
      threshold: String(entry.threshold || "").trim(),
    }))
    .filter((entry) => entry.category.length > 0 && entry.threshold.length > 0)
    .sort((a, b) => {
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      if (a.threshold < b.threshold) return -1;
      if (a.threshold > b.threshold) return 1;
      return 0;
    });
}

function resolveGeminiPreset(modelVersion?: string) {
  const normalized = String(modelVersion || "").toLowerCase();
  if (normalized.includes("flash")) {
    return GEMINI_PRESETS.geminiFlash;
  }
  return GEMINI_PRESETS.geminiPro;
}

export function normalizeGeminiGenerationConfig(
  modelVersion?: string,
  generationConfig?: GeminiGenerationConfig
): GeminiNormalizedGenerationConfig {
  const preset = resolveGeminiPreset(modelVersion);
  const config = generationConfig || {};
  const temperature = normalizeGeminiDecimal(config.temperature, preset.temperature);
  const topP = normalizeGeminiDecimal(config.topP, preset.topP);
  const candidateCount = normalizeGeminiCandidateCount(
    config.candidateCount,
    preset.candidateCount
  );
  const stopSequences = normalizeGeminiStopSequences(config.stopSequences || preset.stopSequences);
  const safetySettings = normalizeGeminiSafetySettings(
    config.safetySettings || preset.safetySettings
  );
  const configDigest = ethers.keccak256(
    ethers.AbiCoder.defaultAbiCoder().encode(
      ["uint256", "string", "string"],
      [BigInt(candidateCount), JSON.stringify(stopSequences), JSON.stringify(safetySettings)]
    )
  );

  return {
    temperature,
    topP,
    candidateCount,
    stopSequences,
    safetySettings,
    configDigest,
  };
}

function normalizeOpenClawValidation(
  validation: OpenClawValidationResult,
  index: number
): OpenClawNormalizedValidationResult {
  return {
    name: requireNonEmptyText(validation.name, `validations[${index}].name`),
    passed: Boolean(validation.passed),
    required: validation.required ?? true,
    details: normalizeOpenClawValidationDetails(validation.details),
  };
}

function sortOpenClawValidations(
  validations: OpenClawNormalizedValidationResult[]
): OpenClawNormalizedValidationResult[] {
  return [...validations].sort((a, b) => {
    if (a.name < b.name) return -1;
    if (a.name > b.name) return 1;
    if (a.required !== b.required) return a.required ? -1 : 1;
    if (a.passed !== b.passed) return a.passed ? 1 : -1;
    if (a.details < b.details) return -1;
    if (a.details > b.details) return 1;
    return 0;
  });
}

function normalizeOpenClawContext(context: OpenClawBuildContext): OpenClawBuildContext {
  return {
    workflow: requireNonEmptyText(context.workflow, "context.workflow"),
    repository: requireNonEmptyText(context.repository, "context.repository"),
    ref: context.ref?.trim() || "",
    sha: context.sha?.trim() || "",
    actor: context.actor?.trim() || "",
    runId: context.runId?.trim() || "",
    runUrl: context.runUrl?.trim() || "",
  };
}

export function buildOpenClawDecisionPayload(
  input: OpenClawDecisionInput
): OpenClawDecisionPayload {
  const modelVersion = requireNonEmptyText(input.modelVersion, "modelVersion");
  if (!Array.isArray(input.validations) || input.validations.length === 0) {
    throw new Error("validations must include at least one entry");
  }

  const normalizedContext = normalizeOpenClawContext(input.context);
  const normalizedValidations = input.validations.map((entry, index) =>
    normalizeOpenClawValidation(entry, index)
  );
  const sortedValidations = sortOpenClawValidations(normalizedValidations);

  const uniqueNames = new Set<string>();
  for (const validation of sortedValidations) {
    if (uniqueNames.has(validation.name)) {
      throw new Error(`validations contains duplicate name: ${validation.name}`);
    }
    uniqueNames.add(validation.name);
  }

  const requiredValidationCount = sortedValidations.filter((entry) => entry.required).length;
  const requiredFailureCount = sortedValidations.filter(
    (entry) => entry.required && !entry.passed
  ).length;
  const decision = requiredFailureCount > 0 ? "OPENCLAW_REJECT" : "OPENCLAW_APPROVE";

  const promptLines = [
    `openclaw.template=${OPENCLAW_PROMPT_TEMPLATE_VERSION}`,
    `openclaw.workflow=${normalizedContext.workflow}`,
    `openclaw.repository=${normalizedContext.repository}`,
    `openclaw.ref=${normalizedContext.ref || ""}`,
    `openclaw.sha=${normalizedContext.sha || ""}`,
    `openclaw.actor=${normalizedContext.actor || ""}`,
    `openclaw.run_id=${normalizedContext.runId || ""}`,
    `openclaw.run_url=${normalizedContext.runUrl || ""}`,
    `openclaw.required_validation_count=${requiredValidationCount}`,
    `openclaw.required_failure_count=${requiredFailureCount}`,
    `openclaw.validation_count=${sortedValidations.length}`,
    ...sortedValidations.map(
      (entry, index) =>
        `openclaw.validation.${index}=name:${entry.name}|required:${entry.required ? "1" : "0"}|passed:${entry.passed ? "1" : "0"}|details:${entry.details}`
    ),
  ];

  const prompt = promptLines.join("\n");
  const promptDigest = ethers.keccak256(ethers.toUtf8Bytes(prompt));

  return {
    prompt,
    output: decision,
    modelVersion,
    promptTemplateVersion: OPENCLAW_PROMPT_TEMPLATE_VERSION,
    promptDigest,
    context: normalizedContext,
    validations: sortedValidations,
    requiredValidationCount,
    requiredFailureCount,
  };
}

export function computeGeminiExpandedHash(payload: GeminiDecisionPayload, nonce: string): string {
  const normalizedNonce = normalizeNonce(nonce);
  const encoded = ethers.AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string", "string", "string"],
    [
      payload.prompt,
      payload.output,
      payload.modelVersion,
      normalizedNonce,
      payload.generationConfig.temperature,
      payload.generationConfig.topP,
    ]
  );
  return ethers.keccak256(encoded);
}

export function buildGeminiDecisionPayload(
  input: GeminiDecisionInput,
  nonce?: string
): GeminiDecisionPayload {
  const prompt = requireNonEmptyText(input.prompt, "prompt");
  const output = requireNonEmptyText(input.output, "output");
  const preset = resolveGeminiPreset(input.modelVersion);
  const modelVersion = requireNonEmptyText(input.modelVersion || preset.model, "modelVersion");
  const generationConfig = normalizeGeminiGenerationConfig(modelVersion, input.generationConfig);
  const nonceForHash = nonce ? normalizeNonce(nonce) : ClawCommit.generateNonce();

  const promptEnvelope = [
    `openclaw.gemini.template=${GEMINI_PROMPT_TEMPLATE_VERSION}`,
    `openclaw.gemini.model=${modelVersion}`,
    `openclaw.gemini.temperature=${generationConfig.temperature}`,
    `openclaw.gemini.topP=${generationConfig.topP}`,
    `openclaw.gemini.candidateCount=${generationConfig.candidateCount}`,
    `openclaw.gemini.stopSequences=${JSON.stringify(generationConfig.stopSequences)}`,
    `openclaw.gemini.safetySettings=${JSON.stringify(generationConfig.safetySettings)}`,
    `openclaw.gemini.configDigest=${generationConfig.configDigest}`,
    "openclaw.gemini.prompt.begin",
    prompt,
    "openclaw.gemini.prompt.end",
  ].join("\n");

  const promptDigest = ethers.keccak256(ethers.toUtf8Bytes(promptEnvelope));
  const expandedHash = computeGeminiExpandedHash(
    {
      prompt: promptEnvelope,
      output,
      modelVersion,
      promptTemplateVersion: GEMINI_PROMPT_TEMPLATE_VERSION,
      promptDigest,
      inputPrompt: prompt,
      generationConfig,
      expandedHash: "",
      expandedHashAlgorithm:
        "keccak256(abi.encode(prompt, output, modelVersion, nonce, temperature, topP))",
    },
    nonceForHash
  );

  return {
    prompt: promptEnvelope,
    output,
    modelVersion,
    promptTemplateVersion: GEMINI_PROMPT_TEMPLATE_VERSION,
    promptDigest,
    inputPrompt: prompt,
    generationConfig,
    expandedHash,
    expandedHashAlgorithm:
      "keccak256(abi.encode(prompt, output, modelVersion, nonce, temperature, topP))",
  };
}

function normalizeNonce(nonce: string): string {
  const normalized = nonce.trim();
  if (!normalized) {
    throw new Error("nonce must be a non-empty string");
  }
  return normalized;
}

function isPlaceholderAddress(address: string): boolean {
  const normalized = address.trim();
  return (
    normalized.length === 0 ||
    normalized === "0x..." ||
    normalized.includes("<") ||
    normalized.includes(">")
  );
}

export class ClawCommit {
  private contract: ethers.Contract;
  private provider: ethers.JsonRpcProvider;
  private signer?: ethers.Wallet;
  private explorerBase: string;
  private allowMainnetWrites: boolean;

  constructor(config: ClawCommitConfig) {
    if (isPlaceholderAddress(config.contractAddress)) {
      throw new Error(
        "contractAddress is required and cannot be a placeholder value (e.g. 0x...)"
      );
    }
    if (!ethers.isAddress(config.contractAddress)) {
      throw new Error(`Invalid contract address: ${config.contractAddress}`);
    }

    const rpcUrl = config.rpcUrl || DEFAULT_RPC_URLS.testnet;
    const isTestnet =
      rpcUrl.includes("testnet") || rpcUrl.includes("prebsc") || rpcUrl.includes("test-rpc");
    this.explorerBase = isTestnet ? EXPLORER_URLS.testnet : EXPLORER_URLS.mainnet;
    this.allowMainnetWrites = config.allowMainnetWrites ?? false;

    this.provider = new ethers.JsonRpcProvider(rpcUrl);

    if (config.privateKey) {
      this.signer = new ethers.Wallet(config.privateKey, this.provider);
      this.contract = new ethers.Contract(config.contractAddress, CLAWCOMMIT_ABI, this.signer);
    } else {
      this.contract = new ethers.Contract(config.contractAddress, CLAWCOMMIT_ABI, this.provider);
    }
  }

  private async assertWriteAllowed(): Promise<void> {
    const chainId = (await this.provider.getNetwork()).chainId;
    if (chainId === BSC_MAINNET_CHAIN_ID && !this.allowMainnetWrites) {
      throw new Error(
        "Refusing write on BSC mainnet. Set allowMainnetWrites=true to allow mainnet transactions."
      );
    }
  }

  private static normalizeCommitId(commitId: CommitIdInput): bigint {
    if (typeof commitId === "bigint") {
      if (commitId < 0n) {
        throw new Error("commitId must be non-negative");
      }
      return commitId;
    }

    if (typeof commitId === "number") {
      if (!Number.isSafeInteger(commitId) || commitId < 0) {
        throw new Error("commitId must be a non-negative safe integer");
      }
      return BigInt(commitId);
    }

    const trimmed = commitId.trim();
    if (!/^\d+$/.test(trimmed)) {
      throw new Error(`commitId must be a non-negative integer. Received: ${commitId}`);
    }
    return BigInt(trimmed);
  }

  async commit(
    payloadOrDecision: DecisionPayload | string,
    nonce?: string
  ): Promise<CommitResult> {
    if (!this.signer) {
      throw new Error("Private key required for commit operation. Initialize SDK with privateKey.");
    }

    await this.assertWriteAllowed();

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
            data: log.data,
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
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`,
    };
  }

  async reveal(
    commitId: CommitIdInput,
    payloadOrDecision: DecisionPayload | string,
    nonce: string
  ): Promise<RevealResult> {
    if (!this.signer) {
      throw new Error("Private key required for reveal operation. Initialize SDK with privateKey.");
    }

    await this.assertWriteAllowed();

    const payload = ClawCommit.normalizePayload(payloadOrDecision);
    const normalizedCommitId = ClawCommit.normalizeCommitId(commitId);
    const normalizedNonce = normalizeNonce(nonce);

    const tx = await this.contract.revealDecision(
      normalizedCommitId,
      payload.prompt,
      payload.output,
      payload.modelVersion,
      normalizedNonce
    );
    const receipt = await tx.wait();
    if (!receipt) {
      throw new Error("Transaction failed - no receipt");
    }

    const verifyResult = await this.verify(normalizedCommitId);

    return {
      commitId: normalizedCommitId.toString(),
      txHash: receipt.hash,
      verified: verifyResult.verified,
      explorerUrl: `${this.explorerBase}/tx/${receipt.hash}`,
    };
  }

  async verify(commitId: CommitIdInput): Promise<VerifyResult> {
    const normalizedCommitId = ClawCommit.normalizeCommitId(commitId);
    const commitment = await this.contract.getCommitment(normalizedCommitId);

    if (!commitment.revealed) {
      throw new Error(`Commitment ${normalizedCommitId.toString()} has not been revealed yet`);
    }

    const replayHash = ClawCommit.computeDecisionHash(
      {
        prompt: commitment.prompt,
        output: commitment.output,
        modelVersion: commitment.modelVersion,
      },
      commitment.nonce
    ).hash;

    const contractVerified = await this.contract.verifyReplay(normalizedCommitId);
    const verified = contractVerified && commitment.hash === replayHash;

    return {
      commitId: normalizedCommitId.toString(),
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
      revealed: commitment.revealed,
    };
  }

  async getCommitCount(): Promise<bigint> {
    return await this.contract.commitCount();
  }

  async getCommitment(commitId: CommitIdInput): Promise<{
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
    const normalizedCommitId = ClawCommit.normalizeCommitId(commitId);
    const commitment = await this.contract.getCommitment(normalizedCommitId);
    return {
      hash: commitment.hash,
      timestamp: commitment.timestamp,
      committer: commitment.committer,
      revealed: commitment.revealed,
      prompt: commitment.prompt,
      output: commitment.output,
      modelVersion: commitment.modelVersion,
      nonce: commitment.nonce,
      decision: commitment.output,
    };
  }

  static computeDecisionHash(
    payloadOrDecision: DecisionPayload | string,
    nonce?: string
  ): { hash: string; nonce: string } {
    const payload = ClawCommit.normalizePayload(payloadOrDecision);
    const finalNonce = nonce ? normalizeNonce(nonce) : ClawCommit.generateNonce();

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
    return ethers.hexlify(randomBytes(32));
  }

  private static normalizePayload(payloadOrDecision: DecisionPayload | string): DecisionPayload {
    if (typeof payloadOrDecision === "string") {
      return {
        prompt: "",
        output: payloadOrDecision,
        modelVersion: "legacy-v1",
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

export async function commitOpenClawDecision(
  claw: ClawCommit,
  input: OpenClawDecisionInput,
  nonce?: string
): Promise<CommitResult> {
  const payload = buildOpenClawDecisionPayload(input);
  return claw.commit(payload, nonce);
}

export async function revealOpenClawDecision(
  claw: ClawCommit,
  commitId: CommitIdInput,
  payload: OpenClawDecisionPayload,
  nonce: string
): Promise<RevealResult> {
  return claw.reveal(commitId, payload, nonce);
}

export async function commitGeminiDecision(
  claw: ClawCommit,
  input: GeminiDecisionInput,
  nonce?: string
): Promise<CommitResult & { payload: GeminiDecisionPayload }> {
  const normalizedNonce = nonce ? normalizeNonce(nonce) : ClawCommit.generateNonce();
  const payload = buildGeminiDecisionPayload(input, normalizedNonce);
  const commit = await claw.commit(payload, normalizedNonce);
  return {
    ...commit,
    payload,
  };
}

export async function revealGeminiDecision(
  claw: ClawCommit,
  commitId: CommitIdInput,
  payload: GeminiDecisionPayload,
  nonce: string
): Promise<RevealResult> {
  return claw.reveal(commitId, payload, nonce);
}

export default ClawCommit;
