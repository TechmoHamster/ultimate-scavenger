import type { Step } from "./steps";

export type PlayerState = {
  name: string;
  username?: string;
  email: string;
  wallet: number;
  completedStepIds: number[];
  purchasedHints: Record<number, string[]>;
  lastStepId: number;
  createdAt: string;
  updatedAt: string;
};

const STORAGE_KEY = "proposal-hunt-state";

export const defaultState = (): PlayerState => ({
  name: "",
  username: "",
  email: "",
  wallet: 0,
  completedStepIds: [],
  purchasedHints: {},
  lastStepId: 0,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
});

export const loadState = (): PlayerState | null => {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PlayerState;
  } catch {
    return null;
  }
};

export const saveState = (state: PlayerState) => {
  if (typeof window === "undefined") return;
  const payload = {
    ...state,
    updatedAt: new Date().toISOString(),
  };
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
};

export const resetState = () => {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
};

export const ensureState = (steps: Step[]): PlayerState => {
  const existing = loadState();
  if (existing) return existing;
  return {
    ...defaultState(),
    wallet: 0,
  };
};
