// HobbyNest — runs an Edge Function locally against a MOCK Supabase and a MOCK
// email provider (nothing real is touched, no real emails are sent).
//
//   deno run -A tests/functions/harness.ts file://$PWD/supabase/functions/<name>/index.ts '<cases JSON>'
//
// See tests/functions/run-function-tests.sh for the cases used.
const FN = Deno.args[0];           // path to index.ts
const CASES = JSON.parse(Deno.args[1]);
const calls: string[] = [];
const emails: any[] = [];
const userToken = "aaa.bbb.ccc";
const users: Record<string, any> = { [userToken]: { id: "0a6f2f9e-1111-4111-8111-111111111111", email: "edu@test.dev", email_confirmed_at: "2026-01-01" } };
const emailLog = new Set<string>();

Deno.serve({ port: 54321, onListen() {} }, async (req) => {
  const u = new URL(req.url);
  const key = `${req.method} ${u.pathname}${u.search}`;
  calls.push(key);
  const p = u.pathname;
  if (p === "/auth/v1/user") {
    const tok = (req.headers.get("authorization") || "").replace("Bearer ", "");
    return users[tok] ? Response.json(users[tok]) : Response.json({ msg: "bad jwt" }, { status: 401 });
  }
  if (p.startsWith("/auth/v1/admin/users/") && req.method === "DELETE") return Response.json({});
  if (p === "/rest/v1/profiles") {
    if (u.search.includes("id=eq.0a6f2f9e-1111-4111-8111-111111111111")) {
      const one = { id: "0a6f2f9e-1111-4111-8111-111111111111", full_name: "Edu Teacher", role: "educator", email: "edu@test.dev", settings: {} };
      return Response.json(req.headers.get("accept")?.includes("vnd.pgrst.object") ? one : [one]);
    }
    return Response.json([{ id: "0a6f2f9e-1111-4111-8111-111111111111", full_name: "Edu Teacher", role: "educator", email: "edu@test.dev", settings: {} }, { id: "0a6f2f9e-2222-4222-8222-222222222222", full_name: "Lea", email: "lea@test.dev", role: "learner", settings: {} },
                          { id: "0a6f2f9e-3333-4333-8333-333333333333", full_name: "Noemail", email: null, role: "learner", settings: { schedule_updates: false } }]);
  }
  if (p === "/rest/v1/courses") return Response.json(u.search.includes("select=title") ? { title: "Guitar 101" } : [{ id: 7, title: "Guitar 101" }]);
  if (p === "/rest/v1/enrollments") return Response.json([{ learner_id: "0a6f2f9e-2222-4222-8222-222222222222", course_id: 7 }, { learner_id: "0a6f2f9e-3333-4333-8333-333333333333", course_id: 7 }]);
  if (p === "/rest/v1/sessions") return Response.json({ id: 5, educator_id: "0a6f2f9e-1111-4111-8111-111111111111", course_id: 7, title: "Live Q&A", description: null, session_date: "2026-10-20T11:30:00Z", meeting_link: "https://meet.google.com/x" });
  if (p === "/rest/v1/email_log" && req.method === "POST") {
    const body = await req.json(); const k = body.kind + ":" + body.ref;
    if (emailLog.has(k)) return Response.json({ code: "23505", message: "duplicate" }, { status: 409 });
    emailLog.add(k); return new Response(null, { status: 201 });
  }
  if (p === "/rest/v1/messages") {
    if (req.method === "HEAD") {
      const burst = u.search.includes("lt.11"); // message 11 follows message 10 within 10 minutes
      return new Response(null, { status: 200, headers: { "content-range": burst ? "0-0/1" : "*/0" } });
    }
    return Response.json([
      { id: 10, sender_id: "0a6f2f9e-1111-4111-8111-111111111111", receiver_id: "0a6f2f9e-2222-4222-8222-222222222222", message: "Lets do a call at 5pm today?", created_at: "2026-10-14T10:00:00Z", kind: "text", read_at: null },
      { id: 11, sender_id: "0a6f2f9e-1111-4111-8111-111111111111", receiver_id: "0a6f2f9e-2222-4222-8222-222222222222", message: "Also bring your guitar", created_at: "2026-10-14T10:01:00Z", kind: "text", read_at: null }
    ]);
  }
  if (p.startsWith("/storage/v1/object/list/")) {
    const bucket = p.split("/").pop();
    return Response.json(bucket === "avatars" ? [{ name: "a.jpg" }, { name: "b.png" }] : []);
  }
  if (p.startsWith("/storage/v1/object/") && req.method === "DELETE") return Response.json([{ name: "a.jpg" }]);
  return Response.json({ unknown: key }, { status: 500 });
});

const realFetch = globalThis.fetch;
globalThis.fetch = async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input.url;
  if (url.startsWith("https://api.resend.com")) {
    const body = JSON.parse(init.body);
    (Array.isArray(body) ? body : [body]).forEach((m: any) => emails.push({ to: m.to[0], subject: m.subject }));
    return Response.json({ id: "x" });
  }
  return realFetch(input, init);
};

Deno.env.set("SUPABASE_URL", "http://localhost:54321");
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "svc");
Deno.env.set("RESEND_API_KEY", "re_test");
Deno.env.set("EMAIL_FROM", "HobbyNest <no-reply@hn.test>");
Deno.env.set("APP_URL", "https://hobbynest.example");
await import(FN);   // starts Deno.serve on :8000
await new Promise(r => setTimeout(r, 300));

for (const c of CASES) {
  calls.length = 0; emails.length = 0;
  const res = await realFetch("http://localhost:8000", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${c.token ?? userToken}` }, body: JSON.stringify(c.body) });
  const out = await res.json();
  console.log(`\n### ${c.name} → ${res.status}`, JSON.stringify(out));
  console.log("   deleted user:", calls.some(k => k.startsWith("DELETE /auth/v1/admin/users")), "| storage removes:", calls.filter(k => k.startsWith("DELETE /storage")).length);
  console.log("   emails:", JSON.stringify(emails));
}
Deno.exit(0);
