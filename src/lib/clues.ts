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
  requires_password?: boolean;
  requires_gps?: boolean;
  requires_artifact?: boolean;
  hints_enabled?: boolean;
  hint_limit?: number | null;
  cooldown_enabled?: boolean;
  cooldown_minutes?: number | null;
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
    requires_unlock: true,
    requires_password: true,
    requires_gps: true,
    requires_artifact: true,
    cooldown_enabled: false,
    cooldown_minutes: 0,
  }));

export const useClues = () => {
  const [clues, setClues] = useState<Clue[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchClues = async () => {
    try {
      const response = await fetch("/api/clues", { cache: "no-store" });
      const body = await response.json().catch(() => ({}));
      const data = body?.clues as Clue[] | undefined;
      if (!response.ok || !data || data.length === 0) {
        setClues(toDefaultClues());
        setLoading(false);
        return;
      }
      setClues(data);
    } catch {
      setClues(toDefaultClues());
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchClues();
  }, []);

  return { clues, setClues, loading, reload: fetchClues };
};
