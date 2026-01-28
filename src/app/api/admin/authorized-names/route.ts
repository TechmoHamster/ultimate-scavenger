import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const unauthorized = () =>
  NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });

async function requireAdmin(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 }) };
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

  if (profile?.role !== "admin") {
    return {
      error: NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 }),
    };
  }

  return { user: userData.user };
}

export async function GET(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const { data, error: selectError } = await supabase
    .from("authorized_names")
    .select("id, display_name, normalized_name, created_at")
    .order("created_at", { ascending: false });

  if (selectError) {
    return NextResponse.json({ ok: false, reason: selectError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, names: data ?? [] });
}

export async function POST(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const body = (await request.json()) as { display_name?: string };
  const displayName = body?.display_name?.trim();
  if (!displayName) {
    return NextResponse.json({ ok: false, reason: "Missing name" }, { status: 400 });
  }

  const normalized = displayName.toLowerCase().replace(/\s+/g, " ").trim();
  const { error: insertError } = await supabase.from("authorized_names").insert({
    display_name: displayName,
    normalized_name: normalized,
  });

  if (insertError) {
    return NextResponse.json({ ok: false, reason: insertError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { error } = await requireAdmin(request);
  if (error) return error;

  const body = (await request.json()) as { id?: string };
  if (!body?.id) {
    return NextResponse.json({ ok: false, reason: "Missing id" }, { status: 400 });
  }

  const { error: deleteError } = await supabase
    .from("authorized_names")
    .delete()
    .eq("id", body.id);

  if (deleteError) {
    return NextResponse.json({ ok: false, reason: deleteError.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
