import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const unauthorized = () =>
  NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });

async function requireStaff(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error: NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 }),
    };
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: unauthorized() };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return { error: unauthorized() };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = profile?.role ?? "player";
  return { user: userData.user, role };
}

export async function GET(request: Request) {
  const { error, role } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const { data, error: listError } = await supabase
    .from("sms_clue_rules")
    .select("clue_index, enabled, template, updated_at")
    .order("clue_index", { ascending: true });

  if (listError) {
    const needsSchema =
      listError.message.includes("does not exist") ||
      listError.message.includes("relation") ||
      listError.code === "42P01";
    return NextResponse.json({
      ok: true,
      needsSchema,
      rules: [],
      hint: needsSchema ? "Run src/supabase/sms_settings.sql in Supabase SQL Editor." : listError.message,
    });
  }

  return NextResponse.json({ ok: true, rules: data ?? [] });
}

export async function PUT(request: Request) {
  const { error, role } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin") {
    return NextResponse.json({ ok: false, reason: "Admins only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    rules?: { clue_index: number; enabled: boolean; template?: string | null }[];
  };

  const rules = body.rules ?? [];
  const payload = rules
    .filter((row) => Number.isFinite(row.clue_index))
    .map((row) => ({
      clue_index: row.clue_index,
      enabled: Boolean(row.enabled),
      template: (row.template ?? "").trim() || null,
      updated_at: new Date().toISOString(),
    }));

  const { error: upsertError } = await supabase.from("sms_clue_rules").upsert(payload, {
    onConflict: "clue_index",
  });

  if (upsertError) {
    return NextResponse.json({ ok: false, reason: upsertError.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

