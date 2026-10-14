// HobbyNest - class details page (screens/user/course.html?id=123)
// Shows a class, its lessons and YouTube lectures, live sessions,
// and lets learners enroll, save the class and tick off lessons.

(function () {
    "use strict";

    const page = document.getElementById("coursePage");
    const courseId = Number(new URLSearchParams(window.location.search).get("id"));
    const esc = HN.escapeHTML;

    let state = {
        user: null,
        profile: null,
        course: null,
        educatorName: "",
        lessons: [],
        lectures: [],
        sessions: [],
        completed: new Set(),   // lesson ids this learner finished
        enrolled: false,
        saved: false,
        seatsTaken: null,
        playingId: null,
        reviews: [],          // { id, learner_id, rating, comment, created_at, name }
        draftRating: 0
    };

    const isOwner = () => state.course && state.course.educator_id === state.user.id;
    const isLearner = () => state.profile && state.profile.role !== "educator";

    function showMessage(title, text) {
        const back = state.profile?.role === "educator"
            ? `<a class="btn" href="../instructor/instructor-dashboard.html">Back to dashboard</a>`
            : `<a class="btn" href="./explore.html">Explore classes</a>`;
        page.innerHTML = `
            <div class="empty show" style="margin-top:40px">
                <h2 style="margin-bottom:10px">${esc(title)}</h2>
                <p style="margin-bottom:18px">${esc(text)}</p>
                ${back}
            </div>`;
    }

    // Educators previewing a class get their own navigation in the sidebar.
    function useEducatorSidebar() {
        const sidebar = document.querySelector(".sidebar");
        if (!sidebar) return;
        sidebar.querySelectorAll("a.nav-item").forEach(link => link.remove());
        const title = sidebar.querySelector(".nav-title");
        if (title) {
            title.textContent = "TEACH";
            title.insertAdjacentHTML("afterend", `
                <a href="../instructor/instructor-dashboard.html" class="nav-item"><span class="nav-icon">⌂</span>Dashboard</a>
                <a href="../instructor/add-class.html" class="nav-item"><span class="nav-icon">＋</span>Add class</a>`);
        }
    }

    function progress() {
        const total = state.lessons.length;
        const done = state.lessons.filter(l => state.completed.has(l.id)).length;
        return { total, done, percent: total ? Math.round((done / total) * 100) : 0 };
    }

    function formatSessionDate(value) {
        const date = new Date(value);
        return date.toLocaleString("en-IN", {
            weekday: "short", day: "numeric", month: "short",
            hour: "numeric", minute: "2-digit"
        });
    }

    function seatsText() {
        const { course, seatsTaken } = state;
        if (seatsTaken == null || !course.capacity) return "";
        const left = Math.max(course.capacity - seatsTaken, 0);
        return left === 0 ? "This class is full" : `${left} of ${course.capacity} seats left`;
    }

    function sidePanel() {
        const { course, enrolled, profile } = state;
        const full = state.seatsTaken != null && course.capacity && state.seatsTaken >= course.capacity;

        let action;
        if (isOwner()) {
            action = `
                <div class="notice">This is your class — you're seeing it the way learners do.</div>
                <a class="btn" href="../instructor/edit-class.html?id=${course.id}">Edit class</a>`;
        } else if (profile.role === "educator") {
            action = `<div class="notice">Switch to a learner account to join classes.</div>`;
        } else if (enrolled) {
            const p = progress();
            action = `
                ${p.total ? `<div style="margin-top:14px">${HN.progressBar(p)}</div>` : ""}
                <button class="btn" type="button" id="startLearning">
                    ${p.percent === 100 ? "🎉 Class completed — review" : p.done ? "Continue learning" : "✓ Enrolled — start learning"}
                </button>
                <a class="btn ghost" style="margin-top:10px" href="./messages.html?to=${encodeURIComponent(course.educator_id)}">✉ Message the educator</a>
                <button class="link-button" type="button" id="leaveCourse">Leave this class</button>`;
        } else if (!course.published) {
            action = `<div class="notice">This class isn't open for new learners right now.</div>`;
        } else if (full) {
            action = `<button class="btn" type="button" disabled>Class full</button>`;
        } else {
            action = `<button class="btn" type="button" id="enrollButton">Enroll in this class →</button>`;
        }

        const saveButton = isLearner() && !isOwner()
            ? `<button class="btn ghost" type="button" id="saveToggle" style="margin-top:10px">
                    ${state.saved ? "♥ Saved" : "♡ Save for later"}
               </button>`
            : "";

        return `
            <aside class="panel course-side">
                <small class="muted">Class fee</small>
                <div class="course-price">${HN.formatFee(course.fee)}</div>
                <div class="seats" id="seatsText">${esc(seatsText())}</div>
                ${action}
                ${saveButton}
            </aside>`;
    }

    function lessonsHTML() {
        if (!state.lessons.length) {
            return `<p class="muted">The educator hasn't added lessons yet.</p>`;
        }
        const canTrack = state.enrolled && isLearner();
        return `
            ${canTrack ? `<p class="muted" style="margin:-6px 0 12px">Tick a lesson when you've finished it.</p>` : ""}
            <div class="lesson-list">${state.lessons.map((lesson, index) => {
                const done = state.completed.has(lesson.id);
                return `
                <div class="lesson ${done ? "done" : ""}" style="cursor:${canTrack ? "pointer" : "default"}"
                    ${canTrack ? `data-toggle-lesson="${lesson.id}" role="checkbox" aria-checked="${done}" tabindex="0"` : ""}>
                    <span class="check">${done ? "✓" : index + 1}</span>
                    <div class="lesson-text">
                        <strong>${esc(lesson.title)}</strong>
                        ${lesson.description ? `<span>${esc(lesson.description)}</span>` : ""}
                    </div>
                    ${lesson.duration ? `<small>${esc(lesson.duration)}</small>` : ""}
                </div>`;
            }).join("")}</div>`;
    }

    function lecturesHTML() {
        const { lectures, enrolled } = state;
        const fullAccess = enrolled || isOwner();

        if (!lectures.length) {
            return `<p class="muted">No recorded lectures yet.</p>`;
        }

        const playing = lectures.find(l => l.id === state.playingId) || lectures[0];
        const embed = HN.youtubeEmbedUrl(playing.youtube_url);

        return `
            <div class="video-wrap">
                ${embed
                    ? `<iframe id="lecturePlayer" src="${esc(embed)}" title="${esc(playing.title)}"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                        allowfullscreen></iframe>`
                    : `<p style="color:#fff;padding:40px;text-align:center">This video link can't be played here.</p>`}
            </div>
            <div class="lesson-list">${lectures.map((lecture, index) => `
                <div class="lesson lecture ${lecture.id === playing.id ? "playing" : ""}"
                    data-lecture="${lecture.id}" role="button" tabindex="0">
                    <span class="check">▶</span>
                    <div class="lesson-text">
                        <strong>${esc(lecture.title)}</strong>
                        ${!fullAccess && index === 0 ? `<span>Free preview</span>` : ""}
                    </div>
                    ${lecture.duration ? `<small>${esc(lecture.duration)}</small>` : ""}
                </div>`).join("")}
                ${fullAccess ? "" : `
                <div class="lesson lecture locked">
                    <span class="check">🔒</span>
                    <div class="lesson-text">
                        <strong>More lectures</strong>
                        <span>Enroll to unlock every recorded lecture in this class.</span>
                    </div>
                </div>`}
            </div>`;
    }

    function sessionsHTML() {
        if (!(state.enrolled || isOwner())) return "";
        const upcoming = state.sessions;
        return `
            <section class="course-section">
                <h2>Live sessions</h2>
                ${upcoming.length ? upcoming.map(session => `
                    <div class="schedule-card">
                        <div class="schedule-main">
                            <div>
                                <h3>${esc(session.title)}</h3>
                                <p class="muted">${esc(formatSessionDate(session.session_date))}${session.description ? " · " + esc(session.description) : ""}</p>
                            </div>
                        </div>
                        ${HN.safeUrl(session.meeting_link)
                            ? `<a class="btn" href="${esc(HN.safeUrl(session.meeting_link))}" target="_blank" rel="noopener">Join →</a>`
                            : `<span class="muted">Link coming soon</span>`}
                    </div>`).join("")
                    : `<p class="muted">No live sessions scheduled for this class yet.</p>`}
            </section>`;
    }

    function myReview() {
        return state.reviews.find(r => r.learner_id === state.user.id) || null;
    }

    function ratingSummary() {
        const count = state.reviews.length;
        if (!count) return { avg: 0, count: 0 };
        const avg = state.reviews.reduce((sum, r) => sum + r.rating, 0) / count;
        return { avg: Math.round(avg * 10) / 10, count };
    }

    function reviewsHTML() {
        const summary = ratingSummary();
        const mine = myReview();
        const canReview = state.enrolled && isLearner() && !isOwner();
        const draft = state.draftRating || (mine ? mine.rating : 0);

        const form = canReview ? `
            <div class="panel" style="margin-bottom:16px">
                <strong>${mine ? "Your review" : "Rate this class"}</strong>
                <div id="starPicker" role="radiogroup" aria-label="Rating" style="font-size:28px;margin:8px 0;cursor:pointer;user-select:none">
                    ${[1, 2, 3, 4, 5].map(n => `<span data-star="${n}" role="radio" aria-checked="${n === draft}" tabindex="0"
                        style="color:${n <= draft ? "#f5a623" : "#d5dbe5"}">★</span>`).join("")}
                </div>
                <textarea id="reviewComment" rows="3" maxlength="1000" placeholder="What did you like? (optional)"
                    style="width:100%;border:1px solid #dfe4eb;padding:10px;font:inherit">${esc(mine?.comment || "")}</textarea>
                <div style="display:flex;gap:10px;align-items:center;margin-top:10px">
                    <button class="btn" type="button" id="saveReview">${mine ? "Update review" : "Post review"}</button>
                    ${mine ? `<button class="link-button" type="button" id="deleteReview" style="margin:0">Delete my review</button>` : ""}
                </div>
            </div>` : (isLearner() && !state.enrolled
                ? `<p class="muted" style="margin-bottom:14px">Enroll in this class to leave a review.</p>` : "");

        const list = state.reviews.length
            ? state.reviews.map(r => `
                <div class="lesson" style="cursor:default;align-items:flex-start">
                    <img src="${esc(HN.initialsAvatar(r.name))}" alt="" style="width:34px;height:34px;border-radius:50%">
                    <div class="lesson-text">
                        <strong>${esc(r.name)} <span style="color:#f5a623;font-weight:400">${HN.stars(r.rating)}</span></strong>
                        ${r.comment ? `<span style="white-space:pre-line">${esc(r.comment)}</span>` : ""}
                    </div>
                    <small>${esc(new Date(r.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }))}</small>
                </div>`).join("")
            : `<p class="muted">No reviews yet${canReview ? " — be the first!" : "."}</p>`;

        return `
            <section class="course-section" id="reviewsSection">
                <h2>Reviews ${summary.count ? `<span style="font-size:16px;color:#687386">· ⭐ ${summary.avg.toFixed(1)} (${summary.count})</span>` : ""}</h2>
                ${form}
                <div class="lesson-list">${list}</div>
            </section>`;
    }

    function render() {
        const { course } = state;
        const meta = HN.categoryMeta(course.category);
        document.title = `${course.title} | HobbyNest`;

        const details = [
            ["Level", course.level],
            ["Duration", course.duration],
            ["Format", course.teaching_format],
            ["Schedule", course.schedule],
            ["Location", course.location],
            ["Certificate", course.certificate ? "Certificate included" : "No certificate"]
        ].filter(([, value]) => value);

        const p = progress();

        page.innerHTML = `
            <a class="course-back" href="${state.profile.role === "educator"
                ? "../instructor/instructor-dashboard.html"
                : "./explore.html"}">← Back</a>

            <div class="course-hero">
                <img src="${esc(HN.courseImage(course, true))}" data-fallback="${esc(HN.categoryMeta(course.category).img)}" alt="">
                <div class="overlay">
                    <span class="tag">${esc(meta.label)}</span>
                    <h1>${esc(course.title)}</h1>
                    <p>By ${esc(state.educatorName)}${ratingSummary().count ? ` · ⭐ ${ratingSummary().avg.toFixed(1)} (${ratingSummary().count} review${ratingSummary().count === 1 ? "" : "s"})` : ""}</p>
                </div>
            </div>

            ${course.published ? "" : `<div class="notice">This class is unpublished, so new learners can't find it.</div>`}
            ${state.enrolled && p.total && p.percent === 100
                ? `<div class="notice" style="background:#eaf8f3;border-color:#bfe6d6;color:#21805e">🎉 You've completed every lesson in this class. Well done!</div>`
                : ""}

            <div class="course-layout">
                <div>
                    ${course.description ? `<p class="course-desc">${esc(course.description)}</p>` : ""}

                    <div class="detail-grid">
                        ${details.map(([label, value]) => `
                            <div class="detail"><small>${esc(label)}</small><strong>${esc(value)}</strong></div>`).join("")}
                    </div>

                    <section class="course-section" id="lecturesSection">
                        <h2>Recorded lectures</h2>
                        <div id="lecturesArea">${lecturesHTML()}</div>
                    </section>

                    <section class="course-section" id="curriculumSection">
                        <h2>Curriculum</h2>
                        ${lessonsHTML()}
                    </section>

                    ${sessionsHTML()}

                    ${reviewsHTML()}
                </div>
                <div id="sideArea">${sidePanel()}</div>
            </div>`;

        bindEvents();
    }

    function bindEvents() {
        document.getElementById("enrollButton")?.addEventListener("click", enroll);
        document.getElementById("leaveCourse")?.addEventListener("click", leave);
        document.getElementById("saveToggle")?.addEventListener("click", toggleSave);
        document.getElementById("startLearning")?.addEventListener("click", () => {
            const target = progress().done ? "curriculumSection" : "lecturesSection";
            document.getElementById(target).scrollIntoView({ behavior: "smooth" });
        });

        document.querySelectorAll("[data-lecture]").forEach(row => {
            const play = () => {
                state.playingId = Number(row.dataset.lecture);
                document.getElementById("lecturesArea").innerHTML = lecturesHTML();
                bindEvents();
            };
            row.addEventListener("click", play);
            row.addEventListener("keydown", event => { if (event.key === "Enter") play(); });
        });

        document.querySelectorAll("[data-star]").forEach(star => {
            const pick = () => {
                state.draftRating = Number(star.dataset.star);
                const comment = document.getElementById("reviewComment")?.value;
                document.getElementById("reviewsSection").outerHTML = reviewsHTML();
                if (comment != null) document.getElementById("reviewComment").value = comment;
                bindEvents();
            };
            star.addEventListener("click", pick);
            star.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); pick(); } });
        });
        document.getElementById("saveReview")?.addEventListener("click", saveReview);
        document.getElementById("deleteReview")?.addEventListener("click", deleteReview);

        document.querySelectorAll("[data-toggle-lesson]").forEach(row => {
            const toggle = () => toggleLesson(Number(row.dataset.toggleLesson));
            row.addEventListener("click", toggle);
            row.addEventListener("keydown", event => {
                if (event.key === "Enter" || event.key === " ") { event.preventDefault(); toggle(); }
            });
        });
    }

    async function toggleLesson(lessonId) {
        const wasDone = state.completed.has(lessonId);

        // Update the page straight away, undo if the database says no.
        if (wasDone) state.completed.delete(lessonId); else state.completed.add(lessonId);
        render();

        const request = wasDone
            ? supabaseClient.from("progress").delete()
                .eq("learner_id", state.user.id).eq("lesson_id", lessonId)
            : supabaseClient.from("progress").insert({
                learner_id: state.user.id,
                lesson_id: lessonId,
                completed: true,
                completed_at: new Date().toISOString()
            });

        const { error } = await request;

        if (error && error.code !== "23505") {
            console.error("Progress error:", error);
            if (wasDone) state.completed.add(lessonId); else state.completed.delete(lessonId);
            render();
            toast("Couldn't save your progress. Please try again.");
            return;
        }

        const p = progress();
        if (!wasDone && p.percent === 100) toast("🎉 Class completed! Amazing work.");
    }

    async function loadReviews() {
        const { data, error } = await supabaseClient
            .from("reviews")
            .select("id, learner_id, rating, comment, created_at")
            .eq("course_id", courseId)
            .order("created_at", { ascending: false });
        if (error) {
            console.error("Reviews:", error);
            state.reviews = [];
            return;
        }
        const names = await HN.educatorNames(data.map(r => r.learner_id));
        state.reviews = data.map(r => ({ ...r, name: names[r.learner_id] || "Learner" }));
    }

    async function saveReview() {
        const mine = myReview();
        const rating = state.draftRating || (mine ? mine.rating : 0);
        if (!rating) return toast("Tap the stars to choose a rating first.");

        const comment = document.getElementById("reviewComment").value.trim() || null;
        const button = document.getElementById("saveReview");
        button.disabled = true;

        const { error } = mine
            ? await supabaseClient.from("reviews").update({ rating, comment }).eq("id", mine.id)
            : await supabaseClient.from("reviews").insert({ learner_id: state.user.id, course_id: courseId, rating, comment });

        if (error) {
            console.error("Review error:", error);
            button.disabled = false;
            return toast("Couldn't save your review. Please try again.");
        }

        state.draftRating = 0;
        await loadReviews();
        render();
        toast(mine ? "Review updated ✓" : "Thanks for your review! ⭐");
    }

    async function deleteReview() {
        const mine = myReview();
        if (!mine || !confirm("Delete your review?")) return;
        const { error } = await supabaseClient.from("reviews").delete().eq("id", mine.id);
        if (error) {
            console.error("Delete review error:", error);
            return toast("Couldn't delete your review.");
        }
        state.draftRating = 0;
        await loadReviews();
        render();
        toast("Review deleted");
    }

    async function toggleSave() {
        const button = document.getElementById("saveToggle");
        button.disabled = true;

        const { error } = state.saved
            ? await supabaseClient.from("saved_courses").delete()
                .eq("learner_id", state.user.id).eq("course_id", courseId)
            : await supabaseClient.from("saved_courses")
                .insert({ learner_id: state.user.id, course_id: courseId });

        if (error && error.code !== "23505") {
            console.error("Save error:", error);
            toast("Couldn't update your saved classes. Please try again.");
            button.disabled = false;
            return;
        }

        state.saved = !state.saved;
        render();
        toast(state.saved ? "Saved — find it under Saved ♥" : "Removed from Saved");
    }

    async function loadLecturesAndSeats() {
        const [lectures, seats] = await Promise.all([
            supabaseClient
                .from("course_lectures")
                .select("id, title, youtube_url, duration, lecture_order")
                .eq("course_id", courseId)
                .order("lecture_order", { ascending: true }),
            supabaseClient.rpc("enrollment_count", { p_course_id: courseId })
        ]);
        if (lectures.error) console.error("Lectures:", lectures.error);
        state.lectures = lectures.data || [];
        state.seatsTaken = seats.error ? null : seats.data;
    }

    // Progress and live sessions only matter once you're in the class.
    async function loadMemberData() {
        if (!(state.enrolled || isOwner())) {
            state.completed = new Set();
            state.sessions = [];
            return;
        }

        const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
        const [sessions, done] = await Promise.all([
            supabaseClient
                .from("sessions")
                .select("id, title, description, session_date, meeting_link")
                .eq("course_id", courseId)
                .gte("session_date", since)
                .order("session_date", { ascending: true }),
            state.enrolled && state.lessons.length
                ? supabaseClient
                    .from("progress")
                    .select("lesson_id")
                    .eq("learner_id", state.user.id)
                    .eq("completed", true)
                    .in("lesson_id", state.lessons.map(l => l.id))
                : Promise.resolve({ data: [] })
        ]);

        state.sessions = sessions.data || [];
        state.completed = new Set((done.data || []).map(r => r.lesson_id));
    }

    async function enroll() {
        const button = document.getElementById("enrollButton");
        button.disabled = true;
        button.textContent = "Enrolling…";

        const { error } = await supabaseClient
            .from("enrollments")
            .insert({ learner_id: state.user.id, course_id: courseId });

        // 23505 = already enrolled (e.g. clicked twice) — treat as success.
        if (error && error.code !== "23505") {
            console.error("Enroll error:", error);
            toast(/full/i.test(error.message) ? "Sorry, this class is full." : "Couldn't enroll. Please try again.");
            button.disabled = false;
            button.textContent = "Enroll in this class →";
            return;
        }

        state.enrolled = true;
        await Promise.all([loadLecturesAndSeats(), loadMemberData()]);
        render();
        toast("You're enrolled! 🎉 All lectures are unlocked.");
    }

    async function leave() {
        if (!confirm("Leave this class? You can enroll again later if there are seats.")) return;

        const { error } = await supabaseClient
            .from("enrollments")
            .delete()
            .eq("learner_id", state.user.id)
            .eq("course_id", courseId);

        if (error) {
            console.error("Leave error:", error);
            toast("Couldn't leave the class. Please try again.");
            return;
        }

        state.enrolled = false;
        state.playingId = null;
        await Promise.all([loadLecturesAndSeats(), loadMemberData()]);
        render();
        toast("You've left the class.");
    }

    async function load() {
        const { user, profile } = await window.nsReady;
        state.user = user;
        state.profile = profile;
        if (profile.role === "educator") useEducatorSidebar();

        if (!courseId) {
            showMessage("No class selected", "Open a class from Explore to see its details.");
            return;
        }

        const { data: course, error } = await supabaseClient
            .from("courses")
            .select(HN.COURSE_COLUMNS)
            .eq("id", courseId)
            .maybeSingle();

        if (error || !course) {
            if (error) console.error("Course load error:", error);
            showMessage("Class not available", "This class may have been removed or isn't published.");
            return;
        }
        state.course = course;

        const [names, lessons, enrollment, saved] = await Promise.all([
            HN.educatorNames([course.educator_id]),
            supabaseClient
                .from("lessons")
                .select("id, title, description, duration, lesson_order")
                .eq("course_id", courseId)
                .order("lesson_order", { ascending: true }),
            supabaseClient
                .from("enrollments")
                .select("id")
                .eq("course_id", courseId)
                .eq("learner_id", user.id)
                .maybeSingle(),
            supabaseClient
                .from("saved_courses")
                .select("id")
                .eq("course_id", courseId)
                .eq("learner_id", user.id)
                .maybeSingle()
        ]);

        state.educatorName = names[course.educator_id] || "HobbyNest educator";
        state.lessons = lessons.data || [];
        state.enrolled = Boolean(enrollment.data);
        state.saved = Boolean(saved.data);
        await Promise.all([loadLecturesAndSeats(), loadMemberData(), loadReviews()]);
        render();
    }

    load().catch(error => {
        console.error("Course page error:", error);
        showMessage("Something went wrong", "Please refresh the page and try again.");
    });
})();
