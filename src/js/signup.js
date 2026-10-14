// HobbyNest - Signup

const signupForm = document.getElementById("signupForm");
const errorBox = document.getElementById("errorBox");
const SUBMIT_LABEL = "Create my account →";

// Verification links bring people to the dedicated verify page.
const VERIFY_URL = new URL("verify.html", window.location.href).href;

function showSignupError(message) {
    if (errorBox) {
        errorBox.textContent = message;
        errorBox.classList.add("show");
        errorBox.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
}

function escapeText(value) {
    const div = document.createElement("div");
    div.textContent = value == null ? "" : String(value);
    return div.innerHTML;
}

// Replaces the form with a clear "check your inbox" screen.
function showCheckInbox(email, { alreadyRegistered = false } = {}) {
    const container = signupForm.closest(".form-container") || signupForm.parentElement;
    container.querySelectorAll(".heading, #signupForm, .login-link").forEach(el => { el.style.display = "none"; });
    errorBox?.classList.remove("show");

    let panel = document.getElementById("signupDone");
    if (!panel) {
        panel = document.createElement("div");
        panel.id = "signupDone";
        panel.setAttribute("role", "status");
        panel.style.cssText = "text-align:center;padding:10px 0 4px";
        signupForm.insertAdjacentElement("beforebegin", panel);
    }

    const button = "display:block;width:100%;height:46px;line-height:46px;border-radius:9px;font-weight:800;font-size:12px;text-decoration:none;margin-top:10px;cursor:pointer;font-family:inherit";
    const primary = button + ";border:0;background:#507db8;color:#fff";
    const secondary = button + ";border:1px solid #cfdbec;background:#fff;color:#507db8";

    panel.innerHTML = alreadyRegistered ? `
        <div style="font-size:42px;margin-bottom:8px">👋</div>
        <h2 style="font-family:Georgia,serif;font-weight:500;font-size:26px;margin-bottom:10px">You already have an account</h2>
        <p style="color:#7c8797;font-size:13px;line-height:1.6;margin-bottom:16px">
            <strong style="color:#263449">${escapeText(email)}</strong> is already registered on HobbyNest.
            Sign in instead — or, if you never verified it, send yourself a new verification link.</p>
        <a href="login.html" style="${primary}">Go to sign in →</a>
        <button type="button" id="resendLink" style="${secondary}">Send a new verification link</button>
        <p id="resendNote" style="font-size:11px;color:#7c8797;margin-top:12px;min-height:16px"></p>`
    : `
        <div style="font-size:42px;margin-bottom:8px">📬</div>
        <h2 style="font-family:Georgia,serif;font-weight:500;font-size:26px;margin-bottom:10px">Check your inbox</h2>
        <p style="color:#7c8797;font-size:13px;line-height:1.6;margin-bottom:12px">
            Your HobbyNest account has been created. We've sent a verification link to
            <strong style="color:#263449">${escapeText(email)}</strong>.</p>
        <ol style="text-align:left;background:#f6f9fd;border-radius:10px;padding:12px 16px 12px 32px;margin:0 0 14px;font-size:12px;line-height:1.8;color:#263449">
            <li>Open the email from HobbyNest (check spam / promotions too)</li>
            <li>Click the <strong>confirm</strong> button / link in it</li>
            <li>You'll see "Registration complete" — then pick your role and get started</li>
        </ol>
        <button type="button" id="resendLink" style="${secondary}">Didn't get it? Send it again</button>
        <a href="login.html" style="${secondary}">I've verified — sign in</a>
        <p style="font-size:11px;color:#7c8797;margin-top:12px">Wrong email? <a href="signup.html" style="color:#507db8;font-weight:700">Start again</a></p>
        <p id="resendNote" style="font-size:11px;color:#7c8797;margin-top:8px;min-height:16px"></p>`;

    let cooldown = null;
    document.getElementById("resendLink").addEventListener("click", async event => {
        const btn = event.currentTarget;
        const note = document.getElementById("resendNote");
        if (cooldown) return;
        btn.disabled = true;
        note.style.color = "#7c8797";
        note.textContent = "Sending…";
        const { error } = await supabaseClient.auth.resend({
            type: "signup",
            email,
            options: { emailRedirectTo: VERIFY_URL }
        });
        if (error) {
            btn.disabled = false;
            note.style.color = "#ad4867";
            note.textContent = /rate|seconds|too many/i.test(error.message || "")
                ? "An email was sent very recently. Please wait a minute and try again."
                : error.message;
            return;
        }
        note.style.color = "#21805e";
        note.textContent = "✓ A new link is on its way. Use the newest email — older links stop working.";
        let seconds = 60;
        const label = btn.textContent;
        cooldown = setInterval(() => {
            seconds -= 1;
            btn.textContent = `Send again in ${seconds}s`;
            if (seconds <= 0) {
                clearInterval(cooldown);
                cooldown = null;
                btn.disabled = false;
                btn.textContent = label;
            }
        }, 1000);
    });
}

if (signupForm) {
    signupForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        errorBox?.classList.remove("show");

        const fullName =
            document.getElementById("name").value.trim();

        const email =
            document.getElementById("email").value.trim().toLowerCase();

        const password =
            document.getElementById("password").value;

        // Role picked on this form; it is pre-selected on the role page
        // and can still be changed there until onboarding is finished.
        const role =
            document.querySelector('input[name="role"]:checked')?.value === "educator"
                ? "educator"
                : "learner";

        const city =
            document.getElementById("city")?.value.trim() || "";

        if (!fullName || !email || !password) {
            showSignupError("Please fill in all required fields.");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showSignupError("Please enter a valid email address.");
            return;
        }

        if (password.length < 8) {
            showSignupError("Use at least 8 characters for your password.");
            return;
        }

        const btn =
            signupForm.querySelector('button[type="submit"]');

        if (btn) {
            btn.disabled = true;
            btn.textContent = "Creating account...";
        }

        const resetButton = () => {
            if (btn) {
                btn.disabled = false;
                btn.textContent = SUBMIT_LABEL;
            }
        };

        // Create Supabase Auth account
        const { data, error } =
            await supabaseClient.auth.signUp({
                email,
                password,
                options: {
                    // The verification email opens verify.html ("Registration complete").
                    emailRedirectTo: VERIFY_URL,
                    data: {
                        full_name: fullName,
                        role: role,
                        city: city
                    }
                }
            });

        if (error) {
            const message = error.message || "";
            if (/already registered|already exists/i.test(message)) {
                showCheckInbox(email, { alreadyRegistered: true });
            } else if (/rate limit|too many|seconds/i.test(message)) {
                showSignupError("Too many sign-up emails were sent recently. Please wait a few minutes and try again.");
            } else if (/error sending|confirmation email/i.test(message)) {
                showSignupError("Your account couldn't be created because the verification email failed to send. Please try again in a few minutes — if it keeps happening, contact the HobbyNest team.");
            } else if (/database error/i.test(message)) {
                showSignupError("We couldn't create your profile. Please try again in a moment.");
            } else {
                showSignupError(message || "Sign up failed. Please try again.");
            }
            resetButton();
            return;
        }

        // With "Confirm email" on, Supabase hides whether an address is taken:
        // it returns a user with no identities and sends no email.
        if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
            showCheckInbox(email, { alreadyRegistered: true });
            return;
        }

        // Email confirmation is on → no session until the link is clicked.
        if (!data.session) {
            try { sessionStorage.setItem("hn_signup_email", email); } catch (e) { /* ignore */ }
            showCheckInbox(email);
            return;
        }

        // Email confirmation is off → already signed in. Show the
        // "Registration complete" page, which then continues to onboarding.
        window.location.href = "verify.html?registered=1";
    });
}
