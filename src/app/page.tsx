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

export default function Home() {
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const { user, profile, loading } = useProfile();
  const progress = usePlayerProgress(user);
  const isAdmin = profile?.role === "admin";
  const { demoMode, demoUi, playerView, toggleDemo, togglePlayerView } = useDemoSettings(
    Boolean(isAdmin)
  );

  useEffect(() => {
    if (!loading && !user) {
      if (typeof document !== "undefined" && document.cookie.includes("psh_session=1")) {
        return;
      }
      const checkSession = async () => {
        const supabase = createSupabaseBrowserClient();
        const { data } = await supabase.auth.getSession();
        if (!data.session) {
          router.replace("/auth/name");
        }
      };
      checkSession();
      return;
    }
    const existing = ensureState(steps);
    setState(existing);
    setName(profile?.full_name ?? existing.name ?? "");
    setEmail(user?.email ?? existing.email ?? "");
  }, [loading, user, profile, router]);

  useEffect(() => {
    if (!user || !progress.state) return;
    setState(progress.state);
  }, [user, progress.state]);

  const totalSteps = steps.length;
  const completedCount =
    progress.state?.completedStepIds.length ?? state?.completedStepIds.length ?? 0;
  const progressPercent = totalSteps ? Math.round((completedCount / totalSteps) * 100) : 0;
  const isProfileLoading = Boolean(user) && (loading || progress.loading);
  const displayName = isProfileLoading
    ? "Loading profile..."
    : profile?.full_name || progress.state?.name || state?.name || "Awaiting account";
  const completedSteps = progress.state?.completedStepIds ?? state?.completedStepIds ?? [];
  const currentStepId = progress.state?.lastStepId ?? state?.lastStepId ?? 0;
  const currentStep = steps[currentStepId] ?? steps[0];
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
    { label: "Progress", value: `${progressPercent}%` },
  ];

  if (loading || !user) {
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
                  {steps.map((step) => (
                    <span
                      key={step.id}
                      className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.2em] ${
                        (progress.state?.completedStepIds ?? state?.completedStepIds ?? []).includes(
                          step.id
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
