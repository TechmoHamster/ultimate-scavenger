"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { useProfile } from "@/lib/profile";

export default function CurrentExperienceRedirect() {
  const router = useRouter();
  const { user, loading } = useProfile();
  const [status, setStatus] = useState("Finding your current clue...");

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/auth/name");
      return;
    }

    const run = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        router.replace("/auth/login");
        return;
      }

      const response = await fetch("/api/player-progress", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) {
        setStatus("Unable to load progress. Redirecting...");
        router.replace("/experience?step=0");
        return;
      }

      const body = (await response.json()) as {
        playerState?: { current_clue_index: number };
      };
      const nextStep = body.playerState?.current_clue_index ?? 0;
      router.replace(`/experience?step=${nextStep}&source=current`);
    };

    if (user) {
      run();
    }
  }, [loading, user, router]);

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
      <div className="glass-panel rounded-3xl p-6 md:p-8">
        <p className="text-sm text-[var(--text-muted)]">{status}</p>
      </div>
    </div>
  );
}
