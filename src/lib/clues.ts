"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { steps } from "@/lib/steps";

export type ClueHint = {
  id: string;
  sort_order: number;
  cost: number;
  text: string;
};

export type Clue = {
  id: string;
  clue_index: number;
  label: string;
  title: string;
  clue: string;
  reminder?: string | null;
  reward: number;
  is_final: boolean;
  hints: ClueHint[];
  requires_unlock?: boolean;
  hints_enabled?: boolean;
  hint_limit?: number | null;
};

export const toDefaultClues = (): Clue[] =>
  steps.map((step) => ({
    id: `local-${step.id}`,
    clue_index: step.id,
    label: step.label,
    title: step.title,
    clue: step.clue,
    reminder: null,
    reward: step.reward,
    is_final: Boolean(step.isFinal),
    hints: step.hints.map((hint, index) => ({
      id: `local-${step.id}-${hint.id}`,
      sort_order: index + 1,
      cost: hint.cost,
      text: hint.text,
    })),
    hints_enabled: true,
    hint_limit: step.hints.length,
  }));

export const useClues = () => {
  const [clues, setClues] = useState<Clue[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClues = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from("clues")
      .select(
        "id, clue_index, label, title, clue, reminder, reward, is_final, hints_enabled, hint_limit, hints:clue_hints(id, sort_order, cost, text)"
      )
      .order("clue_index", { ascending: true })
      .order("sort_order", { foreignTable: "clue_hints", ascending: true });

    if (error || !data || data.length === 0) {
      setClues(toDefaultClues());
      setLoading(false);
      return;
    }

    const normalized = data.map((row) => ({
      ...row,
      hints: (row.hints ?? []).sort((a, b) => a.sort_order - b.sort_order),
    })) as Clue[];

    setClues(normalized);
    setLoading(false);
  };

  useEffect(() => {
    fetchClues();
  }, []);

  return { clues, setClues, loading, reload: fetchClues };
};
