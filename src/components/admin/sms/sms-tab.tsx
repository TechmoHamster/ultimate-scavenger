"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProfileLike = {
  id?: string | null;
  full_name?: string | null;
  username?: string | null;
  role?: string | null;
};

type SmsConfig = {
  configured: boolean;
  hasAccountSid: boolean;
  hasAuthToken: boolean;
  hasFromNumber: boolean;
  hasAdminPhone: boolean;
  fromMasked: string | null;
  toMasked: string | null;
  dbEnabled?: boolean;
  dbConfigured?: boolean;
  dbFromMasked?: string | null;
  dbToMasked?: string | null;
};

type SmsDbSettings = {
  enabled: boolean;
  sendDemoPrefix: boolean;
  template: string;
  adminPhone: string;
  adminPhoneMasked: string | null;
  fromNumber: string;
  fromNumberMasked: string | null;
  accountSid: string;
  messagingServiceSid: string;
  hasAuthToken: boolean;
  updatedAt: string | null;
};

type SmsLogRow = {
  id: string;
  sent_at: string | null;
  is_demo: boolean | null;
  to_number_masked: string | null;
  from_number_masked: string | null;
  message_preview: string | null;
  status: string;
  twilio_sid: string | null;
  error: string | null;
};

type ClueRow = {
  clue_index: number;
  label: string;
  title: string;
  is_final: boolean;
};

type SmsRuleRow = {
  clue_index: number;
  enabled: boolean;
  template: string | null;
  updated_at?: string | null;
};

const SMS_ENCRYPTION_KEY_CMD = "openssl rand -base64 32";

const SMS_SCHEMA_SQL = `-- SMS / Twilio settings + logs + per-clue rules
create table if not exists public.sms_settings (
  id boolean primary key default true,
  enabled boolean default false,
  send_demo_prefix boolean default true,
  template text,
  admin_phone text,
  from_number text,
  account_sid text,
  auth_token_enc text,
  messaging_service_sid text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  constraint sms_settings_singleton check (id = true)
);

create table if not exists public.sms_clue_rules (
  clue_index int primary key,
  enabled boolean default true,
  template text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.sms_logs (
  id uuid primary key default gen_random_uuid(),
  sent_at timestamptz default now(),
  is_demo boolean default false,
  status text not null,
  to_number_masked text,
  from_number_masked text,
  twilio_sid text,
  error text,
  message_preview text,
  triggered_by uuid references auth.users(id) on delete set null
);

alter table public.sms_settings enable row level security;
alter table public.sms_clue_rules enable row level security;
alter table public.sms_logs enable row level security;
`;

function Toggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="relative inline-flex h-6 w-11 cursor-pointer items-center">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        disabled={disabled}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      <span className="absolute inset-0 rounded-full border border-[var(--stroke)] bg-black/40 transition peer-checked:bg-[var(--accent-emerald)]/40 peer-focus-visible:ring-2 peer-focus-visible:ring-[var(--accent-gold)] peer-disabled:opacity-60" />
      <span className="absolute left-1 h-4 w-4 rounded-full bg-[var(--text-muted)] transition peer-checked:translate-x-5 peer-checked:bg-[var(--accent-gold)] peer-disabled:opacity-60" />
    </label>
  );
}

function StatusPill({
  label,
  value,
  onClick,
  tone = "default",
}: {
  label: string;
  value: string;
  onClick?: () => void;
  tone?: "default" | "warn" | "ok";
}) {
  const toneClass =
    tone === "warn"
      ? "border-[var(--accent-gold)] text-[var(--accent-gold)]"
      : tone === "ok"
        ? "border-[var(--accent-emerald)] text-[var(--accent-emerald)]"
        : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border border-[var(--stroke)] bg-black/20 px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/80 transition ${toneClass} ${
        onClick ? "cursor-pointer hover:border-[var(--accent-gold)]" : "cursor-default"
      }`}
    >
      {label} {value}
    </button>
  );
}

function formatTimeAgo(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  const diffMs = Date.now() - date.getTime();
  const diffMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (diffMinutes < 1) return "just now";
  if (diffMinutes < 60) return `${diffMinutes}m ago`;
  const hours = Math.round(diffMinutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function SmsTab({
  visible,
  profile,
  demoMode,
}: {
  visible: boolean;
  profile: ProfileLike | null;
  demoMode: boolean;
}) {
  const isAdmin = (profile?.role ?? "player") === "admin";
  const isStaff = isAdmin || (profile?.role ?? "player") === "moderator";
  const playerName = profile?.full_name ?? profile?.username ?? "Player";

  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [wizardOpen, setWizardOpen] = useState(true);

  const settingsRef = useRef<HTMLDivElement | null>(null);
  const wizardRef = useRef<HTMLDivElement | null>(null);
  const rulesRef = useRef<HTMLDivElement | null>(null);
  const logsRef = useRef<HTMLDivElement | null>(null);

  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [configLoading, setConfigLoading] = useState(false);

  const [dbNeedsSchema, setDbNeedsSchema] = useState(false);
  const [dbHint, setDbHint] = useState<string | null>(null);
  const [dbSettings, setDbSettings] = useState<SmsDbSettings | null>(null);
  const [authTokenInput, setAuthTokenInput] = useState("");

  const [logs, setLogs] = useState<SmsLogRow[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);

  const [clues, setClues] = useState<ClueRow[]>([]);
  const [rules, setRules] = useState<Record<number, SmsRuleRow>>({});
  const [rulesLoading, setRulesLoading] = useState(false);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSnapshot, setRulesSnapshot] = useState<string>("");
  const [ruleSearch, setRuleSearch] = useState("");
  const [showEnabledOnly, setShowEnabledOnly] = useState(false);
  const [showErrorsOnly, setShowErrorsOnly] = useState(false);

  const getAdminToken = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token ?? null;
  }, []);

  const refreshConfig = useCallback(async () => {
    setConfigLoading(true);
    const token = await getAdminToken();
    if (!token) {
      setConfig(null);
      setConfigLoading(false);
      return;
    }

    const response = await fetch("/api/admin/sms", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      setConfig(null);
      setConfigLoading(false);
      return;
    }

    const body = (await response.json().catch(() => null)) as (SmsConfig & { ok?: boolean }) | null;
    if (!body) {
      setConfig(null);
      setConfigLoading(false);
      return;
    }

    setConfig({
      configured: Boolean(body.configured),
      hasAccountSid: Boolean(body.hasAccountSid),
      hasAuthToken: Boolean(body.hasAuthToken),
      hasFromNumber: Boolean(body.hasFromNumber),
      hasAdminPhone: Boolean(body.hasAdminPhone),
      fromMasked: body.fromMasked ?? null,
      toMasked: body.toMasked ?? null,
      dbEnabled: Boolean((body as any).dbEnabled),
      dbConfigured: Boolean((body as any).dbConfigured),
      dbFromMasked: (body as any).dbFromMasked ?? null,
      dbToMasked: (body as any).dbToMasked ?? null,
    });
    setConfigLoading(false);
  }, [getAdminToken]);

  const loadDbSettings = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) return;

    const response = await fetch("/api/admin/sms/settings", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = (await response.json().catch(() => null)) as
      | {
          ok: boolean;
          needsSchema?: boolean;
          hint?: string;
          settings?: SmsDbSettings | null;
        }
      | null;

    if (!body || !body.ok) return;

    setDbNeedsSchema(Boolean(body.needsSchema));
    setDbHint(body.hint ?? null);

    if (body.settings) {
      setDbSettings(body.settings);
    } else if (!body.needsSchema) {
      setDbSettings({
        enabled: false,
        sendDemoPrefix: true,
        template: "Player {playerName} unlocked Clue {clueIndex}: {clueTitle}.",
        adminPhone: "",
        adminPhoneMasked: null,
        fromNumber: "",
        fromNumberMasked: null,
        accountSid: "",
        messagingServiceSid: "",
        hasAuthToken: false,
        updatedAt: null,
      });
    } else {
      setDbSettings(null);
    }
  }, [getAdminToken]);

  const saveDbSettings = useCallback(async () => {
    const token = await getAdminToken();
    if (!token) {
      setStatus("Unable to authenticate.");
      return;
    }

    if (!dbSettings) {
      setStatus("No settings to save.");
      return;
    }

    setBusy(true);
    setStatus(null);
    const response = await fetch("/api/admin/sms/settings", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        enabled: dbSettings.enabled,
        sendDemoPrefix: dbSettings.sendDemoPrefix,
        adminPhone: dbSettings.adminPhone,
        fromNumber: dbSettings.fromNumber,
        accountSid: dbSettings.accountSid,
        messagingServiceSid: dbSettings.messagingServiceSid,
        authToken: authTokenInput,
        template: dbSettings.template,
      }),
    });

    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    if (!response.ok || !body.ok) {
      setStatus(body.reason ?? "Unable to save settings.");
      setBusy(false);
      return;
    }

    setAuthTokenInput("");
    setStatus("SMS settings saved.");
    setBusy(false);
    void loadDbSettings();
    void refreshConfig();
  }, [authTokenInput, dbSettings, getAdminToken, loadDbSettings, refreshConfig]);

  const loadLogs = useCallback(async () => {
    setLogsLoading(true);
    const token = await getAdminToken();
    if (!token) {
      setLogs([]);
      setLogsLoading(false);
      return;
    }

    const response = await fetch("/api/admin/sms/logs?limit=25", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });

    const body = (await response.json().catch(() => null)) as
      | { ok: boolean; needsSchema?: boolean; hint?: string; logs?: SmsLogRow[] }
      | null;

    if (!body || !body.ok) {
      setLogs([]);
      setLogsLoading(false);
      return;
    }

    if (body.needsSchema) {
      setDbNeedsSchema(true);
      setDbHint(body.hint ?? null);
    }

    setLogs(body.logs ?? []);
    setLogsLoading(false);
  }, [getAdminToken]);

  const loadCluesAndRules = useCallback(async () => {
    setRulesLoading(true);
    const token = await getAdminToken();
    if (!token) {
      setRulesLoading(false);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data: clueRows } = await supabase
      .from("clues")
      .select("clue_index, label, title, is_final")
      .order("clue_index", { ascending: true });
    setClues(
      (clueRows ?? []).map((row: any) => ({
        clue_index: row.clue_index,
        label: row.label,
        title: row.title,
        is_final: Boolean(row.is_final),
      }))
    );

    const response = await fetch("/api/admin/sms/rules", {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = (await response.json().catch(() => null)) as
      | { ok: boolean; needsSchema?: boolean; hint?: string; rules?: SmsRuleRow[] }
      | null;

    if (body?.needsSchema) {
      setDbNeedsSchema(true);
      setDbHint(body.hint ?? null);
    }

    const mapped: Record<number, SmsRuleRow> = {};
    (body?.rules ?? []).forEach((row) => {
      mapped[row.clue_index] = {
        clue_index: row.clue_index,
        enabled: Boolean(row.enabled),
        template: row.template ?? null,
        updated_at: row.updated_at ?? null,
      };
    });
    setRules(mapped);
    setRulesLoading(false);
  }, [getAdminToken]);

  const saveRules = useCallback(async () => {
    if (!isAdmin) return;
    const token = await getAdminToken();
    if (!token) return;

    setRulesSaving(true);
    const payload = Object.values(rules).map((row) => ({
      clue_index: row.clue_index,
      enabled: Boolean(row.enabled),
      template: row.template ?? null,
    }));
    const response = await fetch("/api/admin/sms/rules", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ rules: payload }),
    });

    const body = (await response.json().catch(() => ({}))) as { ok?: boolean; reason?: string };
    if (!response.ok || !body.ok) {
      setStatus(body.reason ?? "Unable to save per-clue rules.");
      setRulesSaving(false);
      return;
    }
    setStatus("Per-clue SMS rules saved.");
    setRulesSnapshot(JSON.stringify(payload));
    setRulesSaving(false);
    void loadLogs();
  }, [getAdminToken, isAdmin, loadLogs, rules]);

  const resolvedTemplate = dbSettings?.template?.trim()
    ? dbSettings.template.trim()
    : "Player {playerName} unlocked Clue {clueIndex}: {clueTitle}.";

  const sendTestSms = useCallback(async () => {
    setBusy(true);
    setStatus(null);
    const token = await getAdminToken();
    if (!token) {
      setStatus("Unable to authenticate for SMS.");
      setBusy(false);
      return;
    }

    const message = resolvedTemplate
      .replaceAll("{playerName}", playerName)
      .replaceAll("{clueIndex}", "1")
      .replaceAll("{clueTitle}", "The Opening Envelope")
      .replaceAll("{timestamp}", new Date().toLocaleString())
      .replaceAll("{status}", "unlocked");

    const response = await fetch("/api/admin/sms", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ message, demo: Boolean(demoMode || dbSettings?.sendDemoPrefix) }),
    });

    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setStatus(body?.reason ?? "Unable to send SMS.");
      setBusy(false);
      return;
    }

    setStatus(demoMode || dbSettings?.sendDemoPrefix ? "Demo SMS sent." : "SMS sent successfully.");
    setBusy(false);
    void loadLogs();
  }, [dbSettings?.sendDemoPrefix, demoMode, getAdminToken, loadLogs, playerName, resolvedTemplate]);

  const templateTokens = useMemo(
    () => ["{playerName}", "{clueIndex}", "{clueTitle}", "{timestamp}", "{status}"],
    []
  );

  const visibleLogs = useMemo(() => {
    if (!showErrorsOnly) return logs;
    return logs.filter((row) => row.status === "error");
  }, [logs, showErrorsOnly]);

  useEffect(() => {
    if (!visible) return;
    if (!isStaff) return;
    void refreshConfig();
    void loadDbSettings();
    void loadLogs();
    void loadCluesAndRules();
  }, [isStaff, loadCluesAndRules, loadDbSettings, loadLogs, refreshConfig, visible]);

  const needsSetup =
    Boolean(dbNeedsSchema) ||
    !config?.dbConfigured ||
    !dbSettings?.accountSid ||
    !dbSettings?.adminPhone ||
    !dbSettings?.fromNumber ||
    !dbSettings?.hasAuthToken;

  useEffect(() => {
    if (needsSetup) {
      setWizardOpen(true);
    }
  }, [needsSetup]);

  const normalizedRules = useMemo(
    () =>
      clues.map((clue) => ({
        clue_index: clue.clue_index,
        enabled: Boolean(rules[clue.clue_index]?.enabled ?? true),
        template: rules[clue.clue_index]?.template ?? null,
      })),
    [clues, rules]
  );

  useEffect(() => {
    if (rulesLoading || !clues.length) return;
    if (rulesSnapshot) return;
    setRulesSnapshot(JSON.stringify(normalizedRules));
  }, [clues.length, normalizedRules, rulesLoading, rulesSnapshot]);

  const rulesDirty = useMemo(() => {
    if (!rulesSnapshot) return false;
    return JSON.stringify(normalizedRules) !== rulesSnapshot;
  }, [normalizedRules, rulesSnapshot]);

  const resetRules = useCallback(() => {
    if (!rulesSnapshot) return;
    const parsed = JSON.parse(rulesSnapshot) as Array<{
      clue_index: number;
      enabled: boolean;
      template: string | null;
    }>;
    const next: Record<number, SmsRuleRow> = {};
    parsed.forEach((row) => {
      next[row.clue_index] = {
        clue_index: row.clue_index,
        enabled: row.enabled,
        template: row.template,
      };
    });
    setRules(next);
  }, [rulesSnapshot]);

  const filteredClues = useMemo(() => {
    const query = ruleSearch.trim().toLowerCase();
    return clues.filter((clue) => {
      if (showEnabledOnly && !(rules[clue.clue_index]?.enabled ?? true)) return false;
      if (!query) return true;
      return (
        clue.label.toLowerCase().includes(query) ||
        clue.title.toLowerCase().includes(query)
      );
    });
  }, [clues, ruleSearch, rules, showEnabledOnly]);

  const handleEnableAll = useCallback(
    (enabled: boolean) => {
      setRules((prev) => {
        const next = { ...prev };
        clues.forEach((clue) => {
          next[clue.clue_index] = {
            clue_index: clue.clue_index,
            enabled,
            template: prev[clue.clue_index]?.template ?? null,
          };
        });
        return next;
      });
    },
    [clues]
  );

  const scrollToSection = useCallback((ref: { current: HTMLElement | null }) => {
    if (!ref.current) return;
    ref.current.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const ensureRuleRow = useCallback(
    (clueIndex: number) => {
      setRules((prev) => {
        if (prev[clueIndex]) return prev;
        return {
          ...prev,
          [clueIndex]: { clue_index: clueIndex, enabled: true, template: null },
        };
      });
    },
    [setRules]
  );

  const handleToggleRule = useCallback(
    (clueIndex: number) => {
      ensureRuleRow(clueIndex);
      setRules((prev) => ({
        ...prev,
        [clueIndex]: {
          clue_index: clueIndex,
          enabled: !Boolean(prev[clueIndex]?.enabled),
          template: prev[clueIndex]?.template ?? null,
        },
      }));
    },
    [ensureRuleRow]
  );

  const handleRuleTemplateChange = useCallback((clueIndex: number, value: string) => {
    ensureRuleRow(clueIndex);
    setRules((prev) => ({
      ...prev,
      [clueIndex]: {
        clue_index: clueIndex,
        enabled: Boolean(prev[clueIndex]?.enabled),
        template: value.trim() ? value : null,
      },
    }));
  }, [ensureRuleRow]);

  if (!visible) return null;
  if (!isStaff) {
    return (
      <div className="glass-panel rounded-3xl p-6 md:p-8">
        <h2 className="text-display text-2xl md:text-3xl">SMS Alerts</h2>
        <p className="mt-2 text-sm text-[var(--text-muted)]">Admin access required.</p>
      </div>
    );
  }

  return (
    <motion.section
      className="grid gap-6"
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: "easeOut" }}
    >
      <div className="glass-panel rounded-3xl p-6 md:p-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-display text-2xl md:text-3xl">SMS Alerts</h2>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Configure Twilio messaging, preview templates, and decide which clue completions trigger texts.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void refreshConfig()}
              className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
            >
              {configLoading ? "Checking" : "Verify"}
            </button>
            <button
              type="button"
              onClick={() => void sendTestSms()}
              disabled={busy}
              className="rounded-full bg-[var(--accent-gold)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black disabled:opacity-60"
            >
              {busy ? "Sending" : "Send test"}
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <StatusPill
            label="DB"
            value={configLoading ? "checking" : config?.dbConfigured ? "ready" : "not ready"}
            tone={config?.dbConfigured ? "ok" : "warn"}
            onClick={() => scrollToSection(wizardRef)}
          />
          <StatusPill
            label="SMS"
            value={configLoading ? "checking" : config?.dbEnabled ? "enabled" : "disabled"}
            tone={config?.dbEnabled ? "ok" : "warn"}
            onClick={() => scrollToSection(settingsRef)}
          />
          <StatusPill
            label="To"
            value={config?.dbToMasked ?? config?.toMasked ?? "***"}
            onClick={() => scrollToSection(settingsRef)}
          />
          <StatusPill
            label="From"
            value={config?.dbFromMasked ?? config?.fromMasked ?? "***"}
            onClick={() => scrollToSection(settingsRef)}
          />
          <StatusPill
            label="Template"
            value={dbSettings?.template?.trim() ? "set" : "default"}
            tone={dbSettings?.template?.trim() ? "ok" : "warn"}
            onClick={() => scrollToSection(settingsRef)}
          />
        </div>

        {status && (
          <div className="mt-6 rounded-2xl border border-[var(--stroke)] bg-black/20 px-4 py-3 text-sm text-white/80">
            {status}
          </div>
        )}
      </div>

      <div className="glass-panel rounded-3xl p-6 md:p-8" ref={settingsRef}>
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
              SMS settings
            </p>
            <h3 className="mt-2 text-display text-xl">Delivery + Templates</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Secure configuration for Twilio delivery, templates, and demo behavior.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void saveDbSettings()}
            disabled={dbNeedsSchema || !dbSettings || !isAdmin || busy}
            className="rounded-full bg-[var(--accent-gold)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black disabled:opacity-60"
          >
            Save settings
          </button>
        </div>

        {dbNeedsSchema && (
          <div className="mt-6 rounded-2xl border border-[var(--stroke)] bg-black/20 px-4 py-3 text-sm text-white/70">
            SMS tables are not installed yet. Run{" "}
            <span className="font-mono text-xs text-white">src/supabase/sms_settings.sql</span> in Supabase.
          </div>
        )}

        {dbSettings && (
          <div className="mt-6 grid gap-4">
            <div className="grid gap-4 rounded-2xl border border-[var(--stroke)] bg-black/20 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-white/80">SMS enabled</span>
                <Toggle
                  checked={dbSettings.enabled}
                  onChange={() =>
                    setDbSettings((prev) => (prev ? { ...prev, enabled: !prev.enabled } : prev))
                  }
                  disabled={!isAdmin}
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-white/80">Prefix demo messages</span>
                <Toggle
                  checked={dbSettings.sendDemoPrefix}
                  onChange={() =>
                    setDbSettings((prev) =>
                      prev ? { ...prev, sendDemoPrefix: !prev.sendDemoPrefix } : prev
                    )
                  }
                  disabled={!isAdmin}
                />
              </div>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Global template</span>
              <textarea
                value={dbSettings.template}
                onChange={(event) =>
                  setDbSettings((prev) => (prev ? { ...prev, template: event.target.value } : prev))
                }
                rows={4}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                disabled={!isAdmin}
              />
            </label>

            <div className="flex flex-wrap items-center gap-2 text-[10px] uppercase tracking-[0.3em] text-white/60">
              {templateTokens.map((token) => (
                <span key={token} className="rounded-full border border-[var(--stroke)] px-3 py-1">
                  {token}
                </span>
              ))}
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <label className="grid gap-2 text-sm">
                <span className="text-white/70">Admin phone (E.164)</span>
                <input
                  value={dbSettings.adminPhone}
                  onChange={(event) =>
                    setDbSettings((prev) =>
                      prev ? { ...prev, adminPhone: event.target.value } : prev
                    )
                  }
                  placeholder="+1385..."
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                  disabled={!isAdmin}
                />
                {dbSettings.adminPhoneMasked && (
                  <p className="text-xs text-white/60">Current: {dbSettings.adminPhoneMasked}</p>
                )}
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-white/70">Account SID</span>
                <input
                  value={dbSettings.accountSid}
                  onChange={(event) =>
                    setDbSettings((prev) =>
                      prev ? { ...prev, accountSid: event.target.value } : prev
                    )
                  }
                  placeholder="ACxxxxxxxx..."
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                  disabled={!isAdmin}
                />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-white/70">From number (E.164)</span>
                <input
                  value={dbSettings.fromNumber}
                  onChange={(event) =>
                    setDbSettings((prev) =>
                      prev ? { ...prev, fromNumber: event.target.value } : prev
                    )
                  }
                  placeholder="+1..."
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                  disabled={!isAdmin}
                />
                {dbSettings.fromNumberMasked && (
                  <p className="text-xs text-white/60">Current: {dbSettings.fromNumberMasked}</p>
                )}
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-white/70">Messaging Service SID (optional)</span>
                <input
                  value={dbSettings.messagingServiceSid}
                  onChange={(event) =>
                    setDbSettings((prev) =>
                      prev ? { ...prev, messagingServiceSid: event.target.value } : prev
                    )
                  }
                  placeholder="MGxxxxxxxx..."
                  className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                  disabled={!isAdmin}
                />
              </label>
            </div>

            <label className="grid gap-2 text-sm">
              <span className="text-white/70">Auth token (never shown)</span>
              <input
                value={authTokenInput}
                onChange={(event) => setAuthTokenInput(event.target.value)}
                placeholder={dbSettings.hasAuthToken ? "Leave blank to keep existing token" : "Enter token"}
                className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-base text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                disabled={!isAdmin}
              />
            </label>

            <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-4" ref={wizardRef}>
              <button
                type="button"
                onClick={() => setWizardOpen((prev) => !prev)}
                className="flex w-full items-start justify-between gap-4 text-left"
              >
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                    Setup & troubleshooting
                  </p>
                  <h4 className="mt-2 text-display text-lg">Connect Twilio safely</h4>
                  <p className="mt-2 text-sm text-[var(--text-muted)]">
                    Guidance for first-time setup and common issues.
                  </p>
                </div>
                <span className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white">
                  {wizardOpen ? "Collapse" : "Expand"}
                </span>
              </button>

              {wizardOpen && (
                <div className="mt-6 grid gap-4">
                  {dbNeedsSchema && (
                    <div className="rounded-2xl border border-[var(--stroke)] bg-black/20 p-4">
                      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white">
                        0) Install SMS tables in Supabase
                      </p>
                      <p className="mt-2 text-sm text-[var(--text-muted)]">
                        Run this once in the Supabase SQL Editor.
                      </p>
                      {dbHint && <p className="mt-2 text-xs text-white/60">{dbHint}</p>}
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            await navigator.clipboard.writeText(SMS_SCHEMA_SQL);
                            setStatus("Copied SMS schema SQL to clipboard.");
                          }}
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                        >
                          Copy SQL
                        </button>
                        <Link
                          href="https://supabase.com/dashboard"
                          target="_blank"
                          className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                        >
                          Open Supabase
                        </Link>
                      </div>
                    </div>
                  )}

                  <div className="rounded-2xl border border-[var(--stroke)] bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white">
                      1) Generate APP_ENCRYPTION_KEY
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      Add the key to <span className="font-mono text-xs text-white">.env.local</span> and restart the dev
                      server.
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          await navigator.clipboard.writeText(SMS_ENCRYPTION_KEY_CMD);
                          setStatus("Copied key command to clipboard.");
                        }}
                        className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
                      >
                        Copy command
                      </button>
                      <span className="rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-2 font-mono text-xs text-white">
                        {SMS_ENCRYPTION_KEY_CMD}
                      </span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-[var(--stroke)] bg-black/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-[0.3em] text-white">
                      2) Collect Twilio details
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      You need an Account SID and either a From number or a Messaging Service SID. For trial accounts, your
                      destination phone must be verified.
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="glass-panel rounded-3xl p-6 md:p-8" ref={rulesRef}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                Per-clue rules
              </p>
              <h3 className="mt-2 text-display text-xl">Which clues send SMS?</h3>
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Toggle delivery per clue and optionally override the message template.
              </p>
            </div>
            <button
              type="button"
              onClick={() => void saveRules()}
              disabled={!isAdmin || rulesSaving || rulesLoading}
              className="rounded-full bg-[var(--accent-gold)] px-5 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-black disabled:opacity-60"
            >
              {rulesSaving ? "Saving" : "Save rules"}
            </button>
          </div>

          <div className="mt-6 grid gap-4">
            <div className="flex flex-wrap items-center gap-3">
              <input
                value={ruleSearch}
                onChange={(event) => setRuleSearch(event.target.value)}
                placeholder="Search clues…"
                className="w-full max-w-xs rounded-full border border-[var(--stroke)] bg-black/30 px-4 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
              />
              <button
                type="button"
                onClick={() => handleEnableAll(true)}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
              >
                Enable all
              </button>
              <button
                type="button"
                onClick={() => handleEnableAll(false)}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)]"
              >
                Disable all
              </button>
              <button
                type="button"
                onClick={() => setShowEnabledOnly((prev) => !prev)}
                className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.3em] ${
                  showEnabledOnly
                    ? "border-[var(--accent-emerald)] text-[var(--accent-emerald)]"
                    : "border-[var(--stroke)] text-white"
                }`}
              >
                {showEnabledOnly ? "Enabled only" : "All clues"}
              </button>
            </div>

            {rulesDirty && (
              <div className="sticky top-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--stroke)] bg-black/40 px-4 py-3 backdrop-blur">
                <span className="text-sm text-white/80">Unsaved changes detected.</span>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={resetRules}
                    className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => void saveRules()}
                    disabled={!isAdmin || rulesSaving}
                    className="rounded-full bg-[var(--accent-gold)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-black disabled:opacity-60"
                  >
                    Save rules
                  </button>
                </div>
              </div>
            )}
          </div>

          {rulesLoading ? (
            <p className="mt-6 text-sm text-[var(--text-muted)]">Loading clue rules…</p>
          ) : (
            <div className="mt-6 grid gap-3">
              {filteredClues.map((clue) => {
                const rule = rules[clue.clue_index];
                const enabled = rule ? Boolean(rule.enabled) : true;
                const override = rule?.template ?? "";
                return (
                  <div
                    key={clue.clue_index}
                    className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-4"
                  >
                    <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0">
                        <p className="text-[10px] uppercase tracking-[0.3em] text-white/60">
                          {clue.label}
                        </p>
                        <p className="mt-1 truncate text-sm text-white/90">{clue.title}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs uppercase tracking-[0.3em] text-white/60">
                          SMS
                        </span>
                        <Toggle
                          checked={enabled}
                          onChange={() => handleToggleRule(clue.clue_index)}
                          disabled={!isAdmin}
                        />
                      </div>
                    </div>
                    <div className="mt-3">
                      <label className="grid gap-2 text-sm">
                        <span className="text-white/70">Template override (optional)</span>
                        <textarea
                          value={override}
                          onChange={(event) =>
                            handleRuleTemplateChange(clue.clue_index, event.target.value)
                          }
                          rows={2}
                          placeholder="Leave blank to use global template"
                          className="w-full rounded-2xl border border-[var(--stroke)] bg-black/30 px-4 py-3 text-sm text-white focus:outline-none focus:ring-2 focus:ring-[var(--accent-gold)]"
                          disabled={!isAdmin}
                        />
                      </label>
                    </div>
                  </div>
                );
              })}
              {filteredClues.length === 0 && (
                <p className="text-sm text-[var(--text-muted)]">
                  No clues match the current filter.
                </p>
              )}
            </div>
          )}
        </div>

        <div className="grid gap-6">
          <div className="glass-panel rounded-3xl p-6 md:p-8" ref={logsRef}>
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">Logs</p>
                <h3 className="mt-2 text-display text-xl">Recent events</h3>
                <p className="mt-2 text-sm text-[var(--text-muted)]">
                  Last 25 SMS events (sends + errors). Useful for troubleshooting.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void loadLogs()}
                disabled={logsLoading}
                className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-white hover:border-[var(--accent-gold)] hover:text-[var(--accent-gold)] disabled:opacity-60"
              >
                {logsLoading ? "Loading" : "Refresh"}
              </button>
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => setShowErrorsOnly((prev) => !prev)}
                className={`rounded-full border px-4 py-2 text-[10px] uppercase tracking-[0.3em] ${
                  showErrorsOnly
                    ? "border-red-300 text-red-200"
                    : "border-[var(--stroke)] text-white"
                }`}
              >
                {showErrorsOnly ? "Errors only" : "All events"}
              </button>
            </div>

            <div className="mt-5 grid gap-3">
              {logs.length === 0 && (
                <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
                  <p>No logs yet. Send a test SMS or complete a clue to generate events.</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => void sendTestSms()}
                      className="rounded-full bg-[var(--accent-gold)] px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.3em] text-black"
                    >
                      Send test
                    </button>
                    <button
                      type="button"
                      onClick={() => void loadLogs()}
                      className="rounded-full border border-[var(--stroke)] px-4 py-2 text-[10px] uppercase tracking-[0.3em] text-white"
                    >
                      Refresh
                    </button>
                  </div>
                </div>
              )}
              {logs.length > 0 && visibleLogs.length === 0 && (
                <div className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-4 text-sm text-[var(--text-muted)]">
                  No error events yet. Switch back to all events to see sent logs.
                </div>
              )}
              {visibleLogs.map((row) => {
                const statusLabel =
                  row.status === "sent"
                    ? "Sent"
                    : row.status === "error"
                      ? "Error"
                      : row.status === "saved"
                        ? "Saved"
                        : row.status;
                const badgeColor =
                  row.status === "sent"
                    ? "text-[var(--accent-emerald)]"
                    : row.status === "error"
                      ? "text-red-300"
                      : "text-white/70";
                return (
                  <div
                    key={row.id}
                    className="rounded-3xl border border-[var(--stroke)] bg-black/20 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`rounded-full border border-[var(--stroke)] bg-black/25 px-3 py-1 text-[10px] uppercase tracking-[0.3em] ${badgeColor}`}
                        >
                          {statusLabel}
                        </span>
                        {row.is_demo && (
                          <span className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
                            Demo
                          </span>
                        )}
                        <span className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                          {formatTimeAgo(row.sent_at)}
                        </span>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {row.to_number_masked && (
                          <span className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                            to {row.to_number_masked}
                          </span>
                        )}
                        {row.from_number_masked && (
                          <span className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                            from {row.from_number_masked}
                          </span>
                        )}
                        {row.twilio_sid && (
                          <span className="rounded-full border border-[var(--stroke)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-white/70">
                            sid {row.twilio_sid.slice(0, 8)}…
                          </span>
                        )}
                      </div>
                    </div>
                    {row.message_preview && <p className="mt-3 text-sm text-white/90">{row.message_preview}</p>}
                    {row.error && <p className="mt-3 text-sm text-red-300">{row.error}</p>}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="glass-panel rounded-3xl p-6 md:p-8">
            <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent-emerald)]">
              Troubleshooting
            </p>
            <div className="mt-3 grid gap-2 text-sm text-[var(--text-muted)]">
              <p>
                If messages fail:
                <span className="ml-2 text-white/80">
                  verify Twilio trial phone verification, E.164 phone formats, and restart the server after updating
                  secrets.
                </span>
              </p>
              <p>
                If you use encrypted settings, the server must have{" "}
                <span className="font-mono text-xs text-white">APP_ENCRYPTION_KEY</span>.
              </p>
              <p>Check logs for exact Twilio errors (invalid From number, unverified destination, etc.).</p>
            </div>
          </div>
        </div>
      </div>
    </motion.section>
  );
}
