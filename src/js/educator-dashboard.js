// HobbyNest - educator dashboard: real classes, students, progress,
// sessions, analytics and recent activity. Uses the page's existing
// #classModal and #studentModal popups.

(function () {
    "use strict";

    const esc = HN.escapeHTML;
    const $ = selector => document.querySelector(selector);

    let user = null;
    let classes = [];      // course + { lessons, lectures, students, avgCompletion }
    let lessonsByCourse = {};
    let students = [];     // one row per enrollment
    let sessions = [];
    let activity = [];

    /* ---------------- helpers ---------------- */

    function toastMessage(text) {
        const element = $("#educatorToast");
        if (!element) return;
        element.textContent = text;
        element.classList.add("show");
        setTimeout(() => element.classList.remove("show"), 2600);
    }

    function setText(selector, value) {
        const element = $(selector);
        if (element) element.textContent = value;
    }

    function initials(name) {
        return String(name || "?").trim().split(/\s+/).slice(0, 2).map(p => p[0]).join("").toUpperCase() || "?";
    }

    function shortDate(value) {
        return new Date(value).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
    }

    function timeAgo(value) {
        const minutes = Math.round((Date.now() - new Date(value).getTime()) / 60000);
        if (minutes < 1) return "Just now";
        if (minutes < 60) return `${minutes} min ago`;
        const hours = Math.round(minutes / 60);
        if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
        const days = Math.round(hours / 24);
        if (days === 1) return "Yesterday";
        if (days < 7) return `${days} days ago`;
        return shortDate(value);
    }

    function openModal(selector, html) {
        const modal = $(selector);
        const content = $(selector === "#classModal" ? "#classModalContent" : "#studentModalContent");
        if (!modal || !content) return null;
        content.innerHTML = html;
        modal.classList.add("show");
        return modal;
    }

    function closeModal(selector) {
        $(selector)?.classList.remove("show");
    }

    /* ---------------- stats + analytics ---------------- */

    function updateStats() {
        const published = classes.filter(c => c.published).length;
        const drafts = classes.length - published;
        const uniqueStudents = new Set(students.map(s => s.learner_id)).size;
        const lectures = classes.reduce((sum, c) => sum + c.lectures, 0);
        const tracked = students.filter(s => s.total > 0);
        const avg = tracked.length
            ? Math.round(tracked.reduce((sum, s) => sum + s.percent, 0) / tracked.length)
            : null;

        setText("#statStudents", uniqueStudents);
        setText("#statStudentsNote", "Across all your classes");
        setText("#classCount", published);
        setText("#statClassesNote", drafts ? `${published} published · ${drafts} unpublished` : `${published} published`);
        setText("#statLectures", lectures);
        setText("#statLecturesNote", "Across all your classes");
        setText("#statCompletion", avg == null ? "—" : `${avg}%`);
        setText("#statCompletionNote", avg == null ? "No learner progress yet" : "Average across your learners");
    }

    function renderAnalytics() {
        const box = $("#analyticsList");
        if (!box) return;
        const rows = classes.filter(c => c.students > 0);
        if (!rows.length) {
            box.innerHTML = `<p class="muted">Once learners join your classes and finish lessons, their average completion shows here.</p>`;
            return;
        }
        const colours = ["", "progress-pink", "progress-blue", "progress-green"];
        box.innerHTML = rows.map((course, index) => `
            <div class="analytics-item">
                <div class="analytics-label">
                    <span>${esc(course.title)} · ${course.students} learner${course.students === 1 ? "" : "s"}</span>
                    <strong>${course.lessons ? `${course.avgCompletion}%` : "No lessons"}</strong>
                </div>
                <div class="progress-track">
                    <div class="progress-value ${colours[index % colours.length]}" style="width:${course.avgCompletion}%"></div>
                </div>
            </div>`).join("");
    }

    function renderActivity() {
        const box = $("#activityList");
        if (!box) return;
        if (!activity.length) {
            box.innerHTML = `<p class="muted">Nothing yet — new enrollments and lectures will show up here.</p>`;
            return;
        }
        box.innerHTML = activity.slice(0, 6).map(item => `
            <div class="activity-item">
                <div class="activity-icon">${item.icon}</div>
                <div>
                    <strong>${esc(item.title)}</strong>
                    <p>${esc(item.text)}</p>
                    <span class="activity-time">${esc(timeAgo(item.at))}</span>
                </div>
            </div>`).join("");
    }

    /* ---------------- classes ---------------- */

    function classCard(course) {
        const meta = HN.categoryMeta(course.category);
        return `
            <article class="card class-card searchable"
                data-search="${esc([course.title, course.category, course.description].join(" "))}">
                <div class="class-image-wrap">
                    <img class="class-image" src="${esc(HN.courseImage(course))}" data-fallback="${esc(HN.categoryMeta(course.category).img)}" alt="" loading="lazy">
                    <span class="class-category">${esc(meta.label)}</span>
                </div>
                <div class="class-body">
                    <h3>${esc(course.title)}</h3>
                    <p>${esc(course.description || "")}</p>
                    <div class="class-meta">
                        <div class="meta-box"><small>Students</small><strong>${course.students} / ${course.capacity || "—"}</strong></div>
                        <div class="meta-box"><small>Lessons</small><strong>${course.lessons}</strong></div>
                        <div class="meta-box"><small>Completion</small><strong>${course.students && course.lessons ? course.avgCompletion + "%" : "—"}</strong></div>
                    </div>
                    <div class="class-next">
                        ${course.published ? "● Published" : "○ Unpublished — hidden from learners"}
                        · ${course.rating && course.rating.count ? HN.ratingText(course.rating) : "No reviews yet"}
                    </div>
                    <div class="class-actions">
                        <button class="btn small" type="button" data-manage="${course.id}">Manage</button>
                        <a class="btn small secondary" href="edit-class.html?id=${course.id}">Edit</a>
                    </div>
                </div>
            </article>`;
    }

    function renderClasses() {
        const grid = $("#classesGrid");
        if (grid) {
            grid.innerHTML = classes.length
                ? classes.map(classCard).join("")
                : `<div class="panel" style="grid-column:1/-1;text-align:center;padding:40px">
                        <h3 style="margin-bottom:8px">You haven't published a class yet</h3>
                        <p class="muted" style="margin-bottom:16px">Create your first class and it will show up here.</p>
                        <a class="btn" href="add-class.html">+ Add a class</a>
                   </div>`;
        }
        updateStats();
        renderAnalytics();
    }

    function openManage(id) {
        const course = classes.find(c => c.id === id);
        if (!course) return;

        openModal("#classModal", `
            <div class="eyebrow">${esc(HN.categoryMeta(course.category).label)}</div>
            <h2>${esc(course.title)}</h2>
            <p class="muted">${course.published
                ? "Published — learners can find and join this class."
                : "Unpublished — hidden from Explore. Enrolled learners keep access."}</p>
            <div class="class-meta">
                <div class="meta-box"><small>Students</small><strong>${course.students} / ${course.capacity || "—"}</strong></div>
                <div class="meta-box"><small>Fee</small><strong>${HN.formatFee(course.fee)}</strong></div>
                <div class="meta-box"><small>Lectures</small><strong>${course.lectures}</strong></div>
            </div>
            <div class="edu-actions">
                <a class="btn" href="edit-class.html?id=${course.id}">Edit class</a>
                <a class="btn secondary" href="../user/course.html?id=${course.id}">View as learner</a>
                <button class="btn secondary" type="button" id="togglePublish">${course.published ? "Unpublish" : "Publish"}</button>
                <button class="btn danger" type="button" id="deleteClass">Delete</button>
            </div>
            <div class="edu-actions" style="margin-top:10px">
                <button class="btn secondary" type="button" id="messageClass" ${course.students ? "" : "disabled title=\"No learners enrolled yet\""}>
                    ✉ Message all ${course.students} student${course.students === 1 ? "" : "s"}
                </button>
            </div>`);

        $("#messageClass").addEventListener("click", () => openClassMessage(course));
        $("#togglePublish").addEventListener("click", () => togglePublish(course));
        $("#deleteClass").addEventListener("click", () => deleteClass(course));
    }

    // One message to every learner enrolled in a class (e.g. "Let's do a call at 5").
    function openClassMessage(course) {
        const learners = [...new Set(students.filter(st => st.course_id === course.id).map(st => st.learner_id))];
        openModal("#classModal", `
            <div class="eyebrow">MESSAGE YOUR CLASS</div>
            <h2>${esc(course.title)}</h2>
            <p class="muted" style="margin-bottom:14px">Goes to all ${learners.length} enrolled learner${learners.length === 1 ? "" : "s"} as a
                private message. They see it in Messages (with an unread badge and a pop-up) and get an email.
                To schedule a call with a date and join link, use <strong>Schedule session</strong> instead.</p>
            <textarea id="classMessageText" maxlength="2000" rows="5" placeholder="Write your message…"
                style="display:block;width:100%;padding:11px 12px;border:1px solid #dfe4eb;border-radius:10px;font:inherit;resize:vertical"></textarea>
            <p id="classMessageError" class="muted" style="color:#b43d60;min-height:18px;margin:8px 0"></p>
            <div class="edu-actions">
                <button class="btn" type="button" id="sendClassMessage">Send to ${learners.length} learner${learners.length === 1 ? "" : "s"}</button>
                <button class="btn secondary" type="button" id="classMessageBack">Back</button>
            </div>`);

        $("#classMessageBack").addEventListener("click", () => openManage(course.id));
        $("#sendClassMessage").addEventListener("click", async event => {
            const text = $("#classMessageText").value.trim();
            if (!text) return ($("#classMessageError").textContent = "Please write a message.");
            if (!learners.length) return ($("#classMessageError").textContent = "No learners are enrolled in this class yet.");

            const { data: { session } } = await supabaseClient.auth.getSession();
            if (!session || session.user.id !== user.id) {
                $("#classMessageError").textContent = "This browser is now signed in as a different account. Reload the page and try again.";
                return;
            }

            event.currentTarget.disabled = true;
            const rows = learners.map(id => ({ sender_id: user.id, receiver_id: id, message: text }));
            const { data, error } = await supabaseClient.from("messages").insert(rows).select("id");
            if (error) {
                console.error("Class message error:", error);
                event.currentTarget.disabled = false;
                $("#classMessageError").textContent = "Couldn't send the message. Please try again.";
                return;
            }
            if (window.HNNotify) HNNotify.send("message", { message_ids: (data || []).map(m => m.id) });
            closeModal("#classModal");
            toastMessage(`Message sent to ${learners.length} learner${learners.length === 1 ? "" : "s"} ✓`);
        });
    }

    async function togglePublish(course) {
        const next = !course.published;
        $("#togglePublish").disabled = true;
        const { error } = await supabaseClient.from("courses").update({ published: next }).eq("id", course.id);
        if (error) {
            console.error("Publish toggle error:", error);
            toastMessage("Couldn't update the class. Please try again.");
            $("#togglePublish").disabled = false;
            return;
        }
        course.published = next;
        renderClasses();
        openManage(course.id);
        toastMessage(next ? "Class published ✓" : "Class unpublished — hidden from learners");
    }

    async function deleteClass(course) {
        const warning = course.students
            ? `Delete "${course.title}"? ${course.students} enrolled learner(s) will lose access. This can't be undone.`
            : `Delete "${course.title}"? This can't be undone.`;
        if (!confirm(warning)) return;

        const { error } = await supabaseClient.from("courses").delete().eq("id", course.id);
        if (error) {
            console.error("Delete error:", error);
            toastMessage("Couldn't delete the class. Please try again.");
            return;
        }
        closeModal("#classModal");
        toastMessage("Class deleted");
        await load();
    }

    /* ---------------- students ---------------- */

    function renderStudents() {
        const box = $("#studentRows");
        if (!box) return;
        if (!students.length) {
            box.innerHTML = `<p class="muted" style="padding:16px">No learners have joined your classes yet.</p>`;
            return;
        }
        box.innerHTML = students.map((s, index) => {
            const status = s.total === 0 ? "No lessons yet"
                : s.percent === 100 ? "Completed"
                : s.percent > 0 ? "In progress" : "Not started";
            return `
                <div class="student-row searchable student-entry"
                    data-status="${s.percent > 0 ? "active" : "review"}"
                    data-search="${esc(s.name + " " + s.courseTitle)}">
                    <div class="student-avatar">
                        <div class="avatar">${esc(initials(s.name))}</div>
                        <div>
                            <strong>${esc(s.name)}</strong>
                            <small>Joined ${esc(shortDate(s.enrolled_at))}</small>
                        </div>
                    </div>
                    <span>${esc(s.courseTitle)}</span>
                    <span>${s.total ? s.percent + "%" : "—"}</span>
                    <span class="status">${status}</span>
                    <button class="btn small ghost" type="button" data-student="${index}">View</button>
                </div>`;
        }).join("");
    }

    function openStudent(index) {
        const s = students[index];
        if (!s) return;
        const lessons = lessonsByCourse[s.course_id] || [];
        openModal("#studentModal", `
            <div class="eyebrow">LEARNER PROGRESS</div>
            <h2>${esc(s.name)}</h2>
            <p class="muted">${esc(s.courseTitle)} · joined ${esc(shortDate(s.enrolled_at))}</p>
            <a class="btn small" style="margin:12px 0 4px" href="../user/messages.html?to=${encodeURIComponent(s.learner_id)}">✉ Message ${esc(s.name.split(" ")[0])}</a>
            <div class="class-meta">
                <div class="meta-box"><small>Progress</small><strong>${s.total ? s.percent + "%" : "—"}</strong></div>
                <div class="meta-box"><small>Lessons done</small><strong>${s.done} / ${s.total}</strong></div>
            </div>
            <div class="progress-track" style="margin:14px 0 18px"><div class="progress-value" style="width:${s.percent}%"></div></div>
            <div class="panel" style="margin-top:12px">
                ${lessons.length ? lessons.map((lesson, i) => `
                    <p>${s.doneIds.has(lesson.id) ? "✓" : "○"} ${String(i + 1).padStart(2, "0")} · ${esc(lesson.title)}</p>`).join("")
                    : `<p class="muted">This class has no lessons yet.</p>`}
            </div>`);
    }

    /* ---------------- sessions ---------------- */

    function sessionCard(session) {
        const d = HN.sessionDateParts(session.session_date);
        const course = classes.find(c => c.id === session.course_id);
        const learners = course ? `${course.students} learner${course.students === 1 ? "" : "s"} enrolled` : "Open to all learners";
        return `
            <div class="card session-card searchable" data-search="${esc(session.title + " " + session.courseTitle)}">
                <div class="session-left">
                    <div class="date-card"><span>${d.weekday}</span><strong>${d.day}</strong><span>${d.month}</span></div>
                    <div class="session-details">
                        <h3>${esc(session.title)}</h3>
                        <p class="muted">${esc(d.time)} · ${esc(session.courseTitle)}</p>
                        <p class="muted">${esc(learners)}</p>
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap">
                    ${HN.safeUrl(session.meeting_link)
                        ? `<a class="btn" href="${esc(HN.safeUrl(session.meeting_link))}" target="_blank" rel="noopener">Start meeting →</a>`
                        : `<span class="muted" style="align-self:center">No meeting link</span>`}
                    <button class="btn secondary" type="button" data-delete-session="${session.id}">Delete</button>
                </div>
            </div>`;
    }

    function renderSessions() {
        const list = $("#sessionsList");
        if (list) {
            list.innerHTML = sessions.length
                ? sessions.map(sessionCard).join("")
                : `<div class="panel" style="text-align:center;padding:32px">
                        <h3 style="margin-bottom:8px">No upcoming sessions</h3>
                        <p class="muted">Schedule a live session and your enrolled learners will see it on their Schedule.</p>
                   </div>`;
        }

        const panel = $("#nextSessionPanel");
        if (!panel) return;
        const next = sessions[0];
        if (!next) {
            panel.innerHTML = `
                <span class="session-badge">NEXT SESSION</span>
                <h2>Nothing scheduled</h2>
                <p class="muted" style="margin:12px 0 18px">Plan a live class for your learners.</p>
                <button class="btn" type="button" data-schedule-session>Schedule session →</button>`;
            return;
        }
        const d = HN.sessionDateParts(next.session_date);
        const course = classes.find(c => c.id === next.course_id);
        panel.innerHTML = `
            <span class="session-badge">NEXT SESSION</span>
            <h2>${esc(next.title)}</h2>
            <div class="session-info">
                <div class="session-info-row"><span>◷</span>${esc(d.full)}</div>
                <div class="session-info-row"><span>▣</span>${esc(next.courseTitle)}</div>
                <div class="session-info-row"><span>◎</span>${course ? `${course.students} learners enrolled` : "Open to all learners"}</div>
            </div>
            ${HN.safeUrl(next.meeting_link)
                ? `<a class="btn" href="${esc(HN.safeUrl(next.meeting_link))}" target="_blank" rel="noopener">Start meeting →</a>`
                : `<p class="muted">Add a meeting link so learners can join.</p>`}`;
    }

    function openScheduleForm() {
        if (!classes.length) {
            toastMessage("Create a class before scheduling a learner meeting.");
            return;
        }
        const options = classes.map(c => `<option value="${c.id}">${esc(c.title)}</option>`).join("");
        const field = "display:block;width:100%;padding:11px 12px;border:1px solid #dfe4eb;border-radius:10px;margin:6px 0 14px;font:inherit";
        openModal("#classModal", `
            <div class="eyebrow">GO LIVE</div>
            <h2>Schedule a session</h2>
            <p class="muted" style="margin-bottom:16px">Every learner enrolled in the class gets it straight away in their
                Messages inbox (with the join link), by email, and on their Schedule.</p>
            <form id="sessionForm" novalidate>
                <label>Class
                    <select id="sessionClass" required style="${field}">
                        <option value="">Choose the class</option>
                        ${options}
                    </select>
                </label>
                <label>Session title
                    <input id="sessionTitle" required placeholder="e.g. Live Q&A" style="${field}">
                </label>
                <label>Date & time
                    <input id="sessionDate" type="datetime-local" required style="${field}">
                </label>
                <label>Meeting link (optional)
                    <input id="sessionLink" type="url" placeholder="Leave blank to create a Jitsi room" style="${field}">
                </label>
                <p class="muted" style="margin:-8px 0 12px">A join room is created automatically if you leave the link blank. Only learners enrolled in the selected class receive the session notice.</p>
                <label>Notes (optional)
                    <input id="sessionDescription" placeholder="What will you cover?" style="${field}">
                </label>
                <p id="sessionError" class="muted" style="color:#b43d60;min-height:18px"></p>
                <button class="btn" type="submit">Schedule session ✓</button>
            </form>`);

        $("#sessionForm").addEventListener("submit", saveSession);
    }

    async function saveSession(event) {
        event.preventDefault();
        const error = message => { $("#sessionError").textContent = message; };
        const title = $("#sessionTitle").value.trim();
        const when = $("#sessionDate").value;
        const suppliedLink = $("#sessionLink").value.trim();
        const courseId = $("#sessionClass").value ? Number($("#sessionClass").value) : null;

        if (!courseId) return error("Choose the class whose enrolled learners should be notified.");
        if (!title) return error("Please add a title.");
        if (!when) return error("Please pick a date and time.");
        const date = new Date(when);
        if (date.getTime() <= Date.now()) return error("Pick a time in the future.");
        if (suppliedLink && !/^https:\/\/[^\s"'<>]+$/i.test(suppliedLink)) return error("The meeting link should start with https://");
        const roomToken = (window.crypto && typeof crypto.randomUUID === "function")
            ? crypto.randomUUID().replace(/-/g, "").slice(0, 16)
            : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
        const meetingLink = suppliedLink || `https://meet.jit.si/HobbyNest-${String(title).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 35) || "Live-Class"}-${roomToken}`;

        const button = event.submitter || $("#sessionForm button[type='submit']");
        button.disabled = true;

        const { data: { session } } = await supabaseClient.auth.getSession();
        if (!session || session.user.id !== user.id) {
            error("This browser is now signed in as a different account. Reload the page and try again.");
            button.disabled = false;
            return;
        }

        const { data: saved, error: dbError } = await supabaseClient.from("sessions").insert({
            educator_id: user.id,
            course_id: courseId,
            title,
            description: $("#sessionDescription").value.trim() || null,
            session_date: date.toISOString(),
            meeting_link: meetingLink
        }).select("id").single();

        if (dbError) {
            console.error("Session error:", dbError);
            error("Couldn't schedule the session. Please try again.");
            button.disabled = false;
            return;
        }

        closeModal("#classModal");
        const course = classes.find(c => c.id === courseId);
        let emailResult = null;
        if (window.HNNotify) {
            emailResult = await HNNotify.send("session", { session_id: saved.id });
        }
        if (course && course.students) {
            const emailNote = emailResult && emailResult.sent > 0 ? " Email reminders sent too." : " Inbox notices are created by the database; email depends on notification setup.";
            toastMessage(`Session scheduled ✓ — enrolled learners in ${course.title} are notified.${emailNote}`);
        } else {
            toastMessage("Session scheduled. No learners are enrolled in this class yet; future enrollees can see it on their Schedule.");
        }
        await loadSessions();
    }

    async function deleteSession(id) {
        if (!confirm("Cancel this session? Enrolled learners get a \"session cancelled\" message.")) return;
        const { error } = await supabaseClient.from("sessions").delete().eq("id", id);
        if (error) {
            console.error("Delete session error:", error);
            toastMessage("Couldn't delete the session.");
            return;
        }
        toastMessage("Session cancelled — learners were notified");
        await loadSessions();
    }

    async function loadSessions() {
        sessions = await HN.upcomingSessions({ educatorId: user.id });
        renderSessions();
    }


    function renderEducatorGreeting(profile) {
        const target = $("#educatorGreetingName");
        if (!target) return;
        const name = String(profile?.full_name || "there").trim().split(/\s+/)[0] || "there";
        target.textContent = name;
        const heading = target.closest("h1");
        if (heading) {
            const hour = new Date().getHours();
            const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
            heading.firstChild && heading.firstChild.nodeType === Node.TEXT_NODE
                ? heading.firstChild.textContent = `${greeting}, `
                : null;
        }
    }
    window.HNUpdateEducatorGreeting = renderEducatorGreeting;

    /* ---------------- load everything ---------------- */

    async function load() {
        const ready = await window.nsReady;
        user = ready.user;
        renderEducatorGreeting(ready.profile);

        const { data: courses, error } = await supabaseClient
            .from("courses")
            .select(HN.COURSE_COLUMNS)
            .eq("educator_id", user.id)
            .order("created_at", { ascending: false });

        if (error) {
            console.error("Classes load error:", error);
            const grid = $("#classesGrid");
            if (grid) grid.innerHTML = `<p class="muted">Couldn't load your classes. Please refresh.</p>`;
            return;
        }

        const ids = courses.map(c => c.id);
        let lessons = [], lectures = [], enrollments = [], progress = [], names = {}, ratings = {};

        if (ids.length) {
            const results = await Promise.all([
                supabaseClient.from("lessons").select("id, course_id, title, lesson_order")
                    .in("course_id", ids).order("lesson_order", { ascending: true }),
                supabaseClient.from("course_lectures").select("id, course_id, title, created_at").in("course_id", ids),
                supabaseClient.from("enrollments").select("learner_id, course_id, enrolled_at").in("course_id", ids)
            ]);
            lessons = results[0].data || [];
            lectures = results[1].data || [];
            enrollments = results[2].data || [];

            if (lessons.length && enrollments.length) {
                const { data } = await supabaseClient
                    .from("progress")
                    .select("learner_id, lesson_id")
                    .eq("completed", true)
                    .in("lesson_id", lessons.map(l => l.id));
                progress = data || [];
            }
            names = await HN.educatorNames(enrollments.map(e => e.learner_id));
            ratings = await HN.ratingsFor(ids);
        }

        lessonsByCourse = {};
        lessons.forEach(l => (lessonsByCourse[l.course_id] ||= []).push(l));
        const lessonCourse = Object.fromEntries(lessons.map(l => [l.id, l.course_id]));

        // Finished lesson ids per "learner:course"
        const doneByKey = {};
        progress.forEach(p => {
            const key = `${p.learner_id}:${lessonCourse[p.lesson_id]}`;
            (doneByKey[key] ||= new Set()).add(p.lesson_id);
        });

        const titles = Object.fromEntries(courses.map(c => [c.id, c.title]));
        students = enrollments
            .map(e => {
                const total = (lessonsByCourse[e.course_id] || []).length;
                const doneIds = doneByKey[`${e.learner_id}:${e.course_id}`] || new Set();
                return {
                    ...e,
                    name: names[e.learner_id] || "Learner",
                    courseTitle: titles[e.course_id] || "Class",
                    total,
                    done: doneIds.size,
                    doneIds,
                    percent: total ? Math.round((doneIds.size / total) * 100) : 0
                };
            })
            .sort((a, b) => new Date(b.enrolled_at) - new Date(a.enrolled_at));

        classes = courses.map(course => {
            const mine = students.filter(s => s.course_id === course.id);
            return {
                ...course,
                lessons: (lessonsByCourse[course.id] || []).length,
                lectures: lectures.filter(l => l.course_id === course.id).length,
                students: mine.length,
                rating: ratings[course.id] || null,
                avgCompletion: mine.length ? Math.round(mine.reduce((sum, s) => sum + s.percent, 0) / mine.length) : 0
            };
        });

        activity = [
            ...students.map(s => ({ icon: "◎", title: `${s.name} enrolled`, text: s.courseTitle, at: s.enrolled_at })),
            ...lectures.map(l => ({ icon: "▶", title: "New lecture added", text: `${l.title} · ${titles[l.course_id] || ""}`, at: l.created_at })),
            ...courses.map(c => ({ icon: "▣", title: c.published ? "Class published" : "Class created", text: c.title, at: c.created_at }))
        ].filter(item => item.at).sort((a, b) => new Date(b.at) - new Date(a.at));

        renderClasses();
        renderStudents();
        renderActivity();
        await loadSessions();
    }

    /* ---------------- events ---------------- */

    document.addEventListener("click", event => {
        const manage = event.target.closest("[data-manage]");
        if (manage) return openManage(Number(manage.dataset.manage));

        const student = event.target.closest("[data-student]");
        if (student) return openStudent(Number(student.dataset.student));

        const removeSession = event.target.closest("[data-delete-session]");
        if (removeSession) return deleteSession(Number(removeSession.dataset.deleteSession));

        if (event.target.closest("#scheduleSessionBtn, [data-schedule-session]")) return openScheduleForm();
    });

    load().catch(error => console.error("Educator dashboard error:", error));
})();
