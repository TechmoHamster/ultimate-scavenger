"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { steps } from "@/lib/steps";
import { ensureState, resetState, saveState, type PlayerState } from "@/lib/storage";
import MenuButton from "@/components/menu-button";
import { useProfile } from "@/lib/profile";
import { useDemoSettings } from "@/lib/demo";
import { usePlayerProgress } from "@/lib/player-progress";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useClues, toDefaultClues } from "@/lib/clues";

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [sessionExists, setSessionExists] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [cooldownRemainingMs, setCooldownRemainingMs] = useState(0);
  const { user, profile, loading } = useProfile();
  const progress = usePlayerProgress(user);
  const { clues } = useClues();
  const isAdmin = profile?.role === "admin";
  const { demoMode, demoUi, playerView, toggleDemo, togglePlayerView } = useDemoSettings(
    Boolean(isAdmin)
  );

  useEffect(() => {
    let mounted = true;
    const checkSession = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      const hasSession = Boolean(data.session);
      const hasCookieSession =
        typeof document !== "undefined" && document.cookie.includes("psh_session=1");
      const hasLocalStorageSession =
        typeof window !== "undefined" &&
        Object.keys(window.localStorage).some(
          (key) => key.startsWith("sb-") && key.endsWith("-auth-token")
        );
      setSessionExists(hasSession);
      setAuthChecked(true);
      if (!hasSession && !hasCookieSession && !hasLocalStorageSession && !user && !loading) {
        router.replace("/auth/name");
      }
    };
    checkSession();
    return () => {
      mounted = false;
    };
  }, [user, loading, router]);

  useEffect(() => {
    const existing = ensureState(steps);
    setState(existing);
    setName(profile?.full_name ?? existing.name ?? "");
    setEmail(user?.email ?? existing.email ?? "");
  }, [profile, user]);

  useEffect(() => {
    if (!user || !progress.state) return;
    setState(progress.state);
  }, [user, progress.state]);

  const completedCount =
    progress.state?.completedStepIds.length ?? state?.completedStepIds.length ?? 0;
  const isAuthenticated = Boolean(user) || (authChecked && sessionExists);
  const isProfileLoading = Boolean(user) && (loading || progress.loading);
  const displayName = isProfileLoading
    ? "Loading profile..."
    : profile?.full_name || progress.state?.name || state?.name || "Awaiting account";
  const currentStepId = progress.state?.lastStepId ?? state?.lastStepId ?? 0;
  const completionTimes =
    progress.state?.completedStepTimes ?? state?.completedStepTimes ?? {};
  const trackerClues = clues.length ? clues : toDefaultClues();
  const totalClues = trackerClues.length;
  const currentStep =
    trackerClues.find((clue) => clue.clue_index === currentStepId) ?? trackerClues[0];
  const cooldownEnabled = Boolean(currentStep?.cooldown_enabled);
  const cooldownMinutes = Math.max(0, currentStep?.cooldown_minutes ?? 0);
  const previousCompletionAt =
    currentStepId > 0 ? completionTimes[currentStepId - 1] : null;
  const cooldownEndsAt = useMemo(() => {
    if (!cooldownEnabled || cooldownMinutes <= 0) return null;
    if (!previousCompletionAt) return null;
    const base = new Date(previousCompletionAt).getTime();
    if (Number.isNaN(base)) return null;
    return base + cooldownMinutes * 60 * 1000;
  }, [cooldownEnabled, cooldownMinutes, previousCompletionAt]);
  const cooldownActive = cooldownRemainingMs > 0;
  const hintsUsed = Object.values(progress.state?.purchasedHints ?? {}).reduce(
    (acc, hintIds) => acc + hintIds.length,
    0
  );
  const nextReward = currentStep?.reward ?? 0;

  const canContinue = Boolean(name && email);

  const handleStart = () => {
    if (!name || !email) return;
    const updated: PlayerState = {
      ...(state ?? ensureState(steps)),
      name,
      username: state?.username ?? "",
      email,
      wallet: demoMode ? 9999 : state?.wallet && state.wallet > 0 ? state.wallet : 20,
      lastStepId: currentStepId ?? 0,
    };
    saveState(updated);
    router.push(`/experience?step=${updated.lastStepId ?? 0}`);
  };

  const handleReset = () => {
    resetState();
    const fresh = ensureState(steps);
    setState(fresh);
    setName("");
    setEmail("");
  };

  const heroStats = [
    { label: "Clues Completed", value: completedCount },
    { label: "Wallet", value: progress.state?.wallet ?? state?.wallet ?? 0 },
    { label: "Progress", value: `${totalClues ? Math.round((completedCount / totalClues) * 100) : 0}%` },
  ];

  const formatCooldown = (ms: number) => {
    const totalSeconds = Math.max(Math.ceil(ms / 1000), 0);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes}:${seconds.toString().padStart(2, "0")}`;
  };

  useEffect(() => {
    if (!cooldownEndsAt) {
      setCooldownRemainingMs(0);
      return;
    }
    const updateRemaining = () => {
      const remaining = cooldownEndsAt - Date.now();
      setCooldownRemainingMs(Math.max(remaining, 0));
    };
    updateRemaining();
    const interval = window.setInterval(updateRemaining, 1000);
    return () => window.clearInterval(interval);
  }, [cooldownEndsAt]);

  if (loading || !authChecked || !isAuthenticated) {
    return <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16" />;
  }

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <motion.div
        className="mx-auto flex w-full max-w-6xl flex-col gap-10"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {demoUi && (
                <span className="rounded-full border border-[var(--accent-emerald)]/40 px-3 py-1 text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                  Demo mode
                </span>
              )}
            </div>
            <MenuButton
              showCurrentClue={Boolean(user)}
              currentStepId={currentStepId ?? 0}
              showProfile={Boolean(user)}
              showHowToPlay
              adminControls={{
                enabled: Boolean(isAdmin),
                demoMode,
                playerView,
                onToggleDemo: toggleDemo,
                onTogglePlayerView: togglePlayerView,
              }}
            />
          </div>
          <h1 className="text-display text-4xl font-semibold text-[var(--text-primary)] md:text-6xl">
            Ultimate Scavenger Hunt
          </h1>
          <h2 className="text-xl text-[var(--text-muted)] md:text-3xl">
            A game of wits &amp; test of memory
          </h2>
          <p className="max-w-2xl text-lg text-[var(--text-muted)]">
            The ultimate scavenger hunt is comprised of riddles and fun puzzles. Can you complete all
            of them to reach the final destination?
          </p>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {!user ? (
            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Create Your Player Profile</h2>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                Start the hunt by creating an account. Progress saves automatically and syncs across
                refreshes.
              </p>
              <div className="mt-6 grid gap-4">
                <label className="grid gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">Player name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                    placeholder="player123"
                  />
                </label>
                <label className="grid gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                    placeholder="you@email.com"
                  />
                </label>
                <div className="flex flex-col gap-3 md:flex-row md:items-center">
                  <button
                    onClick={handleStart}
                    disabled={!name || !email}
                    className="glow-ring rounded-full bg-[var(--accent-gold)] px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {canContinue ? "Continue" : "Begin the Hunt"}
                  </button>
                  {demoUi && (
                    <button
                      onClick={handleReset}
                      className="rounded-full border border-[var(--stroke)] px-6 py-3 text-sm uppercase tracking-[0.2em] text-[var(--text-muted)] transition hover:border-[var(--accent-gold)] hover:text-white"
                    >
                      Reset progress
                    </button>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Welcome back</h2>
              <p className="mt-3 text-sm text-[var(--text-muted)]">
                {isProfileLoading
                  ? "Syncing your progress..."
                  : cooldownActive
                  ? `Your next clue unlocks in ${formatCooldown(cooldownRemainingMs)}.`
                  : "Your next clue is ready whenever you are."}
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <button
                  onClick={() => router.push("/experience/current")}
                  disabled={isProfileLoading}
                  className="glow-ring rounded-full bg-[var(--accent-gold)] px-6 py-3 text-sm font-semibold uppercase tracking-[0.2em] text-black disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Go to current clue
                </button>
                <button
                  onClick={() => router.push("/account")}
                  disabled={isProfileLoading}
                  className="rounded-full border border-[var(--stroke)] px-6 py-3 text-sm uppercase tracking-[0.2em] text-white disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Your Profile
                </button>
              </div>
            </div>
          )}

          <div className="glass-panel-strong rounded-3xl p-6 md:p-8">
            <h2 className="text-display text-2xl">Mission Status</h2>
            <p className="mt-3 text-sm text-[var(--text-muted)]">
              Track how far the journey has progressed, plus your in-game wallet balance.
            </p>
            <div className="mt-6 grid gap-4">
              <div className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                <div>
                  <p className="text-sm text-[var(--text-muted)]">Player</p>
                  <p className="text-lg font-semibold text-white">
                    {displayName}
                  </p>
                </div>
                <div className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                  {isProfileLoading ? "Syncing" : displayName === "Awaiting account" ? "Idle" : "Active"}
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {heroStats.map((stat) => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-[var(--stroke)] bg-black/40 px-4 py-4 text-center"
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-white">
                      {stat.label === "Wallet"
                        ? demoUi
                          ? "¢∞"
                          : `¢${stat.value}`
                        : stat.value}
                    </p>
                  </div>
                ))}
              </div>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Current clue
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {currentStep?.label ?? "Clue"} • {currentStep?.title ?? "—"}
                  </p>
                </div>
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Hints used
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {hintsUsed}
                  </p>
                </div>
                {cooldownActive && (
                  <div className="rounded-2xl border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/10 px-4 py-4 md:col-span-2">
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-gold)]">
                      Cooldown active
                    </p>
                    <p className="mt-2 text-sm font-semibold text-white">
                      Next clue unlocks in {formatCooldown(cooldownRemainingMs)}.
                    </p>
                    <p className="mt-2 text-xs text-[var(--text-muted)]">
                      We&apos;ll email you when it&apos;s ready.
                    </p>
                  </div>
                )}
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4 md:col-span-2">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Next reward
                  </p>
                  <p className="mt-2 text-sm font-semibold text-white">
                    {nextReward} credits
                  </p>
                </div>
              </div>

              <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                <p className="text-sm text-[var(--text-muted)]">Adventure roadmap</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {trackerClues.map((step) => (
                    <span
                      key={step.id ?? step.clue_index}
                      className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                        (progress.state?.completedStepIds ?? state?.completedStepIds ?? []).includes(
                          step.clue_index ?? step.id
                        )
                          ? "bg-[var(--accent-emerald)]/20 text-[var(--accent-emerald)]"
                          : "bg-black/40 text-[var(--text-muted)]"
                      }`}
                    >
                      {step.label}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>
      </motion.div>
    </div>
  );
}
