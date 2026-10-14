// HobbyNest — notify Edge Function: all app emails except account deletion.
//
// Called by the app (with the user's login token):
//   { type: "ping" }                         → is email set up? (used by selftest.html)
//   { type: "welcome" }                      → "registration complete" email (once per user)
//   { type: "message", message_ids: [1,2] }  → "new message" email to each receiver
//   { type: "session", session_id: 5 }       → "new live session" email to enrolled learners
//
// Called by a Supabase Database Webhook (optional, see README):
//   profiles DELETE → "your account was deleted" email, also when an admin
//   deletes a user from the Supabase dashboard.
//
// Every email is recorded in public.email_log so nothing is sent twice.
// Deploy:  supabase functions deploy notify
// Secrets: RESEND_API_KEY, EMAIL_FROM, APP_URL (and optional HOBBYNEST_HOOK_SECRET).

import {
  adminClient, appUrl, callerFrom, claimEmail, corsHeaders, emailConfigured, esc, isServerCall, json, layout,
  releaseEmail, sendMail, type Mail,
} from "../_shared/common.ts";

type Admin = ReturnType<typeof adminClient>;

const THROTTLE_MINUTES = 10; // one "new message" email per conversation burst

function istTime(value: string): string {
  return new Date(value).toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }) + " IST";
}

/* ---------------- welcome ---------------- */

async function welcome(admin: Admin, req: Request, user: { id: string; email?: string; email_confirmed_at?: string; confirmed_at?: string }) {
  if (!user.email) return json({ sent: false, reason: "no_email" });
  if (!user.email_confirmed_at && !user.confirmed_at) return json({ sent: false, reason: "not_verified" });
  if (!emailConfigured()) return json({ sent: false, reason: "email_not_configured" });

  const { data: profile } = await admin.from("profiles").select("full_name, role").eq("id", user.id).maybeSingle();
  if (!await claimEmail(admin, "welcome", user.id, user.email)) return json({ sent: false, reason: "already_sent" });

  const site = appUrl(req);
  const name = (profile?.full_name || "").trim() || "there";
  const educator = profile?.role === "educator";
  const steps = educator
    ? ["Finish your educator profile", "Publish your first class", "Schedule a live session — enrolled learners are notified automatically"]
    : ["Explore classes and enroll in one you like", "Message your educator from the class page", "Check Schedule for live sessions"];

  const result = await sendMail([{
    to: user.email,
    subject: "Welcome to HobbyNest — your registration is complete",
    html: layout({
      heading: `Welcome to HobbyNest, ${esc(name)}! 🎉`,
      intro: `Your registration is complete and your email <strong>${esc(user.email)}</strong> is verified. You joined as ${educator ? "an <strong>educator</strong>" : "a <strong>learner</strong>"}.`,
      body: `<p style="font-size:14px;margin:14px 0 6px"><strong>What's next</strong></p><ol style="font-size:14px;line-height:1.7;padding-left:20px">${steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`,
      button: site ? { label: "Open HobbyNest", url: `${site}/src/screens/auth/login.html` } : undefined,
    }),
    text: `Welcome to HobbyNest, ${name}! Your registration is complete and ${user.email} is verified. Next: ${steps.join("; ")}.`,
  }]);

  if (!result.sent) {
    await releaseEmail(admin, "welcome", user.id); // allow a retry later
    return json({ sent: false, reason: "provider_error", detail: result.error }, 502);
  }
  return json({ sent: true });
}

/* ---------------- new message ---------------- */

async function messageEmails(admin: Admin, req: Request, callerId: string, ids: number[]) {
  if (!ids.length) return json({ sent: 0 });
  if (!emailConfigured()) return json({ sent: 0, reason: "email_not_configured" });

  const { data: messages } = await admin
    .from("messages")
    .select("id, sender_id, receiver_id, message, created_at, kind, read_at")
    .in("id", ids.slice(0, 200))
    .eq("sender_id", callerId); // only the sender can trigger emails for a message
  if (!messages?.length) return json({ sent: 0 });

  const receiverIds = [...new Set(messages.map((m) => m.receiver_id))];
  const { data: people } = await admin
    .from("profiles").select("id, full_name, email, role, settings").in("id", [...receiverIds, callerId]);
  const byId = new Map((people || []).map((p) => [p.id, p]));
  const sender = byId.get(callerId);
  const senderName = (sender?.full_name || "").trim() || "Someone";
  const site = appUrl(req);

  const mails: Mail[] = [];
  for (const m of messages) {
    if (m.kind !== "text" || m.read_at) continue;
    const to = byId.get(m.receiver_id);
    if (!to?.email) continue;

    // Respect notification settings.
    const settings = (to.settings || {}) as Record<string, unknown>;
    if (to.role === "educator" && ["none", "sessions"].includes(String(settings.email_notifications || "all"))) continue;
    if (to.role !== "educator" && settings.message_emails === false) continue;

    // Only the first message of a burst gets an email.
    const since = new Date(new Date(m.created_at).getTime() - THROTTLE_MINUTES * 60000).toISOString();
    const { count } = await admin
      .from("messages").select("id", { count: "exact", head: true })
      .eq("sender_id", m.sender_id).eq("receiver_id", m.receiver_id)
      .gte("created_at", since).lt("id", m.id);
    if (count) continue;

    if (!await claimEmail(admin, "message", String(m.id), to.email)) continue;
    const preview = m.message.length > 400 ? m.message.slice(0, 400) + "…" : m.message;
    mails.push({
      to: to.email,
      subject: `New message from ${senderName} on HobbyNest`,
      html: layout({
        heading: `${esc(senderName)} sent you a message`,
        intro: `Hi ${esc(to.full_name || "there")}, you have a new message on HobbyNest:`,
        body: `<blockquote style="margin:14px 0;padding:12px 14px;background:#f5f7fb;border-left:3px solid #1558c0;font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(preview)}</blockquote>`,
        button: site ? { label: "Reply on HobbyNest", url: `${site}/src/screens/user/messages.html?to=${m.sender_id}` } : undefined,
        footer: "You can turn off message emails in Settings on HobbyNest.",
      }),
      text: `${senderName} sent you a message on HobbyNest:\n\n${preview}\n\nReply: ${site}/src/screens/user/messages.html?to=${m.sender_id}`,
    });
  }

  const result = await sendMail(mails);
  return json({ sent: result.sent, error: result.error });
}

/* ---------------- new live session ---------------- */

async function sessionEmails(admin: Admin, req: Request, callerId: string, sessionId: number) {
  const { data: session } = await admin
    .from("sessions")
    .select("id, educator_id, course_id, title, description, session_date, meeting_link")
    .eq("id", sessionId).eq("educator_id", callerId).maybeSingle();
  if (!session) return json({ sent: 0, reason: "not_found" }, 404);
  if (!session.course_id) return json({ sent: 0, reason: "open_session" });
  if (!emailConfigured()) return json({ sent: 0, reason: "email_not_configured" });

  const [{ data: course }, { data: educator }, { data: enrollments }] = await Promise.all([
    admin.from("courses").select("title").eq("id", session.course_id).maybeSingle(),
    admin.from("profiles").select("full_name").eq("id", callerId).maybeSingle(),
    admin.from("enrollments").select("learner_id").eq("course_id", session.course_id).limit(2000),
  ]);
  const learnerIds = (enrollments || []).map((e) => e.learner_id).filter((id) => id !== callerId);
  if (!learnerIds.length) return json({ sent: 0, reason: "no_learners" });

  const { data: learners } = await admin
    .from("profiles").select("id, full_name, email, settings").in("id", learnerIds);

  const site = appUrl(req);
  const when = istTime(session.session_date);
  const educatorName = (educator?.full_name || "").trim() || "Your educator";
  const classTitle = course?.title || "your class";
  const mails: Mail[] = [];

  const wanted = new Set(learnerIds);
  for (const learner of learners || []) {
    if (!learner.email || !wanted.has(learner.id)) continue;
    const settings = (learner.settings || {}) as Record<string, unknown>;
    if (settings.schedule_updates === false) continue;
    if (!await claimEmail(admin, "session", `${session.id}:${learner.id}`, learner.email)) continue;

    const link = session.meeting_link
      ? `<p style="font-size:14px;margin:8px 0">Join link: <a href="${esc(session.meeting_link)}">${esc(session.meeting_link)}</a></p>`
      : `<p style="font-size:14px;margin:8px 0">The join link will be shared before the session.</p>`;
    mails.push({
      to: learner.email,
      subject: `Live session scheduled: ${session.title} — ${when}`,
      html: layout({
        heading: "📅 A live session has been scheduled",
        intro: `Hi ${esc(learner.full_name || "there")}, ${esc(educatorName)} scheduled a live session for <strong>${esc(classTitle)}</strong>.`,
        body: `<div style="background:#f5f7fb;border-radius:10px;padding:14px 16px;margin:14px 0">
                 <p style="font-size:16px;font-weight:700;margin:0 0 6px">${esc(session.title)}</p>
                 <p style="font-size:14px;margin:0 0 6px">🕒 ${esc(when)}</p>
                 ${session.description ? `<p style="font-size:14px;margin:0 0 6px;white-space:pre-wrap">${esc(session.description)}</p>` : ""}
                 ${link}
               </div>`,
        button: site ? { label: "View my schedule", url: `${site}/src/screens/user/schedule.html` } : undefined,
        footer: "You can turn off schedule emails in Settings on HobbyNest.",
      }),
      text: `${educatorName} scheduled a live session for ${classTitle}: ${session.title}, ${when}. ${session.meeting_link ? "Join: " + session.meeting_link : "The join link will be shared before the session."}`,
    });
  }

  const result = await sendMail(mails);
  return json({ sent: result.sent, learners: learnerIds.length, error: result.error });
}

/* ---------------- webhook: profile deleted ---------------- */

async function deletedWebhook(admin: Admin, req: Request, old: { id?: string; email?: string; full_name?: string }) {
  if (!old?.id || !old.email) return json({ sent: false });
  if (!emailConfigured()) return json({ sent: false, reason: "email_not_configured" });
  if (!await claimEmail(admin, "deleted", old.id, old.email)) return json({ sent: false, reason: "already_sent" });
  const site = appUrl(req);
  const result = await sendMail([{
    to: old.email,
    subject: "Your HobbyNest account has been deleted",
    html: layout({
      heading: "Your account has been deleted",
      intro: `Hi ${esc(old.full_name || "there")}, this confirms that your HobbyNest account (<strong>${esc(old.email)}</strong>) has been permanently deleted, together with your profile, messages and other data.`,
      body: `<p style="font-size:14px;line-height:1.6">If you didn't expect this, reply to this email.</p>`,
      button: site ? { label: "Create a new account", url: `${site}/src/screens/auth/signup.html` } : undefined,
      footer: "This is a one-time confirmation. You won't receive any more emails from HobbyNest.",
    }),
    text: `This confirms that your HobbyNest account (${old.email}) has been permanently deleted. If you didn't expect this, reply to this email.`,
  }]);
  return json({ sent: result.sent > 0 });
}

/* ---------------- entry ---------------- */

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let admin: Admin;
  try {
    admin = adminClient();
  } catch (error) {
    console.error(error);
    return json({ error: "config" }, 500);
  }

  const body = await req.json().catch(() => ({}));

  // Database Webhook (server to server).
  if (isServerCall(req) && body?.table === "profiles" && body?.type === "DELETE") {
    return deletedWebhook(admin, req, body.old_record || {});
  }

  const user = await callerFrom(req, admin);
  if (!user) return json({ error: "unauthenticated", version: 11 }, 401);

  try {
    switch (body?.type) {
      case "ping":
        return json({ ok: true, version: 11, emailConfigured: emailConfigured(), appUrl: Boolean(appUrl()) });
      case "welcome":
        return await welcome(admin, req, user);
      case "message": {
        const ids = (Array.isArray(body.message_ids) ? body.message_ids : [body.message_id])
          .map(Number).filter((n: number) => Number.isInteger(n) && n > 0);
        return await messageEmails(admin, req, user.id, ids);
      }
      case "session":
        return await sessionEmails(admin, req, user.id, Number(body.session_id));
      default:
        return json({ error: "unknown_type" }, 400);
    }
  } catch (error) {
    console.error("notify:", error);
    return json({ error: "failed" }, 500);
  }
});
