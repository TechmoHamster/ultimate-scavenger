"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type Profile = {
  id: string;
  full_name: string | null;
  username: string | null;
  role: string | null;
  is_disabled?: boolean | null;
  tutorial_completed?: boolean | null;
  tutorial_completed_at?: string | null;
  tutorial_skipped?: boolean | null;
};

export const useProfile = () => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const syncSessionCookie = (sessionUser: User | null) => {
      if (typeof document === "undefined") return;
      if (sessionUser) {
        document.cookie = "psh_session=1; path=/; max-age=86400; SameSite=Lax";
      } else {
        document.cookie = "psh_session=; path=/; max-age=0; SameSite=Lax";
      }
    };
    const fetchProfile = async (sessionUser: User | null) => {
      setUser(sessionUser);
      syncSessionCookie(sessionUser);
      if (!sessionUser) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const { data: session } = await supabase.auth.getSession();
      const token = session?.session?.access_token;
      if (!token) {
        setProfile(null);
        setLoading(false);
        return;
      }

      const response = await fetch("/api/profile", {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const body = (await response.json()) as { profile?: Profile };
        setProfile(body.profile ?? null);
        setLoading(false);
        return;
      }

      const errorBody = await response.json().catch(() => ({}));
      console.error("Profile API error", response.status, errorBody);

      // Fallback to direct profile fetch if API route fails
      const { data: profileData } = await supabase
        .from("profiles")
        .select("id, full_name, username, role, is_disabled, tutorial_completed, tutorial_completed_at, tutorial_skipped")
        .eq("id", sessionUser.id)
        .maybeSingle();

      setProfile(profileData ?? null);
      setLoading(false);
    };

    supabase.auth.getSession().then(({ data }) => fetchProfile(data.session?.user ?? null));

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      fetchProfile(session?.user ?? null);
    });

    return () => {
      listener.subscription.unsubscribe();
    };
  }, []);

  return { user, profile, loading };
};
