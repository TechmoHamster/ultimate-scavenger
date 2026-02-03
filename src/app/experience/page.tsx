"use client";

import { motion } from "framer-motion";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import confetti from "canvas-confetti";
import { DEMO_COORDS, DEMO_GEO_OVERRIDE } from "@/lib/config";
import { FINAL_DESTINATION, steps } from "@/lib/steps";
import { ensureState, saveState, type PlayerState } from "@/lib/storage";
import { useDemoSettings } from "@/lib/demo";
import { useProfile } from "@/lib/profile";
import MenuButton from "@/components/menu-button";
import { useClues, type Clue, toDefaultClues } from "@/lib/clues";
import { usePlayerProgress, recordCompletion, recordHintPurchase } from "@/lib/player-progress";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const formatDistance = (distance: number | null, ready: boolean) => {
  if (distance === null) return ready ? "Location captured" : "Awaiting location";
  if (distance >= 1000) return `${(distance / 1000).toFixed(2)} km away`;
  return `${Math.round(distance)} m away`;
};

function ExperienceContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user, profile, loading } = useProfile();
  const isAdmin = profile?.role === "admin";
  const { demoMode, demoUi, toggleDemo, togglePlayerView, playerView } = useDemoSettings(
    Boolean(isAdmin)
  );
  const shouldPersistProgress = !demoMode;
  const [state, setState] = useState<PlayerState | null>(null);
  const [stepId, setStepId] = useState(0);
  const [password, setPassword] = useState("");
  const [showUnlock, setShowUnlock] = useState(false);
  const [geoStatus, setGeoStatus] = useState<"idle" | "pending" | "ready" | "error">("idle");
  const [distance, setDistance] = useState<number | null>(null);
  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [statusNote, setStatusNote] = useState<string | null>(null);
  const [celebrationMessage, setCelebrationMessage] = useState<string | null>(null);

  const { clues } = useClues();
  const progress = usePlayerProgress(user);

  const isGateLoading = (loading && !user) || (user && (progress.loading || !progress.state));

  useEffect(() => {
    if (user) return;
    const existing = ensureState(steps);
    setState(existing);
  }, [user]);

  useEffect(() => {
    if (progress.state) {
      setState(progress.state);
    }
  }, [progress.state]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/name");
    }
  }, [loading, user, router]);

  useEffect(() => {
    if (profile?.is_disabled) {
      router.replace("/auth/name");
    }
  }, [profile, router]);

  useEffect(() => {
    if (loading || !user || !profile) return;
    if (profile.role !== "admin" && profile.tutorial_completed === false) {
      router.replace("/tutorial");
    }
  }, [loading, user, profile, router]);


  const trackerClues = useMemo(() => (clues.length ? clues : toDefaultClues()), [clues]);

  useEffect(() => {
    if (progress.loading) return;
    if (user && !progress.state) return;
    const rawStep = Number(searchParams.get("step"));
    const hasStepParam = searchParams.has("step");
    const maxIndex = Math.max(trackerClues.length - 1, 0);
    const progressStep = progress.state?.lastStepId ?? 0;
    const completedIds = progress.state?.completedStepIds ?? [];
    const maxCompleted = completedIds.length ? Math.max(...completedIds) : -1;
    const effectiveProgressStep = Math.max(progressStep, maxCompleted + 1);
    const requestedStep =
      hasStepParam && Number.isFinite(rawStep) && rawStep >= 0 ? rawStep : effectiveProgressStep;

    const limitedStep =
      !demoMode && requestedStep > effectiveProgressStep ? effectiveProgressStep : requestedStep;

    if (hasStepParam && requestedStep > effectiveProgressStep && !demoMode) {
      setStatusNote("That clue is locked. Returning you to your current clue.");
      const timer = window.setTimeout(() => {
        router.replace(`/experience?step=${effectiveProgressStep}`);
      }, 900);
      return () => window.clearTimeout(timer);
    } else {
      setStatusNote(null);
    }

    const unlockParam = searchParams.get("unlock");
    const sourceParam = searchParams.get("source");
    const shouldUnlock =
      hasStepParam &&
      (unlockParam === "1" ||
        unlockParam === "true" ||
        unlockParam === "yes" ||
        sourceParam === "qr");
    setStepId(Math.min(Math.max(limitedStep, 0), maxIndex));
    setPassword("");
    setShowUnlock(shouldUnlock);
    setGeoStatus("idle");
    setDistance(null);
    setCoords(null);
  }, [
    searchParams,
    progress.state?.lastStepId,
    state?.lastStepId,
    progress.state?.completedStepIds,
    trackerClues.length,
    demoMode,
    isAdmin,
    progress.loading,
    user,
  ]);

  useEffect(() => {
    if (demoMode) return;
    const currentStep = effectiveProgressStep;
    if (stepId > currentStep) {
      router.replace(`/experience?step=${currentStep}`);
    }
  }, [demoMode, effectiveProgressStep, stepId, router]);

  const completedIds = progress.state?.completedStepIds ?? [];
  const maxCompleted = completedIds.length ? Math.max(...completedIds) : -1;
  const progressStep = progress.state?.lastStepId ?? 0;
  const effectiveProgressStep = Math.max(progressStep, maxCompleted + 1);

  const step: Clue | undefined = useMemo(
    () => trackerClues.find((clue) => clue.clue_index === stepId),
    [trackerClues, stepId]
  );
  const isCompleted = completedIds.includes(stepId);
  const purchasedHints = state?.purchasedHints?.[stepId] ?? [];
  const nextStepId = Math.min(stepId + 1, Math.max(trackerClues.length - 1, 0));
  const requiresUnlock = step ? step.clue_index !== 0 : false;

  const handleLocationCheck = () => {
    setGeoStatus("pending");
    if (demoMode && !DEMO_GEO_OVERRIDE) {
      setCoords(null);
      setGeoStatus("ready");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const nextCoords = demoMode && DEMO_GEO_OVERRIDE
          ? { lat: DEMO_COORDS.lat, lng: DEMO_COORDS.lng }
          : { lat: position.coords.latitude, lng: position.coords.longitude };
        setCoords(nextCoords);
        setGeoStatus("ready");
      },
      () => {
        setGeoStatus("error");
        setStatusNote("Unable to fetch location. Please enable GPS and try again.");
      },
      { enableHighAccuracy: true }
    );
  };

  const handleCompleteStep = async () => {
    if (!state) return;

    if (requiresUnlock && step) {
      const supabase = createSupabaseBrowserClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setStatusNote("Please sign in again to continue.");
        return;
      }

      const payload = {
        clueIndex: step.clue_index,
        password,
        coords: coords ?? (demoMode && DEMO_GEO_OVERRIDE ? DEMO_COORDS : null),
        allowMissingGeo: demoMode && !DEMO_GEO_OVERRIDE,
      };

      const response = await fetch("/api/validate-clue", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();
      if (!response.ok || !result.ok) {
        if (typeof result?.distance === "number") {
          setDistance(result.distance);
        }
        setStatusNote(
          result?.reason === "Missing GPS"
            ? "Please verify your GPS before unlocking."
            : result?.reason === "Invalid password"
            ? "Password incorrect. Check the name of the location and try again."
            : result?.reason === "Out of range"
            ? "You are outside the GPS radius. Move closer and retry."
            : "Unable to unlock this clue."
        );
        return;
      }

      if (typeof result?.distance === "number") {
        setDistance(result.distance);
      }
    }

    const updated: PlayerState = {
      ...state,
      completedStepIds: state.completedStepIds.includes(stepId)
        ? state.completedStepIds
        : [...state.completedStepIds, stepId],
      wallet: step && step.reward > 0 ? state.wallet + step.reward : state.wallet,
      lastStepId: nextStepId,
    };

    if (!user) {
      saveState(updated);
    }
    setState(updated);

    if (user && step && shouldPersistProgress) {
      recordCompletion(
        user,
        stepId,
        step.reward,
        distance,
        coords ?? undefined
      ).then(() => progress.refresh());
    }

    if (step?.is_final) {
      router.push("/final");
      return;
    }

    const encouragement =
      nextStepId >= steps.length - 1
        ? "You are almost there!"
        : nextStepId >= steps.length - 2
        ? "So close — keep going!"
        : "Great job!";
    setCelebrationMessage(encouragement);
    confetti({
      particleCount: 80,
      spread: 70,
      origin: { y: 0.6 },
      colors: ["#ffffa2", "#87ae73", "#7593af", "#f3b3a6"],
    });
    setTimeout(() => {
      setCelebrationMessage(null);
      router.push(`/experience?step=${nextStepId}`);
    }, 1800);
  };

  const handleBuyHint = (hintId: string, hintOrder: number, cost: number) => {
    if (!state) return;
    if (!demoMode && state.wallet < cost) {
      setStatusNote("Not enough currency. Complete a step to earn more.");
      return;
    }
    const existing = state.purchasedHints?.[stepId] ?? [];
    if (existing.includes(String(hintOrder))) return;

    const updated: PlayerState = {
      ...state,
      wallet: demoMode ? state.wallet : state.wallet - cost,
      purchasedHints: {
        ...state.purchasedHints,
        [stepId]: [...existing, String(hintOrder)],
      },
    };
    if (!user) {
      saveState(updated);
    }
    setState(updated);

    if (user && shouldPersistProgress) {
      recordHintPurchase(user, stepId, hintOrder, cost).then(() => progress.refresh());
    }
  };

  const mapLink = `https://www.google.com/maps/dir/?api=1&destination=${FINAL_DESTINATION.lat},${FINAL_DESTINATION.lng}`;

  if (isGateLoading) {
    return (
      <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
        <div className="glass-panel rounded-3xl p-6 md:p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-32 rounded-full bg-white/10" />
            <div className="h-10 w-2/3 rounded-2xl bg-white/10" />
            <div className="h-4 w-1/2 rounded-full bg-white/10" />
            <div className="h-32 w-full rounded-2xl bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-14">
      <motion.div
        className="mx-auto flex w-full max-w-6xl flex-col gap-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <header className="grid gap-4 md:grid-cols-[1fr_auto] md:items-start">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
                Active Clue
              </p>
              {demoUi && (
                <span className="rounded-full border border-[var(--accent-emerald)]/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                  Demo mode
                </span>
              )}
            </div>
            <h1 className="text-display mt-3 text-3xl md:text-5xl">
              {step?.title ?? "Clue"}
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-[var(--text-muted)]">
              {step?.label ?? "Clue"} • Reward {step?.reward ?? 0} credits
            </p>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Logged in as{" "}
              <span className="text-white">
                {profile?.username || profile?.full_name || state?.username || state?.name || "Guest"}
              </span>
            </p>
          </div>
          <div className="flex flex-col items-end gap-3">
            <MenuButton
              showCurrentClue={Boolean(user)}
              currentStepId={stepId}
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
            <div className="min-w-[110px] rounded-3xl border border-[var(--stroke)] bg-black/40 px-5 py-4 text-right">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Wallet</p>
              <p className="mt-2 text-2xl font-semibold text-[var(--accent-gold)]">
                {demoUi ? "¢∞" : `¢${state?.wallet ?? 0}`}
              </p>
            </div>
          </div>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          {!loading && user && !profile?.full_name && !state?.name && (
            <div className="glass-panel rounded-3xl p-6 md:p-8 lg:col-span-2">
              <p className="text-sm text-[var(--text-muted)]">
                Player profile not found. Return to the account screen to create one before continuing.
              </p>
              <button
                onClick={() => router.push("/")}
                className="mt-4 rounded-full border border-[var(--stroke)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-white"
              >
                Go to account setup
              </button>
            </div>
          )}
          <div className="glass-panel rounded-3xl p-6 md:p-8 min-w-0">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-display text-2xl">Current Clue</h2>
              <span className="rounded-full border border-[var(--accent-emerald)]/40 px-3 py-1 text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                {step?.label ?? "Clue"}
              </span>
            </div>
            <p className="mt-4 text-lg italic text-[var(--text-muted)] text-center md:text-xl">
              {step?.clue ?? "Loading clue..."}
            </p>
            {stepId === 0 && (
              <p className="mt-4 text-center text-sm text-[var(--text-muted)]">
                Read the intro letter, then confirm to begin the hunt.
              </p>
            )}

            {requiresUnlock && !isCompleted && (
              <div className="mt-8 rounded-3xl border border-[var(--stroke)] bg-black/40 p-4 md:p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      Unlock the next clue
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      Once you reach the location, enter the password and verify your GPS.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowUnlock((prev) => !prev)}
                    className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
                  >
                      {showUnlock ? "Hide unlock" : "Unlock clue"}
                  </button>
                </div>
                {showUnlock && (
                  <div>
                    <div className="mt-5 grid gap-4">
                      <label className="grid gap-2 text-sm">
                        <span className="text-[var(--text-muted)]">Password</span>
                        <input
                          value={password}
                          onChange={(event) => setPassword(event.target.value)}
                          className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                          placeholder="Enter the location name"
                        />
                      </label>
                      <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4 min-w-0 self-start">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          GPS Verification
                        </p>
                        <p className="mt-2 text-sm text-white">
                          {formatDistance(distance, geoStatus === "ready")}
                        </p>
                        {demoUi && (
                          <p className="mt-1 text-xs text-[var(--accent-emerald)]">
                            {DEMO_GEO_OVERRIDE
                              ? "Demo mode uses test coordinates for geo verification."
                              : "Demo mode skips geo verification."}
                          </p>
                        )}
                        <div className="mt-4 flex flex-wrap gap-3">
                          <button
                            onClick={handleLocationCheck}
                            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]"
                          >
                            {geoStatus === "pending" ? "Checking..." : "Check location"}
                          </button>
                          {geoStatus === "ready" && (
                            <span
                              className={`rounded-full px-3 py-2 text-xs uppercase tracking-[0.2em] ${
                                distance !== null
                                  ? "bg-[var(--accent-emerald)]/20 text-[var(--accent-emerald)]"
                                  : "bg-[var(--stroke)]/20 text-[var(--text-muted)]"
                              }`}
                            >
                              {distance !== null ? "Checked" : "Ready"}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleCompleteStep}
                      className="mt-4 w-full rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
                    >
                      Unlock clue
                    </button>
                  </div>
                )}
              </div>
            )}

            {statusNote && (
              <p className="mt-4 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--text-muted)]">
                {statusNote}
              </p>
            )}
            {celebrationMessage && (
              <div className="mt-4 rounded-2xl border border-[var(--accent-emerald)]/40 bg-[var(--accent-emerald)]/10 px-4 py-3 text-center text-sm uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                {celebrationMessage}
              </div>
            )}

            <div className="mt-6 flex flex-wrap gap-3">
              {!requiresUnlock && !isCompleted && (
                <button
                  onClick={handleCompleteStep}
                  className="glow-ring mx-auto w-full max-w-xs rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
                >
                  Mark clue complete
                </button>
              )}
              {step?.is_final && isCompleted && (
                <a
                  href={mapLink}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-[var(--accent-gold)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-[var(--accent-gold)]"
                >
                  Go to your final destination
                </a>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-6 min-w-0">
            <div className="glass-panel-strong rounded-3xl p-6 md:p-8">
              <h3 className="text-display text-xl">Hints</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Spend credits to reveal extra guidance. Purchased hints stay visible.
              </p>
              <div className="mt-5 grid gap-4">
                {(step?.hints ?? []).map((hint, index) => {
                  const hintOrder = index + 1;
                  const isUnlocked = purchasedHints.includes(String(hintOrder)) || hint.cost === 0;
                  return (
                    <div
                      key={hint.id}
                      className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4"
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          Hint {index + 1}
                        </p>
                        <span className="text-xs text-[var(--accent-gold)]">{hint.cost} credits</span>
                      </div>
                      <p className="mt-3 text-sm text-white">
                        {isUnlocked ? hint.text : "Hint locked. Purchase to reveal."}
                      </p>
                      {!isUnlocked && (
                        <button
                          onClick={() => handleBuyHint(hint.id, hintOrder, hint.cost)}
                          className="mt-3 rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]"
                        >
                          Buy hint
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h3 className="text-display text-xl">Progress Tracker</h3>
              <div className="mt-3 flex items-center gap-3">
                <span className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  {step?.label ?? "Clue"}
                </span>
                <p className="text-sm text-white">{step?.title ?? "Clue"}</p>
              </div>
              <div className="mt-5 flex flex-col gap-4">
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                  <div className="flex w-full items-start gap-3 overflow-x-auto pb-2">
                    {trackerClues.map((card, index) => {
                      const completed = completedIds.includes(card.clue_index);
                      const isCurrentProgress = card.clue_index === effectiveProgressStep;
                      const isCurrentView = card.clue_index === stepId;
                      const isFinal = card.is_final;
                      const isAccessible = demoMode || card.clue_index <= effectiveProgressStep;
                      const isLocked = !demoMode && card.clue_index > effectiveProgressStep;
                      return (
                        <div key={card.id} className="flex items-center gap-3">
                          <button
                            onClick={() => {
                              if (!isAccessible) return;
                              router.push(`/experience?step=${card.clue_index}`);
                            }}
                            className={`flex min-w-[72px] flex-col items-center gap-2 ${
                              isLocked ? "pointer-events-none opacity-50" : ""
                            }`}
                            aria-disabled={isLocked}
                          >
                            <div
                              className={`flex h-10 w-10 items-center justify-center rounded-full border-2 text-sm ${
                                completed
                                  ? "border-[var(--accent-emerald)] bg-[var(--accent-emerald)]/15 text-[var(--accent-emerald)]"
                                  : isCurrentProgress
                                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10 text-[var(--accent-gold)]"
                                  : "border-[var(--stroke)] text-[var(--text-muted)]"
                              }`}
                            >
                              {completed ? "✓" : isCurrentProgress ? "🔓" : "🔒"}
                            </div>
                            <span className="flex min-h-[32px] flex-col items-center justify-start text-[10px] uppercase tracking-[0.3em]">
                              <span
                                className={`${
                                  isCurrentProgress || isCurrentView
                                    ? "text-[var(--accent-gold)]"
                                    : "text-[var(--text-muted)]"
                                }`}
                              >
                                {isFinal ? "Final" : card.label}
                              </span>
                              <span className="text-[var(--text-muted)]">{isFinal ? "Clue" : ""}</span>
                            </span>
                          </button>
                          {index < trackerClues.length - 1 && (
                            <div
                              className={`h-[2px] w-10 ${
                                card.clue_index < effectiveProgressStep
                                  ? "bg-[var(--accent-emerald)]"
                                  : "bg-[var(--stroke)]"
                              }`}
                            />
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                {demoUi && (
                  <p className="text-xs text-[var(--text-muted)]">
                    Tap any circle to jump between clues.
                  </p>
                )}
              </div>
              {demoUi && (
                <>
                  <p className="mt-4 text-xs text-[var(--text-muted)]">
                    Need to restart? Use the account screen to reset progress.
                  </p>
                  <button
                    onClick={() => router.push("/account")}
                    className="mt-3 rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
                  >
                    Go to account screen
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </motion.div>
    </div>
  );
}

export default function Experience() {
  return (
    <Suspense
      fallback={
        <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
          <div className="glass-panel rounded-3xl p-6 text-sm text-[var(--text-muted)]">
            Loading experience…
          </div>
        </div>
      }
    >
      <ExperienceContent />
    </Suspense>
  );
}
