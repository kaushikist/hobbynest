// HobbyNest - educator dashboard Profile + Settings sections:
// edit your public profile and photo, preferences, and password.

(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    let me = null;

    // The original page wired these buttons to "saved ✓" messages that saved
    // nothing; swap them for clean copies so only the real handlers run.
    function freshButton(id) {
        const old = $(id);
        if (!old) return null;
        const copy = old.cloneNode(true);
        old.replaceWith(copy);
        return copy;
    }

    function note(id, text, isError = false) {
        const el = $(id);
        if (!el) return;
        el.textContent = text;
        el.style.color = isError ? "#b43d60" : "#21805e";
    }

    function selectByText(select, value) {
        if (!select || !value) return;
        const option = [...select.options].find(o => o.value.trim() === value || o.text.trim() === value);
        if (option) select.value = option.value;
    }

    function showAvatar() {
        const img = $("eduAvatarPreview");
        if (img) img.src = me.profile_image || HN.initialsAvatar(me.full_name);
    }

    function fill() {
        $("profileName").value = me.full_name || "";
        $("profileEmail").value = me.email || "";
        $("profileBio").value = me.bio || "";
        $("profileSpecialisation").value = me.headline || "";
        $("profileExperience").value = me.experience || "";
        $("profileCity").value = me.city || "";
        selectByText($("profileFormat"), me.teaching_format);
        showAvatar();

        const settings = me.settings || {};
        if ($("eduNotify")) $("eduNotify").value = settings.email_notifications || "all";
        selectByText($("eduDefaultFormat"), settings.default_format);
    }

    async function saveProfile() {
        const name = $("profileName").value.trim();
        if (!name) return note("eduProfileStatus", "Please enter your name.", true);

        const changes = {
            full_name: name,
            bio: $("profileBio").value.trim() || null,
            headline: $("profileSpecialisation").value.trim() || null,
            experience: $("profileExperience").value.trim() || null,
            city: $("profileCity").value.trim() || null,
            teaching_format: $("profileFormat").value.trim() || null
        };

        note("eduProfileStatus", "Saving…");
        const { error } = await supabaseClient.from("profiles").update(changes).eq("id", me.id);
        if (error) {
            console.error("Educator profile error:", error);
            return note("eduProfileStatus", "Couldn't save your profile. Please try again.", true);
        }
        Object.assign(me, changes);
        showProfileInTopbar(me);
        if (window.HNUpdateEducatorGreeting) window.HNUpdateEducatorGreeting(me);
        note("eduProfileStatus", "✓ Profile saved — learners see this on your classes");
    }

    async function changePhoto(event) {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;
        note("eduProfileStatus", "Uploading photo…");
        try {
            const url = await HN.uploadImage("avatars", file);
            const { error } = await supabaseClient.from("profiles").update({ profile_image: url }).eq("id", me.id);
            if (error) throw new Error("Photo uploaded, but saving it to your profile failed.");
            me.profile_image = url;
            showAvatar();
            showProfileInTopbar(me);
            note("eduProfileStatus", "✓ Photo updated");
        } catch (error) {
            note("eduProfileStatus", error.message, true);
        }
    }

    async function saveSettings() {
        const settings = {
            ...(me.settings || {}),
            email_notifications: $("eduNotify").value,
            default_format: $("eduDefaultFormat").value.trim()
        };
        note("eduSettingsStatus", "Saving…");
        const { error } = await supabaseClient.from("profiles").update({ settings }).eq("id", me.id);
        if (error) {
            console.error("Educator settings error:", error);
            return note("eduSettingsStatus", "Couldn't save. Please try again.", true);
        }
        me.settings = settings;
        note("eduSettingsStatus", "✓ Saved");
    }

    async function savePassword() {
        const pw = $("eduNewPw").value;
        if (pw.length < 8) return note("eduPasswordStatus", "Use at least 8 characters.", true);
        if (pw !== $("eduNewPw2").value) return note("eduPasswordStatus", "The two passwords don't match.", true);
        note("eduPasswordStatus", "Updating…");
        const { error } = await supabaseClient.auth.updateUser({ password: pw });
        if (error) return note("eduPasswordStatus", error.message, true);
        $("eduNewPw").value = "";
        $("eduNewPw2").value = "";
        note("eduPasswordStatus", "✓ Password updated");
    }

    async function load() {
        await window.nsReady;
        const { data, error } = await supabaseClient.rpc("get_my_profile");
        if (error || !data || !data.length) {
            console.error("Educator profile load error:", error);
            return note("eduProfileStatus", "Couldn't load your profile. Please refresh.", true);
        }
        me = data[0];
        fill();
    }

    freshButton("saveProfile")?.addEventListener("click", saveProfile);
    freshButton("saveSettings")?.addEventListener("click", saveSettings);
    $("eduSavePassword")?.addEventListener("click", savePassword);
    $("eduAvatarInput")?.addEventListener("change", changePhoto);

    // Delete account (shared with learners — see account.js).
    if (window.HNAccount) {
        HNAccount.setupDelete({
            input: $("eduDeleteConfirm"),
            button: $("eduDeleteButton"),
            status: $("eduDeleteStatus"),
            role: "educator"
        });
    }

    load().catch(error => console.error("Educator profile error:", error));
})();
