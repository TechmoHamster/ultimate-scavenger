import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

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

  const payload = (await request.json().catch(() => ({}))) as { skipped?: boolean };
  const skipped = Boolean(payload.skipped);

  const { error } = await supabase
    .from("profiles")
    .update({
      tutorial_completed: true,
      tutorial_completed_at: new Date().toISOString(),
      tutorial_skipped: skipped,
    })
    .eq("id", userData.user.id);

  if (error) {
    return NextResponse.json(
      { ok: false, reason: error.message, details: error.details ?? null },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, skipped });
}
