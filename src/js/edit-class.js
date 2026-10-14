// HobbyNest - Edit Class (screens/instructor/edit-class.html?id=123)
// Loads one of the educator's classes into the form and saves changes with
// the update_course database function (course + lessons + lectures in one step).

window.EditClass = (function () {
    "use strict";

    const courseId = Number(new URLSearchParams(window.location.search).get("id"));
    const $ = id => document.getElementById(id);

    // Lesson type labels in the form <-> values stored in the database.
    const LESSON_TYPES = { "Live Session": "live", "Recorded": "video", "Assignment": "assignment" };
    const LESSON_LABELS = Object.fromEntries(Object.entries(LESSON_TYPES).map(([k, v]) => [v, k]));

    let course = null;
    let saving = false;

    function status(message, type = "success") {
        const box = $("statusBox");
        if (!box) return;
        box.className = `status-box ${type}`;
        box.textContent = message;
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function setButtonsDisabled(disabled) {
        document.querySelectorAll(".header-actions .btn, .footer-right .btn").forEach(button => {
            button.disabled = disabled;
        });
    }

    // Select an option by its text; add it if the form doesn't have it yet.
    function setSelect(id, value) {
        const select = $(id);
        if (!select || !value) return;
        let option = [...select.options].find(o => (o.value || o.text).trim() === value);
        if (!option) {
            option = new Option(value, value);
            select.add(option);
        }
        select.value = option.value;
    }

    function fillLessons(lessons) {
        const list = $("lessonList");
        list.innerHTML = "";
        lessons.forEach(lesson => {
            addLesson();
            const card = list.lastElementChild;
            card.dataset.id = lesson.id;
            const inputs = card.querySelectorAll("input");
            inputs[0].value = lesson.title || "";
            inputs[1].value = lesson.duration || "";
            const select = card.querySelector("select");
            const label = LESSON_LABELS[lesson.lesson_type] || "Recorded";
            if (select) select.value = label;
            const textarea = card.querySelector("textarea");
            if (textarea) textarea.value = lesson.description || "";
        });
    }

    function fillLectures(lectures) {
        const list = $("lectureList");
        list.innerHTML = "";
        lectures.forEach(lecture => {
            addLecture();
            const card = list.lastElementChild;
            card.dataset.id = lecture.id;
            const inputs = card.querySelectorAll("input");
            inputs[0].value = lecture.title || "";
            inputs[1].value = lecture.youtube_url || "";
            inputs[2].value = lecture.duration || "";
        });
    }

    function fillForm(lessons, lectures) {
        $("className").value = course.title || "";
        setSelect("category", course.category);
        setSelect("difficulty", course.level);
        $("description").value = course.description || "";
        $("duration").value = course.duration || "";
        $("fee").value = Number(course.fee) || 0;
        $("capacity").value = course.capacity || "";
        $("location").value = course.location || "";
        $("schedule").value = course.schedule || "";
        setSelect("format", course.teaching_format);
        $("certificate").value = course.certificate ? "Certificate included" : "No certificate";

        showCurrentImage();
        fillLessons(lessons);
        fillLectures(lectures);

        if (typeof updatePreview === "function") updatePreview();
    }

    // Show the class's current image in the upload box and the side preview.
    function showCurrentImage() {
        if (!course.thumbnail) return;
        const img = $("previewImg");
        if (img) img.src = course.thumbnail;
        if ($("imagePreview")) $("imagePreview").style.display = "block";
        const side = $("previewContainer");
        if (side) {
            side.innerHTML = "";
            const sideImg = document.createElement("img");
            sideImg.src = course.thumbnail;
            sideImg.alt = "Class image";
            side.appendChild(sideImg);
        }
        if ($("classImage")) $("classImage").value = "";
    }

    function collectLessons() {
        return [...$("lessonList").children].map((card, index) => {
            const inputs = card.querySelectorAll("input");
            const lesson = {
                id: card.dataset.id ? Number(card.dataset.id) : null,
                title: inputs[0]?.value.trim() || "",
                duration: inputs[1]?.value.trim() || null,
                lesson_type: LESSON_TYPES[card.querySelector("select")?.value] || "video",
                description: card.querySelector("textarea")?.value.trim() || null
            };
            // Ignore completely empty new rows.
            if (!lesson.id && !lesson.title && !lesson.duration && !lesson.description) return null;
            if (!lesson.title) throw new Error(`Lesson ${index + 1} needs a title.`);
            return lesson;
        }).filter(Boolean);
    }

    function collectLectures() {
        return [...$("lectureList").children].map((card, index) => {
            const inputs = card.querySelectorAll("input");
            const lecture = {
                id: card.dataset.id ? Number(card.dataset.id) : null,
                title: inputs[0]?.value.trim() || "",
                youtube_url: inputs[1]?.value.trim() || "",
                duration: inputs[2]?.value.trim() || null
            };
            if (!lecture.id && !lecture.title && !lecture.youtube_url && !lecture.duration) return null;
            if (!lecture.title || !lecture.youtube_url) {
                throw new Error(`Lecture ${index + 1}: please enter both a title and a YouTube URL.`);
            }
            if (!HN.isYouTubeUrl(lecture.youtube_url)) {
                throw new Error(`Lecture ${index + 1}: please use a YouTube link (youtube.com or youtu.be).`);
            }
            return lecture;
        }).filter(Boolean);
    }

    // publish: true = publish, false = unpublish, null = keep current status
    async function save(publish) {
        if (!course || saving) return;

        let lessons, lectures;
        try {
            if (!$("className").value.trim()) throw new Error("Please enter a class name.");
            lessons = collectLessons();
            lectures = collectLectures();
        } catch (error) {
            status(error.message, "error");
            return;
        }

        saving = true;
        setButtonsDisabled(true);
        status("Saving…", "success");

        const fee = parseFloat(String($("fee").value).replace(/[₹,$\s]/g, "")) || 0;

        // New class image chosen? Upload it first (otherwise the old one is kept).
        let thumbnail = null;
        const imageFile = $("classImage")?.files?.[0];
        if (imageFile) {
            try {
                status("Uploading image…", "success");
                thumbnail = await HN.uploadImage("course-images", imageFile);
            } catch (error) {
                saving = false;
                setButtonsDisabled(false);
                status(error.message, "error");
                return;
            }
        }

        const { error } = await supabaseClient.rpc("update_course", {
            p_course_id: course.id,
            p_course: {
                title: $("className").value.trim(),
                category: $("category").value,
                level: $("difficulty").value,
                description: $("description").value.trim(),
                duration: $("duration").value.trim(),
                fee: fee,
                capacity: parseInt($("capacity").value, 10) || 30,
                location: $("location").value.trim() || null,
                schedule: $("schedule").value.trim() || null,
                teaching_format: $("format").value,
                certificate: $("certificate").value === "Certificate included",
                thumbnail: thumbnail,
                published: publish
            },
            p_lessons: lessons,
            p_lectures: lectures
        });

        saving = false;
        setButtonsDisabled(false);

        if (error) {
            console.error("Save error:", error);
            status(error.message || "Couldn't save your changes. Please try again.", "error");
            return;
        }

        const published = publish === null ? course.published : publish;
        await load(true);
        status(published
            ? "✓ Changes saved. Your class is live for learners."
            : "✓ Changes saved. This class is unpublished, so learners can't find it yet.");
    }

    async function load(quiet = false) {
        const { user } = await window.nsReady;

        if (!courseId) {
            status("No class selected. Open a class from My Classes on your dashboard and click Edit.", "error");
            setButtonsDisabled(true);
            return;
        }

        const { data, error } = await supabaseClient
            .from("courses")
            .select(HN.COURSE_COLUMNS)
            .eq("id", courseId)
            .eq("educator_id", user.id)
            .maybeSingle();

        if (error || !data) {
            if (error) console.error("Edit load error:", error);
            status("This class wasn't found, or it isn't yours to edit.", "error");
            setButtonsDisabled(true);
            return;
        }
        course = data;

        const [lessons, lectures] = await Promise.all([
            supabaseClient.from("lessons")
                .select("id, title, description, duration, lesson_type, lesson_order")
                .eq("course_id", courseId).order("lesson_order", { ascending: true }),
            supabaseClient.from("course_lectures")
                .select("id, title, youtube_url, duration, lecture_order")
                .eq("course_id", courseId).order("lecture_order", { ascending: true })
        ]);

        fillForm(lessons.data || [], lectures.data || []);
        document.title = `Edit: ${course.title} | HobbyNest`;
        if (!quiet) {
            status(course.published
                ? `Editing "${course.title}" — currently published.`
                : `Editing "${course.title}" — currently unpublished (hidden from learners).`);
        }
    }

    load().catch(error => {
        console.error("Edit class error:", error);
        status("Something went wrong loading this class. Please refresh.", "error");
    });

    return { save };
})();
