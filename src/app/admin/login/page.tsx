"use client";

import { motion } from "framer-motion";
import { useRouter } from "next/navigation";
import { useState } from "react";

export default function AdminLogin() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <motion.div
        className="mx-auto flex w-full max-w-lg flex-col gap-6"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <header className="text-center">
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
            Admin Access
          </p>
          <h1 className="text-display text-3xl md:text-4xl">Zach&apos;s Control Room</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Secure login for monitoring and editing the scavenger hunt experience.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-8">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Admin email</span>
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                placeholder="zach@email.com"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                placeholder="••••••••"
              />
            </label>
            <button
              onClick={() => router.push("/admin/dashboard")}
              className="glow-ring rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
            >
              Enter dashboard
            </button>
            <p className="text-xs text-[var(--text-muted)]">
              This demo UI does not connect to Supabase yet. Wiring auth will enable real admin access.
            </p>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
