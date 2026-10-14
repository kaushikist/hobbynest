// Bumped with each release so the self-test can spot stale cached files.
window.HN_VERSION = 12;

// HobbyNest - shared course helpers (used by learner and educator pages)
// Exposes window.HN.

// Class images that fail to load (e.g. a removed YouTube thumbnail) switch to
// their category photo instead of showing a broken image.
document.addEventListener("error", event => {
    const img = event.target;
    if (img && img.tagName === "IMG" && img.dataset.fallback && img.src !== img.dataset.fallback) {
        img.src = img.dataset.fallback;
    }
}, true);

window.HN = (function () {
    "use strict";

    const CATEGORIES = {
        programming: { label: "Programming", emoji: "💻", img: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=1000&q=80" },
        dance: { label: "Dance", img: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=900&q=80" },
        music: { label: "Music", img: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80" },
        art: { label: "Art & Craft", img: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80" },
        photography: { label: "Photography", img: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?auto=format&fit=crop&w=900&q=80" },
        craft:       { label: "Craft & DIY", emoji: "🏺", img: "https://images.unsplash.com/photo-1452860606245-08befc0ff44b?auto=format&fit=crop&w=1000&q=80" },
        community: { label: "Community", img: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80" },
        other: { label: "Other", img: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=900&q=80" }
    };

    // Columns learners/educators need from courses (never select "*").
    const COURSE_COLUMNS =
        "id, educator_id, title, description, category, level, duration, fee, capacity, " +
        "location, schedule, teaching_format, certificate, thumbnail, published, created_at";

    // "Craft & DIY" -> "craft", "Programming" -> "programming"
    function categoryKey(category) {
        const key = String(category || "").toLowerCase().split(/[\s&]+/)[0];
        return CATEGORIES[key] ? key : "other";
    }

    function categoryMeta(category) {
        return CATEGORIES[categoryKey(category)];
    }

    // large = true for big headers. YouTube thumbnails: the 16:9 "mq" size for
    // cards (no black bars), the larger "hq" one for headers.
    function courseImage(course, large = false) {
        const url = safeUrl(course.thumbnail);
        if (!url) return categoryMeta(course.category).img;
        return large ? url : url.replace(/(\/\/i\.ytimg\.com\/vi\/[\w-]{11}\/)hqdefault\.jpg$/, "$1mqdefault.jpg");
    }

    // Only http(s) links may be used as link targets or images; anything else
    // (e.g. "javascript:") becomes an empty string.
    function safeUrl(url) {
        const value = String(url || "").trim();
        return /^https?:\/\/[^\s"'<>]+$/i.test(value) ? value : "";
    }

    function escapeHTML(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    function formatFee(fee) {
        const amount = Number(fee);
        if (!amount) return "Free";
        return "₹" + amount.toLocaleString("en-IN", { maximumFractionDigits: 2 });
    }

    const YOUTUBE_PATTERN = /^https?:\/\/([a-z0-9-]+\.)?(youtube\.com|youtu\.be)\//i;

    function isYouTubeUrl(url) {
        return YOUTUBE_PATTERN.test(String(url || "").trim());
    }

    // Supports watch?v=, youtu.be/, /embed/, /shorts/ and /live/ links.
    function youtubeId(url) {
        try {
            const parsed = new URL(String(url).trim());
            const host = parsed.hostname.replace(/^www\.|^m\./, "");
            if (host === "youtu.be") return parsed.pathname.slice(1).split("/")[0] || null;
            if (parsed.searchParams.get("v")) return parsed.searchParams.get("v");
            const match = parsed.pathname.match(/\/(embed|shorts|live|v)\/([^/?#]+)/);
            return match ? match[2] : null;
        } catch (error) {
            return null;
        }
    }

    function youtubeEmbedUrl(url) {
        const id = youtubeId(url);
        return id ? `https://www.youtube.com/embed/${encodeURIComponent(id)}?rel=0` : null;
    }

    // { educatorId: "Full Name" } for the given ids (only public profile columns).
    async function educatorNames(ids) {
        const unique = [...new Set(ids.filter(Boolean))];
        if (unique.length === 0) return {};
        const { data, error } = await supabaseClient
            .from("profiles")
            .select("id, full_name")
            .in("id", unique);
        if (error) {
            console.error("Educator names:", error);
            return {};
        }
        return Object.fromEntries(data.map(p => [p.id, p.full_name || "HobbyNest educator"]));
    }

    // Courses the current learner is enrolled in, newest first.
    async function myEnrolledCourses(userId) {
        const { data: enrollments, error } = await supabaseClient
            .from("enrollments")
            .select("course_id, enrolled_at")
            .eq("learner_id", userId)
            .order("enrolled_at", { ascending: false });
        if (error) throw error;
        if (!enrollments.length) return [];

        const ids = enrollments.map(e => e.course_id);
        const { data: courses, error: courseError } = await supabaseClient
            .from("courses")
            .select(COURSE_COLUMNS)
            .in("id", ids);
        if (courseError) throw courseError;

        const byId = Object.fromEntries(courses.map(c => [c.id, c]));
        return ids.map(id => byId[id]).filter(Boolean);
    }

    // Lesson progress for one learner across several courses.
    // Returns { byCourse: { [courseId]: { done, total, percent, next } }, completedDates: [...] }
    async function progressFor(userId, courseIds) {
        const byCourse = {};
        courseIds.forEach(id => { byCourse[id] = { done: 0, total: 0, percent: 0, next: null }; });
        if (!courseIds.length) return { byCourse, completedDates: [] };

        const { data: lessons, error } = await supabaseClient
            .from("lessons")
            .select("id, course_id, title, lesson_order")
            .in("course_id", courseIds)
            .order("lesson_order", { ascending: true });
        if (error) throw error;

        let doneRows = [];
        if (lessons.length) {
            const { data, error: progressError } = await supabaseClient
                .from("progress")
                .select("lesson_id, completed_at")
                .eq("learner_id", userId)
                .eq("completed", true)
                .in("lesson_id", lessons.map(l => l.id));
            if (progressError) throw progressError;
            doneRows = data || [];
        }

        const done = new Set(doneRows.map(r => r.lesson_id));
        lessons.forEach(lesson => {
            const entry = byCourse[lesson.course_id];
            if (!entry) return;
            entry.total += 1;
            if (done.has(lesson.id)) entry.done += 1;
            else if (!entry.next) entry.next = lesson;
        });
        Object.values(byCourse).forEach(entry => {
            entry.percent = entry.total ? Math.round((entry.done / entry.total) * 100) : 0;
        });

        return { byCourse, completedDates: doneRows.map(r => r.completed_at).filter(Boolean) };
    }

    function progressBar(progress, pink = false) {
        if (!progress || !progress.total) {
            return `<div class="progress-label"><span>No lessons yet</span><span></span></div>`;
        }
        return `
            <div class="progress-label">
                <span>${progress.percent === 100 ? "Completed 🎉" : `${progress.percent}% complete`}</span>
                <span>${progress.done}/${progress.total} lessons</span>
            </div>
            <div class="progress-bar">
                <div class="progress-fill ${pink ? "pink-fill" : ""}" style="width:${progress.percent}%"></div>
            </div>`;
    }

    // Upcoming live sessions this user can see (RLS: classes you're in, or general ones),
    // with class titles and educator names attached.
    async function upcomingSessions({ courseIds = null, educatorId = null, limit = 50 } = {}) {
        const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        let query = supabaseClient
            .from("sessions")
            .select("id, educator_id, course_id, title, description, session_date, meeting_link")
            .gte("session_date", since)
            .order("session_date", { ascending: true })
            .limit(limit);
        if (courseIds) query = query.in("course_id", courseIds);
        if (educatorId) query = query.eq("educator_id", educatorId);

        const { data, error } = await query;
        if (error) throw error;

        const courseIdsUsed = [...new Set(data.map(s => s.course_id).filter(Boolean))];
        let titles = {};
        if (courseIdsUsed.length) {
            const { data: courses } = await supabaseClient
                .from("courses").select("id, title").in("id", courseIdsUsed);
            titles = Object.fromEntries((courses || []).map(c => [c.id, c.title]));
        }
        const names = await educatorNames(data.map(s => s.educator_id));

        return data.map(s => ({
            ...s,
            meeting_link: safeUrl(s.meeting_link),
            courseTitle: s.course_id ? (titles[s.course_id] || "Class") : "Open to everyone",
            educatorName: names[s.educator_id] || "HobbyNest educator"
        }));
    }

    function sessionDateParts(value) {
        const date = new Date(value);
        return {
            weekday: date.toLocaleDateString("en-IN", { weekday: "short" }).toUpperCase(),
            day: date.getDate(),
            month: date.toLocaleDateString("en-IN", { month: "short" }).toUpperCase(),
            time: date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }),
            full: date.toLocaleString("en-IN", { weekday: "long", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })
        };
    }

    /* ---------------- photos (Supabase Storage) ---------------- */

    const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"];

    // Uploads an image into <bucket>/<user id>/... and returns its public URL.
    // bucket: "avatars" (max 2 MB) or "course-images" (max 5 MB).
    async function uploadImage(bucket, file) {
        const maxMb = bucket === "avatars" ? 2 : 5;
        if (!file) throw new Error("Please choose an image.");
        if (!IMAGE_TYPES.includes(file.type)) throw new Error("Please use a JPG, PNG or WebP image.");
        if (file.size > maxMb * 1024 * 1024) throw new Error(`Please use an image smaller than ${maxMb} MB.`);

        const { data: { user } } = await supabaseClient.auth.getUser();
        if (!user) throw new Error("Your session has expired. Please log in again.");

        const ext = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" }[file.type];
        const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;

        const { error } = await supabaseClient.storage
            .from(bucket)
            .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
        if (error) {
            console.error("Upload error:", error);
            throw new Error(/bucket not found/i.test(error.message || "")
                ? "Photo storage isn't set up yet — run the latest database.sql in Supabase."
                : `Upload failed: ${error.message}`);
        }
        return supabaseClient.storage.from(bucket).getPublicUrl(path).data.publicUrl;
    }

    // A simple round avatar with initials, for people without a photo.
    function initialsAvatar(name) {
        const letters = String(name || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0] || "").join("").toUpperCase() || "?";
        const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="40" fill="#eef5ff"/><text x="50%" y="54%" font-family="Arial" font-size="30" font-weight="700" fill="#1558c0" text-anchor="middle" dominant-baseline="middle">${letters.replace(/[<&>]/g, "")}</text></svg>`;
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    /* ---------------- ratings ---------------- */

    // { courseId: { avg: 4.3, count: 12 } }
    async function ratingsFor(courseIds) {
        if (!courseIds.length) return {};
        const { data, error } = await supabaseClient
            .from("reviews")
            .select("course_id, rating")
            .in("course_id", courseIds);
        if (error) {
            console.error("Ratings:", error);
            return {};
        }
        const sums = {};
        data.forEach(r => {
            const entry = (sums[r.course_id] ||= { total: 0, count: 0 });
            entry.total += r.rating;
            entry.count += 1;
        });
        return Object.fromEntries(Object.entries(sums).map(([id, e]) =>
            [id, { avg: Math.round((e.total / e.count) * 10) / 10, count: e.count }]));
    }

    function ratingText(rating) {
        if (!rating || !rating.count) return "New";
        return `⭐ ${rating.avg.toFixed(1)} (${rating.count})`;
    }

    function stars(value) {
        const full = Math.round(value);
        return "★★★★★".slice(0, full) + "☆☆☆☆☆".slice(0, 5 - full);
    }

    function courseUrl(id, fromInstructor = false) {
        return `${fromInstructor ? "../user/" : ""}course.html?id=${encodeURIComponent(id)}`;
    }

    // Card used on the learner dashboard and My Courses.
    function learnerCourseCard(course, educatorName, progress) {
        const meta = categoryMeta(course.category);
        const footer = progress && progress.percent === 100 ? "Review class" : progress && progress.done ? "Continue learning" : "Start learning";
        return `
            <article class="card" data-search="${escapeHTML(course.title + " " + (course.category || ""))}"
                onclick="window.location.href='${courseUrl(course.id)}'">
                <img src="${escapeHTML(courseImage(course))}" data-fallback="${escapeHTML(categoryMeta(course.category).img)}" alt="" loading="lazy">
                <div class="card-body">
                    <span class="tag ${meta === CATEGORIES.programming ? "" : "pink"}">${escapeHTML(meta.label)}</span>
                    <h3>${escapeHTML(course.title)}</h3>
                    <p>By ${escapeHTML(educatorName || "HobbyNest educator")}</p>
                    ${course.published ? "" : `<p class="muted">This class is currently unpublished.</p>`}
                    ${progress ? progressBar(progress, meta !== CATEGORIES.programming) : ""}
                    <div class="card-footer">
                        <span>${progress ? footer : "Continue learning"}</span>
                        <span>→</span>
                    </div>
                </div>
            </article>`;
    }


    /* ---------------- meetups ---------------- */

    const MEETUP_CATEGORIES = {
        dance: { label: "Dance", img: "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?auto=format&fit=crop&w=900&q=80" },
        art: { label: "Art & Craft", img: "https://images.unsplash.com/photo-1513364776144-60967b0f800f?auto=format&fit=crop&w=900&q=80" },
        music: { label: "Music", img: "https://images.unsplash.com/photo-1516280440614-37939bbacd81?auto=format&fit=crop&w=900&q=80" },
        photography: { label: "Photography", img: "https://images.unsplash.com/photo-1452587925148-ce544e77e70d?auto=format&fit=crop&w=900&q=80" },
        community: { label: "Community", img: "https://images.unsplash.com/photo-1529156069898-49953e39b3ac?auto=format&fit=crop&w=900&q=80" },
        theatre: { label: "Theatre", img: "https://images.unsplash.com/photo-1507676184212-d03ab07a01bf?auto=format&fit=crop&w=900&q=80" },
        sports: { label: "Sports & Fitness", img: "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=900&q=80" },
        other: { label: "Other", img: "https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=900&q=80" }
    };

    const MEETUP_COLUMNS =
        "id, created_by, title, description, category, venue, latitude, longitude, starts_at, ends_at, capacity, created_at";

    function meetupMeta(category) {
        return MEETUP_CATEGORIES[category] || MEETUP_CATEGORIES.other;
    }

    // Straight-line distance in km between two points (haversine).
    function distanceKm(lat1, lon1, lat2, lon2) {
        if ([lat1, lon1, lat2, lon2].some(v => v == null || v === "" || isNaN(v))) return null;
        const rad = x => (Number(x) * Math.PI) / 180;
        const dLat = rad(lat2 - lat1);
        const dLon = rad(lon2 - lon1);
        const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
        return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    }

    function formatDistance(km) {
        if (km == null) return "";
        if (km < 1) return `${Math.max(Math.round(km * 1000 / 50) * 50, 50)} m away`;
        return `${km < 10 ? km.toFixed(1) : Math.round(km)} km away`;
    }

    // { date: "Sat, 12 Oct", time: "4:00 pm – 6:00 pm" }
    function meetupWhen(meetup) {
        const start = new Date(meetup.starts_at);
        const date = start.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
        const clock = d => d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
        let time = clock(start);
        if (meetup.ends_at) {
            const end = new Date(meetup.ends_at);
            time += end.toDateString() === start.toDateString()
                ? ` – ${clock(end)}`
                : ` – ${end.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}, ${clock(end)}`;
        }
        return { date, time };
    }

    /* ---------------- educator navigation on shared pages ---------------- */

    // Meetups and Messages are shared by both roles. For educators, swap the
    // learner sidebar for teaching links so they never land on learner pages.
    function educatorSidebar() {
        const sidebar = document.querySelector(".sidebar");
        if (!sidebar || sidebar.dataset.educatorNav) return;
        sidebar.dataset.educatorNav = "1";
        const page = location.pathname.split("/").pop();
        const link = (href, icon, label) =>
            `<a href="${href}" class="nav-item${href.endsWith(page) ? " active" : ""}"><span class="nav-icon">${icon}</span>${label}</a>`;
        sidebar.querySelectorAll("a.nav-item, .nav-title").forEach(el => el.remove());
        sidebar.querySelector(".logo").insertAdjacentHTML("afterend", `
            <div class="nav-title">TEACH</div>
            ${link("../instructor/instructor-dashboard.html", "⌂", "Dashboard")}
            ${link("../instructor/instructor-dashboard.html#classes", "▣", "My Classes")}
            ${link("../instructor/instructor-dashboard.html#students", "◎", "Students")}
            ${link("../instructor/add-class.html", "＋", "Add New Class")}
            <div class="nav-title" style="margin-top:30px">COMMUNITY</div>
            ${link("./nearby-meetups.html", "⌖", "Nearby Meetups")}
            ${link("./messages.html", "✉", "Messages")}
            ${link("../instructor/instructor-dashboard.html#settings", "⚙", "Settings")}`);
        const note = sidebar.querySelector(".sidebar-note");
        if (note) note.innerHTML = "<small>TEACH • CREATE • INSPIRE</small><strong>Build classes learners want to come back to.</strong>";
        if (window.nsRefreshUnread) window.nsRefreshUnread();
    }

    return {
        CATEGORIES,
        COURSE_COLUMNS,
        categoryKey,
        categoryMeta,
        courseImage,
        safeUrl,
        escapeHTML,
        formatFee,
        isYouTubeUrl,
        youtubeId,
        youtubeEmbedUrl,
        educatorNames,
        myEnrolledCourses,
        progressFor,
        progressBar,
        upcomingSessions,
        sessionDateParts,
        uploadImage,
        initialsAvatar,
        ratingsFor,
        ratingText,
        stars,
        courseUrl,
        learnerCourseCard,
        MEETUP_CATEGORIES,
        MEETUP_COLUMNS,
        meetupMeta,
        distanceKm,
        formatDistance,
        meetupWhen,
        educatorSidebar
    };
})();
