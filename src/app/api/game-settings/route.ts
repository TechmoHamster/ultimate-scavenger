import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const defaultSettings = {
  require_gps: true,
  require_password: true,
  enable_hints: true,
  allow_replay: false,
  show_demo_helper: false,
  starting_wallet: 20,
  max_hint_cost: 14,
  default_radius: 120,
  autosave_delay: 2,
};

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: true, settings: defaultSettings });
  }

  const { data, error } = await supabase
    .from("game_settings")
    .select(
      [
        "require_gps",
        "require_password",
        "enable_hints",
        "allow_replay",
        "show_demo_helper",
        "starting_wallet",
        "max_hint_cost",
        "default_radius",
        "autosave_delay",
      ].join(",")
    )
    .eq("id", 1)
    .maybeSingle<Partial<typeof defaultSettings>>();

  if (error || !data) {
    return NextResponse.json({ ok: true, settings: defaultSettings });
  }

  const merged = { ...defaultSettings, ...(data ?? {}) };
  return NextResponse.json({ ok: true, settings: merged });
}
