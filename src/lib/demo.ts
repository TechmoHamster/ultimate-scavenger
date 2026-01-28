"use client";

import { useEffect, useState } from "react";
import { DEFAULT_DEMO_MODE } from "@/lib/config";

const DEMO_KEY = "proposal-demo-mode";
const PLAYER_VIEW_KEY = "proposal-player-view";

const readFlag = (key: string, fallback = false) => {
  if (typeof window === "undefined") return fallback;
  const raw = window.localStorage.getItem(key);
  if (raw === null) return fallback;
  return raw === "true";
};

const writeFlag = (key: string, value: boolean) => {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, value ? "true" : "false");
};

export const useDemoSettings = (isAdmin: boolean) => {
  const [demoMode, setDemoMode] = useState(false);
  const [playerView, setPlayerView] = useState(false);

  useEffect(() => {
    if (!isAdmin) {
      setDemoMode(false);
      setPlayerView(false);
      return;
    }
    setDemoMode(readFlag(DEMO_KEY, DEFAULT_DEMO_MODE));
    setPlayerView(readFlag(PLAYER_VIEW_KEY, false));
  }, [isAdmin]);

  const toggleDemo = () => {
    if (!isAdmin) return;
    setDemoMode((prev) => {
      const next = !prev;
      writeFlag(DEMO_KEY, next);
      if (!next) {
        writeFlag(PLAYER_VIEW_KEY, false);
        setPlayerView(false);
      }
      return next;
    });
  };

  const togglePlayerView = () => {
    if (!isAdmin) return;
    setPlayerView((prev) => {
      const next = !prev;
      writeFlag(PLAYER_VIEW_KEY, next);
      return next;
    });
  };

  return {
    demoMode,
    playerView,
    demoUi: demoMode && !playerView,
    toggleDemo,
    togglePlayerView,
  };
};
