import { useEffect, useState } from "react";

export type GameSettings = {
  requireGps: boolean;
  requirePassword: boolean;
  enableHints: boolean;
  allowReplay: boolean;
  showDemoHelper: boolean;
  startingWallet: number;
  maxHintCost: number;
  defaultRadius: number;
  autosaveDelay: number;
};

const defaultSettings: GameSettings = {
  requireGps: true,
  requirePassword: true,
  enableHints: true,
  allowReplay: false,
  showDemoHelper: false,
  startingWallet: 20,
  maxHintCost: 14,
  defaultRadius: 120,
  autosaveDelay: 2,
};

export function useGameSettings() {
  const [settings, setSettings] = useState<GameSettings>(defaultSettings);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      try {
        const response = await fetch("/api/game-settings");
        const payload = await response.json();
        if (!active) return;
        if (payload?.settings) {
          setSettings({
            requireGps: payload.settings.require_gps ?? defaultSettings.requireGps,
            requirePassword: payload.settings.require_password ?? defaultSettings.requirePassword,
            enableHints: payload.settings.enable_hints ?? defaultSettings.enableHints,
            allowReplay: payload.settings.allow_replay ?? defaultSettings.allowReplay,
            showDemoHelper: payload.settings.show_demo_helper ?? defaultSettings.showDemoHelper,
            startingWallet: payload.settings.starting_wallet ?? defaultSettings.startingWallet,
            maxHintCost: payload.settings.max_hint_cost ?? defaultSettings.maxHintCost,
            defaultRadius: payload.settings.default_radius ?? defaultSettings.defaultRadius,
            autosaveDelay: payload.settings.autosave_delay ?? defaultSettings.autosaveDelay,
          });
        }
      } catch {
        if (active) setSettings(defaultSettings);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, []);

  return { settings, loading };
}
