"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import MenuButton from "@/components/menu-button";
import { useProfile } from "@/lib/profile";
import { useDemoSettings } from "@/lib/demo";
import { usePlayerProgress } from "@/lib/player-progress";

export default function HowToPlay() {
  const { user, profile } = useProfile();
  const progress = usePlayerProgress(user);
  const isAdmin = profile?.role === "admin";
  const { demoMode, playerView, toggleDemo, togglePlayerView } = useDemoSettings(
    Boolean(isAdmin)
  );

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <motion.div
        className="mx-auto flex w-full max-w-3xl flex-col gap-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <header className="text-center">
          <div className="flex justify-end">
            <MenuButton
              showCurrentClue={Boolean(user)}
              currentStepId={progress.state?.lastStepId ?? 0}
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
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
            How To Play
          </p>
          <h1 className="text-display text-3xl md:text-5xl">Your Clue-by-Clue Guide</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Follow each clue, visit the location, and unlock the next step with the password and GPS.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-10">
          <ol className="mx-auto grid max-w-xl gap-4 text-base text-[var(--text-muted)] md:text-lg">
            <li>
              1. Start at the first clue and read the prompt carefully.
            </li>
            <li>
              2. Travel to the location hinted by the clue.
            </li>
            <li>
              3. Tap “Unlock clue” to enter the password and verify GPS.
            </li>
            <li>
              4. Purchase hints with credits if you need extra help.
            </li>
            <li>
              5. Repeat until the final clue reveals the destination.
            </li>
          </ol>
          <div className="mt-6 flex justify-center">
            <Link
              href="/"
              className="rounded-full border border-[var(--stroke)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-white"
            >
              Back to home
            </Link>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
