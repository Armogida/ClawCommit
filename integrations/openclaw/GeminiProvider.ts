import type { CommitResult, ClawCommit } from "../sdk/src/index";
import GeminiAdapter, {
  GeminiAdapterOptions,
  GeminiDecisionInput,
  GeminiGenerationConfig,
  GeminiPreparedDecision,
} from "./GeminiAdapter";

interface GoogleModelLike {
  generateContent: (request: unknown) => Promise<unknown>;
}

interface GoogleClientLike {
  getGenerativeModel: (args: { model: string; tools?: unknown[] }) => GoogleModelLike;
}
export interface GeminiProviderOptions {
  claw: ClawCommit;
  apiKey: string;
  adapterOptions?: GeminiAdapterOptions;
  googleClient?: GoogleClientLike;
}

export interface GeminiGenerateRequest {
  prompt: string;
  modelVersion?: string;
  generationConfig?: GeminiGenerationConfig;
  nonce?: string;
  tools?: unknown[];
}

export interface GeminiGenerateAndCommitResult {
  output: string;
  modelVersion: string;
  commit: CommitResult;
  prepared: GeminiPreparedDecision;
  rawResponse: unknown;
}

async function loadGoogleClient(apiKey: string): Promise<GoogleClientLike> {
  try {
    const moduleRef = (await import("@google/generative-ai")) as {
      GoogleGenerativeAI: new (key: string) => GoogleClientLike;
    };
    return new moduleRef.GoogleGenerativeAI(apiKey);
  } catch (error) {
    throw new Error(
      [
        "@google/generative-ai is required for GeminiProvider.",
        "Install it with: npm install @google/generative-ai",
        `Load error: ${String((error as Error).message || error)}`,
      ].join(" ")
    );
  }
}

function extractOutput(response: unknown): string {
  const resp = (response as { response?: any })?.response;
  if (!resp) return "";

  if (resp.text && typeof resp.text === "function") {
    const text = resp.text();
    if (text) return text.trim();
  }

  const candidates = resp.candidates;
  if (!candidates || !Array.isArray(candidates) || candidates.length === 0) {
    return "";
  }

  const candidate = candidates[0];
  if (
    !candidate ||
    !candidate.content ||
    !Array.isArray(candidate.content.parts) ||
    candidate.content.parts.length === 0
  ) {
    return "";
  }

  const parts = candidate.content.parts;
  const functionCalls = parts
    .map((part: any) => part.functionCall)
    .filter(Boolean);

  if (functionCalls.length > 0) {
    return JSON.stringify({ tool_calls: functionCalls });
  }

  return parts
    .map((part: any) => part.text || "")
    .join("\n")
    .trim();
}

export class GeminiProvider {
  private readonly claw: ClawCommit;
  private readonly adapter: GeminiAdapter;
  private readonly clientPromise: Promise<GoogleClientLike>;

  constructor(options: GeminiProviderOptions) {
    this.claw = options.claw;
    this.adapter = new GeminiAdapter(options.adapterOptions);
    this.clientPromise = options.googleClient
      ? Promise.resolve(options.googleClient)
      : loadGoogleClient(options.apiKey);
  }

  public getAdapter(): GeminiAdapter {
    return this.adapter;
  }

  public async generateAndCommit(
    request: GeminiGenerateRequest
  ): Promise<GeminiGenerateAndCommitResult> {
    const modelVersion = request.modelVersion || "gemini-1.5-pro";
    const generationConfig = request.generationConfig || {};
    const tools = request.tools || [];

    const client = await this.clientPromise;
    const model = client.getGenerativeModel({
      model: modelVersion,
      tools,
    });

    const rawResponse = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: request.prompt }] }],
      generationConfig: {
        temperature: generationConfig.temperature,
        topP: generationConfig.topP,
        candidateCount: generationConfig.candidateCount,
        stopSequences: generationConfig.stopSequences,
      },
      safetySettings: generationConfig.safetySettings,
    });

    const output = extractOutput(rawResponse);
    if (!output) {
      throw new Error(
        "Gemini returned an empty response; refusing to commit empty output"
      );
    }

    const prepared: GeminiPreparedDecision = this.adapter.prepareDecision({
      prompt: request.prompt,
      output,
      modelVersion,
      nonce: request.nonce,
      generationConfig: { ...generationConfig, tools },
      tools,
    } as GeminiDecisionInput);

    const commit = await this.claw.commit(
      {
        prompt: prepared.promptEnvelope,
        output: prepared.output,
        modelVersion: prepared.modelVersion,
      },
      prepared.nonce
    );

    return {
      output: prepared.output,
      modelVersion: prepared.modelVersion,
      commit,
      prepared,
      rawResponse,
    };
  }
}

export default GeminiProvider;
