import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { randomBytes } from "crypto";
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";
import { hashPassword } from "@/lib/password.server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const generateToken = () => randomBytes(16).toString("hex");

export async function GET(request: Request) {
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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const { data: clues, error: clueError } = await supabase
    .from("clues")
    .select("id, clue_index, label, title")
    .order("clue_index", { ascending: true });
  if (clueError) {
    return NextResponse.json({ ok: false, reason: clueError.message }, { status: 400 });
  }

  const { data: existingTokens } = await supabase
    .from("artifact_tokens")
    .select("id, clue_id, token_ciphertext, token_hash");

  const tokenMap = new Map(
    (existingTokens ?? []).map((row) => [row.clue_id, row])
  );

  const upserts: {
    clue_id: string;
    token_hash: string;
    token_ciphertext: string;
    updated_at: string;
  }[] = [];

  const origin = new URL(request.url).origin;
  const lines: string[] = [];

  for (const clue of clues ?? []) {
    const tokenRow = tokenMap.get(clue.id);
    let tokenValue: string | null = null;
    let needsPersist = false;

    if (tokenRow?.token_ciphertext) {
      try {
        tokenValue = decryptSecret(tokenRow.token_ciphertext);
      } catch {
        tokenValue = null;
      }
    }

    if (!tokenValue) {
      tokenValue = generateToken();
      needsPersist = true;
    }

    if (!tokenRow?.token_hash || !tokenRow?.token_ciphertext) {
      needsPersist = true;
    }

    if (needsPersist) {
      upserts.push({
        clue_id: clue.id,
        token_hash: hashPassword(tokenValue),
        token_ciphertext: encryptSecret(tokenValue),
        updated_at: new Date().toISOString(),
      });
    }

    const label = clue.label || `Clue ${clue.clue_index}`;
    const url = `${origin}/experience?step=${clue.clue_index}&unlock=1&source=qr&token=${encodeURIComponent(
      tokenValue
    )}`;
    lines.push(`${label}: ${url}`);
  }

  if (upserts.length) {
    await supabase.from("artifact_tokens").upsert(upserts, {
      onConflict: "clue_id",
    });
  }

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=clue-qr-links.txt",
    },
  });
}
