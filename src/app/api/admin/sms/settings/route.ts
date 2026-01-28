import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { canEncrypt, encryptString } from "@/lib/server/crypto";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const unauthorized = () =>
  NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });

async function requireStaff(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return {
      error: NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 }),
    };
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return { error: unauthorized() };

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) return { error: unauthorized() };

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const role = profile?.role ?? "player";
  return { user: userData.user, role };
}

const maskPhone = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-4)}`;
};

const isLikelyE164 = (value: string) => /^\+\d{10,15}$/.test(value);

export async function GET(request: Request) {
  const { error, role } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const { data: settings, error: settingsError } = await supabase
    .from("sms_settings")
    .select(
      "enabled, send_demo_prefix, template, admin_phone, from_number, account_sid, messaging_service_sid, auth_token_enc, updated_at"
    )
    .eq("id", true)
    .maybeSingle();

  if (settingsError) {
    const needsSchema =
      settingsError.message.includes("does not exist") ||
      settingsError.message.includes("relation") ||
      settingsError.code === "42P01";
    return NextResponse.json({
      ok: true,
      needsSchema,
      encryptionReady: canEncrypt(),
      settings: null,
      hint: needsSchema ? "Run src/supabase/sms_settings.sql in Supabase SQL Editor." : settingsError.message,
    });
  }

  return NextResponse.json({
    ok: true,
    needsSchema: false,
    encryptionReady: canEncrypt(),
    settings: settings
      ? {
          enabled: Boolean(settings.enabled),
          sendDemoPrefix: Boolean(settings.send_demo_prefix),
          template:
            (settings as any).template ??
            "Player {playerName} unlocked Clue {clueIndex}: {clueTitle}.",
          adminPhone: settings.admin_phone ?? "",
          adminPhoneMasked: settings.admin_phone ? maskPhone(settings.admin_phone) : null,
          fromNumber: settings.from_number ?? "",
          fromNumberMasked: settings.from_number ? maskPhone(settings.from_number) : null,
          accountSid: settings.account_sid ?? "",
          messagingServiceSid: settings.messaging_service_sid ?? "",
          hasAuthToken: Boolean(settings.auth_token_enc),
          updatedAt: settings.updated_at ?? null,
        }
      : null,
  });
}

export async function PUT(request: Request) {
  const { error, role, user } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin") {
    return NextResponse.json({ ok: false, reason: "Admins only" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    enabled?: boolean;
    sendDemoPrefix?: boolean;
    adminPhone?: string;
    fromNumber?: string;
    accountSid?: string;
    messagingServiceSid?: string;
    authToken?: string; // optional; empty means keep existing
    template?: string;
  };

  const enabled = Boolean(body.enabled);
  const sendDemoPrefix = Boolean(body.sendDemoPrefix);
  const adminPhone = (body.adminPhone ?? "").trim();
  const fromNumber = (body.fromNumber ?? "").trim();
  const accountSid = (body.accountSid ?? "").trim();
  const messagingServiceSid = (body.messagingServiceSid ?? "").trim();
  const authToken = (body.authToken ?? "").trim();
  const template = (body.template ?? "").trim();

  if (adminPhone && !isLikelyE164(adminPhone)) {
    return NextResponse.json({ ok: false, reason: "Admin phone must be E.164 (e.g. +1385...)" }, { status: 400 });
  }
  if (fromNumber && !isLikelyE164(fromNumber)) {
    return NextResponse.json({ ok: false, reason: "From number must be E.164 (e.g. +1385...)" }, { status: 400 });
  }
  if (messagingServiceSid && !/^MG[a-fA-F0-9]{32}$/.test(messagingServiceSid)) {
    return NextResponse.json({ ok: false, reason: "Messaging Service SID should look like MGxxxxxxxx..." }, { status: 400 });
  }
  if (authToken && !canEncrypt()) {
    return NextResponse.json(
      {
        ok: false,
        reason:
          "Server is missing APP_ENCRYPTION_KEY. Add it to .env.local and restart before saving secrets.",
      },
      { status: 500 }
    );
  }

  const update: Record<string, unknown> = {
    id: true,
    enabled,
    send_demo_prefix: sendDemoPrefix,
    template: template || null,
    admin_phone: adminPhone || null,
    from_number: fromNumber || null,
    account_sid: accountSid || null,
    messaging_service_sid: messagingServiceSid || null,
    updated_at: new Date().toISOString(),
  };

  if (authToken) {
    update.auth_token_enc = encryptString(authToken);
  }

  const { error: upsertError } = await supabase.from("sms_settings").upsert(update, { onConflict: "id" });
  if (upsertError) {
    return NextResponse.json({ ok: false, reason: upsertError.message }, { status: 500 });
  }

  await supabase.from("sms_logs").insert({
    status: "saved",
    is_demo: false,
    triggered_by: user?.id ?? null,
    message_preview: "SMS settings updated",
  });

  return NextResponse.json({ ok: true });
}
