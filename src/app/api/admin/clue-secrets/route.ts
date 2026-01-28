import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "@/lib/password.server";
import { decryptSecret, encryptSecret } from "@/lib/crypto.server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

type Payload = {
  clueId?: string;
  password?: string | null;
  requires_unlock?: boolean;
  radius_meters?: number | null;
  lat?: number | null;
  lng?: number | null;
  clearPassword?: boolean;
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

  const body = (await request.json()) as Payload;
  if (!body?.clueId) {
    return NextResponse.json({ ok: false, reason: "Missing clue" }, { status: 400 });
  }

  const update: Record<string, unknown> = {
    requires_unlock: body.requires_unlock ?? true,
    radius_meters: body.radius_meters ?? null,
    lat: body.lat ?? null,
    lng: body.lng ?? null,
  };

  if (body.clearPassword) {
    update.password_hash = null;
    update.password = null;
    update.password_ciphertext = null;
  } else if (typeof body.password === "string" && body.password.trim().length > 0) {
    update.password_ciphertext = encryptSecret(body.password);
    update.password_hash = hashPassword(body.password);
    update.password = null;
  }

  const { data: existing } = await supabase
    .from("clue_secrets")
    .select("id")
    .eq("clue_id", body.clueId)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("clue_secrets").update(update).eq("id", existing.id);
    if (error) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    }
  } else {
    const { error } = await supabase.from("clue_secrets").insert({
      clue_id: body.clueId,
      ...update,
    });
    if (error) {
      return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  if (url.searchParams.get("export") !== "1") {
    return NextResponse.json({ ok: false, reason: "Not found" }, { status: 404 });
  }

  const { data: clues } = await supabase
    .from("clues")
    .select("id, clue_index, label, title, clue, reward, is_final")
    .order("clue_index", { ascending: true });

  const { data: secrets } = await supabase
    .from("clue_secrets")
    .select("clue_id, password_ciphertext, radius_meters, lat, lng, requires_unlock");

  const { data: hints } = await supabase
    .from("clue_hints")
    .select("clue_id, sort_order, cost, text")
    .order("sort_order", { ascending: true });

  const secretsMap = new Map(
    (secrets ?? []).map((row) => [row.clue_id, row])
  );
  const hintsByClue = new Map<string, typeof hints>();
  (hints ?? []).forEach((hint) => {
    const list = hintsByClue.get(hint.clue_id) ?? [];
    list.push(hint);
    hintsByClue.set(hint.clue_id, list);
  });

  const origin = url.origin;
  const lines: string[] = [];

  (clues ?? []).forEach((clue) => {
    const secret = secretsMap.get(clue.id);
    const requiresUnlock = secret?.requires_unlock !== false;
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

    lines.push(`${clue.label || `Clue ${clue.clue_index}`}`);
    lines.push(`Title: ${clue.title}`);
    lines.push(`Reward: ${clue.reward}`);
    lines.push(`Final: ${clue.is_final ? "Yes" : "No"}`);
    lines.push(`QR URL: ${origin}/experience?step=${clue.clue_index}&unlock=1&source=qr`);
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
