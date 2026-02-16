export interface DecisionPayload {
  prompt: string;
  output: string;
  modelVersion: string;
  nonce: string;
}

export interface PullRequestContext {
  owner: string;
  repo: string;
  pullNumber: number;
  title: string;
  body: string;
  state: string;
  merged: boolean;
  headSha: string;
  baseRef: string;
  htmlUrl: string;
  changedFiles: string[];
  prompt: string;
  nonce: string;
  suggestedOutput: string;
  suggestedModelVersion: string;
}

export interface ApiError {
  error: string;
}
