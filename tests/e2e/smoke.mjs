// HobbyNest — browser smoke test for the Batch 8 fixes.
// Opens the real pages in Chromium; the Supabase API is MOCKED, so it never
// touches your real project or sends real emails.
//
//   cd tests/e2e && npm install && npx playwright install chromium && node smoke.mjs
//   (set CHROMIUM_PATH=/path/to/chrome to use an existing browser)
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("../../", import.meta.url));
const BASE = "http://127.0.0.1:8765";
const SUPA = "https://jrxlhqxphtnhtugaetfw.supabase.co";
const UMD = readFileSync(new URL("./node_modules/@supabase/supabase-js/dist/umd/supabase.js", import.meta.url));
const SHOTS = fileURLToPath(new URL("./shots/", import.meta.url));
mkdirSync(SHOTS, { recursive: true });

const server = spawn("python3", ["-m", "http.server", "8765", "--bind", "127.0.0.1"], { cwd: ROOT, stdio: "ignore" });
await new Promise(r => setTimeout(r, 800));

const b64 = o => Buffer.from(JSON.stringify(o)).toString("base64url");
const USER = { id: "0a6f2f9e-2222-4222-8222-222222222222", email: "lea@test.dev", email_confirmed_at: "2026-10-14T05:00:00Z", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {} };
const exp = Math.floor(Date.now() / 1000) + 3600;
const JWT = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ sub: USER.id, exp, role: "authenticated", email: USER.email })}.sig`;
const SESSION = { access_token: JWT, refresh_token: "r1", token_type: "bearer", expires_in: 3600, expires_at: exp, user: USER };

let results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  — " + detail : ""}`); };

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});

async function newPage({ signedIn = false, signup = "new", profile = {}, unread = 0, deleteResult = null,
                        emailjs = false, deleteRpc = "ok", oldDb = false, signupSession = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 860 } });
  const page = await ctx.newPage();
  const calls = [];
  page.on("pageerror", e => calls.push("PAGEERROR " + e.message));
  if (signedIn) {
    await ctx.addInitScript(([key, val]) => { if (!sessionStorage.getItem("seeded")) { localStorage.setItem(key, val); sessionStorage.setItem("seeded", "1"); } }, ["sb-jrxlhqxphtnhtugaetfw-auth-token", JSON.stringify(SESSION)]);
  }
  await page.route("https://cdn.jsdelivr.net/**", r => r.fulfill({ body: UMD, contentType: "application/javascript", headers: { "access-control-allow-origin": "*" } }));
  await page.route(/images\.unsplash\.com|ytimg|nominatim/, r => r.fulfill({ status: 204, body: "" }));
  if (emailjs) {
    await page.route(/\/js\/email-config\.js/, r => r.fulfill({ contentType: "application/javascript",
      body: 'window.HN_EMAIL = { emailjs: { publicKey: "pk_test", serviceId: "service_test", templateId: "template_test" }, edgeFunctions: false };' }));
  }
  await page.route("https://api.emailjs.com/**", r => {
    const body = JSON.parse(r.request().postData() || "{}");
    calls.push("EMAILJS " + (body.template_params?.to_email || "") + " | " + (body.template_params?.subject || ""));
    return r.fulfill({ status: 200, body: "OK", headers: { "access-control-allow-origin": "*" } });
  });
  await page.route(`${SUPA}/**`, async route => {
    const req = route.request();
    const url = new URL(req.url());
    const p = url.pathname;
    calls.push(`${req.method()} ${p}${url.search}`);
    const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "*", "access-control-allow-methods": "*", "access-control-expose-headers": "*" };
    const json = (body, status = 200, extra = {}) => route.fulfill({ status, body: JSON.stringify(body), contentType: "application/json", headers: { ...cors, ...extra } });
    if (req.method() === "OPTIONS") return route.fulfill({ status: 200, headers: cors, body: "" });
    if (p === "/auth/v1/verify") return json({ ...SESSION });
    if (p === "/auth/v1/user") return json(USER);
    if (p === "/auth/v1/logout") return route.fulfill({ status: 204, headers: cors, body: "" });
    if (p === "/auth/v1/resend") return json({});
    if (p === "/auth/v1/signup") {
      const body = JSON.parse(req.postData() || "{}");
      calls.push("SIGNUP redirect=" + (body.code_challenge ? "pkce " : "") + url.searchParams.get("redirect_to"));
      const identities = signup === "exists" ? [] : [{ id: "i1" }];
      if (signupSession) return json({ ...SESSION });   // "Confirm email" switched off in Supabase
      return json({ ...USER, email: body.email, email_confirmed_at: null, identities });
    }
    if (p === "/rest/v1/profiles") {
      const row = { role: "learner", full_name: "Lea Learner", onboarding_complete: true, profile_image: null, headline: null, ...profile };
      const single = (req.headers()["accept"] || "").includes("vnd.pgrst.object");
      return json(single ? row : [row]);
    }
    if (p === "/rest/v1/rpc/get_my_profile") return json([{ id: USER.id, full_name: "Lea Learner", email: USER.email, role: "learner", interests: [], settings: {}, ...profile }]);
    if (p === "/rest/v1/messages" && req.method() === "HEAD") return route.fulfill({ status: 200, headers: { ...cors, "content-range": unread ? `0-0/${unread}` : "*/0" }, body: "" });
    if (p === "/functions/v1/notify") return json({ sent: true });
    if (p === "/rest/v1/rpc/delete_my_account") {
      return deleteRpc === "missing"
        ? json({ code: "PGRST202", message: "Could not find the function public.delete_my_account without parameters in the schema cache" }, 404)
        : json(true);
    }
    if (p === "/rest/v1/messages" && req.method() === "GET" && oldDb && /kind/.test(url.search)) {
      return json({ code: "42703", message: "column messages.kind does not exist" }, 400);
    }
    if (p === "/functions/v1/delete-account") return deleteResult ? json(deleteResult.body, deleteResult.status) : json({ success: true, emailSent: true, email: USER.email });
    if (p.startsWith("/rest/v1/")) return json([]);
    return json({});
  });
  return { ctx, page, calls };
}

try {
  // 1. Expired / pre-used verification link
  {
    const { ctx, page, calls } = await newPage();
    await page.goto(`${BASE}/src/screens/auth/verify.html#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    await page.waitForSelector("#stateError:not([hidden])", { timeout: 8000 });
    const title = await page.textContent("#errorTitle");
    const resend = await page.isVisible("#resendForm");
    check("Expired link → friendly explanation + resend form", /expired or was already used/.test(title) && resend, title);
    await page.fill("#resendEmail", "lea@test.dev");
    await page.click("#resendBtn");
    await page.waitForSelector("#resendNote:not([hidden])");
    check("Resend verification link from verify page", calls.some(c => c.startsWith("POST /auth/v1/resend")), await page.textContent("#resendNote"));
    await page.screenshot({ path: SHOTS + "1-expired-link.png" });
    check("No JS errors (verify/expired)", !calls.some(c => c.startsWith("PAGEERROR")), calls.filter(c => c.startsWith("PAGEERROR")).join(" | "));
    await ctx.close();
  }

  // 2. token_hash link → one click → Registration complete + welcome email
  {
    const { ctx, page, calls } = await newPage({ profile: { onboarding_complete: false }, emailjs: true });
    await page.goto(`${BASE}/src/screens/auth/verify.html?token_hash=pkce_abc123&type=email`);
    await page.waitForSelector("#stateConfirm:not([hidden])", { timeout: 8000 });
    const usedBeforeClick = calls.some(c => c.startsWith("POST /auth/v1/verify"));
    await page.click("#confirmBtn");
    await page.waitForSelector("#stateSuccess:not([hidden])", { timeout: 8000 });
    await page.waitForFunction(() => /welcome note|inbox/i.test(document.getElementById("welcomeNote").textContent), null, { timeout: 8000 });
    const email = await page.textContent("#successEmail");
    const note = await page.textContent("#welcomeNote");
    const href = await page.getAttribute("#continueBtn", "href");
    check("Link isn't used up until the person clicks (scanner-safe)", !usedBeforeClick);
    check("token_hash link → 'Registration complete'", email === USER.email && href === "role-select.html", `${email} → ${href}`);
    check("Welcome email sent (EmailJS)", calls.some(c => c.startsWith("EMAILJS lea@test.dev | Welcome to HobbyNest")), note);
    check("Welcome email marked as sent (no duplicates later)", calls.some(c => c.startsWith("PATCH /rest/v1/profiles")));
    check("Address bar cleaned (no token left in URL)", !page.url().includes("token_hash"), page.url());
    await page.screenshot({ path: SHOTS + "2-registration-complete.png" });
    await ctx.close();
  }

  // 3. Default Supabase link that fell back to the Site URL root → forwarded to verify page
  {
    const { ctx, page, calls } = await newPage();
    await page.goto(`${BASE}/index.html#access_token=${JWT}&expires_at=${exp}&expires_in=3600&refresh_token=r1&token_type=bearer&type=signup`);
    await page.waitForURL(/verify\.html/, { timeout: 8000 });
    await page.waitForSelector("#stateSuccess:not([hidden])", { timeout: 8000 });
    check("Root URL with #access_token → verify page → success", true, page.url());
    await ctx.close();
  }

  // 4. Old-style email link that pointed at login.html → forwarded too
  {
    const { ctx, page } = await newPage();
    await page.goto(`${BASE}/src/screens/auth/login.html?verified=1#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired`);
    await page.waitForURL(/verify\.html/, { timeout: 8000 });
    await page.waitForSelector("#stateError:not([hidden])", { timeout: 8000 });
    check("Old login.html links with errors are explained on verify page", true);
    await ctx.close();
  }

  // 5. Signup → "Check your inbox" screen (no alert), redirect points at verify.html
  {
    const { ctx, page, calls } = await newPage();
    let alerted = false;
    page.on("dialog", d => { alerted = true; d.dismiss(); });
    await page.goto(`${BASE}/src/screens/auth/signup.html`);
    await page.fill("#name", "Lea Learner");
    await page.fill("#email", "Lea@Test.dev");
    await page.fill("#password", "supersecret1");
    if (await page.$("#city")) await page.fill("#city", "Mumbai");
    const terms = await page.$('input[type="checkbox"][required]');
    if (terms) await terms.check();
    await page.click('#signupForm button[type="submit"]');
    await page.waitForSelector("#signupDone", { timeout: 8000 });
    const txt = await page.textContent("#signupDone");
    const redirect = calls.find(c => c.startsWith("SIGNUP")) || "";
    check("Signup shows 'Check your inbox' with the address", /Check your inbox/.test(txt) && /lea@test\.dev/.test(txt) && !alerted, "");
    check("Verification email links to verify.html", /verify\.html/.test(redirect), redirect);
    await page.click("#resendLink");
    await page.waitForFunction(() => /on its way/.test(document.getElementById("resendNote").textContent), null, { timeout: 8000 });
    await page.waitForTimeout(1300);
    check("'Send it again' works with a cooldown", /Send again in/.test(await page.textContent("#resendLink")), await page.textContent("#resendLink"));
    await page.screenshot({ path: SHOTS + "3-signup-check-inbox.png" });
    await ctx.close();
  }

  // 6. Signup with an email that's already registered
  {
    const { ctx, page } = await newPage({ signup: "exists" });
    await page.goto(`${BASE}/src/screens/auth/signup.html`);
    await page.fill("#name", "Lea");
    await page.fill("#email", "lea@test.dev");
    await page.fill("#password", "supersecret1");
    const terms = await page.$('input[type="checkbox"][required]');
    if (terms) await terms.check();
    await page.click('#signupForm button[type="submit"]');
    await page.waitForSelector("#signupDone", { timeout: 8000 });
    check("Already-registered email gets told (instead of silently no email)", /already have an account/.test(await page.textContent("#signupDone")));
    await ctx.close();
  }

  // 7. Learner deletes account → login page confirms deletion + email
  {
    const { ctx, page, calls } = await newPage({ signedIn: true, emailjs: true });
    page.on("dialog", d => d.accept());
    await page.goto(`${BASE}/src/screens/user/profile.html`);
    await page.waitForSelector("#deleteAccountButton");
    await page.waitForFunction(() => document.getElementById("pName")?.value === "Lea Learner", null, { timeout: 8000 });
    await page.click("#deleteAccountButton");
    const warn = await page.textContent("#deleteAccountStatus");
    await page.fill("#deleteAccountConfirm", "DELETE");
    await page.click("#deleteAccountButton");
    await page.waitForURL(/login\.html/, { timeout: 8000 });
    await page.waitForSelector("#errorBox.show", { timeout: 8000 });
    const msg = await page.textContent("#errorBox");
    check("Delete requires typing DELETE", /type DELETE/i.test(warn), warn);
    check("Delete uses the database function (no deploy needed)", calls.some(c => c.startsWith("POST /rest/v1/rpc/delete_my_account")));
    check("Account-deleted email sent", calls.some(c => c.startsWith("EMAILJS lea@test.dev | Your HobbyNest account has been deleted")));
    check("After deletion the login page tells the user (and mentions the email)", /permanently deleted/.test(msg) && /lea@test\.dev/.test(msg), msg.trim());
    await page.screenshot({ path: SHOTS + "4-account-deleted.png" });
    await ctx.close();
  }

  // 8. Delete fails (function not deployed) → honest, specific message
  {
    const { ctx, page } = await newPage({ signedIn: true, deleteRpc: "missing" });
    page.on("dialog", d => d.accept());
    await page.goto(`${BASE}/src/screens/user/profile.html`);
    await page.waitForFunction(() => document.getElementById("pName")?.value === "Lea Learner", null, { timeout: 8000 });
    await page.fill("#deleteAccountConfirm", "DELETE");
    await page.click("#deleteAccountButton");
    await page.waitForFunction(() => /database\.sql/.test(document.getElementById("deleteAccountStatus").textContent), null, { timeout: 8000 });
    check("Failed delete explains why and that nothing was deleted", page.url().includes("profile.html"), await page.textContent("#deleteAccountStatus"));
    await ctx.close();
  }

  // 9. Learner dashboard shows unread-messages banner + badge
  {
    const { ctx, page, calls } = await newPage({ signedIn: true, unread: 2 });
    await page.goto(`${BASE}/src/screens/user/user-dashboard.html`);
    await page.waitForSelector("#nsInboxBanner", { timeout: 8000 });
    const banner = await page.textContent("#nsInboxBanner");
    const badge = await page.textContent('.sidebar a[href$="messages.html"] .nav-badge');
    check("Dashboard banner: unread messages", /2 unread messages/.test(banner), banner.trim());
    check("Sidebar unread badge", badge === "2", badge);
    // Simulate a new message arriving while on another page.
    await page.evaluate(() => nsNotify("📅 Edu Teacher scheduled a live session", "📅 New live session: Live Q&A\nThu, 15 Oct 2026 at 05:00 PM IST", "./messages.html?to=x"));
    check("Pop-up notification renders", await page.isVisible("#nsNotice"));
    await page.screenshot({ path: SHOTS + "5-dashboard-unread.png" });
    check("No JS errors on dashboard", !calls.some(c => c.startsWith("PAGEERROR")), calls.filter(c => c.startsWith("PAGEERROR")).join(" | "));
    await ctx.close();
  }

  // 11. Messages page renders an automatic live-session notice with a clickable join link
  {
    const { ctx, page, calls } = await newPage({ signedIn: true });
    const EDU = "0a6f2f9e-1111-4111-8111-111111111111";
    const msg = { id: 41, sender_id: EDU, receiver_id: USER.id, kind: "session", read_at: null, created_at: new Date().toISOString(),
      message: "📅 New live session: Live Q&A\nThu, 15 Oct 2026 at 05:00 PM IST\nJoin link: https://meet.google.com/abc-defg-hij\nIt is also on your Schedule page." };
    const msg2 = { id: 42, sender_id: EDU, receiver_id: USER.id, kind: "text", read_at: null, created_at: new Date().toISOString(), message: "Let's do a quick call at 5 to go over chords!" };
    await page.route(`${SUPA}/rest/v1/messages**`, r => r.request().method() === "GET"
      ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify([msg2, msg]) })
      : r.fallback());
    await page.route(`${SUPA}/rest/v1/rpc/my_contacts`, r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([{ user_id: EDU, full_name: "Edu Teacher", profile_image: null, headline: null, role: "educator", reason: "Your educator · Guitar 101" }]) }));
    await page.route(`${SUPA}/rest/v1/rpc/can_message`, r => r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: "true" }));
    await page.goto(`${BASE}/src/screens/user/messages.html?to=${EDU}`);
    await page.waitForSelector(".bubble.session", { timeout: 8000 });
    const link = await page.getAttribute(".bubble.session a", "href");
    check("Session notice shows in the learner's chat with a clickable join link", link === "https://meet.google.com/abc-defg-hij", link);
    check("Conversation list shows the educator", /Edu Teacher/.test(await page.textContent("#chatList")));
    await page.screenshot({ path: SHOTS + "6-messages-session-notice.png" });
    check("No JS errors on messages", !calls.some(c => c.startsWith("PAGEERROR")), calls.filter(c => c.startsWith("PAGEERROR")).join(" | "));
    await ctx.close();
  }

  // 12. Messages still work on a database where the latest database.sql wasn't run yet
  {
    const { ctx, page, calls } = await newPage({ signedIn: true, oldDb: true });
    const EDU = "0a6f2f9e-1111-4111-8111-111111111111";
    const old = [{ id: 42, sender_id: EDU, receiver_id: USER.id, read_at: null, created_at: new Date().toISOString(), message: "Can we do a call at 5pm?" }];
    await page.route(`${SUPA}/rest/v1/messages**`, r => (r.request().method() === "GET" && !/kind/.test(r.request().url()))
      ? r.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(old) })
      : r.fallback());
    await page.goto(`${BASE}/src/screens/user/messages.html?to=${EDU}`);
    await page.waitForSelector(".bubble", { timeout: 8000 });
    check("Old database: learner still sees the educator's message", /call at 5pm/.test(await page.textContent("#chatMessages")));
    await ctx.close();
  }

  // 13. "Confirm email" switched OFF in Supabase → still a clear "Registration complete" notice
  {
    const { ctx, page } = await newPage({ signupSession: true, profile: { onboarding_complete: false } });
    await page.goto(`${BASE}/src/screens/auth/signup.html`);
    await page.fill("#name", "Lea");
    await page.fill("#email", "lea@test.dev");
    await page.fill("#password", "supersecret1");
    const terms = await page.$('input[type="checkbox"][required]');
    if (terms) await terms.check();
    await page.click('#signupForm button[type="submit"]');
    await page.waitForSelector("#stateSuccess:not([hidden])", { timeout: 8000 });
    check("Confirm-email OFF: signup shows 'Registration complete'", /verify\.html/.test(page.url()));
    await ctx.close();
  }

  // 14. Deletion without email set up → still clearly told on screen
  {
    const { ctx, page } = await newPage({ signedIn: true });
    page.on("dialog", d => d.accept());
    await page.goto(`${BASE}/src/screens/user/profile.html`);
    await page.waitForFunction(() => document.getElementById("pName")?.value === "Lea Learner", null, { timeout: 8000 });
    await page.fill("#deleteAccountConfirm", "DELETE");
    await page.click("#deleteAccountButton");
    await page.waitForURL(/login\.html/, { timeout: 8000 });
    await page.waitForSelector("#errorBox.show", { timeout: 8000 });
    check("No email set up: login page still says the account was deleted", /permanently deleted/.test(await page.textContent("#errorBox")));
    await ctx.close();
  }

  // 15. selftest.html reports the Batch 8 database setup
  {
    const { ctx, page, calls } = await newPage({ signedIn: true });
    await page.route(`${SUPA}/rest/v1/rpc/hobbynest_setup_check`, r => r.fulfill({ status: 200, contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ version: 8, message_kind: true, delete_function: true, session_notices: true, blocking_foreign_keys: 0, realtime_messages: true }) }));
    await page.goto(`${BASE}/src/screens/selftest.html`);
    const run = await page.$("#run, button");
    if (run) await run.click();
    await page.waitForFunction(() => /Latest database\.sql/.test(document.getElementById("out").textContent), null, { timeout: 20000 });
    const text = await page.textContent("#out");
    check("Selftest shows the database setup check", /Installed \(version 8\)/.test(text) && /Delete account/.test(text), (text.match(/Latest database\.sql.{0,160}/s) || [""])[0].replace(/\s+/g, " "));
    check("No JS errors on selftest", !calls.some(c => c.startsWith("PAGEERROR")), calls.filter(c => c.startsWith("PAGEERROR")).join(" | "));
    await ctx.close();
  }

  // 10. Login page: "email not confirmed" → offers a new link
  {
    const { ctx, page } = await newPage();
    await page.route(`${SUPA}/auth/v1/token**`, r => r.fulfill({ status: 400, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify({ code: "email_not_confirmed", error_code: "email_not_confirmed", msg: "Email not confirmed" }) }));
    await page.goto(`${BASE}/src/screens/auth/login.html`);
    await page.fill("#email", "lea@test.dev");
    await page.fill("#password", "supersecret1");
    await page.click('#loginForm button[type="submit"]');
    await page.waitForSelector("#errorBox.show a", { timeout: 8000 });
    check("Unverified sign-in offers 'Send me a new verification link'", /new verification link/.test(await page.textContent("#errorBox a")));
    await ctx.close();
  }
} catch (error) {
  check("Unexpected test error", false, error.message);
} finally {
  await browser.close();
  server.kill();
  const failed = results.filter(r => !r.ok).length;
  console.log(`\n${results.length - failed}/${results.length} passed`);
  process.exit(failed ? 1 : 0);
}
