import { NextRequest, NextResponse } from "next/server";
import { buildExplorerTxUrl, getClawCommitClient } from "@/lib/clawcommit";
import { parseCommitId, parseDecisionPayload } from "@/lib/validation";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const payload = parseDecisionPayload(body.payload ?? body);
    const commitId = parseCommitId(body.commitId);

    const claw = getClawCommitClient();
    const reveal = await claw.reveal(
      commitId,
      {
        prompt: payload.prompt,
        output: payload.output,
        modelVersion: payload.modelVersion,
      },
      payload.nonce
    );

    return NextResponse.json({
      ...reveal,
      explorerUrl: buildExplorerTxUrl(reveal.txHash) || reveal.explorerUrl,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "Reveal failed",
      },
      { status: 400 }
    );
  }
}
