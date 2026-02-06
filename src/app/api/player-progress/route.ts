import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

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

  const userId = userData.user.id;

  let { data: playerState } = await supabase
    .from("player_state")
    .select("current_clue_index, wallet_balance")
    .eq("player_id", userId)
    .maybeSingle();

  if (!playerState) {
    await supabase.from("player_state").insert({
      player_id: userId,
      current_clue_index: 0,
      wallet_balance: 20,
    });
    playerState = { current_clue_index: 0, wallet_balance: 20 };
  }

  const { data: completions } = await supabase
    .from("step_completions")
    .select("clue_index")
    .eq("player_id", userId);

  const { data: hints } = await supabase
    .from("hint_purchases")
    .select("clue_index, hint_order")
    .eq("player_id", userId);

  const completedIndexes = (completions ?? []).map((row) => row.clue_index);
  const maxCompleted = completedIndexes.length ? Math.max(...completedIndexes) : -1;
  const desiredCurrent = Math.max(maxCompleted + 1, 0);

  if (playerState && playerState.current_clue_index !== desiredCurrent) {
    await supabase
      .from("player_state")
      .update({ current_clue_index: desiredCurrent })
      .eq("player_id", userId);
    playerState = { ...playerState, current_clue_index: desiredCurrent };
  }

  return NextResponse.json({
    ok: true,
    playerState,
    completions: completions ?? [],
    hints: hints ?? [],
  });
}
