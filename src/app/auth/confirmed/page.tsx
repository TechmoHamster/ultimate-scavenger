"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";

export default function ConfirmedPage() {
  const router = useRouter();

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <motion.div
        className="mx-auto flex w-full max-w-2xl flex-col gap-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
            Email Confirmed
          </p>
          <h1 className="text-display text-3xl md:text-5xl">You’re ready to sign in</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Your email has been verified. You can now log in and begin the hunt.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-8 text-center">
          <button
            onClick={() => router.push("/auth/login")}
            className="w-full rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
          >
            Go to login
          </button>
        </div>
      </motion.div>
    </div>
  );
}
