"use client";

import { useMemo, useState } from "react";
import type { DecisionPayload, PullRequestContext } from "@/lib/types";

interface CommitResponse {
  commitId: string;
  txHash: string;
  explorerUrl: string;
  hash: string;
  nonce: string;
}

interface RevealResponse {
  commitId: string;
  txHash: string;
  verified: boolean;
  explorerUrl: string;
}

interface VerifyResponse {
  commitId: string;
  verified: boolean;
  storedHash: string;
  replayHash: string;
  timestamp: string;
  committer: string;
  revealed: boolean;
  prompt: string;
  output: string;
  modelVersion: string;
  nonce: string;
}

interface GitHubContextResponse {
  payload: DecisionPayload;
  context: PullRequestContext;
}

interface LogEntry {
  timestamp: string;
  level: "info" | "error";
  message: string;
}

const INITIAL_PAYLOAD: DecisionPayload = {
  prompt: "",
  output: "OPENCLAW_APPROVE_PR",
  modelVersion: "github-attestor-v1",
  nonce: "",
};

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
    },
  });

  const body = await response.text();
  const data = body ? (JSON.parse(body) as Record<string, unknown>) : {};

  if (!response.ok) {
    throw new Error(String(data.error || `Request failed (${response.status})`));
  }

  return data as T;
}

export default function HomePage() {
  const [owner, setOwner] = useState("Armogida");
  const [repo, setRepo] = useState("ClawCommit");
  const [pullNumber, setPullNumber] = useState("1");
  const [githubToken, setGithubToken] = useState("");
  const [payload, setPayload] = useState<DecisionPayload>(INITIAL_PAYLOAD);

  const [context, setContext] = useState<PullRequestContext | null>(null);
  const [commitId, setCommitId] = useState("");
  const [commitResult, setCommitResult] = useState<CommitResponse | null>(null);
  const [revealResult, setRevealResult] = useState<RevealResponse | null>(null);
  const [verifyResult, setVerifyResult] = useState<VerifyResponse | null>(null);
  const [busy, setBusy] = useState<"load" | "commit" | "reveal" | "verify" | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);

  function addLog(message: string, level: LogEntry["level"] = "info") {
    setLogs((current) => [
      {
        timestamp: new Date().toISOString(),
        level,
        message,
      },
      ...current,
    ]);
  }

  function updatePayload<K extends keyof DecisionPayload>(field: K, value: DecisionPayload[K]) {
    setPayload((current) => ({
      ...current,
      [field]: value,
    }));
  }

  const canCommit = useMemo(() => {
    return Boolean(
      payload.prompt.trim() &&
        payload.output.trim() &&
        payload.modelVersion.trim() &&
        payload.nonce.trim()
    );
  }, [payload]);

  async function loadGithubContext() {
    setBusy("load");

    try {
      const params = new URLSearchParams({
        owner,
        repo,
        pr: pullNumber,
        output: payload.output,
        modelVersion: payload.modelVersion,
      });

      const data = await requestJson<GitHubContextResponse>(
        `/api/github/context?${params.toString()}`,
        {
          headers: githubToken
            ? {
                "x-github-token": githubToken,
              }
            : undefined,
        }
      );

      setContext(data.context);
      setPayload(data.payload);
      setCommitResult(null);
      setRevealResult(null);
      setVerifyResult(null);
      setCommitId("");
      addLog(`Loaded PR #${data.context.pullNumber} context and generated deterministic payload.`);
    } catch (error) {
      addLog((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function commitDecision() {
    setBusy("commit");

    try {
      const data = await requestJson<CommitResponse>("/api/commit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          payload,
        }),
      });

      setCommitResult(data);
      setCommitId(data.commitId);
      setRevealResult(null);
      setVerifyResult(null);
      addLog(`Commit tx submitted. commitId=${data.commitId} tx=${data.txHash}`);
    } catch (error) {
      addLog((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function revealDecision() {
    setBusy("reveal");

    try {
      const data = await requestJson<RevealResponse>("/api/reveal", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          commitId,
          payload,
        }),
      });

      setRevealResult(data);
      setVerifyResult(null);
      addLog(`Reveal tx submitted. commitId=${data.commitId} tx=${data.txHash}`);
    } catch (error) {
      addLog((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  async function verifyDecision() {
    setBusy("verify");

    try {
      const data = await requestJson<VerifyResponse>(
        `/api/verify?commitId=${encodeURIComponent(commitId)}`
      );
      setVerifyResult(data);
      addLog(`Replay verification completed. verified=${String(data.verified)}`);
    } catch (error) {
      addLog((error as Error).message, "error");
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <span className="badge">Midl RPC + ClawCommit SDK</span>
        <h1>GitHub-Native ClawCommit Attestor</h1>
        <p>
          Pull PR context from GitHub, auto-generate the deterministic decision payload, then
          execute commit, reveal, and replay verify transactions against your deployed ClawCommit
          contract.
        </p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>1. GitHub Context</h2>

          <div className="row">
            <div>
              <label className="label" htmlFor="owner">
                Owner
              </label>
              <input
                id="owner"
                value={owner}
                onChange={(event) => setOwner(event.target.value)}
                placeholder="owner"
              />
            </div>

            <div>
              <label className="label" htmlFor="repo">
                Repository
              </label>
              <input
                id="repo"
                value={repo}
                onChange={(event) => setRepo(event.target.value)}
                placeholder="repo"
              />
            </div>

            <div>
              <label className="label" htmlFor="pr">
                Pull Request #
              </label>
              <input
                id="pr"
                value={pullNumber}
                onChange={(event) => setPullNumber(event.target.value)}
                placeholder="42"
              />
            </div>
          </div>

          <label className="label" htmlFor="githubToken">
            GitHub Token (optional; only needed for private repos or higher rate limits)
          </label>
          <input
            id="githubToken"
            type="password"
            value={githubToken}
            onChange={(event) => setGithubToken(event.target.value)}
            placeholder="ghp_..."
          />

          <div className="actions">
            <button type="button" onClick={loadGithubContext} disabled={busy !== null}>
              {busy === "load" ? "Loading GitHub Context..." : "Auto-Fill From GitHub"}
            </button>
          </div>

          {context ? (
            <div className="kv">
              PR #{context.pullNumber} {context.state.toUpperCase()} {context.merged ? "(merged)" : ""}
              {"\n"}
              Head SHA: {context.headSha}
              {"\n"}
              Base: {context.baseRef}
              {"\n"}
              Files: {context.changedFiles.length}
              {"\n"}
              URL: {context.htmlUrl}
            </div>
          ) : null}
        </article>

        <article className="card">
          <h2>2. Decision Payload</h2>

          <label className="label" htmlFor="prompt">
            prompt
          </label>
          <textarea
            id="prompt"
            value={payload.prompt}
            onChange={(event) => updatePayload("prompt", event.target.value)}
            placeholder="Auto-filled from GitHub context"
          />

          <div className="row">
            <div>
              <label className="label" htmlFor="output">
                output
              </label>
              <input
                id="output"
                value={payload.output}
                onChange={(event) => updatePayload("output", event.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="modelVersion">
                modelVersion
              </label>
              <input
                id="modelVersion"
                value={payload.modelVersion}
                onChange={(event) => updatePayload("modelVersion", event.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="nonce">
                nonce
              </label>
              <input
                id="nonce"
                value={payload.nonce}
                onChange={(event) => updatePayload("nonce", event.target.value)}
              />
            </div>
          </div>

          <p className="small">
            Nonce is deterministic from GitHub context by default, but you can override it.
          </p>
        </article>
      </section>

      <section className="grid" style={{ marginTop: 14 }}>
        <article className="card">
          <h2>3. Onchain Actions</h2>

          <label className="label" htmlFor="commitId">
            commitId (for reveal/verify)
          </label>
          <input
            id="commitId"
            value={commitId}
            onChange={(event) => setCommitId(event.target.value)}
            placeholder="auto-filled after commit"
          />

          <div className="actions">
            <button type="button" onClick={commitDecision} disabled={busy !== null || !canCommit}>
              {busy === "commit" ? "Submitting Commit..." : "Commit Decision Onchain"}
            </button>
            <button
              type="button"
              className="secondary"
              onClick={revealDecision}
              disabled={busy !== null || !commitId}
            >
              {busy === "reveal" ? "Submitting Reveal..." : "Reveal Decision"}
            </button>
            <button
              type="button"
              className="ghost"
              onClick={verifyDecision}
              disabled={busy !== null || !commitId}
            >
              {busy === "verify" ? "Verifying..." : "Replay Verify"}
            </button>
          </div>

          {commitResult ? (
            <div className="kv">
              commitId: {commitResult.commitId}
              {"\n"}
              hash: {commitResult.hash}
              {"\n"}
              tx: {commitResult.txHash}
              {"\n"}
              explorer: {commitResult.explorerUrl}
            </div>
          ) : null}

          {revealResult ? (
            <div className="kv">
              reveal tx: {revealResult.txHash}
              {"\n"}
              verified in reveal flow: {String(revealResult.verified)}
              {"\n"}
              explorer: {revealResult.explorerUrl}
            </div>
          ) : null}

          {verifyResult ? (
            <div className="kv">
              verify(commitId): {String(verifyResult.verified)}
              {"\n"}
              revealed: {String(verifyResult.revealed)}
              {"\n"}
              timestamp: {verifyResult.timestamp}
              {"\n"}
              storedHash: {verifyResult.storedHash}
              {"\n"}
              replayHash: {verifyResult.replayHash}
            </div>
          ) : null}
        </article>

        <article className="card">
          <h2>4. Activity</h2>
          <div className="log" role="log" aria-live="polite">
            {logs.length ? (
              logs.map((entry, index) => (
                <div key={`${entry.timestamp}-${index}`} className={`log-item ${entry.level}`}>
                  [{entry.timestamp}] {entry.message}
                </div>
              ))
            ) : (
              <div className="log-item">No actions yet. Load GitHub context to begin.</div>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}
