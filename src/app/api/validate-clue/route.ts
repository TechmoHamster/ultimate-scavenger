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
    .select("id")
    .eq("clue_index", clueIndex)
    .maybeSingle();

  if (!clueRow) {
    return NextResponse.json({ ok: false, reason: "Clue not found" }, { status: 404 });
  }

  const { data: secret } = await supabase
    .from("clue_secrets")
    .select("password, password_hash, password_ciphertext, radius_meters, lat, lng, requires_unlock")
    .eq("clue_id", clueRow.id)
    .maybeSingle();

  if (secret?.requires_unlock === false) {
    return NextResponse.json({ ok: true, distance: null });
  }

  if (requirePassword) {
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

  if (requireGps && secret.radius_meters && secret.lat && secret.lng) {
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
