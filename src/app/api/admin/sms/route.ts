import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import twilio from "twilio";
import { canEncrypt, decryptString } from "@/lib/server/crypto";

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

async function loadSmsSettings() {
  const { data: settings } = await supabase
    .from("sms_settings")
    .select("enabled, send_demo_prefix, admin_phone, from_number, account_sid, auth_token_enc, messaging_service_sid")
    .eq("id", true)
    .maybeSingle();

  if (!settings) return null;

  return {
    enabled: Boolean(settings.enabled),
    sendDemoPrefix: Boolean(settings.send_demo_prefix),
    adminPhone: settings.admin_phone ?? "",
    fromNumber: settings.from_number ?? "",
    accountSid: settings.account_sid ?? "",
    messagingServiceSid: settings.messaging_service_sid ?? "",
    authTokenEnc: settings.auth_token_enc ?? "",
  };
}

export async function GET(request: Request) {
  const { error, role } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const authToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const fromNumber = process.env.TWILIO_FROM_NUMBER ?? "";
  const toNumber = process.env.ADMIN_PHONE ?? "";
  const dbSettings = await loadSmsSettings();

  const dbConfigured = Boolean(
    dbSettings?.enabled &&
      dbSettings.accountSid &&
      (dbSettings.authTokenEnc ? canEncrypt() : false) &&
      (dbSettings.fromNumber || dbSettings.messagingServiceSid) &&
      dbSettings.adminPhone
  );

  return NextResponse.json({
    ok: true,
    configured: Boolean(accountSid && authToken && fromNumber && toNumber) || dbConfigured,
    hasAccountSid: Boolean(accountSid),
    hasAuthToken: Boolean(authToken),
    hasFromNumber: Boolean(fromNumber),
    hasAdminPhone: Boolean(toNumber),
    fromMasked: fromNumber ? maskPhone(fromNumber) : null,
    toMasked: toNumber ? maskPhone(toNumber) : null,
    dbEnabled: Boolean(dbSettings?.enabled),
    dbConfigured,
    dbFromMasked: dbSettings?.fromNumber ? maskPhone(dbSettings.fromNumber) : null,
    dbToMasked: dbSettings?.adminPhone ? maskPhone(dbSettings.adminPhone) : null,
  });
}

export async function POST(request: Request) {
  const { error, role, user } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    message?: string;
    demo?: boolean;
  };

  const message = body.message?.trim();
  if (!message) {
    return NextResponse.json({ ok: false, reason: "Missing message" }, { status: 400 });
  }

  // Prefer DB-configured settings if enabled; fallback to env vars.
  const dbSettings = await loadSmsSettings();
  const envAccountSid = process.env.TWILIO_ACCOUNT_SID ?? "";
  const envAuthToken = process.env.TWILIO_AUTH_TOKEN ?? "";
  const envFromNumber = process.env.TWILIO_FROM_NUMBER ?? "";
  const envToNumber = process.env.ADMIN_PHONE ?? "";

  let accountSid = envAccountSid;
  let authToken = envAuthToken;
  let fromNumber = envFromNumber;
  let messagingServiceSid = "";
  let toNumber = envToNumber;
  let sendDemoPrefix = false;

  if (dbSettings?.enabled) {
    accountSid = dbSettings.accountSid || accountSid;
    toNumber = dbSettings.adminPhone || toNumber;
    fromNumber = dbSettings.fromNumber || fromNumber;
    messagingServiceSid = dbSettings.messagingServiceSid || "";
    sendDemoPrefix = Boolean(dbSettings.sendDemoPrefix);

    if (dbSettings.authTokenEnc) {
      if (!canEncrypt()) {
        await supabase
          .from("sms_logs")
          .insert({
            status: "error",
            triggered_by: user?.id ?? null,
            is_demo: Boolean(body.demo),
            to_number_masked: toNumber ? maskPhone(toNumber) : null,
            from_number_masked: fromNumber ? maskPhone(fromNumber) : null,
            message_preview: message.slice(0, 140),
            error: "Server missing APP_ENCRYPTION_KEY; cannot decrypt Twilio token.",
          });
        return NextResponse.json(
          { ok: false, reason: "Server missing APP_ENCRYPTION_KEY; cannot decrypt Twilio token." },
          { status: 500 }
        );
      }
      authToken = decryptString(dbSettings.authTokenEnc);
    }
  }

  if (!accountSid || !authToken || (!fromNumber && !messagingServiceSid) || !toNumber) {
    await supabase
      .from("sms_logs")
      .insert({
        status: "error",
        triggered_by: user?.id ?? null,
        is_demo: Boolean(body.demo),
        to_number_masked: toNumber ? maskPhone(toNumber) : null,
        from_number_masked: fromNumber ? maskPhone(fromNumber) : null,
        message_preview: message.slice(0, 140),
        error: "Missing Twilio configuration",
      });
    return NextResponse.json({ ok: false, reason: "Missing Twilio configuration" }, { status: 500 });
  }

  const client = twilio(accountSid, authToken);
  const prefix = body.demo || sendDemoPrefix ? "[DEMO] " : "";

  try {
    const payload: Record<string, string> = {
      body: `${prefix}${message}`,
      to: toNumber,
    };
    if (messagingServiceSid) {
      payload.messagingServiceSid = messagingServiceSid;
    } else {
      payload.from = fromNumber;
    }

    const result = await client.messages.create(payload as any);
    await supabase
      .from("sms_logs")
      .insert({
        status: "sent",
        triggered_by: user?.id ?? null,
        is_demo: Boolean(body.demo || sendDemoPrefix),
        to_number_masked: toNumber ? maskPhone(toNumber) : null,
        from_number_masked: (fromNumber || messagingServiceSid) ? maskPhone(fromNumber || messagingServiceSid) : null,
        message_preview: message.slice(0, 140),
        twilio_sid: result.sid,
      });
    return NextResponse.json({ ok: true, sid: result.sid });
  } catch (err) {
    const reason = err instanceof Error ? err.message : "Twilio error";
    await supabase
      .from("sms_logs")
      .insert({
        status: "error",
        triggered_by: user?.id ?? null,
        is_demo: Boolean(body.demo || sendDemoPrefix),
        to_number_masked: toNumber ? maskPhone(toNumber) : null,
        from_number_masked: (fromNumber || messagingServiceSid) ? maskPhone(fromNumber || messagingServiceSid) : null,
        message_preview: message.slice(0, 140),
        error: reason,
      });
    return NextResponse.json({ ok: false, reason }, { status: 400 });
  }
}
