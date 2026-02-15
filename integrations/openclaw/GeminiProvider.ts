import type { CommitResult, ClawCommit } from "../sdk/src/index";
import GeminiAdapter, {
  GeminiAdapterOptions,
  GeminiDecisionInput,
  GeminiGenerationConfig,
  GeminiPreparedDecision,
} from "./GeminiAdapter";

export interface GeminiProviderOptions {
  claw: ClawCommit;
  apiKey: string;
  adapterOptions?: GeminiAdapterOptions;
}

export interface GeminiGenerateRequest {
  prompt: string;
  modelVersion?: string;
  generationConfig?: GeminiGenerationConfig;
  nonce?: string;
}

export interface GeminiGenerateAndCommitResult {
  output: string;
  modelVersion: string;
  commit: CommitResult;
  prepared: GeminiPreparedDecision;
  rawResponse: unknown;
}

interface GoogleModelLike {
  generateContent: (request: unknown) => Promise<unknown>;
}

interface GoogleClientLike {
  getGenerativeModel: (args: { model: string }) => GoogleModelLike;
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

function extractText(response: unknown): string {
  const candidateText =
    (response as {
      response?: {
        text?: () => string;
        candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }> };
      };
    })?.response?.text?.() || "";

  if (candidateText.trim()) {
    return candidateText.trim();
  }

  const fallback =
    (response as {
      response?: { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> }> };
      };
    })?.response?.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join("\n") || "";

  return fallback.trim();
}

export class GeminiProvider {
  private readonly claw: ClawCommit;
  private readonly adapter: GeminiAdapter;
  private readonly clientPromise: Promise<GoogleClientLike>;

  constructor(options: GeminiProviderOptions) {
    this.claw = options.claw;
    this.adapter = new GeminiAdapter(options.adapterOptions);
    this.clientPromise = loadGoogleClient(options.apiKey);
  }

  public getAdapter(): GeminiAdapter {
    return this.adapter;
  }

  public async generateAndCommit(
    request: GeminiGenerateRequest
  ): Promise<GeminiGenerateAndCommitResult> {
    const modelVersion = request.modelVersion || "gemini-1.5-pro";
    const generationConfig = request.generationConfig || {};

    const client = await this.clientPromise;
    const model = client.getGenerativeModel({ model: modelVersion });

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

    const output = extractText(rawResponse);
    if (!output) {
      throw new Error("Gemini returned an empty response; refusing to commit empty output");
    }

    const prepared: GeminiPreparedDecision = this.adapter.prepareDecision({
      prompt: request.prompt,
      output,
      modelVersion,
      nonce: request.nonce,
      generationConfig,
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
