// HobbyNest — helpers shared by the Edge Functions (delete-account, notify).
// Runs on the server only. Never import this from frontend code.

import { createClient, type SupabaseClient, type User } from "npm:@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-hobbynest-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

// The server key. Supabase injects SUPABASE_SERVICE_ROLE_KEY (legacy) and
// SUPABASE_SECRET_KEYS (new API keys, a JSON object) into every function.
export function serviceKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    const first = keys.default || Object.values(keys)[0];
    return typeof first === "string" ? first : null;
  } catch {
    return null;
  }
}

export function adminClient(): SupabaseClient {
  const url = Deno.env.get("SUPABASE_URL");
  const key = serviceKey();
  if (!url || !key) throw new Error("config: SUPABASE_URL or the service key is missing");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// The logged-in user who called the function (from the Authorization header).
export async function callerFrom(req: Request, admin: SupabaseClient): Promise<User | null> {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  if (!token || token.split(".").length !== 3) return null; // API keys are not user tokens
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

// True when the caller is the server itself (a Database Webhook).
export function isServerCall(req: Request): boolean {
  const hookSecret = Deno.env.get("HOBBYNEST_HOOK_SECRET");
  if (hookSecret && req.headers.get("x-hobbynest-secret") === hookSecret) return true;
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "").trim();
  const key = serviceKey();
  return Boolean(token && key && token === key);
}

/* ---------------- email (Resend) ---------------- */

export function emailConfigured(): boolean {
  return Boolean(Deno.env.get("RESEND_API_KEY") && Deno.env.get("EMAIL_FROM"));
}

// Where links in emails point, e.g. https://hobbynest.netlify.app (no trailing slash).
export function appUrl(req?: Request): string {
  const configured = (Deno.env.get("APP_URL") || "").trim().replace(/\/+$/, "");
  if (/^https?:\/\//i.test(configured)) return configured;
  const origin = req?.headers.get("origin") || "";
  return /^https?:\/\/[^\s/]+$/i.test(origin) ? origin : "";
}

export function esc(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!)
  );
}

export interface Mail {
  to: string;
  subject: string;
  html: string;
  text: string;
}

// Sends one email or a batch. Returns how many were accepted by the provider.
export async function sendMail(mails: Mail[]): Promise<{ sent: number; error?: string }> {
  const apiKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("EMAIL_FROM");
  const valid = mails.filter((m) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(m.to || ""));
  if (!valid.length) return { sent: 0 };
  if (!apiKey || !from) return { sent: 0, error: "email not configured" };

  let sent = 0;
  let lastError: string | undefined;
  for (let i = 0; i < valid.length; i += 100) {
    const chunk = valid.slice(i, i + 100).map((m) => ({ from, to: [m.to], subject: m.subject, html: m.html, text: m.text }));
    const single = chunk.length === 1;
    const res = await fetch(single ? "https://api.resend.com/emails" : "https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(single ? chunk[0] : chunk),
    });
    if (res.ok) {
      sent += chunk.length;
    } else {
      lastError = `email provider ${res.status}: ${(await res.text()).slice(0, 300)}`;
      console.error(lastError);
    }
  }
  return { sent, error: lastError };
}

// Simple branded layout used by every HobbyNest email.
export function layout(opts: { heading: string; intro: string; body?: string; button?: { label: string; url: string }; footer?: string }): string {
  const button = opts.button?.url
    ? `<p style="margin:26px 0"><a href="${esc(opts.button.url)}" style="background:#1558c0;color:#ffffff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;display:inline-block">${esc(opts.button.label)}</a></p>`
    : "";
  return `<!doctype html><html><body style="margin:0;background:#f5f7fb;font-family:Arial,Helvetica,sans-serif;color:#182235">
<div style="max-width:560px;margin:0 auto;padding:28px 18px">
  <div style="font-size:22px;font-weight:700;color:#1558c0;margin-bottom:18px">Hobby<span style="color:#e65b9b">Nest</span></div>
  <div style="background:#ffffff;border:1px solid #e3e8f0;border-radius:12px;padding:26px">
    <h1 style="font-size:20px;margin:0 0 12px">${esc(opts.heading)}</h1>
    <p style="font-size:14px;line-height:1.6;margin:0 0 12px">${opts.intro}</p>
    ${opts.body || ""}
    ${button}
  </div>
  <p style="font-size:11px;color:#8a93a2;line-height:1.6;margin-top:16px">${opts.footer || "You're receiving this because you have a HobbyNest account."}</p>
</div></body></html>`;
}

// Records an email in public.email_log. Returns false if it was already sent.
export async function claimEmail(admin: SupabaseClient, kind: string, ref: string, recipient: string): Promise<boolean> {
  const { error } = await admin.from("email_log").insert({ kind, ref, recipient });
  if (!error) return true;
  if (error.code === "23505") return false; // already sent
  // Table missing (database.sql not re-run) — don't block the email.
  console.warn("email_log:", error.message);
  return true;
}

export async function releaseEmail(admin: SupabaseClient, kind: string, ref: string): Promise<void> {
  await admin.from("email_log").delete().eq("kind", kind).eq("ref", ref);
}
