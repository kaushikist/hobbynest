// HobbyNest - Recorded Lectures (educator): every YouTube lecture across your
// classes, with watch, edit and delete. Functions are global because the
// page's buttons call them with onclick="...".

let lectures = [];      // each: lecture + course info
let editingId = null;

function toggleSidebar() {
    document.getElementById("sidebar").classList.toggle("mobile-open");
}

function lectureCard(lecture) {
    const esc = HN.escapeHTML;
    const id = HN.youtubeId(lecture.youtube_url);
    const meta = HN.categoryMeta(lecture.course.category);
    return `
        <article class="lecture-card"
            data-title="${esc(lecture.title)}"
            data-category="${HN.categoryKey(lecture.course.category)}"
            data-class="${lecture.course.id}">
            <div class="thumbnail">
                ${id ? `<img src="https://img.youtube.com/vi/${encodeURIComponent(id)}/hqdefault.jpg" alt="">` : ""}
                <button class="play-button" onclick="openLecture(${lecture.id})">▶</button>
                ${lecture.duration ? `<span class="duration-badge">${esc(lecture.duration)}</span>` : ""}
            </div>
            <div class="lecture-body">
                <div class="lecture-category">${esc(meta.label)}</div>
                <h3 class="lecture-title">${esc(lecture.title)}</h3>
                <p class="lecture-description">
                    Lecture ${lecture.position} of ${lecture.courseTotal}${lecture.position === 1 ? " · free preview for learners" : ""}
                </p>
                <div class="lecture-meta">📚 ${esc(lecture.course.title)}${lecture.course.published ? "" : " · unpublished"}</div>
                <div class="lecture-actions">
                    <button onclick="openLecture(${lecture.id})">▶ Watch</button>
                    <button onclick="editLecture(${lecture.id})">✏️ Edit</button>
                    <button class="delete-btn" onclick="deleteLecture(${lecture.id})">🗑️</button>
                </div>
            </div>
        </article>`;
}

function filterLectures() {
    const term = document.getElementById("searchInput").value.trim().toLowerCase();
    const category = document.getElementById("categoryFilter").value;
    const classId = document.getElementById("classFilter").value;

    const visible = lectures.filter(l =>
        (category === "all" || HN.categoryKey(l.course.category) === category) &&
        (classId === "all" || String(l.course.id) === classId) &&
        (!term || (l.title + " " + l.course.title).toLowerCase().includes(term))
    );

    document.getElementById("lectureGrid").innerHTML = visible.map(lectureCard).join("");
    document.getElementById("emptyState").style.display = visible.length ? "none" : "block";

    // "+ Add Lecture" opens the chosen class in Edit Class (lectures are step 4).
    const target = classId !== "all" ? `edit-class.html?id=${classId}` : "instructor-dashboard.html";
    document.querySelectorAll("a.add-btn").forEach(a => { a.href = target; });
}

function findLecture(id) {
    return lectures.find(l => l.id === id);
}

/* ---------------- watch ---------------- */

function openLecture(id) {
    const lecture = findLecture(id);
    if (!lecture) return;
    document.getElementById("modalTitle").textContent = lecture.title;
    document.getElementById("videoFrame").src = HN.youtubeEmbedUrl(lecture.youtube_url) || "";
    document.getElementById("modalDescription").textContent =
        `${lecture.course.title} · Lecture ${lecture.position}${lecture.duration ? " · " + lecture.duration : ""}`;
    document.getElementById("watchModal").classList.add("show");
}

function closeWatchModal() {
    document.getElementById("videoFrame").src = "";
    document.getElementById("watchModal").classList.remove("show");
}

function closeModal(event) {
    if (event.target.id === "watchModal") closeWatchModal();
}

/* ---------------- edit ---------------- */

function editLecture(id) {
    const lecture = findLecture(id);
    if (!lecture) return;
    editingId = id;
    document.getElementById("editTitle").value = lecture.title;
    document.getElementById("editClass").value = lecture.course.title;
    document.getElementById("editUrl").value = lecture.youtube_url;
    document.getElementById("editDuration").value = lecture.duration || "";
    document.getElementById("editModal").classList.add("show");
}

function closeEditModal(event) {
    // Clicking inside the popup shouldn't close it; clicking the dark backdrop should.
    if (event && event.target && event.target.id !== "editModal") return;
    document.getElementById("editModal").classList.remove("show");
    editingId = null;
}

async function saveLectureEdit() {
    const title = document.getElementById("editTitle").value.trim();
    const url = document.getElementById("editUrl").value.trim();
    const duration = document.getElementById("editDuration").value.trim();

    if (!title || !url) return alert("Please enter a title and a YouTube URL.");
    if (!HN.isYouTubeUrl(url)) return alert("Please use a YouTube link (youtube.com or youtu.be).");

    const { error } = await supabaseClient
        .from("course_lectures")
        .update({ title, youtube_url: url, duration: duration || null })
        .eq("id", editingId);

    if (error) {
        console.error("Lecture update error:", error);
        return alert("Couldn't save the lecture. Please try again.");
    }

    Object.assign(findLecture(editingId), { title, youtube_url: url, duration: duration || null });
    closeEditModal();
    filterLectures();
}

async function deleteLecture(id) {
    const lecture = findLecture(id);
    if (!lecture || !confirm(`Delete "${lecture.title}" from ${lecture.course.title}?`)) return;

    const { error } = await supabaseClient.from("course_lectures").delete().eq("id", id);
    if (error) {
        console.error("Lecture delete error:", error);
        return alert("Couldn't delete the lecture. Please try again.");
    }
    await loadLectures();
}

/* ---------------- load ---------------- */

async function loadLectures() {
    const { user } = await window.nsReady;

    const { data: courses, error } = await supabaseClient
        .from("courses")
        .select("id, title, category, published")
        .eq("educator_id", user.id)
        .order("created_at", { ascending: false });

    if (error) {
        console.error("Lectures load error:", error);
        document.getElementById("lectureGrid").innerHTML = "<p>Couldn't load your lectures. Please refresh.</p>";
        return;
    }

    const ids = courses.map(c => c.id);
    let rows = [], enrollments = [];
    if (ids.length) {
        const [l, e] = await Promise.all([
            supabaseClient.from("course_lectures")
                .select("id, course_id, title, youtube_url, duration, lecture_order")
                .in("course_id", ids)
                .order("lecture_order", { ascending: true }),
            supabaseClient.from("enrollments").select("learner_id").in("course_id", ids)
        ]);
        rows = l.data || [];
        enrollments = e.data || [];
    }

    const byCourse = Object.fromEntries(courses.map(c => [c.id, c]));
    const counts = {};
    lectures = rows.map(row => {
        counts[row.course_id] = (counts[row.course_id] || 0) + 1;
        return { ...row, course: byCourse[row.course_id], position: counts[row.course_id] };
    });
    lectures.forEach(l => { l.courseTotal = counts[l.course_id]; });

    document.getElementById("totalLectures").textContent = lectures.length;
    document.getElementById("statClasses").textContent = courses.length;
    document.getElementById("statLearners").textContent = new Set(enrollments.map(e => e.learner_id)).size;
    document.getElementById("statPreviews").textContent = Object.keys(counts).length;

    const classFilter = document.getElementById("classFilter");
    const current = classFilter.value;
    classFilter.innerHTML = `<option value="all">All Classes</option>` +
        courses.map(c => `<option value="${c.id}">${HN.escapeHTML(c.title)}</option>`).join("");
    if ([...classFilter.options].some(o => o.value === current)) classFilter.value = current;

    const empty = document.getElementById("emptyState");
    empty.querySelector("h3").textContent = lectures.length ? "No lectures found" : "No recorded lectures yet";
    empty.querySelector("p").textContent = lectures.length
        ? "Try another search, category or class."
        : "Add YouTube lectures to a class in Add Class or Edit Class, and they'll show up here.";

    filterLectures();
}

loadLectures().catch(error => console.error("Recorded lectures error:", error));
