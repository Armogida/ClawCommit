#!/usr/bin/env node

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { AbiCoder, keccak256 } = require("ethers");

const GEMINI_PROMPT_TEMPLATE_VERSION = "gemini-context-v1";

const GEMINI_MODEL_PRESETS = {
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

function isGeminiModel(modelVersion) {
  const value = String(modelVersion || "").toLowerCase();
  return value.includes("gemini");
}

function resolveGeminiPreset(modelVersion) {
  const value = String(modelVersion || "").toLowerCase();
  if (value.includes("flash")) {
    return GEMINI_MODEL_PRESETS.geminiFlash;
  }
  return GEMINI_MODEL_PRESETS.geminiPro;
}

function normalizeDecimal(value, fallback) {
  const numeric = Number(value);
  const finalValue = Number.isFinite(numeric) ? numeric : Number(fallback);
  return finalValue.toFixed(6).replace(/(?:\.0+|(?<=\..*?)0+)$/g, "").replace(/\.$/, "");
}

function normalizeCandidateCount(value, fallback) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) {
    return Number(fallback || 1);
  }
  return Math.max(1, Math.floor(numeric));
}

function normalizeStopSequences(stopSequences) {
  if (!Array.isArray(stopSequences)) {
    return [];
  }
  return [...new Set(stopSequences.map((value) => String(value || "")))]
    .filter((value) => value.length > 0)
    .sort((a, b) => a.localeCompare(b));
}

function normalizeSafetySettings(safetySettings) {
  if (!Array.isArray(safetySettings)) {
    return [];
  }

  const normalized = safetySettings
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return null;
      }
      return {
        category: String(entry.category || "").trim(),
        threshold: String(entry.threshold || "").trim(),
      };
    })
    .filter((entry) => entry && entry.category && entry.threshold)
    .sort((a, b) => {
      if (a.category < b.category) return -1;
      if (a.category > b.category) return 1;
      if (a.threshold < b.threshold) return -1;
      if (a.threshold > b.threshold) return 1;
      return 0;
    });

  return normalized;
}

function normalizeGeminiGenerationConfig(modelVersion, generationConfig) {
  const preset = resolveGeminiPreset(modelVersion);
  const config = generationConfig || {};
  const candidateCount = normalizeCandidateCount(config.candidateCount, preset.candidateCount);
  const stopSequences = normalizeStopSequences(config.stopSequences || preset.stopSequences);
  const safetySettings = normalizeSafetySettings(config.safetySettings || preset.safetySettings);
  const configDigest = keccak256(
    AbiCoder.defaultAbiCoder().encode(
      ["uint256", "string", "string"],
      [BigInt(candidateCount), JSON.stringify(stopSequences), JSON.stringify(safetySettings)]
    )
  );

  return {
    temperature: normalizeDecimal(config.temperature, preset.temperature),
    topP: normalizeDecimal(config.topP, preset.topP),
    candidateCount,
    stopSequences,
    safetySettings,
    configDigest,
  };
}

function buildGeminiPromptEnvelope(prompt, modelVersion, generationConfig) {
  const normalizedPrompt = String(prompt || "");
  const config = normalizeGeminiGenerationConfig(modelVersion, generationConfig);

  return [
    `openclaw.gemini.template=${GEMINI_PROMPT_TEMPLATE_VERSION}`,
    `openclaw.gemini.model=${modelVersion}`,
    `openclaw.gemini.temperature=${config.temperature}`,
    `openclaw.gemini.topP=${config.topP}`,
    `openclaw.gemini.candidateCount=${config.candidateCount}`,
    `openclaw.gemini.stopSequences=${JSON.stringify(config.stopSequences)}`,
    `openclaw.gemini.safetySettings=${JSON.stringify(config.safetySettings)}`,
    `openclaw.gemini.configDigest=${config.configDigest}`,
    "openclaw.gemini.prompt.begin",
    normalizedPrompt,
    "openclaw.gemini.prompt.end",
  ].join("\n");
}

function parseGeminiPromptEnvelope(promptEnvelope) {
  const value = String(promptEnvelope || "");
  const beginMarker = "\nopenclaw.gemini.prompt.begin\n";
  const endMarker = "\nopenclaw.gemini.prompt.end";

  const beginIndex = value.indexOf(beginMarker);
  const endIndex = value.lastIndexOf(endMarker);

  if (beginIndex === -1 || endIndex === -1 || endIndex <= beginIndex) {
    return {
      isGeminiEnvelope: false,
      prompt: value,
    };
  }

  const header = value.slice(0, beginIndex).split("\n");
  const prompt = value.slice(beginIndex + beginMarker.length, endIndex);

  const context = {
    isGeminiEnvelope: true,
    prompt,
    modelVersion: "",
    temperature: "",
    topP: "",
    candidateCount: 1,
    stopSequences: [],
    safetySettings: [],
    configDigest: "",
  };

  for (const line of header) {
    const idx = line.indexOf("=");
    if (idx === -1) {
      continue;
    }

    const key = line.slice(0, idx).trim();
    const rawValue = line.slice(idx + 1);

    if (key === "openclaw.gemini.model") {
      context.modelVersion = rawValue;
    } else if (key === "openclaw.gemini.temperature") {
      context.temperature = rawValue;
    } else if (key === "openclaw.gemini.topP") {
      context.topP = rawValue;
    } else if (key === "openclaw.gemini.candidateCount") {
      context.candidateCount = normalizeCandidateCount(rawValue, 1);
    } else if (key === "openclaw.gemini.stopSequences") {
      try {
        context.stopSequences = normalizeStopSequences(JSON.parse(rawValue));
      } catch {
        context.stopSequences = [];
      }
    } else if (key === "openclaw.gemini.safetySettings") {
      try {
        context.safetySettings = normalizeSafetySettings(JSON.parse(rawValue));
      } catch {
        context.safetySettings = [];
      }
    } else if (key === "openclaw.gemini.configDigest") {
      context.configDigest = rawValue;
    }
  }

  return context;
}

function computeClawCommitHash(prompt, output, modelVersion, nonce) {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string"],
    [prompt, output, modelVersion, nonce]
  );
  return keccak256(encoded);
}

function computeGeminiDecisionHash(prompt, output, modelVersion, nonce, temperature, topP) {
  const encoded = AbiCoder.defaultAbiCoder().encode(
    ["string", "string", "string", "string", "string", "string"],
    [
      String(prompt || ""),
      String(output || ""),
      String(modelVersion || ""),
      String(nonce || ""),
      String(temperature || ""),
      String(topP || ""),
    ]
  );
  return keccak256(encoded);
}

function secureRandomNonce() {
  return `0x${crypto.randomBytes(32).toString("hex")}`;
}

function counterNonce(counterFile) {
  const resolved = path.resolve(counterFile || ".clawcommit/openclaw/gemini-nonce.counter");
  fs.mkdirSync(path.dirname(resolved), { recursive: true });

  let next = 1n;
  if (fs.existsSync(resolved)) {
    const raw = fs.readFileSync(resolved, "utf8").trim();
    if (raw) {
      const current = BigInt(raw);
      next = current + 1n;
    }
  }

  fs.writeFileSync(resolved, next.toString() + "\n", "utf8");
  return `0x${next.toString(16).padStart(64, "0")}`;
}

function nextGeminiNonce(strategy, counterFile) {
  const normalized = String(strategy || "random").toLowerCase();
  if (normalized === "counter") {
    return counterNonce(counterFile);
  }
  return secureRandomNonce();
}

function buildGeminiCommitPayload({
  prompt,
  output,
  modelVersion,
  nonce,
  generationConfig,
}) {
  const normalizedConfig = normalizeGeminiGenerationConfig(modelVersion, generationConfig);
  const promptEnvelope = buildGeminiPromptEnvelope(prompt, modelVersion, normalizedConfig);

  const chainHash = computeClawCommitHash(promptEnvelope, output, modelVersion, nonce);
  const geminiExpandedHash = computeGeminiDecisionHash(
    promptEnvelope,
    output,
    modelVersion,
    nonce,
    normalizedConfig.temperature,
    normalizedConfig.topP
  );

  return {
    promptEnvelope,
    prompt,
    output,
    modelVersion,
    nonce,
    generationConfig: normalizedConfig,
    chainHash,
    geminiExpandedHash,
  };
}

module.exports = {
  GEMINI_PROMPT_TEMPLATE_VERSION,
  GEMINI_MODEL_PRESETS,
  isGeminiModel,
  resolveGeminiPreset,
  normalizeGeminiGenerationConfig,
  buildGeminiPromptEnvelope,
  parseGeminiPromptEnvelope,
  computeClawCommitHash,
  computeGeminiDecisionHash,
  nextGeminiNonce,
  buildGeminiCommitPayload,
};
