import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { verifyPassword } from "@/lib/password.server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

type ClaimPayload = {
  clueIndex?: number;
  token?: string;
};

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as ClaimPayload;
  const clueIndex = body?.clueIndex;
  const rawToken = body?.token?.trim();
  if (!Number.isFinite(clueIndex) || clueIndex === undefined) {
    return NextResponse.json({ ok: false, reason: "Invalid clue" }, { status: 400 });
  }
  if (!rawToken) {
    return NextResponse.json({ ok: false, reason: "Missing QR token" }, { status: 400 });
  }

  const { data: clue } = await supabase
    .from("clues")
    .select("id")
    .eq("clue_index", clueIndex)
    .maybeSingle();

  if (!clue) {
    return NextResponse.json({ ok: false, reason: "Clue not found" }, { status: 404 });
  }

  const { data: secret } = await supabase
    .from("clue_secrets")
    .select("requires_artifact")
    .eq("clue_id", clue.id)
    .maybeSingle();

  if (secret?.requires_artifact === false) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();
  const isAdmin = profile?.role === "admin";

  if (!isAdmin) {
    const { data: playerState } = await supabase
      .from("player_state")
      .select("current_clue_index")
      .eq("player_id", userData.user.id)
      .maybeSingle();
    const currentIndex = playerState?.current_clue_index ?? 0;
    const expectedIndex = currentIndex + 1;
    if (clueIndex !== expectedIndex) {
      const reason =
        clueIndex <= currentIndex
          ? "This QR code is no longer valid. Please scan the next clue to continue."
          : "This QR code is for a future clue. Please scan the next clue to continue.";
      return NextResponse.json({ ok: false, reason }, { status: 403 });
    }
  }

  const { data: tokenRow } = await supabase
    .from("artifact_tokens")
    .select("id, token_hash")
    .eq("clue_id", clue.id)
    .maybeSingle();

  if (!tokenRow?.token_hash) {
    return NextResponse.json({ ok: false, reason: "QR token not configured" }, { status: 400 });
  }

  if (!verifyPassword(rawToken, tokenRow.token_hash)) {
    return NextResponse.json({ ok: false, reason: "Invalid QR token" }, { status: 403 });
  }

  const { data: existingClaim } = await supabase
    .from("artifact_claims")
    .select("id")
    .eq("player_id", userData.user.id)
    .eq("clue_id", clue.id)
    .maybeSingle();

  if (!existingClaim) {
    const { error: insertError } = await supabase.from("artifact_claims").insert({
      player_id: userData.user.id,
      clue_id: clue.id,
      clue_index: clueIndex,
      token_id: tokenRow.id,
    });
    if (insertError) {
      return NextResponse.json({ ok: false, reason: insertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}
