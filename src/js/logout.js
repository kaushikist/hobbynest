// HobbyNest - logout button
// Uses Supabase Auth so the current session is fully signed out.
(function () {
    const LOGIN_URL = "../auth/login.html";

    document.addEventListener("click", async function (event) {
        const button = event.target.closest("[data-logout]");
        if (!button) return;

        event.preventDefault();
        if (button.disabled) return;

        button.disabled = true;
        button.textContent = "Signing out...";
        window.nsLeaving = true; // guard.js: don't reload on the sign-out event

        // Failsafe: if signOut() hangs (e.g. network stall), still redirect.
        const failsafe = setTimeout(() => {
            window.location.replace(LOGIN_URL);
        }, 4000);

        try {
            const { error } = await supabaseClient.auth.signOut();
            if (error) console.error("Logout error:", error);
        } catch (err) {
            // e.g. supabaseClient undefined, or the promise rejected —
            // never let this stop the redirect.
            console.error("Logout exception:", err);
        } finally {
            clearTimeout(failsafe);
            // Always land on the login page.
            window.location.replace(LOGIN_URL);
        }
    });
})();
