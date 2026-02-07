"use client";

import { motion } from "framer-motion";
import { GoogleMap, Marker, useLoadScript } from "@react-google-maps/api";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useProfile } from "@/lib/profile";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toDefaultClues, useClues, type Clue } from "@/lib/clues";
import { steps } from "@/lib/steps";

const emptyId = "00000000-0000-0000-0000-000000000000";

type ClueDraft = Clue & {
  password?: string;
  has_password?: boolean;
  requires_unlock?: boolean;
  radius_meters?: number | null;
  lat?: number | null;
  lng?: number | null;
};

type GameDesignPanelProps = {
  showBackLink?: boolean;
  onStatusChange?: (message: string) => void;
};

export default function GameDesignPanel({
  showBackLink = false,
  onStatusChange,
}: GameDesignPanelProps) {
  const { profile } = useProfile();
  const isAdmin = profile?.role === "admin";
  const { clues, reload } = useClues();
  const [drafts, setDrafts] = useState<ClueDraft[]>([]);
  const [originals, setOriginals] = useState<ClueDraft[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [activeClueId, setActiveClueId] = useState<string | null>(null);
  const [quickActionsCollapsed, setQuickActionsCollapsed] = useState(true);
  const mapsKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? "";
  const { isLoaded } = useLoadScript({
    googleMapsApiKey: mapsKey,
    libraries: ["places"],
  });
  const cluesSectionRef = useRef<HTMLDivElement | null>(null);
  const [showQuickActions, setShowQuickActions] = useState(false);
  const [hasUserEdits, setHasUserEdits] = useState(false);

  const notifyStatus = (message: string) => {
    onStatusChange?.(message);
  };

  useEffect(() => {
    const nextDrafts = clues.map((clue) => ({
      ...clue,
      reminder: clue.reminder ?? "",
      password: "",
      has_password: false,
      requires_unlock: true,
      radius_meters: null,
      lat: null,
      lng: null,
      hints_enabled: clue.hints_enabled ?? true,
      hint_limit: clue.hint_limit ?? clue.hints.length,
    }));
    setDrafts(nextDrafts);
    setExpanded((prev) => {
      const next: Record<string, boolean> = { ...prev };
      nextDrafts.forEach((clue) => {
        if (next[clue.id] === undefined) next[clue.id] = false;
      });
      return next;
    });
  }, [clues]);

  useEffect(() => {
    if (!isAdmin || clues.length === 0) return;
    const fetchSecrets = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("clue_secrets")
        .select("clue_id, radius_meters, lat, lng, password_hash, password, requires_unlock");
      if (!data) return;
      const map = new Map(data.map((row) => [row.clue_id, row]));
      setDrafts((prev) =>
        prev.map((clue) => ({
          ...clue,
          radius_meters: map.get(clue.id)?.radius_meters ?? clue.radius_meters ?? null,
          lat: map.get(clue.id)?.lat ?? clue.lat ?? null,
          lng: map.get(clue.id)?.lng ?? clue.lng ?? null,
          requires_unlock: map.get(clue.id)?.requires_unlock ?? clue.requires_unlock ?? true,
          has_password: Boolean(map.get(clue.id)?.password_hash || map.get(clue.id)?.password),
        }))
      );
    };
    fetchSecrets();
  }, [isAdmin, clues]);

  useEffect(() => {
    if (drafts.length === 0) return;
    if (!hasUserEdits) {
      setOriginals(
        drafts.map((clue) => ({
          ...clue,
          password: "",
        }))
      );
    }
  }, [drafts, hasUserEdits]);

  const updateClue = (
    index: number,
    field: keyof ClueDraft,
    value: string | number | boolean | null
  ) => {
    setHasUserEdits(true);
    setDrafts((prev) =>
      prev.map((clue, idx) => (idx === index ? { ...clue, [field]: value } : clue))
    );
  };

  const updateHint = (clueIndex: number, hintIndex: number, field: "text" | "cost") =>
    (value: string) => {
      setHasUserEdits(true);
      setDrafts((prev) =>
        prev.map((clue, idx) => {
          if (idx !== clueIndex) return clue;
          const hints = clue.hints.map((hint, hIdx) =>
            hIdx === hintIndex
              ? { ...hint, [field]: field === "cost" ? Number(value) : value }
              : hint
          );
          return { ...clue, hints };
        })
      );
    };

  const setHintCount = (clueIndex: number, count: 1 | 2 | 3) => {
    setHasUserEdits(true);
    setDrafts((prev) =>
      prev.map((clue, idx) => {
        if (idx !== clueIndex) return clue;
        const nextHints = clue.hints.slice(0, count);
        while (nextHints.length < count) {
          const hintId = `${clue.id}-hint-${nextHints.length + 1}`;
          nextHints.push({
            id: hintId,
            sort_order: nextHints.length + 1,
            cost: 0,
            text: "",
          });
        }
        return {
          ...clue,
          hint_limit: count,
          hints: nextHints,
        };
      })
    );
  };

  const saveClue = async (clue: ClueDraft) => {
    if (!isAdmin) return;
    const supabase = createSupabaseBrowserClient();

    const payload = {
      clue_index: clue.clue_index,
      label: clue.label,
      title: clue.title,
      clue: clue.clue,
      reminder: clue.reminder ?? null,
      reward: clue.reward,
      is_final: clue.is_final,
      hints_enabled: clue.hints_enabled ?? true,
      hint_limit: clue.hint_limit ?? clue.hints.length,
    };

    let clueId = clue.id.startsWith("local-") ? null : clue.id;
    if (!clueId) {
      const { data, error } = await supabase.from("clues").insert(payload).select("id").single();
      if (error || !data) {
        throw new Error(error?.message ?? "Unable to create clue");
      }
      clueId = data.id;
    } else {
      const { error } = await supabase.from("clues").update(payload).eq("id", clueId);
      if (error) throw new Error(error.message);
    }

    await supabase.from("clue_hints").delete().eq("clue_id", clueId);
    const hintRows = clue.hints.map((hint, index) => ({
      clue_id: clueId,
      sort_order: index + 1,
      cost: hint.cost,
      text: hint.text,
    }));

    if (hintRows.length) {
      const { error } = await supabase.from("clue_hints").insert(hintRows);
      if (error) throw new Error(error.message);
    }

    const trimmedPassword = clue.password?.trim();
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) throw new Error("Missing session token.");

    const secretPayload = {
      clueId,
      requires_unlock: clue.requires_unlock ?? true,
      radius_meters: clue.radius_meters ?? null,
      lat: clue.lat ?? null,
      lng: clue.lng ?? null,
      ...(trimmedPassword ? { password: trimmedPassword } : {}),
    };

    const response = await fetch("/api/admin/clue-secrets", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(secretPayload),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      throw new Error(body?.reason ?? "Unable to save clue secrets.");
    }

    setDrafts((prev) =>
      prev.map((item) =>
        item.id === clueId
          ? {
              ...item,
              password: "",
              has_password: item.has_password || Boolean(trimmedPassword),
            }
          : item
      )
    );
    setOriginals((prev) =>
      prev.map((item) =>
        item.id === clueId
          ? {
              ...item,
              title: clue.title,
              clue: clue.clue,
              reminder: clue.reminder ?? null,
              reward: clue.reward,
              hints_enabled: clue.hints_enabled ?? true,
              hint_limit: clue.hint_limit ?? clue.hints.length,
              hints: clue.hints,
              radius_meters: clue.radius_meters ?? null,
              lat: clue.lat ?? null,
              lng: clue.lng ?? null,
              has_password: item.has_password || Boolean(trimmedPassword),
              password: "",
            }
          : item
      )
    );
  };

  const saveAll = async () => {
    if (!isAdmin) return;
    try {
      notifyStatus("Saving clue changes...");
      for (const clue of drafts) {
        await saveClue(clue);
      }
      notifyStatus("Clue changes saved.");
      reload();
      setOriginals(
        drafts.map((clue) => ({
          ...clue,
          password: "",
          has_password: clue.has_password || Boolean(clue.password?.trim()),
        }))
      );
      setHasUserEdits(false);
    } catch (error) {
      notifyStatus(error instanceof Error ? error.message : "Unable to save clue changes.");
    }
  };

  const migratePasswords = async () => {
    if (!isAdmin) return;
    const supabase = createSupabaseBrowserClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) {
      notifyStatus("Missing session token.");
      return;
    }
    notifyStatus("Securing clue passwords...");
    const response = await fetch("/api/admin/migrate-clue-passwords", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      notifyStatus(body?.reason ?? "Unable to secure passwords.");
      return;
    }
    notifyStatus(`Secured ${body.upgraded ?? 0} password(s).`);
  };

  const downloadQrLinks = () => {
    const origin =
      typeof window !== "undefined" && window.location?.origin
        ? window.location.origin
        : "";
    const lines = drafts.map((clue) => {
      const label = clue.label || `Clue ${clue.clue_index}`;
      const url = `${origin}/experience?step=${clue.clue_index}&unlock=1&source=qr`;
      return `${label}: ${url}`;
    });
    const blob = new Blob([lines.join("\n")], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clue-qr-links.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const downloadLockRequirements = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) {
      notifyStatus("Missing session token.");
      return;
    }
    const pin = window.prompt("Enter export PIN to reveal passwords:");
    if (!pin) {
      notifyStatus("Export cancelled.");
      return;
    }
    const response = await fetch("/api/admin/clue-export", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pin }),
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      notifyStatus(body?.reason ?? "Unable to export clue data.");
      return;
    }
    const text = await response.text();
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "clue-export.txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  };

  const seedDefaults = async () => {
    if (!isAdmin) return;
    const supabase = createSupabaseBrowserClient();
    const defaults = toDefaultClues();

    notifyStatus("Seeding defaults...");

    await supabase.from("clue_hints").delete().neq("id", emptyId);
    const { error } = await supabase.from("clues").delete().neq("id", emptyId);

    if (error) {
      notifyStatus(error.message);
      return;
    }

    const { data: inserted, error: insertError } = await supabase
      .from("clues")
      .insert(
        defaults.map((clue) => ({
          clue_index: clue.clue_index,
          label: clue.label,
          title: clue.title,
          clue: clue.clue,
          reminder: clue.reminder ?? null,
          reward: clue.reward,
          is_final: clue.is_final,
          hints_enabled: clue.hints_enabled ?? true,
          hint_limit: clue.hint_limit ?? clue.hints.length,
        }))
      )
      .select("id, clue_index");

    if (insertError || !inserted) {
      notifyStatus(insertError?.message ?? "Unable to seed defaults.");
      return;
    }

    const map = new Map(inserted.map((row) => [row.clue_index, row.id]));
    const hintRows = defaults.flatMap((clue) =>
      clue.hints.map((hint, index) => ({
        clue_id: map.get(clue.clue_index) ?? emptyId,
        sort_order: index + 1,
        cost: hint.cost,
        text: hint.text,
      }))
    );

    if (hintRows.length) {
      await supabase.from("clue_hints").insert(hintRows);
    }

    const { data: session } = await supabase.auth.getSession();
    const token = session?.session?.access_token;
    if (!token) {
      notifyStatus("Missing session token.");
      return;
    }

    const stepMap = new Map(steps.map((step) => [step.id, step]));
    for (const row of inserted) {
      const step = stepMap.get(row.clue_index);
      if (!step) continue;
      const response = await fetch("/api/admin/clue-secrets", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          clueId: row.id,
          password: step.password ?? null,
          radius_meters: step.radiusMeters ?? null,
          lat: step.coords?.lat ?? null,
          lng: step.coords?.lng ?? null,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        notifyStatus(body?.reason ?? "Unable to seed clue secrets.");
        return;
      }
    }

    notifyStatus("Defaults seeded.");
    reload();
  };

  const isClueDirty = (clue: ClueDraft) => {
    const original = originals.find((item) => item.id === clue.id);
    if (!original) return false;
    const baseDirty =
      clue.title !== original.title ||
      clue.clue !== original.clue ||
      clue.reminder !== original.reminder ||
      clue.reward !== original.reward ||
      clue.hints_enabled !== original.hints_enabled ||
      (clue.hint_limit ?? clue.hints.length) !== (original.hint_limit ?? original.hints.length) ||
      clue.radius_meters !== original.radius_meters ||
      clue.lat !== original.lat ||
      clue.lng !== original.lng ||
      JSON.stringify(clue.hints.map((hint) => ({ text: hint.text, cost: hint.cost }))) !==
        JSON.stringify(original.hints.map((hint) => ({ text: hint.text, cost: hint.cost })));
    const passwordDirty = Boolean(clue.password?.trim());
    return baseDirty || passwordDirty;
  };

  const toggleAll = (next: boolean) => {
    setExpanded((prev) => {
      const updated: Record<string, boolean> = { ...prev };
      drafts.forEach((clue) => {
        updated[clue.id] = next;
      });
      return updated;
    });
  };

  useEffect(() => {
    const element = cluesSectionRef.current;
    if (!element) return;
    const updateVisibility = (isIntersecting: boolean) => {
      const offset = element.getBoundingClientRect().top + window.scrollY;
      const beyond = window.scrollY >= offset - 160;
      setShowQuickActions(isIntersecting || beyond);
    };

    const observer = new IntersectionObserver(
      ([entry]) => updateVisibility(entry.isIntersecting),
      { threshold: 0.1 }
    );
    observer.observe(element);

    const handleScroll = () => updateVisibility(false);
    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", handleScroll);
    };
  }, [drafts.length]);

  const scrollToClue = (clue: ClueDraft) => {
    setExpanded((prev) => ({
      ...prev,
      [clue.id]: true,
    }));
    setActiveClueId(clue.id);
    const element = document.getElementById(`clue-${clue.clue_index}`);
    element?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <motion.div
      className="flex flex-col gap-8"
      initial={{ opacity: 0, y: 18 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
    >
      <section className="glass-panel rounded-3xl p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-display text-2xl md:text-3xl">Game Design Controls</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Edit clue copy, rewards, hints, and GPS validation. Changes save to Supabase immediately.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              onClick={saveAll}
              className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
            >
              Save all
            </button>
            <button
              onClick={seedDefaults}
              className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
            >
              Seed defaults
            </button>
            <button
              onClick={migratePasswords}
              className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
            >
              Secure passwords
            </button>
            <button
              onClick={downloadQrLinks}
              className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
            >
              Download QR links
            </button>
            <button
              onClick={downloadLockRequirements}
              className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
            >
              Export lock requirements
            </button>
            {showBackLink && (
              <Link
                href="/admin/dashboard"
                className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
              >
                Back to Dashboard
              </Link>
            )}
          </div>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.2fr_1fr]">
        <div className="glass-panel rounded-3xl p-6 md:p-8">
          <h2 className="text-display text-2xl">Control panel</h2>
          <p className="mt-2 text-sm text-[var(--text-muted)]">
            Toggle global gameplay systems and tune the overall balance.
          </p>
          <div className="mt-4 grid gap-3 text-sm text-[var(--text-muted)]">
            {[
              { label: "Require GPS verification", enabled: true },
              { label: "Require password unlock", enabled: true },
              { label: "Enable hint purchases", enabled: true },
              { label: "Allow replay of completed clues", enabled: false },
              { label: "Show demo-only helper text", enabled: false },
            ].map((item) => (
              <label
                key={item.label}
                className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
              >
                <span>{item.label}</span>
                <span className="relative inline-flex h-6 w-11 items-center">
                  <input
                    type="checkbox"
                    defaultChecked={item.enabled}
                    className="peer h-0 w-0 opacity-0"
                  />
                  <span className="absolute inset-0 rounded-full border border-[var(--stroke)] bg-black/40 transition peer-checked:bg-[var(--accent-emerald)]/40 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-gold)]" />
                  <span className="absolute left-1 h-4 w-4 rounded-full bg-[var(--text-muted)] transition peer-checked:translate-x-5 peer-checked:bg-[var(--accent-gold)]" />
                </span>
              </label>
            ))}
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {[
              { label: "Starting wallet credits", placeholder: "20" },
              { label: "Max hint cost", placeholder: "14" },
              { label: "Default GPS radius (m)", placeholder: "120" },
              { label: "Auto-save delay (s)", placeholder: "2" },
            ].map((field) => (
              <label key={field.label} className="grid content-start gap-2 text-xs text-[var(--text-muted)]">
                {field.label}
                <input
                  type="number"
                  placeholder={field.placeholder}
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                />
              </label>
            ))}
          </div>
          <p className="mt-4 text-xs text-[var(--text-muted)]">
            These controls are UI-only right now. Wire them to Supabase once you confirm the rules.
          </p>
        </div>
        <div className="grid gap-6">
          <div className="glass-panel rounded-3xl p-6 md:p-8">
            <h2 className="text-display text-2xl">Design checklist</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Use this as a quick pre-flight before sending Erika to the next location.
            </p>
            <ul className="mt-4 grid gap-2 text-sm text-[var(--text-muted)]">
              <li>• Confirm clue copy reads well on mobile.</li>
              <li>• Add GPS coordinates + radius for every clue that requires verification.</li>
              <li>• Rotate clue passwords by re-entering them in the field below.</li>
              <li>• Keep hint pricing balanced with the wallet rewards.</li>
            </ul>
          </div>
          <div className="glass-panel rounded-3xl p-6 md:p-8">
            <h2 className="text-display text-2xl">Quick reference</h2>
            <div className="mt-3 grid gap-3 text-sm text-[var(--text-muted)]">
              <p>QR link format: `/experience?step=CLUE_INDEX&amp;unlock=1&amp;source=qr`</p>
              <p>Passwords are hashed on save. Leave blank to keep existing.</p>
              <p>Export lock requirements uses the admin PIN and decrypts on the server only.</p>
              <p>Radius is in meters. Use 80–150 for most locations.</p>
              <p>Coordinates should match the on-site GPS verification point.</p>
            </div>
          </div>
        </div>
      </section>

      <motion.div
        className="fixed right-6 top-24 z-50 flex justify-end"
        initial={false}
        animate={showQuickActions ? { opacity: 1, y: 0 } : { opacity: 0, y: -12 }}
        transition={{ duration: 0.25, ease: "easeOut" }}
        style={{ pointerEvents: showQuickActions ? "auto" : "none" }}
      >
        <div className="glass-panel pointer-events-auto rounded-full border border-[var(--stroke)] bg-black/70 px-3 py-2 backdrop-blur">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setQuickActionsCollapsed((prev) => !prev)}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
            >
              {quickActionsCollapsed ? "Show actions" : "Hide actions"}
            </button>
            {!quickActionsCollapsed && (
              <>
                <button
                  onClick={saveAll}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                >
                  Save all
                </button>
                <button
                  onClick={seedDefaults}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                >
                  Seed defaults
                </button>
                <button
                  onClick={migratePasswords}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                >
                  Secure passwords
                </button>
                <button
                  onClick={downloadQrLinks}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                >
                  QR links
                </button>
                <button
                  onClick={downloadLockRequirements}
                  className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                >
                  Lock report
                </button>
              </>
            )}
          </div>
        </div>
      </motion.div>

      <section className="glass-panel rounded-3xl p-5 md:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
              Clues
            </p>
            <h2 className="text-display text-2xl">Clue shortcuts</h2>
            <p className="mt-1 text-xs text-[var(--text-muted)]">
              Jump to a clue and automatically expand it for editing.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => toggleAll(true)}
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
            >
              Expand all
            </button>
            <button
              onClick={() => toggleAll(false)}
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
            >
              Collapse all
            </button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {drafts.map((clue) => (
            <button
              key={`jump-${clue.id}`}
              onClick={() => scrollToClue(clue)}
              className="rounded-2xl border border-[var(--stroke)] px-3 py-3 text-left text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]"
            >
              <span className="block text-[10px] text-[var(--accent-emerald)]">
                {clue.label}
              </span>
              <span className="mt-1 block truncate">{clue.title}</span>
            </button>
          ))}
        </div>
      </section>

      <section ref={cluesSectionRef} className="grid gap-6">
        {drafts.map((clue, clueIndex) => (
          <div key={clue.id} className="grid gap-3">
            <div
              id={`clue-${clue.clue_index}`}
              className={`glass-panel rounded-3xl border-l-4 p-6 md:p-8 ${
                isClueDirty(clue)
                  ? "border-l-[var(--accent-coral)]"
                  : "border-l-[var(--accent-emerald)]"
              } ${activeClueId === clue.id ? "glow-ring" : ""} cursor-pointer`}
              onClick={(event) => {
                const target = event.target as HTMLElement;
                if (target.closest("[data-no-toggle]")) return;
                setExpanded((prev) => ({
                  ...prev,
                  [clue.id]: !prev[clue.id],
                }));
              }}
              onFocusCapture={() => setActiveClueId(clue.id)}
            >
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                    {clue.label}
                  </p>
                  <h2 className="text-display text-2xl">{clue.title}</h2>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  {isClueDirty(clue) ? (
                    <span className="rounded-full border border-[var(--accent-coral)]/50 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-coral)]">
                      Unsaved
                    </span>
                  ) : (
                    <span className="rounded-full border border-[var(--accent-emerald)]/50 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                      Saved
                    </span>
                  )}
                  {clue.requires_unlock !== false &&
                    (!clue.radius_meters || !clue.lat || !clue.lng) && (
                    <span className="rounded-full border border-[var(--accent-coral)]/50 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-coral)]">
                      Missing GPS
                    </span>
                  )}
                  {clue.requires_unlock !== false &&
                    !clue.has_password &&
                    !clue.password?.trim() && (
                    <span className="rounded-full border border-[var(--accent-coral)]/50 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-coral)]">
                      Missing password
                    </span>
                  )}
                  <span className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Reward {clue.reward}
                  </span>
                  <button
                    data-no-toggle
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [clue.id]: !prev[clue.id],
                      }))
                    }
                    className="rounded-full bg-[var(--accent-gold)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-black shadow-lg shadow-[var(--accent-gold)]/30"
                  >
                    {expanded[clue.id] ?? false ? "Collapse" : "Expand"}
                  </button>
                </div>
              </div>

              {expanded[clue.id] ?? false ? (
                <div data-no-toggle>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Clue details
                </p>
                <div className="mt-3 grid content-start gap-4">
                  <label className="grid content-start gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">Clue title</span>
                    <input
                      value={clue.title}
                      onChange={(event) => updateClue(clueIndex, "title", event.target.value)}
                      className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                    />
                  </label>
                  <label className="grid content-start gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">Reward amount</span>
                    <input
                      type="number"
                      value={clue.reward}
                      onChange={(event) => updateClue(clueIndex, "reward", Number(event.target.value))}
                      className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                    />
                  </label>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Clue text
                </p>
                <label className="mt-3 grid content-start gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">Narrative</span>
                  <textarea
                    value={clue.clue}
                    onChange={(event) => updateClue(clueIndex, "clue", event.target.value)}
                    className="min-h-[140px] w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                  />
                </label>
                <label className="mt-4 grid content-start gap-2 text-sm">
                  <span className="text-[var(--text-muted)]">Reminder text (optional)</span>
                  <textarea
                    value={clue.reminder ?? ""}
                    onChange={(event) => updateClue(clueIndex, "reminder", event.target.value)}
                    className="min-h-[100px] w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                    placeholder="Short reminder or nudge for where to look."
                  />
                </label>
              </div>
            </div>

            <div className="mt-6 rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">Hints</p>
              <div className="mt-3 flex flex-wrap items-center gap-3 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                <span>Hints enabled</span>
                <label className="relative inline-flex h-6 w-11 items-center">
                  <input
                    type="checkbox"
                    checked={clue.hints_enabled !== false}
                    onChange={(event) => updateClue(clueIndex, "hints_enabled", event.target.checked)}
                    className="peer h-0 w-0 opacity-0"
                  />
                  <span className="absolute inset-0 rounded-full border border-[var(--stroke)] bg-black/40 transition peer-checked:bg-[var(--accent-emerald)]/40 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-gold)]" />
                  <span className="absolute left-1 h-4 w-4 rounded-full bg-[var(--text-muted)] transition peer-checked:translate-x-5 peer-checked:bg-[var(--accent-gold)]" />
                </label>
                <span className="ml-2">Hint count</span>
                <div className="flex items-center gap-2">
                  {[1, 2, 3].map((count) => (
                    <button
                      key={count}
                      onClick={() => setHintCount(clueIndex, count as 1 | 2 | 3)}
                      disabled={clue.hints_enabled === false}
                      className={`rounded-full px-3 py-2 text-[10px] uppercase tracking-[0.3em] ${
                        (clue.hint_limit ?? clue.hints.length) === count
                          ? "bg-[var(--accent-gold)] text-black"
                          : "border border-[var(--stroke)] text-[var(--text-muted)]"
                      } ${clue.hints_enabled === false ? "opacity-50" : ""}`}
                    >
                      {count} hint{count > 1 ? "s" : ""}
                    </button>
                  ))}
                </div>
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                {clue.hints.map((hint, hintIndex) => (
                  <div
                    key={hint.id}
                    className={`rounded-2xl border border-[var(--stroke)] bg-black/30 p-4 ${
                      clue.hints_enabled === false ? "opacity-50" : ""
                    }`}
                  >
                    <div className="flex items-center justify-between text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      <span>Hint {hintIndex + 1}</span>
                      <span
                        className={`rounded-full px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${
                          hint.cost <= 5
                            ? "bg-[var(--accent-emerald)]/20 text-[var(--accent-emerald)]"
                            : hint.cost <= 9
                            ? "bg-[var(--accent-gold)]/20 text-[var(--accent-gold)]"
                            : "bg-[var(--accent-coral)]/20 text-[var(--accent-coral)]"
                        }`}
                      >
                        {hint.cost} credits
                      </span>
                    </div>
                    <textarea
                      value={hint.text}
                      disabled={clue.hints_enabled === false}
                      onChange={(event) => updateHint(clueIndex, hintIndex, "text")(event.target.value)}
                      className="mt-3 min-h-[80px] w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                    />
                    <label className="mt-3 grid content-start gap-2 text-xs text-[var(--text-muted)]">
                      Cost
                      <input
                        type="number"
                        value={hint.cost}
                        disabled={clue.hints_enabled === false}
                        onChange={(event) => updateHint(clueIndex, hintIndex, "cost")(event.target.value)}
                        className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                      />
                    </label>
                  </div>
                ))}
              </div>
            </div>

            <div className="mt-6 grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Unlock requirements
                </p>
                <div className="mt-3 grid gap-4">
                  <label className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-[var(--text-muted)]">
                    <span>Require lock for this clue</span>
                    <span className="relative inline-flex h-6 w-11 items-center">
                      <input
                        type="checkbox"
                        checked={clue.requires_unlock !== false}
                        onChange={(event) =>
                          updateClue(clueIndex, "requires_unlock", event.target.checked)
                        }
                        className="peer h-0 w-0 opacity-0"
                      />
                      <span className="absolute inset-0 rounded-full border border-[var(--stroke)] bg-black/40 transition peer-checked:bg-[var(--accent-emerald)]/40 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-gold)]" />
                      <span className="absolute left-1 h-4 w-4 rounded-full bg-[var(--text-muted)] transition peer-checked:translate-x-5 peer-checked:bg-[var(--accent-gold)]" />
                    </span>
                  </label>
                  <label className="grid content-start gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">Clue password</span>
                    <input
                      value={clue.password ?? ""}
                      disabled={clue.requires_unlock === false}
                      onChange={(event) => updateClue(clueIndex, "password", event.target.value)}
                      className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                      placeholder="Enter a new password to replace"
                    />
                  </label>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="grid content-start gap-2 text-sm">
                      <span className="text-[var(--text-muted)]">Latitude</span>
                      <input
                        type="number"
                        value={clue.lat ?? ""}
                        disabled={clue.requires_unlock === false}
                        onChange={(event) =>
                          updateClue(
                            clueIndex,
                            "lat",
                            event.target.value === "" ? null : Number(event.target.value)
                          )
                        }
                        className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                      />
                    </label>
                    <label className="grid content-start gap-2 text-sm">
                      <span className="text-[var(--text-muted)]">Longitude</span>
                      <input
                        type="number"
                        value={clue.lng ?? ""}
                        disabled={clue.requires_unlock === false}
                        onChange={(event) =>
                          updateClue(
                            clueIndex,
                            "lng",
                            event.target.value === "" ? null : Number(event.target.value)
                          )
                        }
                        className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                      />
                    </label>
                  </div>
                  <label className="grid content-start gap-2 text-sm">
                    <span className="text-[var(--text-muted)]">GPS radius (meters)</span>
                    <input
                      type="number"
                      value={clue.radius_meters ?? ""}
                      disabled={clue.requires_unlock === false}
                      onChange={(event) =>
                        updateClue(
                          clueIndex,
                          "radius_meters",
                          event.target.value === "" ? null : Number(event.target.value)
                        )
                      }
                      className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                    />
                  </label>
                </div>
              </div>
              <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4 text-sm text-[var(--text-muted)]">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  GPS preview
                </p>
                <div className="mt-3 overflow-hidden rounded-2xl border border-[var(--stroke)]">
                  {mapsKey ? (
                    isLoaded ? (
                      <GoogleMap
                        mapContainerStyle={{ width: "100%", height: "220px" }}
                        zoom={clue.lat && clue.lng ? 14 : 3}
                        center={{
                          lat: clue.lat ?? 39.8283,
                          lng: clue.lng ?? -98.5795,
                        }}
                        onClick={(event) => {
                          const lat = event.latLng?.lat();
                          const lng = event.latLng?.lng();
                          if (lat === undefined || lng === undefined) return;
                          updateClue(clueIndex, "lat", lat);
                          updateClue(clueIndex, "lng", lng);
                        }}
                        options={{
                          disableDefaultUI: true,
                          zoomControl: true,
                          styles: [
                            { featureType: "poi", stylers: [{ visibility: "off" }] },
                            { featureType: "transit", stylers: [{ visibility: "off" }] },
                          ],
                        }}
                      >
                        {clue.lat && clue.lng && (
                          <Marker
                            position={{ lat: clue.lat, lng: clue.lng }}
                            draggable
                            onDragEnd={(event) => {
                              const lat = event.latLng?.lat();
                              const lng = event.latLng?.lng();
                              if (lat === undefined || lng === undefined) return;
                              updateClue(clueIndex, "lat", lat);
                              updateClue(clueIndex, "lng", lng);
                            }}
                          />
                        )}
                      </GoogleMap>
                    ) : (
                      <div className="flex h-[220px] items-center justify-center bg-black/30 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                        Loading map...
                      </div>
                    )
                  ) : (
                    <div className="flex h-[220px] items-center justify-center bg-black/30 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                      Missing Google Maps API key
                    </div>
                  )}
                </div>
                <p className="mt-3 text-xs">
                  {clue.lat && clue.lng
                    ? `${clue.lat.toFixed(5)}, ${clue.lng.toFixed(5)}`
                    : "Coordinates not set"}
                </p>
                {clue.lat && clue.lng && (
                  <a
                    href={`https://maps.google.com/?q=${clue.lat},${clue.lng}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-flex text-xs uppercase tracking-[0.3em] text-[var(--accent-gold)]"
                  >
                    Open in maps
                  </a>
                )}
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Click on the map to set coordinates or drag the marker to adjust.
                </p>
              </div>
            </div>

            <div className="mt-6">
              <button
                onClick={() =>
                  saveClue(drafts[clueIndex])
                    .then(() => notifyStatus("Saved clue changes."))
                    .catch((error) =>
                      notifyStatus(error instanceof Error ? error.message : "Unable to save clue.")
                    )
                }
                className="rounded-full border border-[var(--stroke)] px-5 py-2 text-xs uppercase tracking-[0.3em] text-white"
              >
                Save this clue
              </button>
            </div>
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </section>
    </motion.div>
  );
}
