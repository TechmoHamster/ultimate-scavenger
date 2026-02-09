import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function POST(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json()) as { clueIndex?: number };
  const clueIndex = body?.clueIndex;
  if (typeof clueIndex !== "number") {
    return NextResponse.json({ ok: false, reason: "Invalid clue" }, { status: 400 });
  }

  const { data: existing } = await supabase
    .from("cooldown_notifications")
    .select("id")
    .eq("player_id", userData.user.id)
    .eq("clue_index", clueIndex)
    .maybeSingle();

  if (existing?.id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  const { data: clue } = await supabase
    .from("clues")
    .select("title, label")
    .eq("clue_index", clueIndex)
    .maybeSingle();

  const email = userData.user.email;
  if (!email) {
    return NextResponse.json({ ok: false, reason: "Missing email" }, { status: 400 });
  }

  const resendKey = process.env.RESEND_API_KEY;
  const resendFrom = process.env.RESEND_FROM;
  if (!resendKey || !resendFrom) {
    return NextResponse.json({ ok: false, reason: "Email not configured" }, { status: 500 });
  }

  const clueLabel = clue?.label ?? `Clue ${clueIndex}`;
  const clueTitle = clue?.title ?? "Your next clue";
  const baseUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ultimatescavenger.xyz";
  const link = `${baseUrl}/experience/current`;
  const subject = "Your next clue is ready";
  const text = `Your next clue (${clueLabel}: ${clueTitle}) is ready.\nOpen it here: ${link}`;
  const html = `
    <div style="font-family: Arial, sans-serif; line-height: 1.5;">
      <h2 style="margin-bottom: 8px;">Your next clue is ready</h2>
      <p>${clueLabel}: <strong>${clueTitle}</strong></p>
      <p>Open it here: <a href="${link}">${link}</a></p>
    </div>
  `;

  const emailResponse = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: resendFrom,
      to: [email],
      subject,
      text,
      html,
    }),
  });

  if (!emailResponse.ok) {
    const details = await emailResponse.text();
    return NextResponse.json({ ok: false, reason: "Email send failed", details }, { status: 500 });
  }

  await supabase.from("cooldown_notifications").insert({
    player_id: userData.user.id,
    clue_index: clueIndex,
  });

  return NextResponse.json({ ok: true });
}
