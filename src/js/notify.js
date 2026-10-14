// HobbyNest - emails. Never blocks or breaks the app: if email isn't set up,
// every call quietly returns { sent: false, reason: "not_configured" }.
//
//   await HNNotify.send("welcome")                         → registration-complete email (once)
//   await HNNotify.goodbye({ email, name })                → account-deleted email
//   HNNotify.send("message", { message_ids: [12] })        → only with edge functions (advanced)
//   HNNotify.send("session", { session_id: 4 })            → only with edge functions (advanced)
//
// Settings live in email-config.js.

window.HNNotify = (function () {
    "use strict";

    const config = () => window.HN_EMAIL || {};
    const ejs = () => config().emailjs || {};
    const emailjsReady = () => Boolean(ejs().publicKey && ejs().serviceId && ejs().templateId);
    const siteUrl = () => location.origin + location.pathname.replace(/\/src\/screens\/.*$/, "");

    function esc(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function layout(heading, bodyHtml, button) {
        return `<div style="max-width:560px;margin:0 auto;font-family:Arial,Helvetica,sans-serif;color:#182235">
<div style="font-size:22px;font-weight:700;color:#1558c0;margin-bottom:16px">Hobby<span style="color:#e65b9b">Nest</span></div>
<div style="border:1px solid #e3e8f0;border-radius:12px;padding:24px">
<h1 style="font-size:20px;margin:0 0 12px">${esc(heading)}</h1>${bodyHtml}
${button ? `<p style="margin:22px 0 0"><a href="${esc(button.url)}" style="background:#1558c0;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-weight:700;display:inline-block">${esc(button.label)}</a></p>` : ""}
</div></div>`;
    }

    // Sends one email through EmailJS (straight from the browser).
    async function emailjsSend(to, toName, subject, html) {
        if (!emailjsReady()) return { sent: false, reason: "not_configured" };
        try {
            const res = await fetch("https://api.emailjs.com/api/v1.0/email/send", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    service_id: ejs().serviceId,
                    template_id: ejs().templateId,
                    user_id: ejs().publicKey,
                    template_params: { to_email: to, to_name: toName || "", subject, message_html: html }
                })
            });
            if (!res.ok) {
                const detail = await res.text().catch(() => "");
                console.warn("EmailJS:", res.status, detail);
                return { sent: false, reason: "provider_error", detail };
            }
            return { sent: true };
        } catch (error) {
            console.warn("EmailJS:", error);
            return { sent: false, reason: "network" };
        }
    }

    // Calls the optional "notify" Edge Function (advanced setup only).
    async function edge(type, payload, timeoutMs) {
        if (!config().edgeFunctions || typeof supabaseClient === "undefined") return { sent: false, reason: "not_configured" };
        try {
            const call = supabaseClient.functions.invoke("notify", { body: { type, ...payload } });
            const timeout = new Promise(resolve => setTimeout(() => resolve({ data: null, error: new Error("timeout") }), timeoutMs));
            const { data, error } = await Promise.race([call, timeout]);
            if (error) return { sent: false, reason: "function_error" };
            return data || { sent: false };
        } catch (error) {
            return { sent: false, reason: "function_error" };
        }
    }

    async function welcome(timeoutMs) {
        if (!emailjsReady()) return edge("welcome", {}, timeoutMs);
        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user || !user.email) return { sent: false, reason: "no_user" };
        if (!user.email_confirmed_at && !user.confirmed_at) return { sent: false, reason: "not_verified" };

        const { data } = await supabaseClient.rpc("get_my_profile");
        const me = (data && data[0]) || {};
        const settings = me.settings || {};
        if (settings.welcome_email_sent) return { sent: false, reason: "already_sent" };

        const name = (me.full_name || "").trim() || "there";
        const educator = me.role === "educator";
        const steps = educator
            ? ["Finish your educator profile", "Publish your first class", "Schedule a live session — enrolled learners are notified in Messages"]
            : ["Explore classes and enroll in one you like", "Message your educator from the class page", "Check Schedule for live sessions"];
        const html = layout(`Welcome to HobbyNest, ${name}! 🎉`,
            `<p style="font-size:14px;line-height:1.6">Your registration is complete and your email <strong>${esc(user.email)}</strong> is verified.</p>
             <p style="font-size:14px;margin:14px 0 6px"><strong>What's next</strong></p>
             <ol style="font-size:14px;line-height:1.7;padding-left:20px">${steps.map(s => `<li>${esc(s)}</li>`).join("")}</ol>`,
            { label: "Open HobbyNest", url: siteUrl() + "/src/screens/auth/login.html" });

        const result = await emailjsSend(user.email, name, "Welcome to HobbyNest — your registration is complete", html);
        if (result.sent) {
            await supabaseClient.from("profiles").update({ settings: { ...settings, welcome_email_sent: true } }).eq("id", user.id);
        }
        return result;
    }

    async function goodbye({ email, name, role }) {
        if (!email) return { sent: false, reason: "no_email" };
        const when = new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "long", timeStyle: "short" });
        const html = layout("Your HobbyNest account has been deleted",
            `<p style="font-size:14px;line-height:1.6">Hi ${esc(name || "there")}, this confirms that your HobbyNest account
             (<strong>${esc(email)}</strong>) was permanently deleted on ${esc(when)} IST.</p>
             <p style="font-size:14px;line-height:1.6">Your profile, ${role === "educator" ? "classes, sessions, " : "enrollments, progress, "}messages, posts and meetups were removed. This can't be undone.</p>
             <p style="font-size:14px;line-height:1.6">If you didn't ask for this, reply to this email straight away.</p>`,
            { label: "Create a new account", url: siteUrl() + "/src/screens/auth/signup.html" });
        return emailjsSend(email, name, "Your HobbyNest account has been deleted", html);
    }

    async function send(type, payload = {}, { timeoutMs = 8000 } = {}) {
        try {
            if (type === "welcome") return await welcome(timeoutMs);
            return await edge(type, payload, timeoutMs);
        } catch (error) {
            console.warn(`notify(${type}) skipped:`, error);
            return { sent: false, reason: "error" };
        }
    }

    return { send, goodbye, emailjsReady, edgeFunctionsOn: () => Boolean(config().edgeFunctions) };
})();
