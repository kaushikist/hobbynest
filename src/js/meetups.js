// HobbyNest - Nearby Meetups (nearby-meetups.html)
// Lists upcoming meetups by distance from you, lets anyone host one,
// join or leave, and lets hosts see who's coming.
//
// Tables: meetups, meetup_registrations. RPC: meetup_counts, get_my_profile.
// Your saved location (profiles.latitude/longitude) stays private: distances
// are worked out here in the browser and never sent anywhere.

(function () {
    "use strict";

    const $ = selector => document.querySelector(selector);
    const $$ = selector => Array.from(document.querySelectorAll(selector));
    const esc = value => HN.escapeHTML(value);
    const ENDED_AFTER_HOURS = 3; // meetups without an end time count as over 3 h after they start

    const state = {
        user: null,
        profile: null,
        origin: null,          // { lat, lng, label }
        meetups: [],
        going: new Set(),      // meetup ids I've joined
        counts: {},            // meetup id -> people going
        hosts: {},             // user id -> name
        view: "upcoming",
        category: "all",
        radius: 25,
        sort: "soonest",
        search: "",
        editing: null,         // meetup being edited, or null for a new one
        pin: null              // { lat, lng } chosen in the host form
    };

    function toast(message) {
        if (typeof window.toast === "function") return window.toast(message);
        const el = $("#toast");
        if (!el) return alert(message);
        el.textContent = message;
        el.classList.add("show");
        clearTimeout(toast.timer);
        toast.timer = setTimeout(() => el.classList.remove("show"), 2800);
    }

    /* ---------------- helpers ---------------- */

    function hasEnded(meetup) {
        const end = meetup.ends_at
            ? new Date(meetup.ends_at)
            : new Date(new Date(meetup.starts_at).getTime() + ENDED_AFTER_HOURS * 3600e3);
        return end < new Date();
    }

    function hasStarted(meetup) {
        return new Date(meetup.starts_at) <= new Date();
    }

    function distanceOf(meetup) {
        if (!state.origin) return null;
        return HN.distanceKm(state.origin.lat, state.origin.lng, meetup.latitude, meetup.longitude);
    }

    function spotsLeft(meetup) {
        return Math.max(meetup.capacity - (state.counts[meetup.id] || 0), 0);
    }

    function isHost(meetup) {
        return meetup.created_by === state.user.id;
    }

    function mapsUrl(meetup) {
        const query = meetup.latitude != null && meetup.longitude != null
            ? `${meetup.latitude},${meetup.longitude}`
            : meetup.venue || "";
        return "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(query);
    }

    function friendlyError(error, fallback) {
        const text = (error && error.message) || "";
        if (/full/i.test(text)) return "Sorry, this meetup is full.";
        if (/duplicate|unique/i.test(text)) return "You're already going to this meetup.";
        if (/row-level security|violates/i.test(text)) return "This meetup has already started or you can't do that.";
        if (/meetups_values_check/i.test(text)) return "Please check the details — something isn't valid.";
        if (/does not exist|schema cache/i.test(text)) return "Meetups aren't set up yet — run the latest database.sql in Supabase.";
        return fallback;
    }

    /* ---------------- loading ---------------- */

    async function loadLocation() {
        const { data, error } = await supabaseClient.rpc("get_my_profile");
        const me = !error && data && data[0];
        if (me && me.latitude != null && me.longitude != null) {
            state.origin = { lat: me.latitude, lng: me.longitude, label: me.city ? `near ${me.city}` : "near your saved location" };
        }
        state.sort = state.origin ? "nearest" : "soonest";
        $("#sortSelect").value = state.sort;
        showLocationStatus();
    }

    function showLocationStatus() {
        const status = $("#locationStatus");
        if (state.origin) {
            status.textContent = `Showing meetups ${state.origin.label}`;
        } else {
            status.textContent = "Share your location to see how far meetups are";
        }
        $("#radiusSelect").disabled = !state.origin;
        $("#sortSelect").querySelector('[value="nearest"]').disabled = !state.origin;
    }

    async function loadMeetups() {
        const since = new Date(Date.now() - 24 * 3600e3).toISOString();
        const [meetupsRes, mineRes] = await Promise.all([
            supabaseClient.from("meetups").select(HN.MEETUP_COLUMNS)
                .gte("starts_at", since).order("starts_at", { ascending: true }).limit(300),
            supabaseClient.from("meetup_registrations").select("meetup_id").eq("user_id", state.user.id)
        ]);

        if (meetupsRes.error) {
            console.error("Meetups:", meetupsRes.error);
            $("#meetupGrid").innerHTML = `<p class="meetup-loading">${esc(friendlyError(meetupsRes.error, "Couldn't load meetups. Please refresh the page."))}</p>`;
            return false;
        }

        state.meetups = meetupsRes.data || [];
        state.going = new Set((mineRes.data || []).map(r => r.meetup_id));
        await Promise.all([loadCounts(), loadHosts()]);
        return true;
    }

    async function loadCounts(ids = state.meetups.map(m => m.id)) {
        if (!ids.length) return;
        const { data, error } = await supabaseClient.rpc("meetup_counts", { p_ids: ids });
        if (error) return console.error("Meetup counts:", error);
        ids.forEach(id => { state.counts[id] = 0; });
        (data || []).forEach(row => { state.counts[row.meetup_id] = row.going; });
    }

    async function loadHosts() {
        const missing = state.meetups.map(m => m.created_by).filter(id => !(id in state.hosts));
        Object.assign(state.hosts, await HN.educatorNames(missing));
    }

    /* ---------------- list ---------------- */

    function renderFilters() {
        const buttons = [`<button class="meetup-filter active" type="button" data-category="all">All</button>`]
            .concat(Object.entries(HN.MEETUP_CATEGORIES).map(([key, meta]) =>
                `<button class="meetup-filter" type="button" data-category="${key}">${esc(meta.label)}</button>`));
        $("#meetupFilters").innerHTML = buttons.join("");
    }

    function visibleMeetups() {
        let list = state.meetups.filter(m => {
            if (state.view === "going") return state.going.has(m.id) && !hasEnded(m);
            if (state.view === "hosting") return isHost(m);
            return !hasEnded(m);
        });

        if (state.category !== "all") list = list.filter(m => (HN.MEETUP_CATEGORIES[m.category] ? m.category : "other") === state.category);

        if (state.search) {
            const term = state.search.toLowerCase();
            list = list.filter(m => [m.title, m.description, m.venue, state.hosts[m.created_by], HN.meetupMeta(m.category).label]
                .join(" ").toLowerCase().includes(term));
        }

        let hidden = 0;
        if (state.view === "upcoming" && state.origin && state.radius) {
            const inRange = list.filter(m => {
                const km = distanceOf(m);
                return km != null && km <= state.radius;
            });
            hidden = list.length - inRange.length;
            list = inRange;
        }

        list.sort((a, b) => {
            if (state.sort === "nearest") {
                const da = distanceOf(a), db = distanceOf(b);
                if (da != null || db != null) {
                    if (da == null) return 1;
                    if (db == null) return -1;
                    if (Math.abs(da - db) > 0.05) return da - db;
                }
            }
            return new Date(a.starts_at) - new Date(b.starts_at);
        });

        return { list, hidden };
    }

    function card(meetup) {
        const meta = HN.meetupMeta(meetup.category);
        const when = HN.meetupWhen(meetup);
        const km = distanceOf(meetup);
        const left = spotsLeft(meetup);
        const badge = isHost(meetup)
            ? `<span class="meetup-badge host">Hosting</span>`
            : state.going.has(meetup.id) ? `<span class="meetup-badge">Going ✓</span>` : "";
        const spots = hasEnded(meetup) ? `<span class="spots">Ended</span>`
            : left === 0 ? `<span class="spots full">Full</span>`
            : `<span class="spots">${left} spot${left === 1 ? "" : "s"} left</span>`;
        const place = [meetup.venue, km != null ? HN.formatDistance(km) : ""].filter(Boolean).join(" · ") || "Location shared after joining";

        const image = meta.img || HN.MEETUP_CATEGORIES.other.img;
        return `
            <article class="meetup-card" data-id="${meetup.id}" tabindex="0" aria-label="Meetup: ${esc(meetup.title)}">
                <div class="meetup-visual"><img src="${esc(image)}" alt="${esc(meta.label)} meetup" loading="lazy" onerror="this.onerror=null;this.src='https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=900&q=80'"></div>
                <div class="meetup-body">
                    <span class="meetup-category">${esc(meta.label)}${badge}</span>
                    <h3>${esc(meetup.title)}</h3>
                    <p class="meetup-description">${esc(meetup.description || `Hosted by ${state.hosts[meetup.created_by] || "a HobbyNest member"}`)}</p>
                    <div class="meetup-details">
                        <span>${esc(place)}</span>
                        <span>${esc(when.date)}</span>
                        <span>${esc(when.time)}</span>
                    </div>
                    <div class="meetup-footer">
                        ${spots}
                        <button class="meetup-btn" type="button" data-id="${meetup.id}">View details</button>
                    </div>
                </div>
            </article>`;
    }

    function render() {
        const grid = $("#meetupGrid");
        const empty = $("#emptyMeetups");
        const { list, hidden } = visibleMeetups();

        grid.innerHTML = list.map(card).join("") + (hidden
            ? `<p class="meetup-loading">${hidden} more meetup${hidden === 1 ? " is" : "s are"} further away or not on the map.
                 <button class="link-btn" type="button" data-show-all>Show any distance</button></p>`
            : "");

        empty.style.display = list.length ? "none" : "block";
        if (!list.length) {
            const texts = {
                upcoming: ["No meetups found", hidden ? "Nothing in this distance yet — try a bigger distance, or host the first one!" : "Try another category, or host the first one!"],
                going: ["You haven't joined any meetups", "Open an upcoming meetup and tap “I'm going”."],
                hosting: ["You're not hosting anything yet", "Tap “Host a meetup” to bring people together."]
            };
            $("#emptyTitle").textContent = texts[state.view][0];
            $("#emptyText").textContent = texts[state.view][1];
        }
    }

    /* ---------------- details ---------------- */

    async function openMeetup(id) {
        let meetup = state.meetups.find(m => m.id === Number(id));
        if (!meetup) {
            // e.g. opened from Saved → fetch it on its own
            const { data } = await supabaseClient.from("meetups").select(HN.MEETUP_COLUMNS).eq("id", id).maybeSingle();
            if (!data) return toast("This meetup was cancelled or doesn't exist.");
            meetup = data;
            state.meetups.push(meetup);
            await Promise.all([loadCounts([meetup.id]), loadHosts()]);
        }

        const meta = HN.meetupMeta(meetup.category);
        const when = HN.meetupWhen(meetup);
        const km = distanceOf(meetup);
        const going = state.counts[meetup.id] || 0;
        const host = state.hosts[meetup.created_by] || "A HobbyNest member";

        const modalImage = meta.img || HN.MEETUP_CATEGORIES.other.img;
        $("#modalIcon").innerHTML = `<img src="${esc(modalImage)}" alt="${esc(meta.label)} meetup" class="meetup-modal-image">`;
        $("#modalTitle").textContent = meetup.title;
        $("#modalDescription").textContent = meetup.description || "";
        $("#modalMeta").innerHTML = `
            <strong>${esc(meta.label)}</strong><br>
            ${esc(when.date)} · ${esc(when.time)}<br>
            ${esc(meetup.venue || "Venue not given")}${km != null ? ` · ${esc(HN.formatDistance(km))}` : ""}
            ${meetup.venue || meetup.latitude != null ? ` · <a href="${esc(mapsUrl(meetup))}" target="_blank" rel="noopener" style="color:#6d52d9">Open in Maps</a>` : ""}<br>
             Hosted by ${esc(isHost(meetup) ? "you" : host)}<br>
             ${going} of ${meetup.capacity} going`;

        $("#modalPeople").innerHTML = "";
        renderActions(meetup);
        $("#meetupModal").dataset.id = meetup.id;
        $("#meetupModal").classList.add("show");

        if (isHost(meetup)) loadAttendees(meetup);
    }

    function renderActions(meetup) {
        const actions = $("#modalActions");
        const ended = hasEnded(meetup);
        const started = hasStarted(meetup);
        const joined = state.going.has(meetup.id);
        const full = spotsLeft(meetup) === 0;
        const messageHost = `messages.html?to=${encodeURIComponent(meetup.created_by)}`;

        if (isHost(meetup)) {
            actions.innerHTML = `
                ${started ? "" : `<button class="join-btn secondary" type="button" data-action="edit">Edit meetup</button>`}
                <button class="join-btn danger" type="button" data-action="cancel">${ended ? "Delete meetup" : "Cancel meetup"}</button>`;
        } else if (joined) {
            actions.innerHTML = `
                <a class="join-btn secondary" style="text-align:center" href="${messageHost}">Message the host</a>
                ${started ? `<p class="modal-note">${ended ? "This meetup has ended." : "This meetup has started."}</p>`
                          : `<button class="join-btn danger" type="button" data-action="leave">I can't make it</button>`}`;
        } else if (ended || started) {
            actions.innerHTML = `<p class="modal-note">${ended ? "This meetup has ended." : "This meetup has already started."}</p>`;
        } else if (full) {
            actions.innerHTML = `<button class="join-btn" type="button" disabled>This meetup is full</button>`;
        } else {
            actions.innerHTML = `
                <button class="join-btn" type="button" data-action="join">I'm going →</button>
                <p class="modal-note">After joining you can message the host.</p>`;
        }
    }

    async function loadAttendees(meetup) {
        const box = $("#modalPeople");
        box.innerHTML = `<p class="muted" style="font-size:13px">Loading who's going…</p>`;
        const { data, error } = await supabaseClient
            .from("meetup_registrations").select("user_id, created_at")
            .eq("meetup_id", meetup.id).order("created_at", { ascending: true });
        if ($("#meetupModal").dataset.id !== String(meetup.id)) return; // another meetup was opened meanwhile
        if (error) {
            box.innerHTML = `<p class="muted">Couldn't load who's going.</p>`;
            return;
        }
        if (!data.length) {
            box.innerHTML = `<p class="muted" style="font-size:13px;margin-bottom:16px">Nobody has joined yet — share it with friends!</p>`;
            return;
        }
        const ids = data.map(r => r.user_id);
        const { data: people } = await supabaseClient.from("profiles").select("id, full_name, profile_image").in("id", ids);
        const byId = Object.fromEntries((people || []).map(p => [p.id, p]));
        box.innerHTML = `
            <strong style="font-size:14px">Who's going (${data.length})</strong>
            <div class="people-list" style="margin-top:10px">
                ${ids.map(id => {
                    const person = byId[id] || {};
                    const name = person.full_name || "HobbyNest member";
                    return `<div class="person-row">
                        <img src="${esc(person.profile_image || HN.initialsAvatar(name))}" alt=""
                             onerror="this.onerror=null;this.src=HN.initialsAvatar(this.dataset.name)" data-name="${esc(name)}">
                        <span>${esc(name)}</span>
                        <a href="messages.html?to=${encodeURIComponent(id)}">Message</a>
                    </div>`;
                }).join("")}
            </div>`;
    }

    function closeModals() {
        $$(".meetup-modal").forEach(modal => modal.classList.remove("show"));
        if (new URLSearchParams(location.search).has("id")) history.replaceState(null, "", location.pathname);
    }

    function current() {
        return state.meetups.find(m => String(m.id) === $("#meetupModal").dataset.id);
    }

    async function join(meetup, button) {
        button.disabled = true;
        const { error } = await supabaseClient.from("meetup_registrations")
            .insert({ meetup_id: meetup.id, user_id: state.user.id });
        if (error && !/duplicate|unique/i.test(error.message || "")) {
            button.disabled = false;
            await loadCounts([meetup.id]);
            render();
            return toast(friendlyError(error, "Couldn't join. Please try again."));
        }
        state.going.add(meetup.id);
        await loadCounts([meetup.id]);
        toast("You're registered for this meetup.");
        render();
        openMeetup(meetup.id);
    }

    async function leave(meetup, button) {
        button.disabled = true;
        const { error } = await supabaseClient.from("meetup_registrations")
            .delete().eq("meetup_id", meetup.id).eq("user_id", state.user.id);
        if (error) {
            button.disabled = false;
            return toast("Couldn't update. Please try again.");
        }
        state.going.delete(meetup.id);
        await loadCounts([meetup.id]);
        toast("Okay — you're no longer going.");
        render();
        openMeetup(meetup.id);
    }

    async function cancel(meetup, button) {
        const going = state.counts[meetup.id] || 0;
        const ask = going && !hasEnded(meetup)
            ? `Cancel "${meetup.title}"? ${going} ${going === 1 ? "person is" : "people are"} going — let them know in Messages.`
            : `Delete "${meetup.title}"?`;
        if (!confirm(ask)) return;
        button.disabled = true;
        const { error } = await supabaseClient.from("meetups").delete().eq("id", meetup.id).eq("created_by", state.user.id);
        if (error) {
            button.disabled = false;
            return toast("Couldn't cancel. Please try again.");
        }
        state.meetups = state.meetups.filter(m => m.id !== meetup.id);
        state.going.delete(meetup.id);
        closeModals();
        render();
        toast("Meetup cancelled.");
    }

    /* ---------------- host / edit form ---------------- */

    function pad(n) {
        return String(n).padStart(2, "0");
    }

    function localDate(d) {
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    }

    function localTime(d) {
        return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function setPin(pin, text) {
        state.pin = pin;
        $("#pinStatus").textContent = text || (pin
            ? `✓ On the map (${pin.lat.toFixed(4)}, ${pin.lng.toFixed(4)})`
            : "Not on the map yet — distance won't be shown.");
    }

    function openForm(meetup = null) {
        state.editing = meetup;
        $("#meetupForm").reset();
        $("#formError").textContent = "";
        $("#hostTitle").textContent = meetup ? "Edit meetup" : "Host a meetup";
        $("#saveMeetup").textContent = meetup ? "Save changes" : "Publish meetup";
        $("#saveMeetup").disabled = false;
        $("#mDate").min = localDate(new Date());

        if (meetup) {
            const start = new Date(meetup.starts_at);
            $("#mTitle").value = meetup.title;
            $("#mCategory").value = HN.MEETUP_CATEGORIES[meetup.category] ? meetup.category : "other";
            $("#mCapacity").value = meetup.capacity;
            $("#mDescription").value = meetup.description || "";
            $("#mVenue").value = meetup.venue || "";
            $("#mDate").value = localDate(start);
            $("#mStart").value = localTime(start);
            $("#mEnd").value = meetup.ends_at ? localTime(new Date(meetup.ends_at)) : "";
            setPin(meetup.latitude != null && meetup.longitude != null ? { lat: meetup.latitude, lng: meetup.longitude } : null);
        } else {
            const tomorrow = new Date(Date.now() + 24 * 3600e3);
            $("#mDate").value = localDate(tomorrow);
            $("#mStart").value = "17:00";
            $("#mEnd").value = "19:00";
            $("#mCapacity").value = 20;
            setPin(null);
        }

        $("#meetupModal").classList.remove("show");
        $("#hostModal").classList.add("show");
        setTimeout(() => $("#mTitle").focus(), 50);
    }

    // Free address lookup (OpenStreetMap). Only the venue text is sent.
    async function geocode(address) {
        const url = "https://nominatim.openstreetmap.org/search?format=json&limit=1&q=" + encodeURIComponent(address);
        const response = await fetch(url, { headers: { "Accept-Language": "en" } });
        if (!response.ok) throw new Error("lookup failed");
        const results = await response.json();
        if (!results.length) return null;
        return { lat: Number(results[0].lat), lng: Number(results[0].lon), name: results[0].display_name };
    }

    async function findVenue() {
        const venue = $("#mVenue").value.trim();
        if (!venue) return setPin(state.pin, "Type the venue address first.");
        setPin(state.pin, "Looking it up…");
        try {
            const found = await geocode(venue);
            if (!found) return setPin(null, "Couldn't find that address — add the area and city, or use “I'm at the venue now”.");
            setPin({ lat: found.lat, lng: found.lng }, `✓ Found: ${found.name.split(",").slice(0, 3).join(",")}`);
        } catch (e) {
            setPin(state.pin, "Address lookup isn't available right now — you can still publish.");
        }
    }

    function pinHere() {
        if (!navigator.geolocation) return setPin(state.pin, "Your browser can't share location.");
        setPin(state.pin, "Getting your location…");
        navigator.geolocation.getCurrentPosition(
            pos => setPin({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)) }, "✓ Pinned where you are now"),
            () => setPin(state.pin, "Location permission was blocked."),
            { enableHighAccuracy: true, timeout: 10000 }
        );
    }

    function clearFieldErrors() {
        $$(".field-error").forEach(node => node.remove());
        $$("#meetupForm [aria-invalid='true']").forEach(field => field.removeAttribute("aria-invalid"));
    }

    function fieldError(fieldId, message) {
        const field = $("#" + fieldId);
        field.setAttribute("aria-invalid", "true");
        const error = document.createElement("small");
        error.className = "field-error";
        error.setAttribute("role", "alert");
        error.textContent = message;
        field.insertAdjacentElement("afterend", error);
        return { error: message };
    }

    function readForm() {
        const title = $("#mTitle").value.trim();
        const description = $("#mDescription").value.trim();
        const venue = $("#mVenue").value.trim();
        const capacity = Number($("#mCapacity").value);
        const date = $("#mDate").value;
        const startTime = $("#mStart").value;
        const endTime = $("#mEnd").value;

        clearFieldErrors();
        if (!title) return fieldError("mTitle", "Give your meetup a title.");
        if (title.length > 120) return fieldError("mTitle", "Use 120 characters or fewer.");
        if (!venue) return fieldError("mVenue", "Add the venue so people know where to go.");
        if (venue.length > 200) return fieldError("mVenue", "Use 200 characters or fewer.");
        if (description.length > 2000) return fieldError("mDescription", "Use 2,000 characters or fewer.");
        if (!date) return fieldError("mDate", "Choose a date.");
        if (!startTime) return fieldError("mStart", "Choose a start time.");
        if (!Number.isInteger(capacity) || capacity < 1 || capacity > 500) return fieldError("mCapacity", "Max people must be between 1 and 500.");

        const start = new Date(`${date}T${startTime}`);
        if (isNaN(start)) return fieldError("mStart", "That date or time doesn't look right.");
        if (start <= new Date()) return fieldError("mStart", "The start time must be in the future.");

        let end = null;
        if (endTime) {
            end = new Date(`${date}T${endTime}`);
            if (end <= start) return fieldError("mEnd", "The end time must be after the start time.");
        }

        if (state.editing) {
            const going = state.counts[state.editing.id] || 0;
            if (capacity < going) return fieldError("mCapacity", `${going} people are already going — max people cannot be lower than that.`);
        }

        return {
            row: {
                title,
                description: description || null,
                category: $("#mCategory").value,
                venue,
                capacity,
                starts_at: start.toISOString(),
                ends_at: end ? end.toISOString() : null,
                latitude: state.pin ? state.pin.lat : null,
                longitude: state.pin ? state.pin.lng : null
            }
        };
    }

    async function saveMeetup(event) {
        event.preventDefault();
        const errorBox = $("#formError");
        const { row, error } = readForm();
        if (error) {
            errorBox.textContent = $("#meetupForm [aria-invalid='true']") ? "" : error;
            return;
        }
        errorBox.textContent = "";
        const button = $("#saveMeetup");
        button.disabled = true;
        button.textContent = "Saving…";

        // Not pinned yet? Try the address once so distances work.
        if (!state.pin) {
            try {
                const found = await geocode(row.venue);
                if (found) {
                    row.latitude = found.lat;
                    row.longitude = found.lng;
                }
            } catch (e) { /* publish without a map pin */ }
        }

        let result;
        if (state.editing) {
            result = await supabaseClient.from("meetups").update(row)
                .eq("id", state.editing.id).eq("created_by", state.user.id).select(HN.MEETUP_COLUMNS).single();
        } else {
            result = await supabaseClient.from("meetups").insert({ ...row, created_by: state.user.id })
                .select(HN.MEETUP_COLUMNS).single();
        }

        button.disabled = false;
        button.textContent = state.editing ? "Save changes" : "Publish meetup";

        if (result.error) {
            console.error("Save meetup:", result.error);
            errorBox.textContent = friendlyError(result.error, "Couldn't save the meetup. Please try again.");
            return;
        }

        const saved = result.data;
        state.meetups = state.meetups.filter(m => m.id !== saved.id).concat(saved);
        state.hosts[state.user.id] = state.profile.full_name || "You";
        if (!(saved.id in state.counts)) state.counts[saved.id] = 0;

        const wasEditing = !!state.editing;
        $("#hostModal").classList.remove("show");
        if (!wasEditing) setView("hosting");
        render();
        toast(wasEditing
            ? "Meetup updated."
            : saved.latitude == null ? "Meetup published! (It isn't on the map, so it shows under “Any distance”.)" : "Meetup published!");
        openMeetup(saved.id);
    }

    /* ---------------- controls ---------------- */

    function setView(view) {
        state.view = view;
        $$("#meetupTabs .tab").forEach(tab => tab.classList.toggle("active", tab.dataset.view === view));
        $(".meetup-selects").style.visibility = view === "upcoming" ? "" : "hidden";
    }

    function useDeviceLocation() {
        if (!navigator.geolocation) return toast("Your browser can't share location.");
        $("#locationStatus").textContent = "Getting your location…";
        navigator.geolocation.getCurrentPosition(
            pos => {
                state.origin = { lat: pos.coords.latitude, lng: pos.coords.longitude, label: "near where you are now" };
                state.sort = "nearest";
                $("#sortSelect").value = "nearest";
                showLocationStatus();
                render();
            },
            () => {
                showLocationStatus();
                toast("Location permission was blocked — you can allow it in your browser settings.");
            },
            { timeout: 10000 }
        );
    }

    function bindEvents() {
        $("#meetupFilters").addEventListener("click", event => {
            const button = event.target.closest(".meetup-filter");
            if (!button) return;
            $$(".meetup-filter").forEach(b => b.classList.toggle("active", b === button));
            state.category = button.dataset.category;
            render();
        });

        $("#meetupTabs").addEventListener("click", event => {
            const tab = event.target.closest(".tab");
            if (!tab) return;
            setView(tab.dataset.view);
            render();
        });

        $("#radiusSelect").addEventListener("change", event => {
            state.radius = event.target.value ? Number(event.target.value) : null;
            render();
        });

        $("#sortSelect").addEventListener("change", event => {
            state.sort = event.target.value;
            render();
        });

        const search = $(".topbar .search input");
        if (search) search.addEventListener("input", () => {
            state.search = search.value.trim();
            render();
        });

        $("#meetupGrid").addEventListener("click", event => {
            if (event.target.closest("[data-show-all]")) {
                $("#radiusSelect").value = "";
                state.radius = null;
                return render();
            }
            const target = event.target.closest("[data-id]");
            if (target) openMeetup(target.dataset.id);
        });

        $("#meetupGrid").addEventListener("keydown", event => {
            if (event.key === "Enter" && event.target.matches(".meetup-card")) openMeetup(event.target.dataset.id);
        });

        $("#modalActions").addEventListener("click", event => {
            const button = event.target.closest("[data-action]");
            const meetup = current();
            if (!button || !meetup) return;
            const action = button.dataset.action;
            if (action === "join") join(meetup, button);
            if (action === "leave") leave(meetup, button);
            if (action === "cancel") cancel(meetup, button);
            if (action === "edit") openForm(meetup);
        });

        $$(".meetup-modal").forEach(modal => modal.addEventListener("click", event => {
            if (event.target === modal || event.target.closest("[data-close-modal]")) closeModals();
        }));

        document.addEventListener("keydown", event => {
            if (event.key === "Escape") closeModals();
        });

        $("#useLocation").addEventListener("click", useDeviceLocation);
        $("#hostMeetup").addEventListener("click", () => openForm());
        $("#findVenue").addEventListener("click", findVenue);
        $("#pinHere").addEventListener("click", pinHere);
        $("#mVenue").addEventListener("input", () => { if (state.pin) setPin(null); });
        $("#meetupForm").addEventListener("submit", saveMeetup);
    }

    /* ---------------- start ---------------- */

    async function init() {
        const { user, profile } = await window.nsReady;
        state.user = user;
        state.profile = profile;
        if (profile.role === "educator") HN.educatorSidebar();

        $("#mCategory").innerHTML = Object.entries(HN.MEETUP_CATEGORIES)
            .map(([key, meta]) => `<option value="${key}">${esc(meta.label)}</option>`).join("");
        renderFilters();
        bindEvents();

        await loadLocation();
        const ok = await loadMeetups();
        if (!ok) return;
        render();

        const params = new URLSearchParams(location.search);
        if (params.get("id")) openMeetup(params.get("id"));
        if (params.get("host") === "1") openForm();
    }

    init().catch(error => {
        console.error("Meetups page:", error);
        $("#meetupGrid").innerHTML = `<p class="meetup-loading">Something went wrong. Please refresh the page.</p>`;
    });
})();
