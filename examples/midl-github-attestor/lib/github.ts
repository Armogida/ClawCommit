import { ethers } from "ethers";
import type { PullRequestContext } from "@/lib/types";

const GITHUB_API_BASE = "https://api.github.com";
const MAX_FILES_IN_PROMPT = 25;
const MAX_BODY_CHARS = 1200;

interface GitHubPullResponse {
  number: number;
  title: string;
  body: string | null;
  state: string;
  merged: boolean | null;
  html_url: string;
  base: {
    ref: string;
  };
  head: {
    sha: string;
  };
}

interface GitHubPullFileResponse {
  filename: string;
}

function normalizeText(value: string | null | undefined): string {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function trimText(value: string, maxChars: number): string {
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, maxChars - 3)}...`;
}

function buildGitHubHeaders(token?: string): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github+json",
    "User-Agent": "clawcommit-midl-github-attestor",
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

async function githubGet<T>(path: string, token?: string): Promise<T> {
  const response = await fetch(`${GITHUB_API_BASE}${path}`, {
    headers: buildGitHubHeaders(token),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`GitHub API ${response.status}: ${body || response.statusText}`);
  }

  return (await response.json()) as T;
}

function buildPrompt(context: {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  body: string;
  headSha: string;
  baseRef: string;
  htmlUrl: string;
  changedFiles: string[];
}): string {
  const changedFiles = context.changedFiles.slice(0, MAX_FILES_IN_PROMPT);
  const fileLines = changedFiles.length
    ? changedFiles.map((name) => `- ${name}`).join("\n")
    : "- (none detected)";

  const prBody = context.body ? trimText(context.body, MAX_BODY_CHARS) : "(empty)";

  return [
    "ClawCommit GitHub Decision Context",
    `Repository: ${context.owner}/${context.repo}`,
    `Pull Request: #${context.pullNumber}`,
    `Title: ${context.title}`,
    `Head SHA: ${context.headSha}`,
    `Base Branch: ${context.baseRef}`,
    `PR URL: ${context.htmlUrl}`,
    "",
    "PR Body:",
    prBody,
    "",
    "Changed Files:",
    fileLines,
  ].join("\n");
}

function buildDeterministicNonce(material: string): string {
  return ethers.keccak256(ethers.toUtf8Bytes(material));
}

function suggestOutput(state: string, merged: boolean): string {
  if (merged) {
    return "OPENCLAW_MERGE_CONFIRMED";
  }

  if (state.toLowerCase() === "open") {
    return "OPENCLAW_APPROVE_PR";
  }

  return "OPENCLAW_PR_CLOSED";
}

export async function fetchPullRequestContext(params: {
  owner: string;
  repo: string;
  pullNumber: number;
  token?: string;
}): Promise<PullRequestContext> {
  const { owner, repo, pullNumber, token } = params;

  const [pull, files] = await Promise.all([
    githubGet<GitHubPullResponse>(`/repos/${owner}/${repo}/pulls/${pullNumber}`, token),
    githubGet<GitHubPullFileResponse[]>(
      `/repos/${owner}/${repo}/pulls/${pullNumber}/files?per_page=100`,
      token
    ),
  ]);

  const changedFiles = files.map((entry) => normalizeText(entry.filename)).filter(Boolean);

  const prompt = buildPrompt({
    owner,
    repo,
    pullNumber,
    title: normalizeText(pull.title),
    body: normalizeText(pull.body),
    headSha: normalizeText(pull.head.sha),
    baseRef: normalizeText(pull.base.ref),
    htmlUrl: normalizeText(pull.html_url),
    changedFiles,
  });

  const nonceMaterial = `${owner}/${repo}:${pullNumber}:${pull.head.sha}:${pull.base.ref}:${pull.state}`;
  const nonce = buildDeterministicNonce(nonceMaterial);

  return {
    owner,
    repo,
    pullNumber,
    title: normalizeText(pull.title),
    body: normalizeText(pull.body),
    state: normalizeText(pull.state),
    merged: Boolean(pull.merged),
    headSha: normalizeText(pull.head.sha),
    baseRef: normalizeText(pull.base.ref),
    htmlUrl: normalizeText(pull.html_url),
    changedFiles,
    prompt,
    nonce,
    suggestedOutput: suggestOutput(normalizeText(pull.state), Boolean(pull.merged)),
    suggestedModelVersion: "github-attestor-v1",
  };
}
