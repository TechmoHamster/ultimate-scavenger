"use client";

import { motion } from "framer-motion";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) return;
    setLoading(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      const message = error.message.toLowerCase().includes("confirm")
        ? "Please confirm your email first. Check your inbox."
        : error.message;
      setStatus(message);
      setLoading(false);
      return;
    }

    const { data: sessionData } = await supabase.auth.getSession();
    const token = sessionData.session?.access_token;

    let shouldRunTutorial = false;
    if (token) {
      const profileResponse = await fetch("/api/profile", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (profileResponse.ok) {
        const body = (await profileResponse.json()) as {
          profile?: { tutorial_completed?: boolean | null; role?: string | null };
        };
        shouldRunTutorial =
          body.profile?.role !== "admin" && body.profile?.tutorial_completed === false;
      }
    }

    if (shouldRunTutorial) {
      router.push("/tutorial");
      return;
    }

    let nextStep = 0;
    if (token) {
      const response = await fetch("/api/player-progress", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const body = (await response.json()) as {
          playerState?: { current_clue_index: number };
        };
        nextStep = body.playerState?.current_clue_index ?? 0;
      }
    }

    router.push(`/experience?step=${nextStep}`);
  };

  const handleReset = async () => {
    if (!email) {
      setStatus("Enter your email first.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/account`,
    });
    setStatus(error ? error.message : "Password reset link sent.");
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
            Welcome Back
          </p>
          <h1 className="text-display text-3xl md:text-5xl">Sign in to continue</h1>
        </header>

        
        {searchParams.get("confirm") === "1" && (
          <p className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--text-muted)]">
            Please confirm your email using the link we sent before signing in.
          </p>
        )}

        <form
          className="glass-panel rounded-3xl p-6 md:p-8"
          onSubmit={(event) => {
            event.preventDefault();
            handleLogin();
          }}
        >
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
              />
            </label>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
          >
            {loading ? "Logging in" : "Log in"}
          </button>
          <button
            type="button"
            onClick={handleReset}
            className="mt-3 w-full rounded-full border border-[var(--stroke)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-white"
          >
            Reset password
          </button>
          {status && (
            <p className="mt-4 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--text-muted)]">
              {status}
            </p>
          )}
        </form>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
            <div className="glass-panel rounded-3xl p-6 md:p-8 text-sm text-[var(--text-muted)]">
              Loading sign-in…
            </div>
          </div>
        </div>
      }
    >
      <LoginContent />
    </Suspense>
  );
}
