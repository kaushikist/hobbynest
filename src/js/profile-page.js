// HobbyNest - learner Profile page: edit your details and profile photo.

(function () {
    "use strict";

    const $ = id => document.getElementById(id);
    let me = null;

    function status(text, isError = false) {
        const el = $("profileStatus");
        el.textContent = text;
        el.style.color = isError ? "#b43d60" : "#21805e";
    }

    function parseInterests(text) {
        const seen = new Set();
        return text.split(",")
            .map(t => t.trim().replace(/\s+/g, " "))
            .filter(t => t && t.length <= 40 && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase()))
            .slice(0, 20);
    }

    function renderChips() {
        const interests = parseInterests($("pInterests").value);
        $("interestChips").innerHTML = interests.length
            ? interests.map(i => `<span class="tag pink" style="margin:0">${HN.escapeHTML(i)}</span>`).join("")
            : `<span class="muted">No interests added yet.</span>`;
    }

    function showAvatar(url) {
        $("avatarPreview").src = url || HN.initialsAvatar($("pName").value || me?.full_name);
    }

    function fill() {
        $("pName").value = me.full_name || "";
        $("pEmail").value = me.email || "";
        $("pCity").value = me.city || "";
        $("pStyle").value = me.learning_style || "";
        $("pHeadline").value = me.headline || "";
        $("pBio").value = me.bio || "";
        $("pInterests").value = (me.interests || []).join(", ");
        showAvatar(me.profile_image);
        renderChips();
    }

    async function save() {
        const name = $("pName").value.trim();
        if (!name) return status("Please enter your name.", true);

        const button = $("saveProfile");
        button.disabled = true;
        status("Saving…");

        const changes = {
            full_name: name,
            city: $("pCity").value.trim() || null,
            learning_style: $("pStyle").value || null,
            headline: $("pHeadline").value.trim() || null,
            bio: $("pBio").value.trim() || null,
            interests: parseInterests($("pInterests").value)
        };

        const { error } = await supabaseClient.from("profiles").update(changes).eq("id", me.id);
        button.disabled = false;

        if (error) {
            console.error("Profile save error:", error);
            return status("Couldn't save your profile. Please try again.", true);
        }

        Object.assign(me, changes);
        showProfileInTopbar(me);
        status("✓ Profile saved");
        toast("Profile saved ✓");
    }

    async function changePhoto(event) {
        const file = event.target.files[0];
        event.target.value = "";
        if (!file) return;

        status("Uploading photo…");
        try {
            const url = await HN.uploadImage("avatars", file);
            const { error } = await supabaseClient.from("profiles").update({ profile_image: url }).eq("id", me.id);
            if (error) throw new Error("Photo uploaded, but saving it to your profile failed.");
            me.profile_image = url;
            showAvatar(url);
            showProfileInTopbar(me);
            status("✓ Photo updated");
        } catch (error) {
            status(error.message, true);
        }
    }

    async function load() {
        await window.nsReady;
        const { data, error } = await supabaseClient.rpc("get_my_profile");
        if (error || !data || !data.length) {
            console.error("Profile load error:", error);
            return status("Couldn't load your profile. Please refresh the page.", true);
        }
        me = data[0];
        fill();
    }

    $("saveProfile").addEventListener("click", save);
    // Delete account (shared with educators — see account.js).
    HNAccount.setupDelete({
        input: $("deleteAccountConfirm"),
        button: $("deleteAccountButton"),
        status: $("deleteAccountStatus"),
        role: "learner"
    });
    $("avatarInput").addEventListener("change", changePhoto);
    $("pInterests").addEventListener("input", renderChips);
    $("pName").addEventListener("input", () => { if (!me?.profile_image) showAvatar(null); });

    load().catch(error => {
        console.error("Profile page error:", error);
        status("Something went wrong. Please refresh the page.", true);
    });
})();
