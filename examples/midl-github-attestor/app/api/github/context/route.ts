import { NextRequest, NextResponse } from "next/server";
import { fetchPullRequestContext } from "@/lib/github";
import {
  normalizeModelVersion,
  normalizeOutput,
  normalizeOwner,
  normalizePullNumber,
  normalizeRepo,
  parseOptionalToken,
} from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const owner = normalizeOwner(request.nextUrl.searchParams.get("owner"));
    const repo = normalizeRepo(request.nextUrl.searchParams.get("repo"));
    const pullNumber = normalizePullNumber(request.nextUrl.searchParams.get("pr"));

    const tokenFromHeader = parseOptionalToken(request.headers.get("x-github-token"));
    const token = tokenFromHeader || parseOptionalToken(process.env.GITHUB_TOKEN || null);

    const context = await fetchPullRequestContext({
      owner,
      repo,
      pullNumber,
      token,
    });

    const output = normalizeOutput(
      request.nextUrl.searchParams.get("output"),
      context.suggestedOutput
    );
    const modelVersion = normalizeModelVersion(
      request.nextUrl.searchParams.get("modelVersion"),
      context.suggestedModelVersion
    );

    return NextResponse.json({
      payload: {
        prompt: context.prompt,
        output,
        modelVersion,
        nonce: context.nonce,
      },
      context,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "Failed to fetch GitHub context",
      },
      { status: 400 }
    );
  }
}
