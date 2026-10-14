// HobbyNest - email verification landing page (verify.html).
//
// Every kind of verification link ends up here and gets a clear result:
//   • ?token_hash=…&type=email   (recommended email template — one click to confirm)
//   • #access_token=…            (Supabase's default {{ .ConfirmationURL }} link)
//   • ?code=…                    (PKCE links)
//   • #error=…&error_code=otp_expired  (used/expired links) → friendly help + "send a new link"
// On success the user sees "Registration complete", gets a welcome email and
// continues to onboarding.

(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    const opened = new URL(window.HN_AUTH_URL || window.location.href);
    const query = opened.searchParams;
    const hash = new URLSearchParams(opened.hash.replace(/^#/, ""));
    const param = key => query.get(key) || hash.get(key);
    const OTP_TYPES = ["email", "signup", "invite", "magiclink", "email_change"];
    const verifyUrl = new URL("verify.html", window.location.href).href;

    function show(id) {
        ["stateLoading", "stateConfirm", "stateSuccess", "stateError", "stateIdle"].forEach(s => { $(s).hidden = s !== id; });
    }

    function cleanAddressBar() {
        try { history.replaceState(null, "", window.location.pathname); } catch (e) { /* ignore */ }
    }

    function showResend(prefill) {
        $("resendForm").hidden = false;
        const remembered = (() => { try { return sessionStorage.getItem("hn_signup_email") || ""; } catch (e) { return ""; } })();
        $("resendEmail").value = prefill || query.get("email") || remembered;
    }

    function showError(code, description) {
        const text = String(description || "").replace(/\+/g, " ");
        const expired = /otp_expired|expired|invalid|already/i.test(code + " " + text);
        if (expired) {
            $("errorTitle").textContent = "This link has expired or was already used";
            $("errorText").innerHTML =
                "Verification links work <strong>once</strong> and expire after a while. " +
                "Some email apps open links automatically to scan them, which uses the link up — " +
                "if that happened, <strong>your email is probably already verified</strong>, so try signing in first. " +
                "If sign-in says your email isn't confirmed, send yourself a new link below.";
        } else {
            $("errorTitle").textContent = "This link didn't work";
            $("errorText").textContent = (text || "The verification link couldn't be used.") +
                " You can send yourself a new link below, or try signing in.";
        }
        show("stateError");
        showResend();
        cleanAddressBar();
    }

    async function showSuccess(user) {
        cleanAddressBar();
        try { sessionStorage.removeItem("hn_signup_email"); } catch (e) { /* ignore */ }
        $("successEmail").textContent = user.email || "your email";
        $("welcomeNote").textContent = "Sending your welcome email…";
        show("stateSuccess");

        // Where to go next: onboarding, or the dashboard if that's already done.
        const { data: profile } = await supabaseClient
            .from("profiles")
            .select("role, onboarding_complete")
            .eq("id", user.id)
            .maybeSingle();
        if (profile?.onboarding_complete) {
            $("nextSteps").hidden = true;
            $("continueBtn").textContent = "Go to my dashboard →";
            $("continueBtn").href = profile.role === "educator"
                ? "../instructor/instructor-dashboard.html"
                : "../user/user-dashboard.html";
        }

        const result = window.HNNotify ? await HNNotify.send("welcome") : null;
        if (result && result.sent) {
            $("welcomeNote").innerHTML = "";
            $("welcomeNote").append("We've also emailed a welcome note to ", Object.assign(document.createElement("strong"), { textContent: user.email }), ".");
        } else if (result && result.reason === "already_sent") {
            $("welcomeNote").textContent = "Your welcome email is already in your inbox.";
        } else {
            $("welcomeNote").hidden = true;
        }
    }

    async function confirmWithTokenHash(tokenHash, type) {
        show("stateConfirm");
        $("confirmBtn").addEventListener("click", async () => {
            $("confirmBtn").disabled = true;
            $("confirmBtn").textContent = "Confirming…";
            $("confirmError").hidden = true;
            const { data, error } = await supabaseClient.auth.verifyOtp({ token_hash: tokenHash, type });
            if (error || !data?.user) {
                showError(error?.code || error?.status || "", error?.message || "");
                return;
            }
            await showSuccess(data.user);
        }, { once: true });
    }

    async function start() {
        // A password-reset link that landed here by mistake → reset page.
        if (param("type") === "recovery") {
            window.location.replace("reset-password.html" + opened.search + opened.hash);
            return;
        }

        const errorDescription = param("error_description");
        const errorCode = param("error_code") || param("error");
        if (errorDescription || errorCode) return showError(errorCode || "", errorDescription || "");

        const tokenHash = query.get("token_hash");
        if (tokenHash) {
            const type = OTP_TYPES.includes(query.get("type")) ? query.get("type") : "email";
            return confirmWithTokenHash(tokenHash, type);
        }

        const code = query.get("code");
        if (code) {
            const { data, error } = await supabaseClient.auth.exchangeCodeForSession(code);
            if (!error && data?.session) return showSuccess(data.session.user);
            // The email is confirmed before the link redirects here; the code just
            // couldn't sign this browser in (e.g. opened on another device).
            cleanAddressBar();
            $("errorTitle").textContent = "Your email is verified";
            $("errorText").textContent = "Your registration is complete. Sign in with your email and password to continue.";
            show("stateError");
            return;
        }

        // #access_token links are picked up by the Supabase library automatically.
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (session?.user) {
            if (hash.get("access_token") || session.user.email_confirmed_at) return showSuccess(session.user);
        }
        if (hash.get("access_token")) {
            return showError("", "We couldn't sign you in with this link.");
        }

        show("stateIdle");
        showResend();
    }

    $("resendForm").addEventListener("submit", async event => {
        event.preventDefault();
        const email = $("resendEmail").value.trim();
        const note = $("resendNote");
        note.hidden = false;
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            note.className = "note err";
            note.textContent = "Please enter the email address you signed up with.";
            return;
        }
        $("resendBtn").disabled = true;
        const { error } = await supabaseClient.auth.resend({ type: "signup", email, options: { emailRedirectTo: verifyUrl } });
        $("resendBtn").disabled = false;
        if (error) {
            note.className = "note err";
            note.textContent = /rate|seconds|too many/i.test(error.message || "")
                ? "A link was sent very recently. Please wait a minute, then try again."
                : error.message;
            return;
        }
        note.className = "note ok";
        note.textContent = `If ${email} has an account that still needs verifying, a new link is on its way. Check your inbox and spam folder — and use the newest email.`;
    });

    start().catch(error => {
        console.error("Verify page:", error);
        showError("", "Something went wrong while checking your link.");
    });
})();
