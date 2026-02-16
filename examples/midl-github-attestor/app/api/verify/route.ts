import { NextRequest, NextResponse } from "next/server";
import { getClawCommitClient } from "@/lib/clawcommit";
import { parseCommitId } from "@/lib/validation";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const commitId = parseCommitId(request.nextUrl.searchParams.get("commitId"));
    const claw = getClawCommitClient();
    const proof = await claw.verify(commitId);
    return NextResponse.json(proof);
  } catch (error) {
    return NextResponse.json(
      {
        error: (error as Error).message || "Verify failed",
      },
      { status: 400 }
    );
  }
}
