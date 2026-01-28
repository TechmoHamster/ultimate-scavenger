"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { FINAL_DESTINATION, steps } from "@/lib/steps";
import { ensureState, type PlayerState } from "@/lib/storage";
import { useProfile } from "@/lib/profile";

export default function FinalReveal() {
  const router = useRouter();
  const [state, setState] = useState<PlayerState | null>(null);
  const { user, loading } = useProfile();

  useEffect(() => {
    setState(ensureState(steps));
  }, []);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/name");
    }
  }, [loading, user, router]);

  const finalStep = steps.find((step) => step.isFinal);
  const finalComplete = finalStep ? state?.completedStepIds.includes(finalStep.id) : false;
  const mapLink = `https://www.google.com/maps/dir/?api=1&destination=${FINAL_DESTINATION.lat},${FINAL_DESTINATION.lng}`;

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <motion.div
        className="mx-auto flex w-full max-w-4xl flex-col gap-8 text-center"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.7, ease: "easeOut" }}
      >
        <p className="text-xs uppercase tracking-[0.5em] text-[var(--accent-emerald)]">
          Final Destination
        </p>
        <h1 className="text-display text-4xl md:text-6xl">The last clue leads to forever.</h1>
        <p className="text-base text-[var(--text-muted)]">
          When the final password is confirmed, this page becomes your map to the proposal location.
        </p>

        <div className="glass-panel rounded-3xl p-8">
          {finalComplete ? (
            <div className="space-y-5">
              <p className="text-lg text-white">
                You made it. Take a deep breath, follow the map, and trust what you already know.
              </p>
              <a
                href={mapLink}
                target="_blank"
                rel="noreferrer"
                className="glow-ring inline-flex rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
              >
                Go to your final destination
              </a>
            </div>
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-[var(--text-muted)]">
                The final step has not been unlocked yet. Return to the active clue to finish the hunt.
              </p>
              <button
                onClick={() => router.push("/experience?step=8")}
                className="rounded-full border border-[var(--stroke)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-white"
              >
                Back to the final step
              </button>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
