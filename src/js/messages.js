// HobbyNest - Messages (messages.html), for learners and educators.
//
// Who can message whom is decided by the database (can_message): educator ↔
// their students, meetup host ↔ attendees, or anyone who messaged you first.
// New messages arrive live through Supabase Realtime; if Realtime isn't
// available the page checks every few seconds instead.
//
// Open a chat directly with messages.html?to=<user id>.

(function () {
    "use strict";

    const $ = selector => document.querySelector(selector);
    const esc = value => HN.escapeHTML(value);
    const MAX_THREAD_ROWS = 500;     // recent messages used to build the conversation list
    const MAX_CHAT_ROWS = 200;       // messages shown in one conversation
    const POLL_LIVE_MS = 30000;      // safety refresh while Realtime works
    const POLL_FALLBACK_MS = 5000;   // refresh when Realtime is unavailable

    const state = {
        user: null,
        people: {},          // id -> { id, name, image, reason, role }
        threads: new Map(),  // other id -> { last, unread }
        active: null,        // other person's id
        chat: [],            // messages in the open conversation (oldest first)
        canReply: false,
        // "kind" (session notices) exists once the latest database.sql has run;
        // without it the page falls back to the older columns and keeps working.
        columns: "id, sender_id, receiver_id, message, created_at, read_at, kind",
        live: false,
        pollTimer: null,
        search: ""
    };

    function toast(message) {
        if (typeof window.toast === "function") window.toast(message);
    }

    /* ---------------- formatting ---------------- */

    function shortTime(value) {
        const date = new Date(value);
        const today = new Date().toDateString() === date.toDateString();
        return today
            ? date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })
            : date.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }

    function dayLabel(value) {
        const date = new Date(value);
        const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(value).setHours(0, 0, 0, 0)) / 86400e3);
        if (days === 0) return "Today";
        if (days === 1) return "Yesterday";
        return date.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short", year: days > 300 ? "numeric" : undefined });
    }

    // Escaped text with https links made clickable (meeting links in session notices).
    function linkify(text) {
        return esc(text).replace(/https:\/\/[^\s<>"']+/g, url =>
            `<a href="${url}" target="_blank" rel="noopener noreferrer">${url}</a>`);
    }

    function previewOf(message) {
        return (message.kind === "session" ? "📅 " : "") + String(message.message || "").split("\n")[0];
    }

    function personOf(id) {
        return state.people[id] || { id, name: "HobbyNest member", image: null, reason: "", role: "" };
    }

    function avatar(person) {
        return person.image || HN.initialsAvatar(person.name);
    }

    function otherOf(message) {
        return message.sender_id === state.user.id ? message.receiver_id : message.sender_id;
    }

    /* ---------------- data ---------------- */

    // Older database (latest database.sql not run yet): stop asking for "kind".
    function dropKindColumn(error) {
        if (!/kind/i.test(error?.message || "") || !state.columns.includes("kind")) return false;
        console.warn("messages.kind is missing — run the latest database.sql to get live-session notices.");
        state.columns = "id, sender_id, receiver_id, message, created_at, read_at";
        return true;
    }

    async function loadThreads() {
        const me = state.user.id;
        const { data, error } = await supabaseClient
            .from("messages")
            .select(state.columns)
            .or(`sender_id.eq.${me},receiver_id.eq.${me}`)
            .order("created_at", { ascending: false })
            .limit(MAX_THREAD_ROWS);
        if (error && dropKindColumn(error)) return loadThreads();
        if (error) throw error;

        const threads = new Map();
        (data || []).forEach(message => {
            const other = otherOf(message);
            if (!threads.has(other)) threads.set(other, { last: message, unread: 0 });
            if (message.receiver_id === me && !message.read_at) threads.get(other).unread++;
        });
        state.threads = threads;
    }

    async function loadContacts() {
        const { data, error } = await supabaseClient.rpc("my_contacts");
        if (error) {
            console.error("Contacts:", error);
            return;
        }
        (data || []).forEach(c => {
            state.people[c.user_id] = {
                id: c.user_id,
                name: c.full_name || "HobbyNest member",
                image: c.profile_image,
                role: c.role,
                reason: c.reason || ""
            };
        });
    }

    // Names/photos for people we have messages with but who aren't in contacts.
    async function loadMissingPeople(ids) {
        const missing = [...new Set(ids)].filter(id => id && !state.people[id]);
        if (!missing.length) return;
        const { data } = await supabaseClient
            .from("profiles")
            .select("id, full_name, profile_image, role, headline")
            .in("id", missing);
        (data || []).forEach(p => {
            state.people[p.id] = {
                id: p.id,
                name: p.full_name || "HobbyNest member",
                image: p.profile_image,
                role: p.role,
                reason: p.headline || (p.role === "educator" ? "Educator" : "Learner")
            };
        });
    }

    async function loadChat(otherId) {
        const me = state.user.id;
        const { data, error } = await supabaseClient
            .from("messages")
            .select(state.columns)
            .or(`and(sender_id.eq.${me},receiver_id.eq.${otherId}),and(sender_id.eq.${otherId},receiver_id.eq.${me})`)
            .order("created_at", { ascending: false })
            .limit(MAX_CHAT_ROWS);
        if (error && dropKindColumn(error)) return loadChat(otherId);
        if (error) throw error;
        return (data || []).reverse();
    }

    async function markRead(otherId) {
        const thread = state.threads.get(otherId);
        const hasUnread = state.chat.some(m => m.sender_id === otherId && !m.read_at);
        if (!hasUnread && !(thread && thread.unread)) return;
        const now = new Date().toISOString();
        const { error } = await supabaseClient
            .from("messages")
            .update({ read_at: now })
            .eq("receiver_id", state.user.id)
            .eq("sender_id", otherId)
            .is("read_at", null);
        if (error) return console.error("Mark read:", error);
        state.chat.forEach(m => { if (m.sender_id === otherId && !m.read_at) m.read_at = now; });
        if (thread) thread.unread = 0;
        renderList();
        if (window.nsRefreshUnread) window.nsRefreshUnread();
    }

    /* ---------------- conversation list ---------------- */

    function personRow(person, preview, time, unread) {
        return `
            <div class="chat-person${person.id === state.active ? " active" : ""}${unread ? " unread" : ""}"
                 data-person="${esc(person.id)}" role="button" tabindex="0">
                <img src="${esc(avatar(person))}" alt="" data-name="${esc(person.name)}">
                <div class="who">
                    <strong>${esc(person.name)}</strong>
                    <p class="muted">${esc(preview)}</p>
                </div>
                ${time ? `<time>${esc(time)}</time>` : ""}
                ${unread ? `<span class="unread-dot">${unread > 99 ? "99+" : unread}</span>` : ""}
            </div>`;
    }

    function matches(person) {
        if (!state.search) return true;
        return (person.name + " " + person.reason).toLowerCase().includes(state.search.toLowerCase());
    }

    function renderList() {
        const list = $("#chatList");
        const conversations = [...state.threads.entries()]
            .sort((a, b) => new Date(b[1].last.created_at) - new Date(a[1].last.created_at))
            .map(([id, thread]) => ({ person: personOf(id), thread }))
            .filter(row => matches(row.person));

        // Make sure an opened ?to= person shows up even before the first message.
        if (state.active && !state.threads.has(state.active) && matches(personOf(state.active))) {
            conversations.unshift({ person: personOf(state.active), thread: null });
        }

        const others = Object.values(state.people)
            .filter(p => !state.threads.has(p.id) && p.id !== state.active && matches(p))
            .sort((a, b) => a.name.localeCompare(b.name));

        let html = "";
        if (conversations.length) {
            html += `<div class="chat-section">CONVERSATIONS</div>` + conversations.map(({ person, thread }) => {
                if (!thread) return personRow(person, person.reason || "New conversation", "", 0);
                const mine = thread.last.sender_id === state.user.id;
                return personRow(person, (mine ? "You: " : "") + previewOf(thread.last), shortTime(thread.last.created_at), thread.unread);
            }).join("");
        }
        if (others.length) {
            html += `<div class="chat-section">START A CONVERSATION</div>` +
                others.map(person => personRow(person, person.reason, "", 0)).join("");
        }
        if (!html) {
            html = state.search
                ? `<p class="chat-list-empty">No one matches “${esc(state.search)}”.</p>`
                : `<p class="chat-list-empty">No conversations yet.<br><br>
                     Join a class or a meetup — you'll be able to message the educator or host from here.<br><br>
                     <a class="btn small" href="./nearby-meetups.html">Find a meetup →</a></p>`;
        }
        list.innerHTML = html;
    }

    /* ---------------- open conversation ---------------- */

    function renderChat({ keepScroll = false } = {}) {
        const box = $("#chatMessages");
        const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 80;
        const me = state.user.id;
        let lastDay = "";
        let html = "";

        state.chat.forEach(message => {
            const day = new Date(message.created_at).toDateString();
            if (day !== lastDay) {
                html += `<div class="day-divider">${esc(dayLabel(message.created_at))}</div>`;
                lastDay = day;
            }
            const time = new Date(message.created_at).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
            const session = message.kind === "session";
            html += `<div class="bubble${message.sender_id === me ? " me" : ""}${session ? " session" : ""}">` +
                (session ? `<span class="bubble-tag">Live session notice</span>` : "") +
                `${linkify(message.message)}<time>${esc(time)}</time></div>`;
        });

        const last = state.chat[state.chat.length - 1];
        if (last && last.sender_id === me && last.read_at) html += `<div class="seen">Seen</div>`;

        if (!state.chat.length) {
            const person = personOf(state.active);
            html = `<div class="chat-placeholder"><p><span class="ph-icon">👋</span>Say hi to ${esc(person.name)}!</p></div>`;
        }

        box.innerHTML = html;
        if (!keepScroll || nearBottom) box.scrollTop = box.scrollHeight;
    }

    function showChatPanels(open) {
        $("#chatHead").hidden = !open;
        $("#chatMessages").hidden = !open;
        $("#chatPlaceholder").hidden = open;
        $("#chatLayout").classList.toggle("chat-open", open);
        document.body.classList.toggle("chat-open", open);
        if (!open) {
            $("#chatForm").hidden = true;
            $("#chatNote").hidden = true;
        }
    }

    async function openChat(otherId) {
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(otherId || "") || otherId === state.user.id) return;
        state.active = otherId;
        await loadMissingPeople([otherId]);
        const person = personOf(otherId);

        history.replaceState(null, "", `${location.pathname}?to=${encodeURIComponent(otherId)}`);
        delete $("#chatAvatar").dataset.fallback;
        $("#chatAvatar").dataset.name = person.name;
        $("#chatAvatar").src = avatar(person);
        $("#chatName").textContent = person.name;
        $("#chatReason").textContent = person.reason || "";
        showChatPanels(true);
        renderList();

        $("#chatMessages").innerHTML = `<p class="muted" style="padding:10px">Loading messages…</p>`;
        const [chat, allowed] = await Promise.all([
            loadChat(otherId).catch(error => { console.error("Chat:", error); return null; }),
            supabaseClient.rpc("can_message", { p_other: otherId })
        ]);
        if (state.active !== otherId) return; // user switched chats meanwhile

        if (chat === null) {
            $("#chatMessages").innerHTML = `<p class="muted" style="padding:10px">Couldn't load this conversation. Please refresh.</p>`;
            return;
        }
        state.chat = chat;
        state.canReply = !allowed.error && allowed.data === true;
        renderChat();

        $("#chatForm").hidden = !state.canReply;
        $("#chatNote").hidden = state.canReply;
        $("#chatNote").textContent = "You can message people you share a class or meetup with. Join their class or meetup to start chatting.";
        if (state.canReply && window.matchMedia("(min-width: 801px)").matches) $("#chatInput").focus();

        markRead(otherId);
    }

    function closeChat() {
        state.active = null;
        state.chat = [];
        history.replaceState(null, "", location.pathname);
        showChatPanels(false);
        renderList();
    }

    /* ---------------- sending ---------------- */

    async function send(event) {
        event.preventDefault();
        const input = $("#chatInput");
        const text = input.value.trim();
        if (!text || !state.active) return;
        if (text.length > 2000) return toast("Messages can be up to 2000 characters.");

        const button = $("#sendBtn");
        button.disabled = true;
        const to = state.active;

        // Make sure this tab is still logged in as the same person (another tab
        // may have signed in to a different account in this browser).
        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session || session.user.id !== state.user.id) {
            button.disabled = false;
            toast("You're now signed in as a different account in this browser. Reloading…");
            setTimeout(() => window.location.reload(), 1200);
            return;
        }

        const insertMessage = () => supabaseClient
            .from("messages")
            .insert({ sender_id: state.user.id, receiver_id: to, message: text })
            .select(state.columns)
            .single();
        let { data, error } = await insertMessage();
        if (error && dropKindColumn(error)) ({ data, error } = await insertMessage());
        button.disabled = false;

        if (error) {
            console.error("Send:", error);
            const blocked = /row-level security|violates/i.test(error.message || "");
            const note = $("#chatNote");
            note.hidden = false;
            note.textContent = blocked
                ? "Not sent: you can only message your students, your educators and people from your meetups. " +
                  "The learner needs to be enrolled in one of your classes (or you need to share a meetup)."
                : "Not sent — check your connection and try again. Your text is still in the box.";
            return toast(blocked ? "Message not sent — you can't message this person." : "Message not sent. Please try again.");
        }

        $("#chatNote").hidden = state.canReply;
        input.value = "";
        input.style.height = "";
        addMessage(data);
        input.focus();

        // Email the receiver (first message of a burst only; respects their settings).
        if (window.HNNotify) HNNotify.send("message", { message_ids: [data.id] });
    }

    // Adds a message (sent, received live, or found by polling) to the page.
    function addMessage(message) {
        const me = state.user.id;
        if (message.sender_id !== me && message.receiver_id !== me) return;
        const other = otherOf(message);
        const existing = state.threads.get(other);
        const known = state.chat.some(m => m.id === message.id) ||
            (existing && existing.last.id === message.id);
        if (known) return;

        const thread = existing || { last: message, unread: 0 };
        if (new Date(message.created_at) >= new Date(thread.last.created_at)) thread.last = message;
        state.threads.set(other, thread);

        if (other === state.active) {
            state.chat.push(message);
            renderChat({ keepScroll: true });
            if (message.receiver_id === me) {
                if (document.visibilityState === "visible") markRead(other);
                else thread.unread++;
            }
        } else if (message.receiver_id === me) {
            thread.unread++;
            if (window.nsRefreshUnread) window.nsRefreshUnread();
        }

        if (!state.people[other]) loadMissingPeople([other]).then(renderList);
        renderList();
    }

    /* ---------------- live updates ---------------- */

    function setLive(live) {
        state.live = live;
        $("#liveStatus").textContent = live ? "● Live" : "";
        $("#liveStatus").style.color = live ? "#18794e" : "";
        schedulePoll();
    }

    function subscribe() {
        if (typeof supabaseClient.channel !== "function") return setLive(false);
        const me = state.user.id;
        try {
            supabaseClient
                .channel("hn-messages-" + me)
                .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `receiver_id=eq.${me}` },
                    payload => addMessage(payload.new))
                .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages", filter: `sender_id=eq.${me}` },
                    payload => {
                        const row = state.chat.find(m => m.id === payload.new.id);
                        if (row && payload.new.read_at && !row.read_at) {
                            row.read_at = payload.new.read_at;
                            renderChat({ keepScroll: true });
                        }
                    })
                .subscribe(status => setLive(status === "SUBSCRIBED"));
        } catch (error) {
            console.warn("Realtime unavailable, checking every few seconds instead.", error);
            setLive(false);
        }
    }

    function schedulePoll() {
        clearTimeout(state.pollTimer);
        state.pollTimer = setTimeout(poll, state.live ? POLL_LIVE_MS : POLL_FALLBACK_MS);
    }

    async function poll() {
        try {
            if (document.visibilityState === "visible") {
                await loadThreads();
                if (state.active) {
                    const chat = await loadChat(state.active);
                    const before = state.chat.map(m => m.id + ":" + !!m.read_at).join();
                    const after = chat.map(m => m.id + ":" + !!m.read_at).join();
                    if (before !== after) {
                        state.chat = chat;
                        renderChat({ keepScroll: true });
                        markRead(state.active);
                    }
                }
                await loadMissingPeople([...state.threads.keys()]);
                renderList();
            }
        } catch (error) {
            console.warn("Message refresh failed:", error);
        }
        schedulePoll();
    }

    /* ---------------- start ---------------- */

    // Broken photo links fall back to initials.
    document.addEventListener("error", event => {
        const img = event.target;
        if (img.tagName !== "IMG" || img.dataset.fallback) return;
        if (img.id !== "chatAvatar" && !img.dataset.name) return;
        img.dataset.fallback = "1";
        img.src = HN.initialsAvatar(img.dataset.name || $("#chatName").textContent);
    }, true);

    function bindEvents() {
        $("#chatList").addEventListener("click", event => {
            const row = event.target.closest("[data-person]");
            if (row) openChat(row.dataset.person);
        });
        $("#chatList").addEventListener("keydown", event => {
            const row = event.target.closest("[data-person]");
            if (row && event.key === "Enter") openChat(row.dataset.person);
        });
        $("#chatForm").addEventListener("submit", send);
        $("#chatInput").addEventListener("keydown", event => {
            if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
                event.preventDefault();
                $("#chatForm").requestSubmit();
            }
        });
        $("#chatInput").addEventListener("input", event => {
            const box = event.target;
            box.style.height = "";
            box.style.height = Math.min(box.scrollHeight, 120) + "px";
        });
        $("#chatBack").addEventListener("click", closeChat);
        $("#peopleSearch").addEventListener("input", event => {
            state.search = event.target.value.trim();
            renderList();
        });
        document.addEventListener("visibilitychange", () => {
            if (document.visibilityState === "visible" && state.active) markRead(state.active);
        });
    }

    async function init() {
        const { user, profile } = await window.nsReady;
        state.user = user;
        if (profile.role === "educator") HN.educatorSidebar();
        bindEvents();

        try {
            await Promise.all([loadThreads(), loadContacts()]);
            await loadMissingPeople([...state.threads.keys()]);
        } catch (error) {
            console.error("Messages:", error);
            $("#chatList").innerHTML = `<p class="chat-list-empty">${
                /read_at|my_contacts|does not exist|schema cache/i.test(error.message || "")
                    ? "Messages aren't set up yet — run the latest database.sql in Supabase."
                    : "Couldn't load your messages. Please refresh the page."}</p>`;
            return;
        }

        renderList();
        const to = new URLSearchParams(location.search).get("to");
        if (to) await openChat(to);

        subscribe();
    }

    init().catch(error => console.error("Messages page:", error));
})();
