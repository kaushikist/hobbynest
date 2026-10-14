// HobbyNest - shared learner-page UI helpers
// toast(), openCourse(), mobile menu, card search, saved empty state,
// and the "Join lecture" flow on the Schedule page.
//


(function () {
    "use strict";

    const $ = (selector, root = document) => root.querySelector(selector);
    const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

    function escapeHTML(value) {
        const div = document.createElement("div");
        div.textContent = value == null ? "" : String(value);
        return div.innerHTML;
    }

    /* ---------------- TOAST ---------------- */

    let toastTimer = null;

    function toast(message) {
        let element = $("#toast");
        if (!element) {
            element = document.createElement("div");
            element.id = "toast";
            element.className = "toast";
            document.body.appendChild(element);
        }
        element.textContent = message;
        element.classList.add("show");
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => element.classList.remove("show"), 2400);
    }

    /* ---------------- OPEN A CLASS ---------------- */

    // Classes have their own page: course.html?id=<class id>.
    function openCourse(id) {
        if (/^\d+$/.test(String(id))) {
            window.location.href = `course.html?id=${id}`;
            return;
        }
        toast("This class isn't available.");
    }

    /* ---------------- MOBILE MENU ---------------- */

    function setupMobileMenu() {
        const button = $("#mobileMenu");
        const sidebar = $(".sidebar");
        if (!button || !sidebar) return;

        button.addEventListener("click", event => {
            event.stopPropagation();
            sidebar.classList.toggle("open");
        });

        document.addEventListener("click", event => {
            if (sidebar.classList.contains("open") &&
                !sidebar.contains(event.target) && event.target !== button) {
                sidebar.classList.remove("open");
            }
        });
    }

    /* ---------------- TOP-BAR SEARCH (pages with data-search cards) ---------------- */

    function setupCardSearch() {
        const input = $(".topbar .search input");
        if (!input) return;

        // Cards are often loaded from Supabase after the page opens,
        // so look them up each time the search changes.
        input.addEventListener("input", () => {
            const term = input.value.trim().toLowerCase();
            $$(".card[data-search]").forEach(card => {
                const text = (card.dataset.search + " " + card.innerText).toLowerCase();
                card.style.display = !term || text.includes(term) ? "" : "none";
            });
        });
    }

    /* ---------------- SCHEDULE: JOIN A LIVE SESSION ---------------- */
    // Buttons with data-join="Title" data-link="https://..." open a quick
    // camera/mic check, then "Join now" opens the meeting link in a new tab.

    function setupJoinLecture() {
        const meetingModal = $("#meetingModal");
        if (!meetingModal) return;

        const video = $("#cameraPreview");
        const placeholder = $("#cameraPlaceholder");
        let stream = null;
        let meetingLink = null;

        function stopCamera() {
            if (stream) stream.getTracks().forEach(track => track.stop());
            stream = null;
            if (video) {
                video.srcObject = null;
                video.style.display = "none";
            }
            if (placeholder) placeholder.style.display = "";
        }

        async function startCamera() {
            if (!navigator.mediaDevices?.getUserMedia || !video) return;
            try {
                stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
                video.srcObject = stream;
                video.style.display = "block";
                if (placeholder) placeholder.style.display = "none";
            } catch (error) {
                if (placeholder) {
                    placeholder.textContent = "Camera or microphone access was blocked. You can still join.";
                }
            }
        }

        document.addEventListener("click", event => {
            const button = event.target.closest("[data-join]");
            if (!button) return;
            meetingLink = /^https?:\/\/[^\s"'<>]+$/i.test(button.dataset.link || "") ? button.dataset.link : null;
            if (!meetingLink) {
                toast("The educator hasn't added a meeting link yet.");
                return;
            }
            $("#meetingTitle").textContent = button.dataset.join;
            meetingModal.classList.add("show");
            startCamera();
        });

        $("#closeMeeting")?.addEventListener("click", () => {
            meetingModal.classList.remove("show");
            stopCamera();
        });

        $("#joinMeeting")?.addEventListener("click", () => {
            meetingModal.classList.remove("show");
            stopCamera();   // free the camera so the meeting app can use it
            if (meetingLink) window.open(meetingLink, "_blank", "noopener");
        });
    }

    /* ---------------- SHARED FORM VALIDATION ---------------- */
    function setupFormValidation() {
        document.addEventListener("submit", event => {
            const form = event.target;
            if (!(form instanceof HTMLFormElement) || form.id === "meetupForm") return;
            form.querySelectorAll(".field-error").forEach(node => node.remove());
            form.querySelectorAll("[aria-invalid='true']").forEach(field => field.removeAttribute("aria-invalid"));
            let firstInvalid = null;
            const fields = [...form.querySelectorAll("input, textarea, select")].filter(field => !field.disabled && field.type !== "hidden" && field.type !== "submit" && field.type !== "button");
            for (const field of fields) {
                const value = String(field.value || "").trim();
                let message = "";
                if (field.required && !value) message = "This field is required.";
                else if (field.type === "email" && value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = "Enter a valid email address.";
                else if (field.maxLength > 0 && value.length > field.maxLength) message = `Use ${field.maxLength} characters or fewer.`;
                if (!message) continue;
                field.setAttribute("aria-invalid", "true");
                const error = document.createElement("small");
                error.className = "field-error";
                error.setAttribute("role", "alert");
                error.textContent = message;
                field.insertAdjacentElement("afterend", error);
                if (!firstInvalid) firstInvalid = field;
            }
            if (firstInvalid) {
                event.preventDefault();
                event.stopImmediatePropagation();
                firstInvalid.focus();
            }
        }, true);
    }

    /* ---------------- START ---------------- */

    window.toast = toast;
    window.openCourse = openCourse;

    function init() {
        setupMobileMenu();
        setupCardSearch();
        setupJoinLecture();
        setupFormValidation();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
