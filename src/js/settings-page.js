// HobbyNest - learner Settings page: notification choices, learning
// preferences (saved to your profile) and changing your password.

(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    let me = null;
    let settings = {};

    function setToggle(button, on) {
        button.setAttribute("aria-pressed", String(on));
        button.textContent = on ? "On" : "Off";
        button.classList.toggle("active", on);
        button.classList.toggle("secondary", !on);
    }

    function note(id, text, isError = false) {
        $(id).textContent = text;
        $(id).style.color = isError ? "#b43d60" : "#21805e";
    }

    async function saveSettings() {
        const button = $("saveSettings");
        button.disabled = true;
        note("settingsStatus", "Saving…");

        document.querySelectorAll("[data-setting]").forEach(btn => {
            settings[btn.dataset.setting] = btn.getAttribute("aria-pressed") === "true";
        });
        settings.weekly_goal = $("sGoal").value || null;

        const { error } = await supabaseClient
            .from("profiles")
            .update({ settings, learning_style: $("sStyle").value || null })
            .eq("id", me.id);

        button.disabled = false;
        if (error) {
            console.error("Settings save error:", error);
            return note("settingsStatus", "Couldn't save. Please try again.", true);
        }
        note("settingsStatus", "✓ Saved");
        toast("Settings saved ✓");
    }

    async function savePassword() {
        const pw = $("newPw").value;
        const pw2 = $("newPw2").value;
        if (pw.length < 8) return note("passwordStatus", "Use at least 8 characters.", true);
        if (pw !== pw2) return note("passwordStatus", "The two passwords don't match.", true);

        const button = $("savePassword");
        button.disabled = true;
        note("passwordStatus", "Updating…");
        const { error } = await supabaseClient.auth.updateUser({ password: pw });
        button.disabled = false;

        if (error) return note("passwordStatus", error.message, true);
        $("newPw").value = "";
        $("newPw2").value = "";
        note("passwordStatus", "✓ Password updated");
    }

    async function load() {
        await window.nsReady;
        const { data, error } = await supabaseClient.rpc("get_my_profile");
        if (error || !data || !data.length) {
            console.error("Settings load error:", error);
            return note("settingsStatus", "Couldn't load your settings. Please refresh.", true);
        }
        me = data[0];
        settings = me.settings || {};

        const defaults = { class_reminders: true, schedule_updates: true, recommendations: false, message_emails: true };
        document.querySelectorAll("[data-setting]").forEach(btn => {
            const key = btn.dataset.setting;
            setToggle(btn, key in settings ? Boolean(settings[key]) : defaults[key]);
        });
        $("sStyle").value = me.learning_style || "";
        $("sGoal").value = settings.weekly_goal || "";
    }

    document.querySelectorAll("[data-setting]").forEach(btn => {
        btn.addEventListener("click", () => setToggle(btn, btn.getAttribute("aria-pressed") !== "true"));
    });
    $("saveSettings").addEventListener("click", saveSettings);
    $("savePassword").addEventListener("click", savePassword);

    load().catch(error => console.error("Settings page error:", error));
})();
