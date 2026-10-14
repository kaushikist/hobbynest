// HobbyNest — delete-account Edge Function.
//
// Called from the Profile page (learners) and Settings (educators) with the
// user's own login token. It:
//   1. checks who is asking (you can only delete yourself),
//   2. removes your uploaded photos from Storage,
//   3. deletes the auth user — the database removes your profile, classes,
//      enrollments, messages, posts and meetups through ON DELETE CASCADE,
//   4. emails you a confirmation that the account was deleted, and (for
//      educators) tells enrolled learners that the class is no longer available.
//
// Deploy:  supabase functions deploy delete-account
// Secrets (for the emails): RESEND_API_KEY, EMAIL_FROM, APP_URL — see README.

import {
  adminClient, appUrl, callerFrom, claimEmail, corsHeaders, emailConfigured, esc, json, layout, sendMail, type Mail,
} from "../_shared/common.ts";

const BUCKETS = ["avatars", "course-images", "social-posts"];

async function removeUserFiles(admin: ReturnType<typeof adminClient>, userId: string): Promise<number> {
  let removed = 0;
  for (const bucket of BUCKETS) {
    for (let round = 0; round < 20; round++) {
      const { data, error } = await admin.storage.from(bucket).list(userId, { limit: 1000 });
      if (error || !data?.length) break;
      const paths = data.filter((f) => f.name).map((f) => `${userId}/${f.name}`);
      if (!paths.length) break;
      const { error: removeError } = await admin.storage.from(bucket).remove(paths);
      if (removeError) {
        console.warn(`storage ${bucket}:`, removeError.message);
        break;
      }
      removed += paths.length;
      if (data.length < 1000) break;
    }
  }
  return removed;
}

async function handle(req: Request): Promise<Response> {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let admin;
  try {
    admin = adminClient();
  } catch (error) {
    console.error(error);
    return json({ error: "config", message: "The delete-account function is missing its server key." }, 500);
  }

  const user = await callerFrom(req, admin);
  if (!user) return json({ error: "unauthenticated", message: "Your session has expired. Please log in again.", version: 11 }, 401);

  const body = await req.json().catch(() => ({}));
  if (body?.confirm !== "DELETE") {
    return json({ error: "not_confirmed", message: "Type DELETE to confirm." }, 400);
  }

  // Details we need for the emails — collected BEFORE everything is deleted.
  const { data: profile } = await admin
    .from("profiles").select("full_name, role, email").eq("id", user.id).maybeSingle();
  const email = user.email || profile?.email || "";
  const name = (profile?.full_name || "").trim() || "there";
  const site = appUrl(req);

  // Educators: learners enrolled in their classes lose access — tell them.
  const learnerMails: Mail[] = [];
  if (profile?.role === "educator") {
    const { data: courses } = await admin.from("courses").select("id, title").eq("educator_id", user.id);
    const ids = (courses || []).map((c) => c.id);
    if (ids.length) {
      const { data: enrollments } = await admin
        .from("enrollments").select("learner_id, course_id").in("course_id", ids).limit(2000);
      const byLearner = new Map<string, string[]>();
      (enrollments || []).forEach((e) => {
        const title = courses!.find((c) => c.id === e.course_id)?.title || "a class";
        byLearner.set(e.learner_id, [...(byLearner.get(e.learner_id) || []), title]);
      });
      if (byLearner.size) {
        const { data: learners } = await admin
          .from("profiles").select("id, full_name, email").in("id", [...byLearner.keys()]);
        (learners || []).forEach((l) => {
          if (!l.email || l.id === user.id || !byLearner.has(l.id)) return;
          const titles = byLearner.get(l.id) || [];
          const list = titles.map((t) => `<li>${esc(t)}</li>`).join("");
          learnerMails.push({
            to: l.email,
            subject: "A HobbyNest class you joined is no longer available",
            html: layout({
              heading: "A class you joined has been removed",
              intro: `Hi ${esc(l.full_name || "there")}, the educator ${esc(profile?.full_name || "")} has closed their HobbyNest account, so ${titles.length === 1 ? "this class is" : "these classes are"} no longer available:`,
              body: `<ul style="font-size:14px;line-height:1.7">${list}</ul><p style="font-size:14px">Your own account is not affected. You can find other classes on Explore.</p>`,
              button: site ? { label: "Explore classes", url: `${site}/src/screens/user/explore.html` } : undefined,
            }),
            text: `Hi ${l.full_name || "there"}, the educator has closed their HobbyNest account, so these classes are no longer available: ${titles.join(", ")}. Your own account is not affected.`,
          });
        });
      }
    }
  }

  const filesRemoved = await removeUserFiles(admin, user.id).catch((error) => {
    console.warn("storage cleanup:", error);
    return 0;
  });

  let deleteError: { message: string } | null = null;
  try {
    ({ error: deleteError } = await admin.auth.admin.deleteUser(user.id));
  } catch (error) {
    deleteError = { message: String((error as Error)?.message || error) };
  }
  if (deleteError) {
    console.error("deleteUser:", deleteError);
    return json({
      error: "delete_failed",
      message: "The account could not be deleted because of a database rule. " +
        "The site owner needs to run the latest database.sql in Supabase (it fixes old foreign keys).",
      detail: deleteError.message,
    }, 500);
  }

  // Confirmation email to the person who was deleted.
  let emailSent = false;
  if (email && emailConfigured() && await claimEmail(admin, "deleted", user.id, email)) {
    const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" });
    const result = await sendMail([{
      to: email,
      subject: "Your HobbyNest account has been deleted",
      html: layout({
        heading: "Your account has been deleted",
        intro: `Hi ${esc(name)}, this confirms that your HobbyNest account (<strong>${esc(email)}</strong>) was permanently deleted on ${esc(when)} IST.`,
        body: `<p style="font-size:14px;line-height:1.6">We removed your profile, ${profile?.role === "educator" ? "your classes, sessions, " : "your enrollments, progress, "}messages, posts, meetups and uploaded photos. This can't be undone.</p>
               <p style="font-size:14px;line-height:1.6">If you didn't ask for this, reply to this email straight away.</p>`,
        button: site ? { label: "Create a new account", url: `${site}/src/screens/auth/signup.html` } : undefined,
        footer: "This is a one-time confirmation. You won't receive any more emails from HobbyNest.",
      }),
      text: `Hi ${name}, this confirms that your HobbyNest account (${email}) was permanently deleted on ${when} IST. If you didn't ask for this, reply to this email.`,
    }]);
    emailSent = result.sent > 0;
  }

  if (learnerMails.length && emailConfigured()) {
    await sendMail(learnerMails).catch((error) => console.warn("learner emails:", error));
  }

  return json({ success: true, emailSent, email, filesRemoved, learnersNotified: learnerMails.length });
}

Deno.serve(async (req) => {
  try {
    return await handle(req);
  } catch (error) {
    console.error("delete-account:", error);
    return json({ error: "failed", message: "Something went wrong on the server. Nothing was deleted — please try again." }, 500);
  }
});
