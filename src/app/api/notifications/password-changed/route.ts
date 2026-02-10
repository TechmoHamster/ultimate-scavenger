import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

export async function POST(request: Request) {
  if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
    return NextResponse.json({ ok: false, reason: "Email not configured" }, { status: 500 });
  }

  const token = request.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData?.user?.email) {
    return NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });
  }

  const email = userData.user.email;
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM,
      to: [email],
      subject: "Your password was changed",
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.5;">
          <h2>Password updated</h2>
          <p>Your scavenger hunt account password was just changed.</p>
          <p>If this wasn't you, please reset your password immediately.</p>
        </div>
      `,
    }),
  });

  if (!response.ok) {
    const details = await response.text();
    return NextResponse.json({ ok: false, reason: details }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
