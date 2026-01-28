"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";

export default function NameGate() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim()) return;
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const payload = (await response.json()) as {
        allowed: boolean;
        displayName?: string;
        hasAccount?: boolean;
      };

      if (!payload.allowed) {
        setStatus("You are not authorized to access this experience.");
        setLoading(false);
        return;
      }

      if (payload.displayName) {
        sessionStorage.setItem("authorizedName", payload.displayName);
      } else {
        sessionStorage.setItem("authorizedName", name.trim());
      }

      if (payload.hasAccount) {
        router.push("/auth/login");
      } else {
        router.push("/auth/signup");
      }
    } catch {
      setStatus("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      handleSubmit();
    }
  };

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <motion.div
        className="mx-auto flex w-full max-w-2xl flex-col gap-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <header className="text-center">
          <h1 className="text-display text-4xl md:text-6xl">Welcome</h1>
          <h2 className="mt-3 text-base font-semibold text-[var(--text-muted)] md:text-2xl">
            Enter your name to begin
          </h2>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            This experience is private. Authorized individuals only.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-8">
          <label className="grid gap-2 text-sm">
            <span className="text-[var(--text-muted)]">Full name</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
              placeholder="First Last"
            />
          </label>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="mt-5 w-full rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
          >
            {loading ? "Checking" : "Continue"}
          </button>
          {status && (
            <p className="mt-4 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--accent-coral)]">
              {status}
            </p>
          )}
          {status && (
            <p className="mt-2 text-xs text-[var(--text-muted)]">
              If you believe this is a mistake, please close your browser and contact the host.
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
