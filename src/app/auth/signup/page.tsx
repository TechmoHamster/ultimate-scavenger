"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function SignupPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const stored = sessionStorage.getItem("authorizedName");
    if (stored) setName(stored);
  }, []);

  const handleSignup = async () => {
    if (!email || !password || !name) return;
    setLoading(true);
    setStatus(null);
    const supabase = createSupabaseBrowserClient();

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/confirmed`,
      },
    });

    if (error) {
      setStatus(error.message);
      setLoading(false);
      return;
    }

    setStatus("Check your email to confirm your account, then sign in.");
    setLoading(false);
    router.push("/auth/login?confirm=1");
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
            Create Account
          </p>
          <h1 className="text-display text-3xl md:text-5xl">Set your login details</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Use your email and a password to unlock the hunt.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-8">
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Full name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
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
          </div>
          <button
            onClick={handleSignup}
            disabled={loading}
            className="mt-6 w-full rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
          >
            {loading ? "Creating" : "Create account"}
          </button>
          <button
            onClick={() => router.push("/auth/login")}
            className="mt-3 w-full rounded-full border border-[var(--stroke)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-white"
          >
            Have An Account? Sign IN
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
