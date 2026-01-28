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

  const url = new URL(request.url);
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get("limit") ?? "25")));

  const { data, error: listError } = await supabase
    .from("sms_logs")
    .select("id, sent_at, is_demo, to_number_masked, from_number_masked, message_preview, status, twilio_sid, error")
    .order("sent_at", { ascending: false })
    .limit(limit);

  if (listError) {
    const needsSchema =
      listError.message.includes("does not exist") ||
      listError.message.includes("relation") ||
      listError.code === "42P01";
    return NextResponse.json(
      {
        ok: true,
        needsSchema,
        logs: [],
        hint: needsSchema ? "Run src/supabase/sms_settings.sql in Supabase SQL Editor." : listError.message,
      },
      { status: 200 }
    );
  }

  return NextResponse.json({ ok: true, logs: data ?? [] });
}
