import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import bcrypt from "bcryptjs";
import { decryptSecret } from "@/lib/crypto.server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

type ExportPayload = {
  pin?: string;
};

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
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

  const { pin } = (await request.json().catch(() => ({}))) as ExportPayload;
  if (!pin || pin.trim().length === 0) {
    return NextResponse.json({ ok: false, reason: "PIN required." }, { status: 400 });
  }

  const pinHash = process.env.ADMIN_EXPORT_PIN_HASH;
  if (!pinHash) {
    return NextResponse.json(
      { ok: false, reason: "Export PIN not configured on server." },
      { status: 500 }
    );
  }

  const validPin = await bcrypt.compare(pin, pinHash);
  if (!validPin) {
    return NextResponse.json({ ok: false, reason: "Invalid PIN." }, { status: 403 });
  }

  let clues: any[] | null = null;
  let secrets: any[] | null = null;
  let hints: any[] | null = null;

  const { data: clueRows, error: clueError } = await supabase
    .from("clues")
    .select("id, clue_index, label, title, clue, reward, is_final")
    .order("clue_index", { ascending: true });
  if (clueError) {
    return NextResponse.json({ ok: false, reason: clueError.message }, { status: 400 });
  }
  clues = clueRows ?? [];

  const { data: secretRows, error: secretError } = await supabase
    .from("clue_secrets")
    .select("clue_id, password_ciphertext, radius_meters, lat, lng, requires_unlock, requires_artifact");
  if (secretError) {
    return NextResponse.json({ ok: false, reason: secretError.message }, { status: 400 });
  }
  secrets = secretRows ?? [];

  const { data: tokenRows, error: tokenError } = await supabase
    .from("artifact_tokens")
    .select("clue_id, token_ciphertext");
  if (tokenError) {
    return NextResponse.json({ ok: false, reason: tokenError.message }, { status: 400 });
  }

  const { data: hintRows, error: hintError } = await supabase
    .from("clue_hints")
    .select("clue_id, sort_order, cost, text")
    .order("sort_order", { ascending: true });
  if (hintError) {
    return NextResponse.json({ ok: false, reason: hintError.message }, { status: 400 });
  }
  hints = hintRows ?? [];

  const secretsMap = new Map(secrets.map((row) => [row.clue_id, row]));
  const tokenMap = new Map((tokenRows ?? []).map((row) => [row.clue_id, row]));
  const hintsByClue = new Map<string, typeof hints>();
  hints.forEach((hint) => {
    const list = hintsByClue.get(hint.clue_id) ?? [];
    list.push(hint);
    hintsByClue.set(hint.clue_id, list);
  });

  const origin = new URL(request.url).origin;
  const lines: string[] = [];

  clues.forEach((clue) => {
    const secret = secretsMap.get(clue.id);
    const requiresUnlock = secret?.requires_unlock !== false;
    const requiresArtifact = secret?.requires_artifact !== false;
    let password = "[none]";
    if (requiresUnlock) {
      if (secret?.password_ciphertext) {
        try {
          password = decryptSecret(secret.password_ciphertext);
        } catch {
          password = "[decrypt failed]";
        }
      } else {
        password = "[stored (hashed)]";
      }
    }

    let tokenValue = "";
    const tokenRow = tokenMap.get(clue.id);
    if (tokenRow?.token_ciphertext) {
      try {
        tokenValue = decryptSecret(tokenRow.token_ciphertext);
      } catch {
        tokenValue = "";
      }
    }
    const qrUrl = tokenValue
      ? `${origin}/experience?step=${clue.clue_index}&unlock=1&source=qr&token=${encodeURIComponent(
          tokenValue
        )}`
      : `${origin}/experience?step=${clue.clue_index}&unlock=1&source=qr`;

    lines.push(`${clue.label || `Clue ${clue.clue_index}`}`);
    lines.push(`Title: ${clue.title}`);
    lines.push(`Reward: ${clue.reward}`);
    lines.push(`Final: ${clue.is_final ? "Yes" : "No"}`);
    lines.push(`QR required: ${requiresArtifact ? "Yes" : "No"}`);
    lines.push(`QR URL: ${qrUrl}`);
    lines.push(`Lock required: ${requiresUnlock ? "Yes" : "No"}`);
    lines.push(`Password: ${password}`);
    lines.push(`Latitude: ${secret?.lat ?? "—"}`);
    lines.push(`Longitude: ${secret?.lng ?? "—"}`);
    lines.push(`Radius (meters): ${secret?.radius_meters ?? "—"}`);
    lines.push("Hints:");
    const clueHints = hintsByClue.get(clue.id) ?? [];
    if (clueHints.length === 0) {
      lines.push("  - None");
    } else {
      clueHints.forEach((hint) => {
        lines.push(`  - Hint ${hint.sort_order}: (${hint.cost} credits) ${hint.text}`);
      });
    }
    lines.push("");
  });

  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": "attachment; filename=clue-export.txt",
    },
  });
}
