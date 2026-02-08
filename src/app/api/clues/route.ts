import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

type ClueRow = {
  id: string;
  clue_index: number;
  label: string;
  title: string;
  clue: string;
  reminder: string | null;
  reward: number;
  is_final: boolean;
  hints_enabled: boolean | null;
  hint_limit: number | null;
  cooldown_enabled: boolean | null;
  cooldown_minutes: number | null;
  hints?: { id: string; sort_order: number; cost: number; text: string }[];
  secrets?: { requires_unlock: boolean | null }[] | { requires_unlock: boolean | null } | null;
};

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 });
  }

  const { data, error } = await supabase
    .from("clues")
    .select(
      [
        "id",
        "clue_index",
        "label",
        "title",
        "clue",
        "reminder",
        "reward",
        "is_final",
        "hints_enabled",
        "hint_limit",
        "cooldown_enabled",
        "cooldown_minutes",
        "hints:clue_hints(id, sort_order, cost, text)",
        "secrets:clue_secrets(requires_unlock)",
      ].join(",")
    )
    .order("clue_index", { ascending: true })
    .order("sort_order", { foreignTable: "clue_hints", ascending: true });

  if (error || !data) {
    return NextResponse.json({ ok: false, reason: error?.message ?? "No clues found" }, { status: 500 });
  }

  const rows = Array.isArray(data) ? (data as unknown as ClueRow[]) : [];
  const normalized = rows.map((row) => {
    const hints = (row.hints ?? []).sort(
      (a: { sort_order: number }, b: { sort_order: number }) => a.sort_order - b.sort_order
    );
    const requiresUnlock = Array.isArray(row.secrets)
      ? row.secrets[0]?.requires_unlock ?? true
      : row.secrets?.requires_unlock ?? true;
    return {
      id: row.id,
      clue_index: row.clue_index,
      label: row.label,
      title: row.title,
      clue: row.clue,
      reminder: row.reminder,
      reward: row.reward,
      is_final: row.is_final,
      hints_enabled: row.hints_enabled,
      hint_limit: row.hint_limit,
      cooldown_enabled: row.cooldown_enabled,
      cooldown_minutes: row.cooldown_minutes,
      hints,
      requires_unlock: requiresUnlock,
    };
  });

  return NextResponse.json({ ok: true, clues: normalized });
}
