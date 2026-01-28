import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { hashPassword } from "@/lib/password.server";

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  if (profile?.role !== "admin") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const { data: secrets, error } = await supabase
    .from("clue_secrets")
    .select("id, password, password_hash");

  if (error) {
    return NextResponse.json({ ok: false, reason: error.message }, { status: 400 });
  }

  let upgraded = 0;
  for (const secret of secrets ?? []) {
    if (secret.password_hash || !secret.password) continue;
    const hashed = hashPassword(secret.password);
    await supabase
      .from("clue_secrets")
      .update({ password_hash: hashed, password: null })
      .eq("id", secret.id);
    upgraded += 1;
  }

  return NextResponse.json({ ok: true, upgraded });
}
