import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? ""
);

type Action =
  | "update_profile"
  | "set_role"
  | "set_email"
  | "reset_password"
  | "delete_user";

const unauthorized = () =>
  NextResponse.json({ ok: false, reason: "Unauthorized" }, { status: 401 });

async function requireStaff(request: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { error: NextResponse.json({ ok: false, reason: "Server misconfigured" }, { status: 500 }) };
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

export async function GET(request: Request) {
  const { error, role } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const { data: usersData, error: usersError } = await supabase.auth.admin.listUsers();
  if (usersError) {
    return NextResponse.json({ ok: false, reason: usersError.message }, { status: 400 });
  }

  const userIds = usersData?.users?.map((user) => user.id) ?? [];
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, username, role, is_disabled, created_at")
    .in("id", userIds);

  const profileMap = new Map((profiles ?? []).map((row) => [row.id, row]));

  const users = (usersData?.users ?? []).map((user) => {
    const profile = profileMap.get(user.id);
    return {
      id: user.id,
      email: user.email ?? null,
      full_name: profile?.full_name ?? null,
      username: profile?.username ?? null,
      role: profile?.role ?? "player",
      is_disabled: profile?.is_disabled ?? false,
      created_at: user.created_at ?? profile?.created_at ?? null,
      last_sign_in_at: user.last_sign_in_at ?? null,
    };
  });

  return NextResponse.json({ ok: true, users });
}

export async function POST(request: Request) {
  const { error, role } = await requireStaff(request);
  if (error) return error;
  if (role !== "admin" && role !== "moderator") {
    return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json()) as {
    action?: Action;
    userId?: string;
    updates?: { full_name?: string; username?: string; is_disabled?: boolean };
    role?: string;
    email?: string;
  };

  if (!body?.action || !body.userId) {
    return NextResponse.json({ ok: false, reason: "Missing payload" }, { status: 400 });
  }

  if (body.action === "update_profile") {
    const { updates } = body;
    if (!updates) {
      return NextResponse.json({ ok: false, reason: "Missing updates" }, { status: 400 });
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update(updates)
      .eq("id", body.userId);
    if (updateError) {
      return NextResponse.json({ ok: false, reason: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_role") {
    if (role !== "admin") {
      return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
    }
    if (!body.role) {
      return NextResponse.json({ ok: false, reason: "Missing role" }, { status: 400 });
    }
    const { error: updateError } = await supabase
      .from("profiles")
      .update({ role: body.role })
      .eq("id", body.userId);
    if (updateError) {
      return NextResponse.json({ ok: false, reason: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "set_email") {
    if (role !== "admin") {
      return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
    }
    if (!body.email) {
      return NextResponse.json({ ok: false, reason: "Missing email" }, { status: 400 });
    }
    const { error: updateError } = await supabase.auth.admin.updateUserById(body.userId, {
      email: body.email,
    });
    if (updateError) {
      return NextResponse.json({ ok: false, reason: updateError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "reset_password") {
    if (!body.email) {
      return NextResponse.json({ ok: false, reason: "Missing email" }, { status: 400 });
    }
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) {
      return NextResponse.json({ ok: false, reason: "Email not configured" }, { status: 500 });
    }
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ??
      (process.env.NEXT_PUBLIC_VERCEL_URL
        ? `https://${process.env.NEXT_PUBLIC_VERCEL_URL}`
        : "");
    const { data, error: linkError } = await supabase.auth.admin.generateLink({
      type: "recovery",
      email: body.email,
      options: baseUrl ? { redirectTo: `${baseUrl}/auth/reset` } : undefined,
    });
    if (linkError) {
      return NextResponse.json({ ok: false, reason: linkError.message }, { status: 400 });
    }
    const actionLink = data?.properties?.action_link ?? null;
    if (!actionLink) {
      return NextResponse.json({ ok: false, reason: "Unable to generate reset link." }, { status: 400 });
    }
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM,
        to: [body.email],
        subject: "Reset your scavenger hunt password",
        html: `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2>Reset your password</h2>
            <p>Click the button below to choose a new password.</p>
            <p><a href="${actionLink}" style="display:inline-block;padding:10px 16px;background:#f6f099;color:#000;border-radius:999px;text-decoration:none;">Reset password</a></p>
            <p>If you did not request this, you can ignore this email.</p>
          </div>
        `,
      }),
    });
    if (!emailResponse.ok) {
      const details = await emailResponse.text();
      return NextResponse.json({ ok: false, reason: details }, { status: 500 });
    }
    return NextResponse.json({ ok: true });
  }

  if (body.action === "delete_user") {
    if (role !== "admin") {
      return NextResponse.json({ ok: false, reason: "Forbidden" }, { status: 403 });
    }
    const { error: deleteError } = await supabase.auth.admin.deleteUser(body.userId);
    if (deleteError) {
      return NextResponse.json({ ok: false, reason: deleteError.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: false, reason: "Unknown action" }, { status: 400 });
}
