import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const normalizeName = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string };
    const rawName = body?.name ?? "";
    const normalized = normalizeName(rawName);

    if (!normalized) {
      return NextResponse.json({ allowed: false }, { status: 400 });
    }

    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ allowed: false }, { status: 500 });
    }

    const { data, error } = await supabase
      .from("authorized_names")
      .select("display_name")
      .eq("normalized_name", normalized)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ allowed: false });
    }

    const displayName = data.display_name;
    const lookupName = rawName.trim();

    const queryByName = async (name: string) => {
      if (!name) return null;
      const { data: match } = await supabase
        .from("profiles")
        .select("id")
        .or(`full_name.ilike.%${name}%,username.ilike.%${name}%`)
        .maybeSingle();
      return match;
    };

    const match =
      (await queryByName(lookupName)) ||
      (displayName && displayName !== lookupName ? await queryByName(displayName) : null);

    return NextResponse.json({
      allowed: true,
      displayName,
      hasAccount: Boolean(match?.id),
    });
  } catch {
    return NextResponse.json({ allowed: false }, { status: 500 });
  }
}
