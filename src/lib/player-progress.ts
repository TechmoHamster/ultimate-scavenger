"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { PlayerState } from "@/lib/storage";

export type PlayerProgress = {
  state: PlayerState | null;
  loading: boolean;
  refresh: () => Promise<void>;
};

export const usePlayerProgress = (user: User | null) => {
  const [state, setState] = useState<PlayerState | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = async () => {
    if (!user) {
      setLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) {
      setLoading(false);
      return;
    }

    const response = await fetch("/api/player-progress", {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      setLoading(false);
      return;
    }

    const body = (await response.json()) as {
      playerState?: { current_clue_index: number; wallet_balance: number; updated_at?: string | null };
      completions?: { clue_index: number; completed_at?: string | null }[];
      hints?: { clue_index: number; hint_order: number }[];
      artifactClaims?: { clue_index: number }[];
    };

    const completed = (body.completions ?? []).map((row) => row.clue_index);
    const completionTimes: Record<number, string> = {};
    (body.completions ?? []).forEach((row) => {
      if (row.completed_at) {
        completionTimes[row.clue_index] = row.completed_at;
      }
    });
    const purchased: Record<number, string[]> = {};
    (body.hints ?? []).forEach((row) => {
      if (!purchased[row.clue_index]) purchased[row.clue_index] = [];
      purchased[row.clue_index].push(String(row.hint_order));
    });
    const claimedArtifacts = (body.artifactClaims ?? []).map((row) => row.clue_index);

    setState({
      name: user.user_metadata?.full_name ?? "",
      username: "",
      email: user.email ?? "",
      wallet: body.playerState?.wallet_balance ?? 20,
      completedStepIds: completed,
      completedStepTimes: completionTimes,
      purchasedHints: purchased,
      artifactClaims: claimedArtifacts,
      lastStepId: body.playerState?.current_clue_index ?? 0,
      createdAt: new Date().toISOString(),
      updatedAt: body.playerState?.updated_at ?? new Date().toISOString(),
    });

    setLoading(false);
  };

  useEffect(() => {
    refresh();
  }, [user]);

  return { state, setState, loading, refresh } as PlayerProgress & {
    setState: (state: PlayerState) => void;
  };
};

export const recordCompletion = async (
  user: User,
  clueIndex: number,
  reward: number,
  distance: number | null,
  coords?: { lat: number; lng: number }
) => {
  const supabase = createSupabaseBrowserClient();
  await supabase.from("step_completions").insert({
    player_id: user.id,
    clue_index: clueIndex,
    geo_lat: coords?.lat ?? null,
    geo_lng: coords?.lng ?? null,
    distance_meters: distance,
  });

  let { data: playerState } = await supabase
    .from("player_state")
    .select("wallet_balance")
    .eq("player_id", user.id)
    .maybeSingle();

  if (!playerState) {
    playerState = { wallet_balance: 0 } as { wallet_balance: number };
  }

  const nextWallet = (playerState.wallet_balance ?? 0) + reward;

  await supabase
    .from("player_state")
    .upsert(
      { player_id: user.id, wallet_balance: nextWallet, current_clue_index: clueIndex + 1 },
      { onConflict: "player_id" }
    );

  return nextWallet;
};

export const recordHintPurchase = async (
  user: User,
  clueIndex: number,
  hintOrder: number,
  cost: number
) => {
  const supabase = createSupabaseBrowserClient();
  await supabase.from("hint_purchases").insert({
    player_id: user.id,
    clue_index: clueIndex,
    hint_order: hintOrder,
    cost,
  });

  const { data: playerState } = await supabase
    .from("player_state")
    .select("wallet_balance")
    .eq("player_id", user.id)
    .maybeSingle();

  const nextWallet = (playerState?.wallet_balance ?? 0) - cost;

  await supabase
    .from("player_state")
    .update({ wallet_balance: nextWallet })
    .eq("player_id", user.id);

  return nextWallet;
};
