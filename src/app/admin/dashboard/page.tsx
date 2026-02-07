"use client";

import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useProfile } from "@/lib/profile";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import MenuButton from "@/components/menu-button";
import { useDemoSettings } from "@/lib/demo";
import { steps } from "@/lib/steps";
import { useClues } from "@/lib/clues";
import GameDesignPanel from "@/components/admin/game-design-panel";
import { usePlayerProgress } from "@/lib/player-progress";
import SmsTab from "@/components/admin/sms/sms-tab";

type PlayerRow = {
  id: string;
  full_name: string | null;
  username: string | null;
  role: string | null;
  is_disabled: boolean | null;
  created_at: string | null;
  wallet: number;
  currentClue: number;
  completions: number[];
  completionDetails: { clue_index: number; completed_at: string }[];
  hints: { clue_index: number; hint_order: number; purchased_at: string }[];
  lastActivity: string | null;
};

type AdminUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  username: string | null;
  role: string | null;
  is_disabled: boolean | null;
  created_at: string | null;
  last_sign_in_at: string | null;
};

type AuthorizedName = {
  id: string;
  display_name: string;
  normalized_name: string;
  created_at: string | null;
};

type StatusMessage = {
  message: string;
  id: number;
};

const STARTING_WALLET = 20;
const ACTIVE_WINDOW_MINUTES = 30;
const STUCK_WINDOW_HOURS = 24;
const LOW_WALLET_THRESHOLD = 5;
const formatSince = (iso: string | null) => {
  if (!iso) return "Unknown";
  const diffMs = Date.now() - new Date(iso).getTime();
  if (diffMs < 60_000) return "Just now";
  const mins = Math.round(diffMs / 60_000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
};

export default function AdminDashboard() {
  const router = useRouter();
  const { profile, loading, user } = useProfile();
  const progress = usePlayerProgress(user);
  const { clues: liveClues } = useClues();
  const isAdmin = profile?.role === "admin" || profile?.role === "moderator";
  const isOwner = profile?.role === "admin";
  const currentUserId = profile?.id ?? user?.id ?? null;
  const { demoMode, demoUi, playerView, toggleDemo, togglePlayerView } = useDemoSettings(
    Boolean(isOwner)
  );
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [playersLoading, setPlayersLoading] = useState(false);
  const [playerDrafts, setPlayerDrafts] = useState<
    Record<string, { username?: string; currentClue?: number; addCredits?: string }>
  >({});
  const [playerViewMode, setPlayerViewMode] = useState<"players" | "staff" | "all" | "custom">(
    "players"
  );
  const [playerRoleFilter, setPlayerRoleFilter] = useState({
    player: true,
    moderator: false,
    admin: false,
  });
  const [includeDisabledPlayers, setIncludeDisabledPlayers] = useState(true);
  const [playerFilterOpen, setPlayerFilterOpen] = useState(false);
  const [expandedPlayers, setExpandedPlayers] = useState<Record<string, boolean>>({});
  const [expandedUsers, setExpandedUsers] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<StatusMessage | null>(null);
  const [banner, setBanner] = useState<{
    message: string;
    tone: "loading" | "success" | "error";
  } | null>(null);
  const [bannerVisible, setBannerVisible] = useState(false);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [userDrafts, setUserDrafts] = useState<
    Record<string, { full_name?: string; username?: string; email?: string; role?: string }>
  >({});
  const [authorizedNames, setAuthorizedNames] = useState<AuthorizedName[]>([]);
  const [userStatus, setUserStatus] = useState<StatusMessage | null>(null);
  const [newAuthorizedName, setNewAuthorizedName] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"overview" | "players" | "users" | "design" | "sms">(
    "overview"
  );

  const pushStatus = (message: string) => {
    setStatus({ message, id: Date.now() });
  };

  const pushUserStatus = (message: string) => {
    setUserStatus({ message, id: Date.now() });
  };

  useEffect(() => {
    const message = status?.message ?? userStatus?.message;
    if (!message) return;
    const tone: "loading" | "success" | "error" = /saving|seeding|securing|updating|sending/i.test(
      message
    )
      ? "loading"
      : /unable|error|failed/i.test(message)
        ? "error"
        : "success";
    setBanner({ message, tone });
    setBannerVisible(true);
    const timer = window.setTimeout(() => setBannerVisible(false), 5000);
    return () => window.clearTimeout(timer);
  }, [status, userStatus]);

  const getAdminToken = async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  };

  const loadPlayers = async () => {
    setPlayersLoading(true);
    const supabase = createSupabaseBrowserClient();

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, username, role, is_disabled, created_at");

    const { data: states } = await supabase
      .from("player_state")
      .select("player_id, wallet_balance, current_clue_index, updated_at");

    const { data: completions } = await supabase
      .from("step_completions")
      .select("player_id, clue_index, completed_at");

    const { data: hints } = await supabase
      .from("hint_purchases")
      .select("player_id, clue_index, hint_order, purchased_at");

    const completionMap = new Map<string, number[]>();
    const completionTimes = new Map<string, { clue_index: number; completed_at: string }[]>();
    (completions ?? []).forEach((row) => {
      if (!completionMap.has(row.player_id)) completionMap.set(row.player_id, []);
      completionMap.get(row.player_id)!.push(row.clue_index);
      if (!completionTimes.has(row.player_id)) completionTimes.set(row.player_id, []);
      completionTimes.get(row.player_id)!.push({
        clue_index: row.clue_index,
        completed_at: row.completed_at,
      });
    });

    const hintMap = new Map<string, { clue_index: number; hint_order: number; purchased_at: string }[]>();
    const hintTimes = new Map<string, string[]>();
    (hints ?? []).forEach((row) => {
      if (!hintMap.has(row.player_id)) hintMap.set(row.player_id, []);
      hintMap.get(row.player_id)!.push({
        clue_index: row.clue_index,
        hint_order: row.hint_order,
        purchased_at: row.purchased_at,
      });
      if (!hintTimes.has(row.player_id)) hintTimes.set(row.player_id, []);
      hintTimes.get(row.player_id)!.push(row.purchased_at);
    });

    const stateMap = new Map<
      string,
      { wallet: number; current: number; updated_at: string | null }
    >();
    (states ?? []).forEach((row) => {
      stateMap.set(row.player_id, {
        wallet: row.wallet_balance ?? 0,
        current: row.current_clue_index ?? 0,
        updated_at: row.updated_at ?? null,
      });
    });

    const rows = (profiles ?? []).map((row) => {
      const state = stateMap.get(row.id);
      const stateUpdatedAt = state?.updated_at ?? null;
      const completionList = completionTimes.get(row.id) ?? [];
      const hintList = hintTimes.get(row.id) ?? [];
      const latestCompletion = completionList
        .map((entry) => entry.completed_at)
        .filter(Boolean)
        .sort()
        .slice(-1)[0];
      const latestHint = hintList.sort().slice(-1)[0];
      const lastActivity = [stateUpdatedAt, latestCompletion, latestHint]
        .filter(Boolean)
        .sort()
        .slice(-1)[0] ?? null;

      return {
        ...row,
        wallet: state?.wallet ?? 0,
        currentClue: state?.current ?? 0,
        completions: completionMap.get(row.id) ?? [],
        completionDetails: completionList,
        hints: hintMap.get(row.id) ?? [],
        lastActivity,
      } as PlayerRow;
    });

    setPlayers(rows);
    setPlayersLoading(false);
  };

  useEffect(() => {
    if (isAdmin) loadPlayers();
  }, [isAdmin]);

  useEffect(() => {
    setExpandedPlayers((prev) => {
      const next = { ...prev };
      players.forEach((player) => {
        if (next[player.id] === undefined) next[player.id] = false;
      });
      return next;
    });
  }, [players]);

  const loadUsers = async () => {
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/users", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to load users.");
      return;
    }
    setUsers(body.users ?? []);
  };

  const loadAuthorizedNames = async () => {
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/authorized-names", {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to load authorized names.");
      return;
    }
    setAuthorizedNames(body.names ?? []);
  };

  useEffect(() => {
    if (!isAdmin) return;
    if (activeTab === "users") {
      loadUsers();
      loadAuthorizedNames();
    }
  }, [activeTab, isAdmin]);

  const giveCredits = async (playerId: string, amount: number) => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase
      .from("player_state")
      .select("wallet_balance")
      .eq("player_id", playerId)
      .maybeSingle();

    const next = (data?.wallet_balance ?? 0) + amount;
    await supabase
      .from("player_state")
      .upsert({ player_id: playerId, wallet_balance: next, current_clue_index: 0 });

    pushStatus("Credits updated.");
    loadPlayers();
  };

  const resetProgress = async (playerId: string) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("step_completions").delete().eq("player_id", playerId);
    await supabase.from("hint_purchases").delete().eq("player_id", playerId);
    await supabase
      .from("player_state")
      .upsert({
        player_id: playerId,
        current_clue_index: 0,
        wallet_balance: STARTING_WALLET,
      });

    pushStatus("Progress reset.");
    loadPlayers();
  };

  const setCurrentClue = async (playerId: string, clueIndex: number) => {
    const supabase = createSupabaseBrowserClient();
    await supabase
      .from("player_state")
      .upsert({ player_id: playerId, current_clue_index: clueIndex });
    pushStatus("Current clue updated.");
    loadPlayers();
  };

  const updateUsername = async (playerId: string, username: string) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("profiles").update({ username }).eq("id", playerId);
    pushStatus("Username updated.");
    loadPlayers();
  };

  const toggleDisabled = async (playerId: string, disabled: boolean) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("profiles").update({ is_disabled: disabled }).eq("id", playerId);
    pushStatus(disabled ? "Player disabled." : "Player enabled.");
    loadPlayers();
  };

  const markCompletion = async (playerId: string, clueIndex: number) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("step_completions").insert({ player_id: playerId, clue_index: clueIndex });
    pushStatus("Completion added.");
    loadPlayers();
  };

  const removeCompletion = async (playerId: string, clueIndex: number) => {
    const supabase = createSupabaseBrowserClient();
    await supabase
      .from("step_completions")
      .delete()
      .eq("player_id", playerId)
      .eq("clue_index", clueIndex);
    pushStatus("Completion removed.");
    loadPlayers();
  };

  const grantHint = async (playerId: string, clueIndex: number, hintOrder: number, cost: number) => {
    const supabase = createSupabaseBrowserClient();
    await supabase.from("hint_purchases").insert({
      player_id: playerId,
      clue_index: clueIndex,
      hint_order: hintOrder,
      cost,
    });
    pushStatus("Hint unlocked.");
    loadPlayers();
  };

  const updateUserProfile = async (
    userId: string,
    updates: { full_name?: string; username?: string; is_disabled?: boolean }
  ) => {
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "update_profile", userId, updates }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to update profile.");
      return;
    }
    pushUserStatus("User updated.");
    loadUsers();
  };

  const savePlayerDraft = async (player: PlayerRow) => {
    const draft = playerDrafts[player.id];
    if (!draft) {
      pushStatus("No changes to save.");
      return;
    }

    const tasks: Promise<void>[] = [];
    const nextUsername = draft.username ?? player.username ?? "";
    if (nextUsername !== (player.username ?? "")) {
      tasks.push(updateUsername(player.id, nextUsername));
    }

    if (
      typeof draft.currentClue === "number" &&
      draft.currentClue !== player.currentClue
    ) {
      tasks.push(setCurrentClue(player.id, draft.currentClue));
    }

    if (draft.addCredits) {
      const amount = Number(draft.addCredits);
      if (!Number.isNaN(amount) && amount !== 0) {
        tasks.push(giveCredits(player.id, amount));
      }
    }

    if (tasks.length === 0) {
      pushStatus("No changes to save.");
      return;
    }

    await Promise.all(tasks);
    setPlayerDrafts((prev) => {
      const { [player.id]: _removed, ...rest } = prev;
      return rest;
    });
    pushStatus("Player changes saved.");
  };

  const updateUserRole = async (userId: string, role: string) => {
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "set_role", userId, role }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to update role.");
      return;
    }
    pushUserStatus("Role updated.");
    loadUsers();
  };

  const saveUserDraft = async (user: AdminUser) => {
    const draft = userDrafts[user.id];
    if (!draft) {
      pushUserStatus("No changes to save.");
      return;
    }

    const tasks: Promise<void>[] = [];
    if (draft.full_name !== undefined && draft.full_name !== (user.full_name ?? "")) {
      tasks.push(updateUserProfile(user.id, { full_name: draft.full_name }));
    }
    if (draft.username !== undefined && draft.username !== (user.username ?? "")) {
      tasks.push(updateUserProfile(user.id, { username: draft.username }));
    }
    if (draft.email !== undefined && draft.email !== (user.email ?? "")) {
      tasks.push(updateUserEmail(user.id, draft.email));
    }
    if (draft.role !== undefined && draft.role !== (user.role ?? "player")) {
      tasks.push(updateUserRole(user.id, draft.role));
    }

    if (tasks.length === 0) {
      pushUserStatus("No changes to save.");
      return;
    }

    await Promise.all(tasks);
    setUserDrafts((prev) => {
      const { [user.id]: _removed, ...rest } = prev;
      return rest;
    });
    pushUserStatus("User changes saved.");
  };

  const updateUserEmail = async (userId: string, email: string) => {
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "set_email", userId, email }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to update email.");
      return;
    }
    pushUserStatus("Email updated.");
    loadUsers();
  };

  const sendResetLink = async (userId: string, email: string | null) => {
    if (!email) return;
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "reset_password", userId, email }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to generate reset link.");
      return;
    }
    if (body?.link) {
      if (typeof navigator !== "undefined" && navigator.clipboard) {
        await navigator.clipboard.writeText(body.link);
        pushUserStatus("Password reset link copied to clipboard.");
      } else {
        pushUserStatus("Password reset link generated.");
      }
    } else {
      pushUserStatus("Password reset link generated.");
    }
  };

  const deleteUser = async (userId: string) => {
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/users", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ action: "delete_user", userId }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to delete user.");
      return;
    }
    pushUserStatus("User deleted.");
    loadUsers();
  };

  const addAuthorized = async () => {
    if (!newAuthorizedName.trim()) return;
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/authorized-names", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ display_name: newAuthorizedName }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to add authorized name.");
      return;
    }
    setNewAuthorizedName("");
    loadAuthorizedNames();
  };

  const removeAuthorized = async (id: string) => {
    const token = await getAdminToken();
    if (!token) return;
    const response = await fetch("/api/admin/authorized-names", {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ id }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setUserStatus(body?.reason ?? "Unable to remove name.");
      return;
    }
    loadAuthorizedNames();
  };

  const playerRows = useMemo(() => players, [players]);

  const filteredPlayerRows = useMemo(() => {
    let rows = [...playerRows];
    if (!includeDisabledPlayers) {
      rows = rows.filter((player) => !player.is_disabled);
    }

    if (playerViewMode === "players") {
      return rows.filter((player) => (player.role ?? "player") === "player");
    }
    if (playerViewMode === "staff") {
      return rows.filter((player) => ["admin", "moderator"].includes(player.role ?? ""));
    }
    if (playerViewMode === "custom") {
      return rows.filter((player) => {
        const role = (player.role ?? "player") as "player" | "moderator" | "admin";
        return Boolean(playerRoleFilter[role]);
      });
    }
    return rows;
  }, [playerRows, includeDisabledPlayers, playerViewMode, playerRoleFilter]);

  const togglePlayerCard = (playerId: string) => {
    setExpandedPlayers((prev) => ({ ...prev, [playerId]: !prev[playerId] }));
  };

  const toggleUserCard = (userId: string) => {
    setExpandedUsers((prev) => ({ ...prev, [userId]: !prev[userId] }));
  };
  const clueLookup = useMemo(() => {
    const map = new Map<number, { label: string; title: string }>();
    liveClues.forEach((clue) => {
      map.set(clue.clue_index, {
        label: clue.label ?? `Clue ${clue.clue_index}`,
        title: clue.title ?? `Clue ${clue.clue_index}`,
      });
    });
    return map;
  }, [liveClues]);

  const getClueLabel = (index: number) =>
    clueLookup.get(index)?.label ?? steps[index]?.label ?? `Clue ${index}`;
  const getClueTitle = (index: number) =>
    clueLookup.get(index)?.title ?? steps[index]?.title ?? `Clue ${index}`;

  const overview = useMemo(() => {
    const totalClues = liveClues.length || steps.length;
    const totalPlayers = playerRows.length;
    const activePlayers = playerRows.filter((player) => !player.is_disabled).length;
    const totalCompletions = playerRows.reduce(
      (sum, player) => sum + player.completions.length,
      0
    );
    const totalHints = playerRows.reduce((sum, player) => sum + player.hints.length, 0);
    const lowWalletPlayers = playerRows.filter((player) => player.wallet <= LOW_WALLET_THRESHOLD);
    const now = Date.now();
    const activeNow = playerRows.filter((player) => {
      if (!player.lastActivity) return false;
      const delta = now - new Date(player.lastActivity).getTime();
      return delta <= ACTIVE_WINDOW_MINUTES * 60 * 1000;
    });
    const stuckPlayers = playerRows.filter((player) => {
      if (!player.lastActivity) return false;
      if (player.currentClue >= totalClues - 1) return false;
      const delta = now - new Date(player.lastActivity).getTime();
      return delta >= STUCK_WINDOW_HOURS * 60 * 60 * 1000;
    });
    const totalProgress = playerRows.reduce(
      (sum, player) => sum + (player.currentClue ?? 0),
      0
    );
    const averageProgress =
      totalPlayers > 0 ? Math.round((totalProgress / totalPlayers) * 100) / 100 : 0;

    const completionFunnel = Array.from({ length: totalClues }, (_, index) => ({
      clue_index: index,
      label: getClueLabel(index),
      completed: playerRows.filter((player) => player.completions.includes(index)).length,
    }));

    const progressDistribution = Array.from({ length: totalClues }, (_, index) => ({
      clue_index: index,
      label: getClueLabel(index),
      count: playerRows.filter((player) => player.currentClue === index).length,
    }));

    const hintHeatmap = Array.from({ length: totalClues }, (_, index) => ({
      clue_index: index,
      label: getClueLabel(index),
      hints: playerRows.reduce(
        (sum, player) => sum + player.hints.filter((hint) => hint.clue_index === index).length,
        0
      ),
    }));

    const avgTimeByClue = Array.from({ length: totalClues }, (_, index) => ({
      clue_index: index,
      label: getClueLabel(index),
      hours: null as number | null,
    }));

    const timeBuckets: Record<number, number[]> = {};
    playerRows.forEach((player) => {
      const completionTimes = player.completionDetails
        .filter((item) => item.completed_at)
        .sort((a, b) => a.clue_index - b.clue_index);
      for (let i = 1; i < completionTimes.length; i += 1) {
        const prev = completionTimes[i - 1];
        const current = completionTimes[i];
        if (!prev?.completed_at || !current?.completed_at) continue;
        const diffHours =
          (new Date(current.completed_at).getTime() - new Date(prev.completed_at).getTime()) /
          (1000 * 60 * 60);
        if (!timeBuckets[current.clue_index]) timeBuckets[current.clue_index] = [];
        timeBuckets[current.clue_index].push(diffHours);
      }
    });

    avgTimeByClue.forEach((entry) => {
      const samples = timeBuckets[entry.clue_index];
      if (!samples || samples.length === 0) return;
      const avg = samples.reduce((sum, value) => sum + value, 0) / samples.length;
      entry.hours = Math.round(avg * 10) / 10;
    });

    const recentActivity = [
      ...playerRows.flatMap((player) =>
        player.completionDetails.map((entry) => ({
          type: "completed" as const,
          playerId: player.id,
          playerName: player.full_name || player.username || "Player",
          clueIndex: entry.clue_index,
          timestamp: entry.completed_at,
        }))
      ),
      ...playerRows.flatMap((player) =>
        player.hints.map((hint) => ({
          type: "hint" as const,
          playerId: player.id,
          playerName: player.full_name || player.username || "Player",
          clueIndex: hint.clue_index,
          timestamp: hint.purchased_at,
        }))
      ),
    ]
      .filter((entry) => entry.timestamp)
      .sort((a, b) => (a.timestamp ?? "").localeCompare(b.timestamp ?? ""))
      .slice(-10)
      .reverse();

    return {
      totalClues,
      totalPlayers,
      activePlayers,
      totalCompletions,
      totalHints,
      averageProgress,
      activeNow,
      stuckPlayers,
      lowWalletPlayers,
      completionFunnel,
      progressDistribution,
      hintHeatmap,
      avgTimeByClue,
      recentActivity,
    };
  }, [playerRows]);

  if (loading) {
    return (
      <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
        <div className="glass-panel rounded-3xl p-6 md:p-8">
          <div className="animate-pulse space-y-4">
            <div className="h-4 w-40 rounded-full bg-white/10" />
            <div className="h-10 w-72 rounded-2xl bg-white/10" />
            <div className="h-3 w-56 rounded-full bg-white/10" />
          </div>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-16">
        <div className="glass-panel rounded-3xl p-6 md:p-8">
          Admin access required.
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell min-h-screen px-6 py-10 md:px-12 md:py-14">
      <motion.div
        className="mx-auto flex w-full max-w-6xl flex-col gap-8"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        <header className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent-emerald)]">
                Admin Dashboard
              </p>
              {demoUi && (
                <span className="rounded-full border border-[var(--accent-emerald)]/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                  Demo mode
                </span>
              )}
            </div>
            <MenuButton
              showCurrentClue
              currentStepId={progress.state?.lastStepId ?? 0}
              showProfile
              showHowToPlay
              adminControls={{
                enabled: Boolean(isOwner),
                demoMode,
                playerView,
                onToggleDemo: toggleDemo,
                onTogglePlayerView: togglePlayerView,
              }}
            />
          </div>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-display text-3xl md:text-5xl">Mission Control</h1>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Monitor live progress, tune the hunt, and manage your roster.
              </p>
            </div>
          </div>
        </header>

        {banner && bannerVisible && (
          <motion.div
            className="fixed left-1/2 top-4 z-50 flex w-[min(720px,90vw)] -translate-x-1/2 items-center justify-between gap-4 rounded-2xl border border-[var(--stroke)] bg-black/80 px-4 py-3 text-sm text-[var(--text-muted)] shadow-[var(--shadow)] backdrop-blur"
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
          >
            <div className="flex items-center gap-3">
              {banner.tone === "loading" ? (
                <span className="h-2 w-2 animate-pulse rounded-full bg-[var(--accent-gold)]" />
              ) : banner.tone === "error" ? (
                <span className="h-2 w-2 rounded-full bg-[#f16d6d]" />
              ) : (
                <span className="h-2 w-2 rounded-full bg-[var(--accent-emerald)]" />
              )}
              <span>{banner.message}</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setBannerVisible(false);
                setBanner(null);
                setStatus(null);
                setUserStatus(null);
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white"
            >
              Close
            </button>
          </motion.div>
        )}

        <nav className="flex flex-wrap gap-2">
          {[
            { key: "overview", label: "Overview" },
            { key: "players", label: "Players" },
            { key: "users", label: "User Management" },
            { key: "design", label: "Game Design" },
            { key: "sms", label: "SMS Alerts" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() =>
                setActiveTab(tab.key as "overview" | "players" | "users" | "design" | "sms")
              }
              className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em] ${
                activeTab === tab.key
                  ? "bg-[var(--accent-gold)] text-black"
                  : "border border-[var(--stroke)] text-[var(--text-muted)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {activeTab === "overview" && (
          <motion.section
            className="grid gap-6 md:grid-cols-2"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Overview</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Snapshot of active players, progress, and hint usage.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-4">
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Total players
                  </p>
                  <p className="mt-2 text-2xl text-white">{overview.totalPlayers}</p>
                </div>
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Active
                  </p>
                  <p className="mt-2 text-2xl text-white">{overview.activePlayers}</p>
                </div>
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Completions
                  </p>
                  <p className="mt-2 text-2xl text-white">{overview.totalCompletions}</p>
                </div>
                <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-4">
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    Hints bought
                  </p>
                  <p className="mt-2 text-2xl text-white">{overview.totalHints}</p>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Progress</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Average current clue across active players.
              </p>
              <div className="mt-6 rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-6 text-center">
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                  Average clue index
                </p>
                <p className="mt-3 text-3xl text-white">{overview.averageProgress}</p>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Active Now</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Players seen within the last {ACTIVE_WINDOW_MINUTES} minutes.
              </p>
              <div className="mt-4 grid gap-3">
                {overview.activeNow.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No active players right now.</p>
                )}
                {overview.activeNow.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <span className="text-sm text-white">
                      {player.full_name || player.username || "Player"}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {formatSince(player.lastActivity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Stuck Alerts</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Players inactive for more than {STUCK_WINDOW_HOURS} hours.
              </p>
              <div className="mt-4 grid gap-3">
                {overview.stuckPlayers.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No stuck players detected.</p>
                )}
                {overview.stuckPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <span className="text-sm text-white">
                      {player.full_name || player.username || "Player"}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      Clue {player.currentClue} • {formatSince(player.lastActivity)}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Recent Activity</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Last 10 completions and hint purchases.
              </p>
              <div className="mt-4 grid gap-3">
                {overview.recentActivity.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No recent activity.</p>
                )}
                {overview.recentActivity.map((entry, index) => (
                  <div
                    key={`${entry.playerId}-${entry.type}-${index}`}
                    className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">
                        {entry.playerName} • {getClueLabel(entry.clueIndex)}
                      </span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {formatSince(entry.timestamp)}
                      </span>
                    </div>
                    <p className="mt-2 text-xs uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      {entry.type === "completed" ? "Clue completed" : "Hint purchased"}
                    </p>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Wallet Health</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Players with {LOW_WALLET_THRESHOLD} credits or fewer.
              </p>
              <div className="mt-4 grid gap-3">
                {overview.lowWalletPlayers.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No low-wallet players.</p>
                )}
                {overview.lowWalletPlayers.map((player) => (
                  <div
                    key={player.id}
                    className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <span className="text-sm text-white">
                      {player.full_name || player.username || "Player"}
                    </span>
                    <span className="text-xs text-[var(--accent-gold)]">
                      ¢{player.wallet} credits
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8 md:col-span-2">
              <h2 className="text-display text-2xl">Completion Funnel</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                How many players completed each clue.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {overview.completionFunnel.map((entry) => (
                  <div
                    key={entry.clue_index}
                    className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-white">{entry.label}</span>
                      <span className="text-xs text-[var(--text-muted)]">
                        {entry.completed}/{overview.totalPlayers}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Progress Distribution</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                How many players are on each clue.
              </p>
              <div className="mt-4 grid gap-3">
                {overview.progressDistribution.map((entry) => (
                  <div
                    key={entry.clue_index}
                    className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <span className="text-sm text-white">{entry.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">{entry.count}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Hint Spend Heatmap</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Which clues are consuming the most hints.
              </p>
              <div className="mt-4 grid gap-3">
                {overview.hintHeatmap.map((entry) => (
                  <div
                    key={entry.clue_index}
                    className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <span className="text-sm text-white">{entry.label}</span>
                    <span className="text-xs text-[var(--accent-gold)]">{entry.hints}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8 md:col-span-2">
              <h2 className="text-display text-2xl">Average Time Per Clue</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Average hours spent between clue completions.
              </p>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {overview.avgTimeByClue.map((entry) => (
                  <div
                    key={entry.clue_index}
                    className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <span className="text-sm text-white">{entry.label}</span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {entry.hours === null ? "—" : `${entry.hours}h`}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </motion.section>
        )}

        {activeTab === "players" && (
          <motion.section
            className="relative z-10 grid gap-6 overflow-visible"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
          <div className="glass-panel relative z-50 overflow-visible rounded-3xl p-6 md:p-8">
            <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
              <div>
                <h2 className="text-display text-2xl">Player Operations</h2>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Track progress, manage credits, and reset player data.
                </p>
                <p className="mt-3 text-sm text-[var(--text-muted)]">
                  Choose which user types appear in the player list.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {[
                  { key: "players", label: "Players only" },
                  { key: "staff", label: "Staff only" },
                  { key: "all", label: "All roles" },
                ].map((option) => (
                  <button
                    key={option.key}
                    onClick={() =>
                      setPlayerViewMode(option.key as "players" | "staff" | "all" | "custom")
                    }
                    className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em] ${
                      playerViewMode === option.key
                        ? "bg-[var(--accent-gold)] text-black"
                        : "border border-[var(--stroke)] text-[var(--text-muted)]"
                    }`}
                  >
                    {option.label}
                  </button>
                ))}
                <div className="relative z-[500] isolate">
                  <button
                    onClick={() => {
                      setPlayerViewMode("custom");
                      setPlayerFilterOpen((prev) => !prev);
                    }}
                    className={`rounded-full px-4 py-2 text-xs uppercase tracking-[0.3em] ${
                      playerViewMode === "custom" || playerFilterOpen
                        ? "bg-[var(--accent-gold)] text-black"
                        : "border border-[var(--stroke)] text-[var(--text-muted)]"
                    }`}
                  >
                    Filters
                  </button>
                  {playerFilterOpen && (
                    <div className="absolute right-0 top-12 z-[600] w-64 rounded-2xl border border-[var(--stroke)] bg-[var(--panel-strong)] p-4 shadow-2xl">
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                        Roles
                      </p>
                      <div className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
                        {([
                          { key: "player", label: "Players" },
                          { key: "moderator", label: "Moderators" },
                          { key: "admin", label: "Admins" },
                        ] as const).map((role) => (
                          <label
                            key={role.key}
                            className={`flex cursor-pointer items-center gap-3 rounded-full border px-3 py-2 transition hover:border-[var(--accent-gold)]/70 hover:bg-black/50 ${
                              playerRoleFilter[role.key]
                                ? "border-[var(--accent-gold)]/70 bg-black/50 text-white"
                                : "border-[var(--stroke)] bg-black/30 text-[var(--text-muted)]"
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={playerRoleFilter[role.key]}
                              onChange={(event) =>
                                setPlayerRoleFilter((prev) => ({
                                  ...prev,
                                  [role.key]: event.target.checked,
                                }))
                              }
                              className="sr-only"
                            />
                            <span
                              className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                                playerRoleFilter[role.key]
                                  ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                                  : "border-[var(--stroke)] bg-black/40"
                              }`}
                            >
                              <span
                                className={`h-2.5 w-2.5 rounded-full transition ${
                                  playerRoleFilter[role.key]
                                    ? "bg-[var(--accent-gold)] opacity-100 shadow-[0_0_10px_rgba(255,241,143,0.6)]"
                                    : "bg-transparent opacity-0"
                                }`}
                              />
                            </span>
                            {role.label}
                          </label>
                        ))}
                      </div>
                      <div className="mt-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          Status
                        </p>
                        <label
                          className={`mt-3 flex cursor-pointer items-center gap-3 rounded-full border px-3 py-2 text-sm transition hover:border-[var(--accent-gold)]/70 hover:bg-black/50 ${
                            includeDisabledPlayers
                              ? "border-[var(--accent-gold)]/70 bg-black/50 text-white"
                              : "border-[var(--stroke)] bg-black/30 text-[var(--text-muted)]"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={includeDisabledPlayers}
                            onChange={(event) => setIncludeDisabledPlayers(event.target.checked)}
                            className="sr-only"
                          />
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded-full border ${
                              includeDisabledPlayers
                                ? "border-[var(--accent-gold)] bg-[var(--accent-gold)]/10"
                                : "border-[var(--stroke)] bg-black/40"
                            }`}
                          >
                            <span
                              className={`h-2.5 w-2.5 rounded-full transition ${
                                includeDisabledPlayers
                                  ? "bg-[var(--accent-gold)] opacity-100 shadow-[0_0_10px_rgba(255,241,143,0.6)]"
                                  : "bg-transparent opacity-0"
                              }`}
                            />
                          </span>
                          Include disabled players
                        </label>
                      </div>
                      <button
                        onClick={() => setPlayerFilterOpen(false)}
                        className="mt-4 w-full rounded-full border border-[var(--stroke)] px-3 py-2 text-xs uppercase tracking-[0.3em] text-white"
                      >
                        Done
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
          {playersLoading && (
            <div className="glass-panel relative z-0 rounded-3xl p-6 md:p-8">
              <div className="animate-pulse space-y-4">
                <div className="h-4 w-40 rounded-full bg-white/10" />
                <div className="h-9 w-full rounded-2xl bg-white/10" />
                <div className="h-9 w-4/5 rounded-2xl bg-white/10" />
              </div>
            </div>
          )}
          {!playersLoading && filteredPlayerRows.length === 0 && (
            <div className="glass-panel relative z-0 rounded-3xl p-6 md:p-8">
              <p className="text-sm text-[var(--text-muted)]">
                No players found yet. Once a player completes name auth and creates an account,
                their profile will appear here.
              </p>
            </div>
          )}
          {filteredPlayerRows.map((player) => {
            const isExpanded = expandedPlayers[player.id] ?? false;
            const clueTitle = (index: number) => getClueTitle(index);
            const eventItems = [
              ...player.completionDetails.map((entry) => ({
                id: `completion-${player.id}-${entry.clue_index}-${entry.completed_at}`,
                at: entry.completed_at,
                label: `Unlocked ${clueTitle(entry.clue_index)}`,
              })),
              ...player.hints.map((entry) => ({
                id: `hint-${player.id}-${entry.clue_index}-${entry.hint_order}-${entry.purchased_at}`,
                at: entry.purchased_at,
                label: `Purchased hint ${entry.hint_order} for ${clueTitle(entry.clue_index)}`,
              })),
            ]
              .filter((item) => item.at)
              .sort((a, b) => new Date(b.at!).getTime() - new Date(a.at!).getTime());
            return (
              <div
                key={player.id}
                className="glass-panel relative z-0 rounded-3xl p-6 md:p-8"
                onClick={(event) => {
                  const target = event.target as HTMLElement;
                  if (target.closest("[data-no-toggle]")) return;
                  togglePlayerCard(player.id);
                }}
              >
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                      Player
                    </p>
                    <h2 className="text-display text-2xl">
                      {player.full_name || player.username || "Unnamed"}
                    </h2>
                    <p className="text-xs text-[var(--text-muted)]">{player.role}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                    <span className="rounded-full border border-[var(--stroke)] px-3 py-2">
                      Wallet ¢{player.wallet}
                    </span>
                    <span className="rounded-full border border-[var(--stroke)] px-3 py-2">
                      Current clue {player.currentClue}
                    </span>
                    <span className="rounded-full border border-[var(--stroke)] px-3 py-2">
                      Completed {player.completions.length}
                    </span>
                    <span className="rounded-full border border-[var(--stroke)] px-3 py-2">
                      Hints {player.hints.length}
                    </span>
                    <button
                      data-no-toggle
                      onClick={() => togglePlayerCard(player.id)}
                      className="rounded-full bg-[var(--accent-gold)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-black shadow-lg shadow-[var(--accent-gold)]/30"
                    >
                      {isExpanded ? "Collapse" : "Expand"}
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-6 grid gap-6" data-no-toggle>
                    <div className="grid gap-4 md:grid-cols-2">
                      <label className="grid gap-2 text-sm">
                        <span className="text-[var(--text-muted)]">Add credits</span>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-2 text-sm text-white"
                            placeholder="20"
                            value={playerDrafts[player.id]?.addCredits ?? ""}
                            onChange={(event) =>
                              setPlayerDrafts((prev) => ({
                                ...prev,
                                [player.id]: {
                                  ...(prev[player.id] ?? {}),
                                  addCredits: event.target.value,
                                },
                              }))
                            }
                          />
                          <button
                            onClick={() =>
                              setPlayerDrafts((prev) => ({
                                ...prev,
                                [player.id]: {
                                  ...(prev[player.id] ?? {}),
                                  addCredits: String(
                                    (Number(prev[player.id]?.addCredits ?? 0) || 0) + 10
                                  ),
                                },
                              }))
                            }
                            className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
                          >
                            +10
                          </button>
                        </div>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="text-[var(--text-muted)]">Update username</span>
                        <input
                          type="text"
                          className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-2 text-sm text-white"
                          placeholder={player.username ?? "username"}
                          value={
                            playerDrafts[player.id]?.username ?? (player.username ?? "")
                          }
                          onChange={(event) =>
                            setPlayerDrafts((prev) => ({
                              ...prev,
                              [player.id]: {
                                ...(prev[player.id] ?? {}),
                                username: event.target.value,
                              },
                            }))
                          }
                        />
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="text-[var(--text-muted)]">Current clue</span>
                        <select
                          value={
                            playerDrafts[player.id]?.currentClue ?? player.currentClue
                          }
                          onChange={(event) =>
                            setPlayerDrafts((prev) => ({
                              ...prev,
                              [player.id]: {
                                ...(prev[player.id] ?? {}),
                                currentClue: Number(event.target.value),
                              },
                            }))
                          }
                          className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-2 text-sm text-white"
                        >
                          {steps.map((step) => (
                            <option key={step.id} value={step.id}>
                              {step.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-2 text-sm">
                        <span className="text-[var(--text-muted)]">Unlock hint</span>
                        <div className="flex gap-2">
                          <input
                            type="number"
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white"
                            placeholder="Clue"
                            onBlur={(event) => {
                              const clueIndex = Number(event.target.value);
                              if (Number.isNaN(clueIndex)) return;
                              grantHint(player.id, clueIndex, 1, 0);
                            }}
                          />
                          <input
                            type="number"
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white"
                            placeholder="Hint #"
                            onBlur={(event) => {
                              const hintOrder = Number(event.target.value);
                              if (Number.isNaN(hintOrder)) return;
                              grantHint(player.id, player.currentClue, hintOrder, 0);
                            }}
                          />
                          <input
                            type="number"
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white"
                            placeholder="Cost"
                            onBlur={(event) => {
                              const cost = Number(event.target.value);
                              if (Number.isNaN(cost)) return;
                              grantHint(player.id, player.currentClue, 1, cost);
                            }}
                          />
                        </div>
                      </label>
                      <div className="flex flex-wrap gap-3">
                        <button
                          onClick={() => savePlayerDraft(player)}
                          className="rounded-full bg-[var(--accent-gold)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-black"
                        >
                          Save changes
                        </button>
                        <button
                          onClick={() => resetProgress(player.id)}
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
                        >
                          Reset progress
                        </button>
                        <button
                          onClick={() => toggleDisabled(player.id, !player.is_disabled)}
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
                        >
                          {player.is_disabled ? "Enable player" : "Kick player"}
                        </button>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                      <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                        Progress toggles
                      </p>
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {steps.map((step) => {
                          const completed = player.completions.includes(step.id);
                          return (
                            <div
                              key={`${player.id}-toggle-${step.id}`}
                              className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                            >
                              <div>
                                <p className="text-sm text-white">{step.label}</p>
                                <p className="text-xs text-[var(--text-muted)]">
                                  {step.title}
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() =>
                                  completed
                                    ? removeCompletion(player.id, step.id)
                                    : markCompletion(player.id, step.id)
                                }
                                className={`relative inline-flex h-7 w-12 items-center rounded-full transition ${
                                  completed
                                    ? "bg-[var(--accent-emerald)]"
                                    : "border border-[var(--stroke)] bg-black/30"
                                }`}
                              >
                                <span
                                  className={`inline-block h-5 w-5 transform rounded-full bg-white transition ${
                                    completed ? "translate-x-6" : "translate-x-1"
                                  }`}
                                />
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          Current clue
                        </p>
                        <p className="mt-2 text-lg text-white">
                          {clueTitle(player.currentClue)}
                        </p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">
                          Last activity {formatSince(player.lastActivity)}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          Event log
                        </p>
                        <div className="mt-3 max-h-48 space-y-3 overflow-auto pr-2 text-sm text-[var(--text-muted)]">
                          {eventItems.length === 0 ? (
                            <p>No events recorded yet.</p>
                          ) : (
                            eventItems.slice(0, 12).map((event) => (
                              <div key={event.id} className="flex items-start justify-between gap-3">
                                <span className="text-white">{event.label}</span>
                                <span className="text-xs text-[var(--text-muted)]">
                                  {formatSince(event.at)}
                                </span>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          Completed clues
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {player.completionDetails.length === 0 && (
                            <span className="text-xs text-[var(--text-muted)]">
                              No completions yet.
                            </span>
                          )}
                          {player.completionDetails.map((entry) => (
                            <span
                              key={`${player.id}-${entry.clue_index}`}
                              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs text-[var(--text-muted)]"
                            >
                              Clue {entry.clue_index} • {formatSince(entry.completed_at)}
                            </span>
                          ))}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4">
                        <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          Hints unlocked
                        </p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {player.hints.length === 0 && (
                            <span className="text-xs text-[var(--text-muted)]">
                              No hints unlocked.
                            </span>
                          )}
                          {player.hints.map((entry, index) => (
                            <span
                              key={`${player.id}-hint-${index}`}
                              className="rounded-full border border-[var(--stroke)] px-3 py-1 text-xs text-[var(--text-muted)]"
                            >
                              Clue {entry.clue_index} • Hint {entry.hint_order}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          </motion.section>
        )}

        {activeTab === "users" && (
          <motion.section
            className="grid gap-6"
            initial={{ opacity: 0, y: 18 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
          >
            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <h2 className="text-display text-2xl">User Management</h2>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Manage access, profiles, and authorized individuals.
                  </p>
                </div>
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">Authorized Individuals</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Control who can pass the name gate.
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <input
                  value={newAuthorizedName}
                  onChange={(event) => setNewAuthorizedName(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-2 text-sm text-white md:max-w-xs"
                  placeholder="Add authorized name"
                />
                <button
                  onClick={addAuthorized}
                  className="rounded-full border border-[var(--stroke)] px-4 py-2 text-xs uppercase tracking-[0.3em] text-white"
                >
                  Add
                </button>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                {authorizedNames.map((name) => (
                  <div
                    key={name.id}
                    className="flex items-center justify-between rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3"
                  >
                    <div>
                      <p className="text-sm text-white">{name.display_name}</p>
                      <p className="text-xs text-[var(--text-muted)]">{name.normalized_name}</p>
                    </div>
                    <button
                      onClick={() => removeAuthorized(name.id)}
                      className="rounded-full border border-[var(--stroke)] px-3 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                    >
                      Remove
                    </button>
                  </div>
                ))}
                {authorizedNames.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No authorized names yet.</p>
                )}
              </div>
            </div>

            <div className="glass-panel rounded-3xl p-6 md:p-8">
              <h2 className="text-display text-2xl">User Directory</h2>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Manage profiles, roles, and access controls.
              </p>
              <div className="mt-4 grid gap-4">
                {users.map((user) => {
                  const isSelf = currentUserId === user.id;
                  const isExpanded = expandedUsers[user.id] ?? false;
                  return (
                  <div
                    key={user.id}
                    className="rounded-2xl border border-[var(--stroke)] bg-black/30 p-4"
                    onClick={(event) => {
                      const target = event.target as HTMLElement;
                      if (target.closest("[data-no-toggle]")) return;
                      toggleUserCard(user.id);
                    }}
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div>
                        <p className="text-sm text-white">
                          {user.full_name || user.username || "Unnamed"}
                        </p>
                        <p className="text-xs text-[var(--text-muted)]">{user.email ?? "No email"}</p>
                        <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--text-muted)]">
                          {user.role ?? "player"}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
                        <span className="rounded-full border border-[var(--stroke)] px-3 py-1">
                          Joined {user.created_at ? new Date(user.created_at).toLocaleDateString() : "—"}
                        </span>
                        <span className="rounded-full border border-[var(--stroke)] px-3 py-1">
                          Last sign-in {user.last_sign_in_at ? new Date(user.last_sign_in_at).toLocaleDateString() : "—"}
                        </span>
                        {isSelf && (
                          <span className="rounded-full border border-[var(--accent-emerald)]/40 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                            This is you
                          </span>
                        )}
                        <button
                          data-no-toggle
                          onClick={() => toggleUserCard(user.id)}
                          className="rounded-full bg-[var(--accent-gold)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-black shadow-lg shadow-[var(--accent-gold)]/30"
                        >
                          {isExpanded ? "Collapse" : "Expand"}
                        </button>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2" data-no-toggle>
                        <label className="grid gap-2 text-xs text-[var(--text-muted)]">
                          Full name
                          <input
                            type="text"
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white"
                            value={
                              userDrafts[user.id]?.full_name ?? (user.full_name ?? "")
                            }
                            onChange={(event) =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {}),
                                  full_name: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-xs text-[var(--text-muted)]">
                          Username
                          <input
                            type="text"
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white"
                            value={
                              userDrafts[user.id]?.username ?? (user.username ?? "")
                            }
                            onChange={(event) =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {}),
                                  username: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-xs text-[var(--text-muted)]">
                          Email
                          <input
                            type="email"
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white"
                            value={userDrafts[user.id]?.email ?? (user.email ?? "")}
                            onChange={(event) =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {}),
                                  email: event.target.value,
                                },
                              }))
                            }
                          />
                        </label>
                        <label className="grid gap-2 text-xs text-[var(--text-muted)]">
                          Role
                          <select
                            className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                            value={
                              userDrafts[user.id]?.role ?? (user.role ?? "player")
                            }
                            onChange={(event) =>
                              setUserDrafts((prev) => ({
                                ...prev,
                                [user.id]: {
                                  ...(prev[user.id] ?? {}),
                                  role: event.target.value,
                                },
                              }))
                            }
                            disabled={user.role === "admin"}
                          >
                            <option value="player">Player</option>
                            <option value="moderator">Moderator</option>
                            <option value="admin">Admin</option>
                          </select>
                          {user.role === "admin" && (
                            <span className="text-[10px] uppercase tracking-[0.3em] text-[var(--accent-coral)]">
                              Admin role locked
                            </span>
                          )}
                        </label>
                      </div>
                    )}

                    {isExpanded && (
                      <div className="mt-4 flex flex-wrap gap-3" data-no-toggle>
                        <button
                          onClick={() => saveUserDraft(user)}
                          className="rounded-full bg-[var(--accent-gold)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-black"
                        >
                          Save changes
                        </button>
                        <button
                          onClick={() => sendResetLink(user.id, user.email)}
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                        >
                          Password reset
                        </button>
                        <button
                          onClick={() => updateUserProfile(user.id, { is_disabled: !user.is_disabled })}
                          disabled={isSelf}
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {user.is_disabled ? "Enable" : "Disable"}
                        </button>
                        <button
                          onClick={() => deleteUser(user.id)}
                          disabled={isSelf}
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          Delete user
                        </button>
                      </div>
                    )}
                  </div>
                  );
                })}
                {users.length === 0 && (
                  <p className="text-sm text-[var(--text-muted)]">No users found.</p>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {activeTab === "design" && (
          <section className="grid gap-6">
            <div className="glass-panel rounded-3xl p-5 md:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                    Tutorial
                  </p>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Run the onboarding tutorial to review the guided flow.
                  </p>
                </div>
                <button
                  onClick={() => router.push("/tutorial")}
                  className="rounded-full bg-[var(--accent-gold)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black"
                >
                  Preview tutorial
                </button>
              </div>
            </div>
            <GameDesignPanel onStatusChange={pushStatus} />
          </section>
        )}

        <SmsTab visible={activeTab === "sms"} profile={profile} demoMode={demoMode} />

      </motion.div>
    </div>
  );
}
