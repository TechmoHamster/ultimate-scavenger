"use client";

import { motion } from "framer-motion";
import { useEffect, useState } from "react";
import { ensureState, resetState, saveState, type PlayerState } from "@/lib/storage";
import { steps } from "@/lib/steps";
import MenuButton from "@/components/menu-button";
import { useProfile } from "@/lib/profile";
import { useDemoSettings } from "@/lib/demo";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { usePlayerProgress } from "@/lib/player-progress";

export default function AccountPage() {
  const [state, setState] = useState<PlayerState | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const { user, profile, loading } = useProfile();
  const progress = usePlayerProgress(user);
  const isAdmin = profile?.role === "admin";
  const { demoUi, demoMode, playerView, toggleDemo, togglePlayerView } = useDemoSettings(
    Boolean(isAdmin)
  );
  const isGateLoading = loading || (Boolean(user) && !profile);

  useEffect(() => {
    const existing = ensureState(steps);
    setState(existing);
    setName(profile?.full_name || existing.name || "");
    setUsername(profile?.username || existing.username || "");
    setEmail(user?.email || existing.email || "");
  }, [profile, user]);

  useEffect(() => {
    if (!loading && !user) {
      window.location.href = "/auth/name";
    }
  }, [loading, user]);

  const handleSave = () => {
    if (!state) return;
    const syncLocal = () => {
      const updated: PlayerState = {
        ...state,
        name,
        username,
        email,
      };
      saveState(updated);
      setState(updated);
    };

    const updateProfile = async () => {
      if (!user) return;
      const supabase = createSupabaseBrowserClient();
      await supabase
        .from("profiles")
        .update({ full_name: name, username })
        .eq("id", user.id);

      if (email && email !== user.email) {
        await supabase.auth.updateUser({ email });
      }

      if (newPassword) {
        await supabase.auth.updateUser({ password: newPassword });
      }
    };

    updateProfile()
      .then(() => {
        syncLocal();
        setNewPassword("");
        setStatus("Profile saved. If you changed email, check your inbox.");
      })
      .catch(() => {
        setStatus("Unable to save profile. Please try again.");
      });
  };

  const handleReset = () => {
    resetState();
    const fresh = ensureState(steps);
    setState(fresh);
    setName("");
    setUsername("");
    setEmail("");
    setStatus("Progress reset.");
  };

  if (isGateLoading) {
    return <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16" />;
  }

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
              currentStepId={progress.state?.lastStepId ?? state?.lastStepId ?? 0}
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
            Account Center
          </p>
          <h1 className="text-display text-3xl md:text-5xl">Your Player Profile</h1>
          <p className="mt-3 text-sm text-[var(--text-muted)]">
            Update your name, optional username, and account details.
          </p>
        </header>

        <div className="glass-panel rounded-3xl p-6 md:p-8">
          {profile?.role && (
            <div className="mb-6 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--text-muted)]">
              Role: <span className="text-white capitalize">{profile.role}</span>
            </div>
          )}
          <div className="grid gap-4">
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Full name</span>
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                placeholder="John Doe"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Username (optional)</span>
              <input
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                placeholder="player123"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">Email</span>
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                placeholder="myemail@email.com"
              />
            </label>
            <label className="grid gap-2 text-sm">
              <span className="text-[var(--text-muted)]">New password</span>
              <input
                type="password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                placeholder="••••••••"
              />
            </label>
          </div>

          <div className="mt-6 flex flex-col gap-3 md:flex-row md:items-center">
            <button
              onClick={handleSave}
              className="glow-ring rounded-full bg-[var(--accent-gold)] px-6 py-3 text-xs font-semibold uppercase tracking-[0.3em] text-black"
            >
              Save changes
            </button>
            <button
              onClick={async () => {
                const supabase = createSupabaseBrowserClient();
                await supabase.auth.signOut();
                window.location.href = "/auth/name";
              }}
              className="rounded-full border border-[var(--stroke)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-white"
            >
              Sign out
            </button>
            {demoUi && (
              <button
                onClick={handleReset}
                className="rounded-full border border-[var(--stroke)] px-6 py-3 text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]"
              >
                Reset progress
              </button>
            )}
          </div>

          {status && (
            <p className="mt-4 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--text-muted)]">
              {status}
            </p>
          )}

          <p className="mt-4 text-xs text-[var(--text-muted)]">
            Email changes require confirmation from your inbox.
          </p>
        </div>
      </motion.div>
    </div>
  );
}
