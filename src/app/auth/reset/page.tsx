"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);

  useEffect(() => {
    const init = async () => {
      const supabase = createSupabaseBrowserClient();
      const code = searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setStatus("This reset link is invalid or expired. Please request a new one.");
      }
      setSessionReady(true);
    };
    init();
  }, [searchParams]);

  const handleSubmit = async () => {
    if (!password || !confirm) {
      setStatus("Enter and confirm your new password.");
      return;
    }
    if (password !== confirm) {
      setStatus("Passwords do not match.");
      return;
    }
    setLoading(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (token) {
        await fetch("/api/notifications/password-changed", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
        });
      }
    } catch {
      // ignore email failures
    }
    await supabase.auth.signOut();
    router.push("/auth/login?reset=1");
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
          <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
            Password Reset
          </p>
          <h1 className="text-display text-3xl md:text-5xl">Set a new password</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Choose a new password and we&apos;ll sign you back in.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-8">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">New password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Confirm password</span>
              <input
                type="password"
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
              />
            </label>
          </div>
          <button
            type="button"
            disabled={!sessionReady || loading}
            onClick={handleSubmit}
            className="mt-6 w-full rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Saving..." : "Update password"}
          </button>
          {status && (
            <p className="mt-4 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--text-muted)]">
              {status}
            </p>
          )}
        </div>
      </motion.div>
    </div>
  );
}
