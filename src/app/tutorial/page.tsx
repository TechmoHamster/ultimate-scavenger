"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/profile";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const tutorialHighlights = [
  {
    title: "Menu button",
    body: "Use the menu to jump to your profile, current clue, and help pages.",
    target: "menu",
  },
  {
    title: "Current clue panel",
    body: "This panel shows the active clue you should solve next.",
    target: "clue",
  },
  {
    title: "Progress tracker",
    body: "Track which clues are complete and what comes next.",
    target: "progress",
  },
  {
    title: "Wallet balance",
    body: "Credits let you unlock hints when you need extra help.",
    target: "wallet",
  },
  {
    title: "Hints",
    body: "Spend credits to reveal hints for the current clue.",
    target: "hints",
  },
];

const tutorialRules = [
  "Scan QR codes to open the correct clue page.",
  "Unlock clues by entering the password shown at the location.",
  "GPS verification confirms you are in the right place.",
  "Hints can be purchased with credits from your wallet.",
  "Progress saves automatically as you go.",
];

export default function TutorialPage() {
  const router = useRouter();
  const { user, profile, loading } = useProfile();
  const [phase, setPhase] = useState<1 | 2 | 3>(1);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [demoWallet, setDemoWallet] = useState(10);
  const [hintPurchased, setHintPurchased] = useState(false);
  const [demoPassword, setDemoPassword] = useState("");
  const [gpsVerified, setGpsVerified] = useState(false);
  const [demoUnlocked, setDemoUnlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const totalPhases = 3;
  const phaseLabel = useMemo(() => {
    if (phase === 1) return `Orientation • ${highlightIndex + 1} of ${tutorialHighlights.length}`;
    if (phase === 2) return "How it works";
    return "Interactive demo";
  }, [phase, highlightIndex]);

  const highlight = tutorialHighlights[highlightIndex];
  const isActive = (target: string) => highlight?.target === target;



  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/auth/name");
      return;
    }

    if (profile?.tutorial_completed) {
      router.replace("/experience/current");
    }
  }, [loading, user, profile, router]);

  const goNext = () => {
    if (highlightIndex < tutorialHighlights.length - 1) {
      setHighlightIndex((prev) => prev + 1);
      return;
    }
    setPhase(2);
  };

  const goBack = () => {
    if (highlightIndex > 0) {
      setHighlightIndex((prev) => prev - 1);
    }
  };

  const startDemo = () => setPhase(3);

  const handleBuyHint = () => {
    if (hintPurchased || demoWallet < 4) return;
    setHintPurchased(true);
    setDemoWallet((prev) => prev - 4);
  };

  const handleVerifyGps = () => {
    setGpsVerified(true);
  };

  const handleUnlockDemo = () => {
    if (!hintPurchased || !gpsVerified) return;
    if (demoPassword.trim().toLowerCase() !== "tutorial park") {
      setStatus("That password doesn't match the demo location.");
      return;
    }
    setStatus(null);
    setDemoUnlocked(true);
  };

  const completeTutorial = async (skipped: boolean) => {
    if (busy) return;
    setBusy(true);
    setStatus(null);

    const supabase = createSupabaseBrowserClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    if (!token) {
      router.replace("/auth/login");
      return;
    }

    const response = await fetch("/api/tutorial/complete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ skipped }),
    });

    if (!response.ok) {
      setStatus("Unable to save tutorial progress. Please try again.");
      setBusy(false);
      return;
    }

    router.replace("/experience/current");
  };

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <motion.div
        className="mx-auto flex w-full max-w-4xl flex-col gap-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <header className="flex flex-col gap-3 text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
            Tutorial
          </p>
          <h1 className="text-display text-3xl md:text-5xl">Ready to Hunt</h1>
          <p className="text-sm text-[var(--text-muted)]">
            {phaseLabel} • Step {phase} of {totalPhases}
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-10">
          {phase === 1 && (
            <div className="grid gap-6">
              <div className="grid gap-6 lg:grid-cols-[1.4fr_0.9fr]">
                <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-6">
                  <div className="flex items-center justify-between gap-3">
                    <span
                      className={`rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white transition ${
                        isActive("menu")
                          ? "ring-2 ring-[var(--accent-gold)] shadow-[0_0_0_4px_rgba(255,248,140,0.2)]"
                          : "opacity-70"
                      }`}
                    >
                      Menu
                    </span>
                    <div
                      className={`rounded-2xl border border-[var(--stroke)] bg-black/40 px-4 py-3 text-right transition ${
                        isActive("wallet")
                          ? "ring-2 ring-[var(--accent-gold)] shadow-[0_0_0_4px_rgba(255,248,140,0.2)]"
                          : "opacity-70"
                      }`}
                    >
                      <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">Wallet</p>
                      <p className="mt-2 text-lg font-semibold text-[var(--accent-gold)]">¢10</p>
                    </div>
                  </div>

                  <div
                    className={`mt-5 rounded-2xl border border-[var(--stroke)] bg-black/30 p-5 transition ${
                      isActive("clue")
                        ? "ring-2 ring-[var(--accent-gold)] shadow-[0_0_0_4px_rgba(255,248,140,0.2)]"
                        : "opacity-70"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                      Current clue
                    </p>
                    <h3 className="mt-3 text-lg text-white">The Opening Envelope</h3>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      Read the clue, then head to the location to unlock the next step.
                    </p>
                  </div>

                  <div
                    className={`mt-4 rounded-2xl border border-[var(--stroke)] bg-black/20 p-5 transition ${
                      isActive("hints")
                        ? "ring-2 ring-[var(--accent-gold)] shadow-[0_0_0_4px_rgba(255,248,140,0.2)]"
                        : "opacity-70"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Hints</p>
                    <div className="mt-3 flex items-center justify-between rounded-xl border border-[var(--stroke)] bg-black/20 px-3 py-2 text-sm">
                      <span>Hint 1</span>
                      <span className="text-[var(--accent-gold)]">4¢</span>
                    </div>
                  </div>

                  <div
                    className={`mt-4 rounded-2xl border border-[var(--stroke)] bg-black/20 p-5 transition ${
                      isActive("progress")
                        ? "ring-2 ring-[var(--accent-gold)] shadow-[0_0_0_4px_rgba(255,248,140,0.2)]"
                        : "opacity-70"
                    }`}
                  >
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      Progress tracker
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      <span className="rounded-full border border-[var(--accent-emerald)]/40 px-3 py-1 text-[10px] text-[var(--accent-emerald)]">
                        Intro
                      </span>
                      <span className="rounded-full border border-[var(--stroke)] px-3 py-1">Clue 1</span>
                      <span className="rounded-full border border-[var(--stroke)] px-3 py-1">Clue 2</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                    Callout
                  </p>
                  <h2 className="text-display mt-3 text-2xl md:text-3xl">{highlight.title}</h2>
                  <p className="mt-3 text-sm text-[var(--text-muted)]">{highlight.body}</p>
                  <div className="mt-6 flex items-center justify-between gap-3">
                    <button
                      onClick={goBack}
                      disabled={highlightIndex === 0}
                      className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white disabled:opacity-40"
                    >
                      Back
                    </button>
                    <button
                      onClick={goNext}
                      className="rounded-full bg-[var(--accent-gold)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black"
                    >
                      {highlightIndex === tutorialHighlights.length - 1 ? "Continue" : "Next"}
                    </button>
                  </div>
                </div>
              </div>
              <div className="flex justify-start">
                <button
                  onClick={() => completeTutorial(true)}
                  className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
                >
                  Skip tutorial
                </button>
              </div>
            </div>
          )}

          {phase === 2 && (
            <div className="grid gap-6">
              <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-6">
                <h2 className="text-display text-2xl md:text-3xl">How the hunt works</h2>
                <ul className="mt-4 grid gap-3 text-sm text-[var(--text-muted)]">
                  {tutorialRules.map((rule) => (
                    <li
                      key={rule}
                      className="rounded-2xl border border-[var(--stroke)] bg-black/10 px-4 py-3"
                    >
                      {rule}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-wrap justify-between gap-3">
                <button
                  onClick={() => setPhase(1)}
                  className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
                >
                  Back
                </button>
                <button
                  onClick={startDemo}
                  className="rounded-full bg-[var(--accent-gold)] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black"
                >
                  Start demo
                </button>
              </div>
            </div>
          )}

          {phase === 3 && (
            <div className="grid gap-6">
              <div className="grid gap-4 md:grid-cols-[1.2fr_0.8fr]">
                <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-6">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Demo clue</p>
                  <h2 className="text-display mt-3 text-2xl md:text-3xl">Tutorial Park</h2>
                  <p className="mt-3 text-sm text-[var(--text-muted)]">
                    Purchase a hint, enter the demo password, and verify GPS to unlock the demo clue.
                  </p>

                  <div className="mt-5 grid gap-4">
                    <button
                      onClick={handleBuyHint}
                      className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
                    >
                      {hintPurchased ? "Hint unlocked" : "Buy hint (4¢)"}
                    </button>
                    {hintPurchased && (
                      <div className="rounded-2xl border border-[var(--stroke)] bg-black/10 px-4 py-3 text-sm text-[var(--text-muted)]">
                        The password is the place name: “tutorial park”.
                      </div>
                    )}
                    <label className="grid gap-2 text-sm">
                      <span className="text-[var(--text-muted)]">Password</span>
                      <input
                        value={demoPassword}
                        onChange={(event) => setDemoPassword(event.target.value)}
                        className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                      />
                    </label>
                    <button
                      onClick={handleVerifyGps}
                      className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
                    >
                      {gpsVerified ? "GPS verified" : "Check location"}
                    </button>
                    <button
                      onClick={handleUnlockDemo}
                      className="rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
                    >
                      Unlock demo clue
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-6 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Sandbox wallet</p>
                  <p className="mt-4 text-4xl font-semibold text-[var(--accent-gold)]">¢{demoWallet}</p>
                  <p className="mt-4 text-sm text-[var(--text-muted)]">
                    GPS is simulated in tutorial mode.
                  </p>
                </div>
              </div>

              {demoUnlocked && (
                <div className="rounded-3xl border border-[var(--accent-emerald)]/40 bg-black/20 p-6">
                  <p className="text-sm uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                    Demo complete
                  </p>
                  <h3 className="mt-3 text-display text-2xl">Ready to hunt</h3>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    You’ve completed the tutorial and earned the “Ready to Hunt” badge.
                  </p>
                </div>
              )}

              {status && (
                <p className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--accent-coral)]">
                  {status}
                </p>
              )}

              <div className="flex flex-wrap justify-between gap-3">
                <button
                  onClick={() => completeTutorial(true)}
                  className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
                >
                  Skip tutorial
                </button>
                <button
                  onClick={() => completeTutorial(false)}
                  disabled={!demoUnlocked || busy}
                  className="rounded-full bg-[var(--accent-gold)] px-6 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black disabled:opacity-60"
                >
                  {busy ? "Saving" : "Finish tutorial"}
                </button>
              </div>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
