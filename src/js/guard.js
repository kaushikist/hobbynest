// HobbyNest - protected page guard
// Add data-role="learner" or data-role="educator" to <body> on protected pages.
//
// Other scripts can wait for the checked user like this:
//   const { user, profile } = await window.nsReady;

window.nsReady = (async function () {
    const LOGIN_URL = "../auth/login.html";
    const requiredRole = document.body.dataset.role;

    const { data: { user }, error: userError } =
        await supabaseClient.auth.getUser();

    if (userError || !user) {
        window.location.replace(LOGIN_URL);
        return new Promise(() => {}); // never resolves; page is leaving
    }

    // Never select("*") on profiles: email/location are private columns.
    const { data: profile, error } = await supabaseClient
        .from("profiles")
        .select("role, full_name, onboarding_complete, profile_image, headline")
        .eq("id", user.id)
        .single();

    if (error || !profile) {
        console.error("Profile load error:", error);
        window.location.replace(LOGIN_URL);
        return new Promise(() => {});
    }

    // Unfinished onboarding (no role/location yet) → finish it first.
    if (!profile.onboarding_complete) {
        window.location.replace("../auth/role-select.html");
        return new Promise(() => {});
    }

    if (requiredRole && profile.role !== requiredRole) {
        window.location.replace(
            profile.role === "educator"
                ? "../instructor/instructor-dashboard.html"
                : "../user/user-dashboard.html"
        );
        return new Promise(() => {});
    }

    window.nsUser = user;
    window.nsProfile = profile;

    showProfileInTopbar(profile);
    nsWatchAccountSwitch(user.id);
    nsRefreshUnread();
    nsWatchInbox(user.id);

    return { user, profile };
})();

// Supabase keeps ONE login per browser, shared by all tabs. If someone signs in
// as a different account in another tab (e.g. testing educator + learner in the
// same browser), this tab would silently act as the other account — messages
// would be rejected or land in the wrong place. Reload so the page always
// matches who is really logged in.
function nsWatchAccountSwitch(userId) {
    try {
        supabaseClient.auth.onAuthStateChange((event, session) => {
            const current = session?.user?.id || null;
            if (window.nsLeaving) return; // logging out / account deleted — the page is navigating away
            if (current !== userId && event !== "INITIAL_SESSION") {
                window.location.reload();
            }
        });
    } catch (error) {
        console.warn("Auth watch unavailable:", error);
    }
}

// Name, headline and photo (or initials) in the top bar of every page.
function showProfileInTopbar(profile) {
    const name = profile.full_name || "My account";
    const subtitle = profile.headline ||
        (profile.role === "educator" ? "Educator · HobbyNest" : "Learner · HobbyNest");

    document.querySelectorAll(".profile-info strong").forEach(el => { el.textContent = name; });
    document.querySelectorAll(".profile-info span").forEach(el => { el.textContent = subtitle; });

    const letters = name.trim().split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase() || "?";
    const fallback = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#eef5ff"/>` +
        `<text x="50%" y="54%" font-family="Arial" font-size="30" font-weight="700" fill="#1558c0" text-anchor="middle" dominant-baseline="middle">${letters.replace(/[<&>]/g, "")}</text></svg>`);

    document.querySelectorAll(".profile img, .topbar .profile img, .current-avatar img, img.current-avatar").forEach(img => {
        img.alt = name + " profile photo";
        img.onerror = () => { img.onerror = null; img.src = fallback; };
        img.src = profile.profile_image || fallback;
    });

    // Make the whole account area (name and avatar) an obvious profile link.
    document.querySelectorAll(".topbar .profile").forEach(profileCard => {
        if (profileCard.parentElement?.classList.contains("profile-link")) return;
        const link = document.createElement("a");
        link.className = "profile-link";
        link.href = profile.role === "educator" ? "../instructor/profile.html" : "./profile.html";
        link.setAttribute("aria-label", "Open your profile");
        link.style.cssText = "display:inline-flex;align-items:center;color:inherit;text-decoration:none;border-radius:10px;";
        profileCard.parentNode.insertBefore(link, profileCard);
        link.appendChild(profileCard);
    });
    if (profile.role === "educator" && location.pathname.endsWith("/instructor-dashboard.html") && location.hash === "#profile") {
        setTimeout(() => document.querySelector('.edu-nav[data-section="profile"]')?.click(), 0);
    }
}

// Unread-message count next to every "Messages" link in the sidebar,
// plus a banner on the dashboards. Returns the count.
let nsLastUnread = null;
async function nsRefreshUnread() {
    const user = window.nsUser;
    if (!user) return;
    let count = 0;
    try {
        const result = await supabaseClient
            .from("messages")
            .select("id", { count: "exact", head: true })
            .eq("receiver_id", user.id)
            .is("read_at", null);
        if (result.error) return null; // e.g. database.sql not updated yet — just skip the badge
        count = result.count || 0;
    } catch (e) {
        return null;
    }
    document.querySelectorAll('.sidebar a[href$="messages.html"]').forEach(link => {
        let badge = link.querySelector(".nav-badge");
        if (!count) { if (badge) badge.remove(); return; }
        if (!badge) {
            badge = document.createElement("span");
            badge.className = "nav-badge";
            link.appendChild(badge);
        }
        badge.textContent = count > 99 ? "99+" : String(count);
    });
    nsShowInboxBanner(count);
    nsLastUnread = count;
    return count;
}

function nsMessagesUrl(otherId) {
    const base = location.pathname.includes("/instructor/") ? "../user/messages.html" : "./messages.html";
    return otherId ? `${base}?to=${encodeURIComponent(otherId)}` : base;
}

// "You have N unread messages" banner at the top of the dashboards.
function nsShowInboxBanner(count) {
    const onDashboard = /\/(user-dashboard|instructor-dashboard)\.html$/.test(location.pathname);
    if (!onDashboard) return;
    const content = document.querySelector("main .content");
    if (!content) return;
    let banner = document.getElementById("nsInboxBanner");
    if (!count) { if (banner) banner.remove(); return; }
    if (!banner) {
        banner = document.createElement("a");
        banner.id = "nsInboxBanner";
        banner.href = nsMessagesUrl();
        banner.style.cssText = "display:flex;align-items:center;gap:12px;margin:0 0 18px;padding:13px 16px;border-radius:12px;" +
            "background:#eef5ff;border:1px solid #cfe0fa;color:#123a73;text-decoration:none;font-size:14px;font-weight:600";
        content.prepend(banner);
    }
    banner.innerHTML = `<span style="font-size:20px">✉️</span><span style="flex:1">You have ${count} unread message${count === 1 ? "" : "s"}` +
        ` — including any live-session notices from your ${location.pathname.includes("/instructor/") ? "learners" : "educators"}.</span>` +
        `<span style="white-space:nowrap">Open Messages →</span>`;
}

// Small pop-up in the corner: "New message from …".
function nsNotify(title, text, href) {
    let box = document.getElementById("nsNotice");
    if (!box) {
        box = document.createElement("a");
        box.id = "nsNotice";
        box.setAttribute("role", "status");
        box.style.cssText = "position:fixed;right:18px;bottom:88px;z-index:9999;max-width:340px;background:#fff;color:#182235;" +
            "border:1px solid #dfe4eb;border-left:4px solid #1558c0;border-radius:12px;padding:12px 14px;" +
            "box-shadow:0 14px 40px rgba(20,40,80,.18);text-decoration:none;font-size:13px;line-height:1.45;transition:opacity .2s";
        document.body.appendChild(box);
    }
    box.href = href;
    box.innerHTML = "";
    const strong = document.createElement("strong");
    strong.textContent = title;
    strong.style.cssText = "display:block;margin-bottom:3px";
    const p = document.createElement("span");
    p.textContent = text.length > 120 ? text.slice(0, 120) + "…" : text;
    p.style.cssText = "display:block;color:#5d6878;white-space:pre-line";
    box.append(strong, p);
    box.style.opacity = "1";
    box.style.display = "block";
    clearTimeout(box._hide);
    box._hide = setTimeout(() => { box.style.opacity = "0"; setTimeout(() => { box.style.display = "none"; }, 250); }, 9000);
}

// Live inbox on every page (the Messages page has its own, richer version).
function nsWatchInbox(userId) {
    if (/\/messages\.html$/.test(location.pathname)) return;

    const announce = async message => {
        let name = "Someone";
        try {
            const { data } = await supabaseClient.from("profiles").select("full_name").eq("id", message.sender_id).single();
            if (data?.full_name) name = data.full_name;
        } catch (e) { /* keep default */ }
        const title = message.kind === "session" ? `📅 ${name} scheduled a live session` : `✉️ New message from ${name}`;
        nsNotify(title, message.message || "", nsMessagesUrl(message.sender_id));
        nsRefreshUnread();
    };

    try {
        supabaseClient
            .channel("hn-inbox-" + userId)
            .on("postgres_changes",
                { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${userId}` },
                payload => announce(payload.new))
            .subscribe();
    } catch (error) {
        console.warn("Live inbox unavailable:", error);
    }

    // Safety net if Realtime is off: check the unread count every 45 s.
    setInterval(async () => {
        if (document.visibilityState !== "visible") return;
        const before = nsLastUnread;
        const count = await nsRefreshUnread();
        if (count != null && before != null && count > before) {
            nsNotify("✉️ New messages", `You have ${count} unread message${count === 1 ? "" : "s"}.`, nsMessagesUrl());
        }
    }, 45000);
}

async function nsLogout() {
    window.nsLeaving = true;
    await supabaseClient.auth.signOut();
    window.location.href = "../auth/login.html";
}
