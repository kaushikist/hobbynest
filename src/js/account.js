// HobbyNest - "Delete account", shared by the learner Profile page and the
// educator Settings section.
//
//   HNAccount.setupDelete({ input, button, status, role })
//
// How it works (only database.sql is needed — no extra deployment):
//   1. removes the user's own uploaded photos from Storage,
//   2. sends the "account deleted" email (if email is set up — email-config.js),
//   3. calls the database function delete_my_account(), which deletes the
//      user and — through ON DELETE CASCADE — all their data,
//   4. signs out and shows "Your account has been permanently deleted" on the login page.
// If delete_my_account() is missing and the delete-account Edge Function is
// deployed, that is used instead.

window.HNAccount = (function () {
    "use strict";

    const BUCKETS = ["avatars", "course-images", "social-posts"];

    async function removeMyFiles(userId) {
        for (const bucket of BUCKETS) {
            try {
                const { data } = await supabaseClient.storage.from(bucket).list(userId, { limit: 1000 });
                const paths = (data || []).filter(f => f.name && f.id !== null).map(f => `${userId}/${f.name}`);
                if (paths.length) await supabaseClient.storage.from(bucket).remove(paths);
            } catch (error) {
                console.warn(`Photo clean-up (${bucket}) skipped:`, error);
            }
        }
    }

    // Plain-language reason for a failed delete.
    async function explain(error) {
        const text = String(error?.message || error || "");
        if (/could not find the function|delete_my_account|PGRST202/i.test(text + " " + (error?.code || ""))) {
            return "Account deletion isn't set up in the database yet. The site owner needs to run the latest database.sql in Supabase (SUPABASE-SETUP.txt, step 1). Nothing was deleted.";
        }
        if (/foreign key|violates/i.test(text)) {
            return "The database blocked the deletion because of an old rule. The site owner needs to run the latest database.sql in Supabase (it fixes this). Nothing was deleted.";
        }
        if (/permission denied/i.test(text)) {
            return "The database didn't allow the deletion (permission denied). The site owner should run the latest database.sql and try again. Nothing was deleted. (" + text + ")";
        }
        if (/session|jwt|expired|not logged/i.test(text)) {
            return "Your session has expired. Please log out, log in again and retry. Nothing was deleted.";
        }
        if (/fetch|network|Failed to/i.test(text)) {
            return "Couldn't reach the server — check your internet connection and try again. Nothing was deleted.";
        }
        return "Account not deleted: " + (text || "unknown error") + ". Nothing was deleted.";
    }

    async function deleteViaEdgeFunction() {
        const { data, error } = await supabaseClient.functions.invoke("delete-account", { body: { confirm: "DELETE" } });
        if (error || !data || data.success !== true) {
            let message = data?.message || error?.message || "The delete-account function failed.";
            try { const body = await error?.context?.clone().json(); if (body?.message) message = body.message; } catch (e) { /* ignore */ }
            throw new Error(message);
        }
        return data;
    }

    function setupDelete({ input, button, status, role = "learner" }) {
        if (!input || !button || !status) return;

        const say = (text, kind = "info") => {
            status.textContent = text;
            status.style.color = kind === "error" ? "#b4234d" : kind === "ok" ? "#21805e" : "#666";
        };

        button.addEventListener("click", async () => {
            if (input.value.trim() !== "DELETE") {
                say("Please type DELETE (in capitals) to confirm.", "error");
                input.focus();
                return;
            }

            const extra = role === "educator"
                ? "\n\nYour classes, lessons and sessions will be removed and enrolled learners will lose access to them."
                : "";
            if (!window.confirm("This permanently deletes your HobbyNest account and all its data. It cannot be undone." + extra + "\n\nDelete my account?")) return;

            button.disabled = true;
            input.disabled = true;
            say("Deleting your account…");

            try {
                const { data: { user } } = await supabaseClient.auth.getUser();
                if (!user) throw new Error("Your session has expired. Please log in again.");

                // Details for the confirmation email, collected before anything is deleted.
                const { data: rows } = await supabaseClient.rpc("get_my_profile");
                const me = (rows && rows[0]) || {};
                const email = user.email || me.email || "";

                // 1. photos (best effort — the user owns their own folder)
                say("Deleting your account… (removing photos)");
                await removeMyFiles(user.id);

                // 2. delete in the database
                say("Deleting your account… (removing your data)");
                let usedEdge = false;
                const { error } = await supabaseClient.rpc("delete_my_account");
                if (error) {
                    const missing = /could not find the function|PGRST202/i.test((error.message || "") + " " + (error.code || ""));
                    if (missing && window.HNNotify && HNNotify.edgeFunctionsOn()) {
                        await deleteViaEdgeFunction();
                        usedEdge = true;
                    } else {
                        throw error;
                    }
                }

                // 3. tell the user by email (if set up)
                let emailSent = usedEdge; // the edge function emails by itself
                if (!usedEdge && window.HNNotify) {
                    const result = await HNNotify.goodbye({ email, name: me.full_name, role: me.role || role });
                    emailSent = Boolean(result && result.sent);
                }

                say("✓ Account deleted. Signing you out…", "ok");
                window.nsLeaving = true;
                try { await supabaseClient.auth.signOut({ scope: "local" }); } catch (e) { /* already gone */ }

                const params = new URLSearchParams({ account_deleted: "1" });
                if (emailSent) params.set("email_sent", "1");
                if (email) params.set("email", email);
                window.location.replace("../auth/login.html?" + params.toString());
            } catch (error) {
                console.error("Account deletion error:", error);
                say(await explain(error), "error");
                button.disabled = false;
                input.disabled = false;
            }
        });
    }

    return { setupDelete, explain };
})();
