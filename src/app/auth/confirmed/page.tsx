"use client";

import { motion } from "framer-motion";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

function ConfirmedContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    const code = searchParams.get("code");
    if (!code) return;

    const confirm = async () => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        setStatus("This confirmation link is invalid or expired. Please request a new one.");
      }
    };

    confirm();
  }, [searchParams]);

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
          {status && (
            <p className="mt-4 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-xs text-[var(--text-muted)]">
              {status}
            </p>
          )}
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

export default function ConfirmedPage() {
  return (
    <Suspense
      fallback={
        <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
          <div className="glass-panel rounded-3xl p-6 md:p-8">
            <div className="animate-pulse space-y-3">
              <div className="h-4 w-32 rounded-full bg-white/10" />
              <div className="h-8 w-1/2 rounded-2xl bg-white/10" />
              <div className="h-4 w-2/3 rounded-full bg-white/10" />
            </div>
          </div>
        </div>
      }
    >
      <ConfirmedContent />
    </Suspense>
  );
}
