import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { decryptSecret } from "@/lib/crypto.server";
import { hashPassword, normalizePassword, verifyPassword } from "@/lib/password.server";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

const haversine = (lat1: number, lon1: number, lat2: number, lon2: number) => {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const earthRadius = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return earthRadius * c;
};

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 });
  }

  const body = (await request.json()) as {
    clueIndex?: number;
    password?: string;
    coords?: { lat: number; lng: number };
    allowMissingGeo?: boolean;
  };

  const clueIndex = body?.clueIndex;
  if (typeof clueIndex !== "number") {
    return NextResponse.json({ ok: false, reason: "Invalid clue" }, { status: 400 });
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", userData.user.id)
    .maybeSingle();

  const isAdmin = profile?.role === "admin";
  const { data: gameSettings } = await supabase
    .from("game_settings")
    .select("require_gps, require_password")
    .eq("id", 1)
    .maybeSingle();

  const requirePassword = gameSettings?.require_password ?? true;
  const requireGps = gameSettings?.require_gps ?? true;

  const { data: clueRow } = await supabase
    .from("clues")
    .select("id, clue_index, cooldown_enabled, cooldown_minutes")
    .eq("clue_index", clueIndex)
    .maybeSingle();

  if (!clueRow) {
    return NextResponse.json({ ok: false, reason: "Clue not found" }, { status: 404 });
  }

  const { data: secret } = await supabase
    .from("clue_secrets")
    .select(
      [
        "password",
        "password_hash",
        "password_ciphertext",
        "radius_meters",
        "lat",
        "lng",
        "requires_unlock",
        "requires_artifact",
        "requires_password",
        "requires_gps",
      ].join(",")
    )
    .eq("clue_id", clueRow.id)
    .maybeSingle();

  const lockEnabled = secret?.requires_unlock !== false;
  const requiresArtifact = lockEnabled && (secret?.requires_artifact ?? true);
  const requiresPassword = lockEnabled && (secret?.requires_password ?? true) && requirePassword;
  const requiresGps = lockEnabled && (secret?.requires_gps ?? true) && requireGps;

  const cooldownEnabled = Boolean(clueRow?.cooldown_enabled);
  const cooldownMinutes = Math.max(0, clueRow?.cooldown_minutes ?? 0);
  if (!isAdmin && cooldownEnabled && cooldownMinutes > 0 && clueIndex > 0) {
    const { data: previousCompletion } = await supabase
      .from("step_completions")
      .select("completed_at")
      .eq("player_id", userData.user.id)
      .eq("clue_index", clueIndex - 1)
      .order("completed_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (previousCompletion?.completed_at) {
      const base = new Date(previousCompletion.completed_at).getTime();
      if (!Number.isNaN(base)) {
        const endsAt = base + cooldownMinutes * 60 * 1000;
        const remaining = endsAt - Date.now();
        if (remaining > 0) {
          return NextResponse.json(
            { ok: false, reason: "Cooldown active", remainingMs: remaining },
            { status: 200 }
          );
        }
      }
    }
  }

  if (!lockEnabled) {
    return NextResponse.json({ ok: true, distance: null });
  }

  if (requiresArtifact && !isAdmin) {
    const { data: claim } = await supabase
      .from("artifact_claims")
      .select("id")
      .eq("player_id", userData.user.id)
      .eq("clue_id", clueRow.id)
      .maybeSingle();
    if (!claim) {
      return NextResponse.json({ ok: false, reason: "Missing QR" }, { status: 200 });
    }
  }

  if (requiresPassword) {
    if (!secret?.password_hash && !secret?.password && !secret?.password_ciphertext) {
      return NextResponse.json({ ok: false, reason: "Clue not configured" }, { status: 400 });
    }

    const inputPassword = body.password ?? "";
    if (!inputPassword) {
      return NextResponse.json({ ok: false, reason: "Missing password" }, { status: 200 });
    }

    if (secret?.password_ciphertext) {
      try {
        const stored = normalizePassword(decryptSecret(secret.password_ciphertext));
        const input = normalizePassword(inputPassword);
        if (!input || !stored.includes(input)) {
          return NextResponse.json({ ok: false, reason: "Invalid password" }, { status: 200 });
        }
      } catch {
        return NextResponse.json({ ok: false, reason: "Invalid password" }, { status: 200 });
      }
    } else if (secret?.password_hash) {
      if (!verifyPassword(inputPassword, secret.password_hash)) {
        return NextResponse.json({ ok: false, reason: "Invalid password" }, { status: 200 });
      }
    } else if (secret?.password) {
      const normalized = normalizePassword(inputPassword);
      if (!normalized || !normalizePassword(secret.password).includes(normalized)) {
        return NextResponse.json({ ok: false, reason: "Invalid password" }, { status: 200 });
      }
      const upgraded = hashPassword(inputPassword);
      await supabase
        .from("clue_secrets")
        .update({ password_hash: upgraded, password: null })
        .eq("clue_id", clueRow.id);
    }
  }

  if (requiresGps) {
    if (!secret || !secret.radius_meters || !secret.lat || !secret.lng) {
      return NextResponse.json({ ok: false, reason: "Clue not configured" }, { status: 400 });
    }
    if (!body.coords) {
      if (body.allowMissingGeo && isAdmin) {
        return NextResponse.json({ ok: true, distance: null });
      }
      return NextResponse.json({ ok: false, reason: "Missing GPS" }, { status: 200 });
    }
    const distance = haversine(body.coords.lat, body.coords.lng, secret.lat, secret.lng);
    if (distance > secret.radius_meters) {
      return NextResponse.json({ ok: false, reason: "Out of range", distance }, { status: 200 });
    }
    return NextResponse.json({ ok: true, distance });
  }

  return NextResponse.json({ ok: true, distance: null });
}
