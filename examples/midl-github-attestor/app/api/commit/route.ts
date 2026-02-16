import { NextRequest, NextResponse } from "next/server";
import { buildExplorerTxUrl, getClawCommitClient } from "@/lib/clawcommit";
import { parseDecisionPayload } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = parseDecisionPayload(body.payload ?? body);

    const claw = getClawCommitClient();
    const commit = await claw.commit(
      {
        prompt: payload.prompt,
        output: payload.output,
        modelVersion: payload.modelVersion,
      },
      payload.nonce
    );

    return NextResponse.json({
      ...commit,
      explorerUrl: buildExplorerTxUrl(commit.txHash) || commit.explorerUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "Commit failed",
      },
      { status: 400 }
    );
  }
}
