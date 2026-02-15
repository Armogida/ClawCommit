import { randomBytes } from "crypto";
import fs from "fs";
import path from "path";
import { AbiCoder, keccak256 } from "ethers";

export type GeminiPresetName = "geminiPro" | "geminiFlash";
export type GeminiNonceStrategy = "random" | "counter";

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
  nonce?: string;
  generationConfig?: GeminiGenerationConfig;
}

export interface GeminiPreparedDecision {
  promptEnvelope: string;
  inputPrompt: string;
  output: string;
  modelVersion: string;
  nonce: string;
  generationConfig: GeminiNormalizedGenerationConfig;
  chainHash: string;
  expandedHash: string;
  expandedAlgorithm: string;
}

export interface GeminiAdapterOptions {
  defaultPreset?: GeminiPresetName;
  nonceStrategy?: GeminiNonceStrategy;
  nonceCounterFile?: string;
}

const GEMINI_TEMPLATE_VERSION = "gemini-context-v1";

const GEMINI_PRESETS: Record<GeminiPresetName, Required<GeminiGenerationConfig> & { model: string }> = {
  geminiPro: {
    model: "gemini-1.5-pro",
    temperature: 0.2,
    topP: 0.95,
    candidateCount: 1,
    stopSequences: [],
    safetySettings: [],
  },
  geminiFlash: {
    model: "gemini-1.5-flash",
    temperature: 0.3,
    topP: 0.9,
    candidateCount: 1,
    stopSequences: [],
    safetySettings: [],
  },
};

function toDecimalString(value: unknown, fallback: number): string {
  const numeric = Number(value);
  const result = Number.isFinite(numeric) ? numeric : fallback;
  return result
    .toFixed(6)
    .replace(/(?:\.0+|(?<=\..*?)0+)$/g, "")
    .replace(/\.$/, "");
}

function toPositiveInt(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Math.max(1, Math.floor(fallback));
  }
  return Math.max(1, Math.floor(numeric));
}

function normalizeStopSequences(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((entry) => String(entry || "").trim()))]
    .filter((entry) => entry.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeSafetySettings(value: unknown): GeminiSafetySetting[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }

      const casted = entry as GeminiSafetySetting;
      const category = String(casted.category || "").trim();
      const threshold = String(casted.threshold || "").trim();
      if (!category || !threshold) {
        return null;
      }
      return { category, threshold };
    })
    .filter((entry): entry is GeminiSafetySetting => Boolean(entry))
    .sort((a, b) => {
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      if (a.threshold < b.threshold) return -1;
      if (a.threshold > b.threshold) return 1;
      return 0;
    });
}

function resolvePreset(modelVersion?: string, defaultPreset: GeminiPresetName = "geminiPro") {
  const normalized = String(modelVersion || "").toLowerCase();
  if (normalized.includes("flash")) {
    return GEMINI_PRESETS.geminiFlash;
  }
  if (normalized.includes("pro")) {
    return GEMINI_PRESETS.geminiPro;
  }
  return GEMINI_PRESETS[defaultPreset];
}

export class GeminiAdapter {
  private readonly defaultPreset: GeminiPresetName;
  private readonly nonceStrategy: GeminiNonceStrategy;
  private readonly nonceCounterFile: string;

  constructor(options?: GeminiAdapterOptions) {
    this.defaultPreset = options?.defaultPreset || "geminiPro";
    this.nonceStrategy = options?.nonceStrategy || "random";
    this.nonceCounterFile = path.resolve(
      options?.nonceCounterFile || ".clawcommit/openclaw/gemini-nonce.counter"
    );
  }

  public static presets() {
    return { ...GEMINI_PRESETS };
  }

  public static isGeminiModel(modelVersion: string): boolean {
    return String(modelVersion || "").toLowerCase().includes("gemini");
  }

  public normalizeGenerationConfig(
    modelVersion?: string,
    generationConfig?: GeminiGenerationConfig
  ): GeminiNormalizedGenerationConfig {
    const preset = resolvePreset(modelVersion, this.defaultPreset);
    const nextConfig = generationConfig || {};

    const temperature = toDecimalString(nextConfig.temperature, preset.temperature);
    const topP = toDecimalString(nextConfig.topP, preset.topP);
    const candidateCount = toPositiveInt(nextConfig.candidateCount, preset.candidateCount);
    const stopSequences = normalizeStopSequences(nextConfig.stopSequences || preset.stopSequences);
    const safetySettings = normalizeSafetySettings(
      nextConfig.safetySettings || preset.safetySettings
    );

    const configDigest = keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["uint256", "string", "string"],
        [
          BigInt(candidateCount),
          JSON.stringify(stopSequences),
          JSON.stringify(safetySettings),
        ]
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

  public buildPromptEnvelope(
    prompt: string,
    modelVersion: string,
    normalizedConfig: GeminiNormalizedGenerationConfig
  ): string {
    return [
      `openclaw.gemini.template=${GEMINI_TEMPLATE_VERSION}`,
      `openclaw.gemini.model=${modelVersion}`,
      `openclaw.gemini.temperature=${normalizedConfig.temperature}`,
      `openclaw.gemini.topP=${normalizedConfig.topP}`,
      `openclaw.gemini.candidateCount=${normalizedConfig.candidateCount}`,
      `openclaw.gemini.stopSequences=${JSON.stringify(normalizedConfig.stopSequences)}`,
      `openclaw.gemini.safetySettings=${JSON.stringify(normalizedConfig.safetySettings)}`,
      `openclaw.gemini.configDigest=${normalizedConfig.configDigest}`,
      "openclaw.gemini.prompt.begin",
      prompt,
      "openclaw.gemini.prompt.end",
    ].join("\n");
  }

  public parsePromptEnvelope(promptEnvelope: string): {
    prompt: string;
    modelVersion: string;
    temperature: string;
    topP: string;
    candidateCount: number;
    stopSequences: string[];
    safetySettings: GeminiSafetySetting[];
    configDigest: string;
    isGeminiEnvelope: boolean;
  } {
    const beginMarker = "\nopenclaw.gemini.prompt.begin\n";
    const endMarker = "\nopenclaw.gemini.prompt.end";

    const begin = promptEnvelope.indexOf(beginMarker);
    const end = promptEnvelope.lastIndexOf(endMarker);
    if (begin === -1 || end === -1 || end <= begin) {
      return {
        prompt: promptEnvelope,
        modelVersion: "",
        temperature: "",
        topP: "",
        candidateCount: 1,
        stopSequences: [],
        safetySettings: [],
        configDigest: "",
        isGeminiEnvelope: false,
      };
    }

    const header = promptEnvelope.slice(0, begin).split("\n");
    const prompt = promptEnvelope.slice(begin + beginMarker.length, end);

    const result = {
      prompt,
      modelVersion: "",
      temperature: "",
      topP: "",
      candidateCount: 1,
      stopSequences: [] as string[],
      safetySettings: [] as GeminiSafetySetting[],
      configDigest: "",
      isGeminiEnvelope: true,
    };

    for (const line of header) {
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      const value = line.slice(idx + 1);

      if (key === "openclaw.gemini.model") {
        result.modelVersion = value;
      } else if (key === "openclaw.gemini.temperature") {
        result.temperature = value;
      } else if (key === "openclaw.gemini.topP") {
        result.topP = value;
      } else if (key === "openclaw.gemini.candidateCount") {
        result.candidateCount = toPositiveInt(value, 1);
      } else if (key === "openclaw.gemini.stopSequences") {
        try {
          result.stopSequences = normalizeStopSequences(JSON.parse(value));
        } catch {
          result.stopSequences = [];
        }
      } else if (key === "openclaw.gemini.safetySettings") {
        try {
          result.safetySettings = normalizeSafetySettings(JSON.parse(value));
        } catch {
          result.safetySettings = [];
        }
      } else if (key === "openclaw.gemini.configDigest") {
        result.configDigest = value;
      }
    }

    return result;
  }

  public nextNonce(strategy?: GeminiNonceStrategy): string {
    const selected = strategy || this.nonceStrategy;
    if (selected === "counter") {
      return this.nextCounterNonce();
    }
    return `0x${randomBytes(32).toString("hex")}`;
  }

  public computeChainHash(
    promptEnvelope: string,
    output: string,
    modelVersion: string,
    nonce: string
  ): string {
    return keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "string", "string"],
        [promptEnvelope, output, modelVersion, nonce]
      )
    );
  }

  public computeExpandedHash(
    promptEnvelope: string,
    output: string,
    modelVersion: string,
    nonce: string,
    temperature: string,
    topP: string
  ): string {
    return keccak256(
      AbiCoder.defaultAbiCoder().encode(
        ["string", "string", "string", "string", "string", "string"],
        [promptEnvelope, output, modelVersion, nonce, temperature, topP]
      )
    );
  }

  public prepareDecision(input: GeminiDecisionInput): GeminiPreparedDecision {
    const modelVersion = String(input.modelVersion || resolvePreset(undefined, this.defaultPreset).model);
    const nonce = input.nonce || this.nextNonce();
    const normalizedConfig = this.normalizeGenerationConfig(modelVersion, input.generationConfig);
    const promptEnvelope = this.buildPromptEnvelope(input.prompt, modelVersion, normalizedConfig);

    const chainHash = this.computeChainHash(promptEnvelope, input.output, modelVersion, nonce);
    const expandedHash = this.computeExpandedHash(
      promptEnvelope,
      input.output,
      modelVersion,
      nonce,
      normalizedConfig.temperature,
      normalizedConfig.topP
    );

    return {
      promptEnvelope,
      inputPrompt: input.prompt,
      output: input.output,
      modelVersion,
      nonce,
      generationConfig: normalizedConfig,
      chainHash,
      expandedHash,
      expandedAlgorithm:
        "keccak256(abi.encode(prompt, output, modelVersion, nonce, temperature, topP))",
    };
  }

  private nextCounterNonce(): string {
    fs.mkdirSync(path.dirname(this.nonceCounterFile), { recursive: true });

    let next = 1n;
    if (fs.existsSync(this.nonceCounterFile)) {
      const raw = fs.readFileSync(this.nonceCounterFile, "utf8").trim();
      if (raw) {
        next = BigInt(raw) + 1n;
      }
    }

    fs.writeFileSync(this.nonceCounterFile, `${next.toString()}\n`, "utf8");
    return `0x${next.toString(16).padStart(64, "0")}`;
  }
}

export default GeminiAdapter;
