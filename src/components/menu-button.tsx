"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type MenuButtonProps = {
  showCurrentClue?: boolean;
  currentStepId?: number;
  showProfile?: boolean;
  showHowToPlay?: boolean;
  adminControls?: {
    enabled: boolean;
    demoMode: boolean;
    playerView: boolean;
    onToggleDemo: () => void;
    onTogglePlayerView: () => void;
  };
};

export default function MenuButton({
  showCurrentClue = false,
  currentStepId = 0,
  showProfile = false,
  showHowToPlay = false,
  adminControls,
}: MenuButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const isActive = (path: string) => pathname === path;
  const itemClass = (active: boolean) =>
    `w-full rounded-full px-4 py-2 text-left text-xs uppercase tracking-[0.3em] ${
      active ? "text-[var(--accent-gold)]" : "text-white hover:text-[var(--accent-gold)]"
    }`;

  useEffect(() => {
    if (!open) return;
    const handleClick = (event: MouseEvent) => {
      if (!wrapperRef.current) return;
      if (!wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((prev) => !prev)}
        className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
      >
        Menu
      </button>
      {open && (
        <div className="absolute right-0 top-12 z-20 min-w-[200px] rounded-2xl border border-[var(--stroke)] bg-[var(--panel-strong)] p-3 shadow-xl">
          <button
            onClick={() => {
              router.push("/");
              setOpen(false);
            }}
            className={itemClass(isActive("/"))}
            aria-current={isActive("/") ? "page" : undefined}
          >
            Home
          </button>
          {showCurrentClue && (
            <button
              onClick={() => {
                router.push("/experience/current");
                setOpen(false);
              }}
              className={`mt-2 ${itemClass(isActive("/experience"))}`}
              aria-current={isActive("/experience") ? "page" : undefined}
            >
              Current clue
            </button>
          )}
          {showProfile && (
            <button
              onClick={() => {
                router.push("/account");
                setOpen(false);
              }}
              className={`mt-2 ${itemClass(isActive("/account"))}`}
              aria-current={isActive("/account") ? "page" : undefined}
            >
              Your Profile
            </button>
          )}
          {showHowToPlay && (
            <button
              onClick={() => {
                router.push("/how-to-play");
                setOpen(false);
              }}
              className={`mt-2 ${itemClass(isActive("/how-to-play"))}`}
              aria-current={isActive("/how-to-play") ? "page" : undefined}
            >
              How to play
            </button>
          )}
          {showProfile && (
            <button
              onClick={async () => {
                const supabase = createSupabaseBrowserClient();
                await supabase.auth.signOut();
                router.push("/auth/name");
                setOpen(false);
              }}
              className="mt-2 w-full rounded-full px-4 py-2 text-left text-xs uppercase tracking-[0.3em] text-white hover:text-[var(--accent-gold)]"
            >
              Sign out
            </button>
          )}
          {adminControls?.enabled && (
            <>
              <button
                onClick={() => {
                  router.push("/admin/dashboard");
                  setOpen(false);
                }}
                className={`mt-3 w-full rounded-full border border-[var(--stroke)] px-4 py-2 text-left text-xs uppercase tracking-[0.3em] ${
                  isActive("/admin/dashboard")
                    ? "text-[var(--accent-gold)]"
                    : "text-white"
                }`}
                aria-current={isActive("/admin/dashboard") ? "page" : undefined}
              >
                Dashboard
              </button>
              <button
                onClick={adminControls.onToggleDemo}
                className="mt-3 w-full rounded-full border border-[var(--stroke)] px-4 py-2 text-left text-xs uppercase tracking-[0.3em] text-white"
              >
                Demo mode: {adminControls.demoMode ? "On" : "Off"}
              </button>
              {adminControls.demoMode && (
                <button
                  onClick={adminControls.onTogglePlayerView}
                  className="mt-2 w-full rounded-full border border-[var(--stroke)] px-4 py-2 text-left text-xs uppercase tracking-[0.3em] text-white"
                >
                  View as player: {adminControls.playerView ? "On" : "Off"}
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
