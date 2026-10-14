// HobbyNest - Login

const loginForm = document.getElementById("loginForm");
const errorBox = document.getElementById("errorBox");

function showLoginError(message) {
    if (errorBox) {
        errorBox.className = "error show";
        errorBox.textContent = message;
    }
}

function showLoginInfo(message) {
    if (errorBox) {
        errorBox.className = "error show info";
        errorBox.textContent = message;
    }
}

// Send a signed-in user to the right place (onboarding or their dashboard).
// Returns false if the profile couldn't be loaded.
async function routeSignedInUser(userId) {
    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("role, full_name, onboarding_complete")
        .eq("id", userId)
        .single();

    if (error || !profile) return false;

    if (!profile.onboarding_complete) {
        window.location.href = "role-select.html";
    } else if (profile.role === "educator") {
        window.location.href = "../instructor/instructor-dashboard.html";
    } else {
        window.location.href = "../user/user-dashboard.html";
    }
    return true;
}

/* ---------------- MESSAGES FROM OTHER PAGES ---------------- */

(function showArrivalMessage() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("account_deleted")) {
        const email = params.get("email");
        let text = "Your HobbyNest account has been permanently deleted, together with your data.";
        if (params.get("email_sent")) {
            text += email ? ` We've emailed a confirmation to ${email}.` : " We've emailed you a confirmation.";
        }
        showLoginInfo(text + " Thank you for being part of HobbyNest.");
        history.replaceState(null, "", window.location.pathname);
    } else if (params.get("reset") === "done") {
        showLoginInfo("Your password was updated. Sign in with your new password.");
    } else if (params.get("verified")) {
        showLoginInfo("Email verified! Sign in to continue.");
    }
})();

// "Email not confirmed" → offer a fresh verification link right here.
function offerResend(email) {
    if (!errorBox || !email) return;
    const link = document.createElement("a");
    link.href = "#";
    link.textContent = "Send me a new verification link";
    link.style.cssText = "display:block;margin-top:6px;font-weight:700;color:inherit";
    link.addEventListener("click", async event => {
        event.preventDefault();
        link.textContent = "Sending…";
        const { error } = await supabaseClient.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: new URL("verify.html", window.location.href).href }
        });
        if (error) {
            showLoginError(/rate|seconds|too many/i.test(error.message || "")
                ? "A link was sent very recently. Please wait a minute and try again."
                : error.message);
            return;
        }
        showLoginInfo(`A new verification link is on its way to ${email}. Open the newest email and click "Confirm my email".`);
    });
    errorBox.appendChild(link);
}

/* ---------------- ALREADY SIGNED IN? ---------------- */
// e.g. after clicking the email verification link.

(async function () {
    const { data } = await supabaseClient.auth.getSession();
    if (data.session?.user) {
        await routeSignedInUser(data.session.user.id);
    }
})();

/* ---------------- SIGN IN ---------------- */

if (loginForm) {

    loginForm.addEventListener("submit", async (e) => {

        e.preventDefault();

        errorBox?.classList.remove("show");

        const email =
            document.getElementById("email").value.trim();

        const password =
            document.getElementById("password").value;

        const btn =
            loginForm.querySelector('button[type="submit"]');

        if (!email || !password) {
            showLoginError("Please enter your email and password.");
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.textContent = "Signing in...";
        }

        const { data, error } =
            await supabaseClient.auth.signInWithPassword({ email, password });

        if (error) {
            const message =
                /email not confirmed/i.test(error.message || "")
                    ? "Please verify your email address first, then try signing in again."
                    : /invalid login credentials/i.test(error.message || "")
                        ? "That email and password don't match. Check them, or use \"Forgot password?\"."
                        : error.message;

            showLoginError(message);
            if (/email not confirmed/i.test(error.message || "")) offerResend(email);

            if (btn) {
                btn.disabled = false;
                btn.textContent = "Sign in →";
            }
            return;
        }

        const routed = await routeSignedInUser(data.user.id);

        if (!routed) {
            await supabaseClient.auth.signOut();
            showLoginError("Login worked, but your profile could not be loaded.");
            if (btn) {
                btn.disabled = false;
                btn.textContent = "Sign in →";
            }
        }
    });
}

/* ---------------- FORGOT PASSWORD ---------------- */

document.getElementById("forgotPassword")?.addEventListener("click", async (event) => {
    event.preventDefault();

    const email = document.getElementById("email")?.value.trim();

    if (!email) {
        showLoginError("Type your email address above first, then click \"Forgot password?\" again.");
        document.getElementById("email")?.focus();
        return;
    }

    const link = event.currentTarget;
    link.style.pointerEvents = "none";
    link.textContent = "Sending…";

    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, {
        redirectTo: new URL("reset-password.html", window.location.href).href
    });

    link.style.pointerEvents = "";
    link.textContent = "Forgot password?";

    if (error) {
        showLoginError(
            /rate limit/i.test(error.message || "")
                ? "Too many emails were sent recently. Please wait a while and try again."
                : error.message
        );
        return;
    }

    // Same message whether or not the account exists (keeps emails private).
    showLoginInfo(`If an account exists for ${email}, a password reset link is on its way. Check your inbox and spam folder.`);
});
