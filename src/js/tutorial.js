// HobbyNest - First Time Interactive Tutorial
// Backend-powered version
// Tutorial completion is stored in Supabase profiles.

(function () {

    let currentStep = 0;

    const learnerSteps = [

        {
            title: "Welcome to HobbyNest! 👋",
            text: "Let's take a quick tour so you know where everything is. You can skip this anytime.",
            target: null
        },

        {
            title: "Explore New Skills 🔎",
            text: "Find classes and extracurricular activities across programming, dance, music, art, photography, craft and community activities.",
            target: "a[href*='explore.html']"
        },

        {
            title: "Keep Learning 📚",
            text: "Your enrolled classes, lessons and learning progress can be accessed from your learning section.",
            target: "a[href*='my-courses.html']"
        },

        {
            title: "Check Your Progress 📈",
            text: "Track completed lessons, course progress and your overall learning journey here.",
            target: "a[href*='my-progress.html']"
        },

        {
            title: "Save Classes ❤️",
            text: "Found something interesting but not ready to join? Save it and come back later.",
            target: "a[href*='saved.html']"
        },

        {
            title: "Meet People Nearby 📍",
            text: "Discover workshops, photography walks, dance sessions, NGO drives, open mics, reading circles and other activities near you.",
            target: "a[href*='nearby-meetups.html']"
        },

        {
            title: "Join the Community ✨",
            text: "Share photos and experiences, discover people with similar interests and interact with the HobbyNest community.",
            target: "a[href*='socials.html']"
        },

        {
            title: "You're All Set! 🎉",
            text: "That's everything you need to get started. Explore, learn, create and meet people with similar interests.",
            target: null
        }

    ];


    const educatorSteps = [

        {
            title: "Welcome to HobbyNest! 👋",
            text: "Let's take a quick tour of your educator workspace.",
            target: null
        },

        {
            title: "Manage Your Classes 📚",
            text: "Open My Classes to review your classes, learners and teaching progress.",
            target: ".edu-nav[data-section=\"classes\"]"
        },

        {
            title: "Add a New Class ➕",
            text: "Create a new class with details, curriculum and recorded lectures.",
            target: ".edu-nav[data-section=\"add\"]"
        },

        {
            title: "Recorded Lectures ▶️",
            text: "Manage your YouTube-based recorded lectures from the dedicated lecture library.",
            target: ".edu-nav[data-section=\"lectures\"]"
        },

        {
            title: "Students 👥",
            text: "Review learner progress, attendance and engagement from your Students section.",
            target: ".edu-nav[data-section=\"students\"]"
        },

        {
            title: "Upcoming Sessions 📅",
            text: "Keep track of your scheduled sessions and upcoming classes.",
            target: ".edu-nav[data-section=\"sessions\"]"
        },

        {
            title: "You're All Set! 🎉",
            text: "Your educator workspace is ready. Create classes, teach and build your learning community.",
            target: null
        }

    ];


    let tutorialSteps = learnerSteps;


    // =========================================
    // DETECT USER ROLE FROM SUPABASE
    // =========================================

    async function loadUserAndStartTutorial() {

        try {

            const {
                data: {
                    user
                },
                error: userError
            } = await supabaseClient.auth.getUser();


            if (userError || !user) {
                return;
            }


            const {
                data: profile,
                error: profileError
            } = await supabaseClient
                .from("profiles")
                .select("role, tutorial_completed")
                .eq("id", user.id)
                .single();


            if (profileError || !profile) {
                console.error(
                    "Tutorial profile error:",
                    profileError
                );

                return;
            }


            // Tutorial already completed
            if (profile.tutorial_completed === true) {
                return;
            }


            // Select tutorial according to backend role
            if (profile.role === "educator") {
                tutorialSteps = educatorSteps;
            } else {
                tutorialSteps = learnerSteps;
            }


            createTutorial();

        } catch (error) {

            console.error(
                "Tutorial initialization error:",
                error
            );

        }

    }


    // =========================================
    // CREATE TUTORIAL
    // =========================================

    function createTutorial() {

        if (
            document.getElementById(
                "nsTutorialOverlay"
            )
        ) {
            return;
        }


        const overlay =
            document.createElement("div");

        overlay.id =
            "nsTutorialOverlay";


        overlay.innerHTML = `

            <div class="ns-tutorial-backdrop"></div>

            <div
                class="ns-tutorial-highlight"
                id="nsTutorialHighlight">
            </div>

            <div
                class="ns-tutorial-card"
                id="nsTutorialCard">

                <button
                    class="ns-tutorial-close"
                    id="nsTutorialSkip">
                    ×
                </button>

                <div
                    class="ns-tutorial-step-count"
                    id="nsTutorialStepCount">
                    1 / ${tutorialSteps.length}
                </div>

                <div
                    class="ns-tutorial-icon"
                    id="nsTutorialIcon">
                    👋
                </div>

                <h2
                    id="nsTutorialTitle">
                    Welcome to HobbyNest!
                </h2>

                <p
                    id="nsTutorialText">
                    Let's take a quick tour.
                </p>

                <div
                    class="ns-tutorial-dots"
                    id="nsTutorialDots">
                </div>

                <div class="ns-tutorial-actions">

                    <button
                        class="ns-tutorial-back"
                        id="nsTutorialBack">
                        ← Back
                    </button>

                    <button
                        class="ns-tutorial-next"
                        id="nsTutorialNext">
                        Next →
                    </button>

                </div>

            </div>
        `;


        document.body.appendChild(overlay);

        addTutorialStyles();

        setupTutorialEvents();

        renderStep();

    }


    // =========================================
    // TUTORIAL STYLES
    // =========================================

    function addTutorialStyles() {

        if (
            document.getElementById(
                "nsTutorialStyles"
            )
        ) {
            return;
        }


        const style =
            document.createElement("style");

        style.id =
            "nsTutorialStyles";


        style.textContent = `

            #nsTutorialOverlay {
                position: fixed;
                inset: 0;
                z-index: 99999;
                display: block;
            }

            .ns-tutorial-backdrop {
                position: fixed;
                inset: 0;
                background: rgba(20, 20, 40, 0.62);
                backdrop-filter: blur(2px);
            }

            .ns-tutorial-highlight {
                position: fixed;
                display: none;
                border: 3px solid #8b6cff;
                border-radius: 15px;
                box-shadow:
                    0 0 0 5px rgba(139, 108, 255, 0.18),
                    0 0 35px rgba(139, 108, 255, 0.45);
                pointer-events: none;
                z-index: 100001;
                transition: all .25s ease;
            }

            .ns-tutorial-card {
                position: fixed;
                width: min(420px, calc(100vw - 32px));
                background: #ffffff;
                border-radius: 22px;
                padding: 28px;
                box-shadow:
                    0 25px 70px rgba(0, 0, 0, .22);
                z-index: 100002;
                left: 50%;
                top: 50%;
                transform: translate(-50%, -50%);
                animation: nsTutorialIn .25s ease;
            }

            @keyframes nsTutorialIn {

                from {
                    opacity: 0;
                    transform:
                        translate(-50%, -46%)
                        scale(.96);
                }

                to {
                    opacity: 1;
                    transform:
                        translate(-50%, -50%)
                        scale(1);
                }

            }

            .ns-tutorial-close {
                position: absolute;
                top: 15px;
                right: 15px;
                width: 32px;
                height: 32px;
                border: none;
                border-radius: 50%;
                background: #f3f3f7;
                color: #77778a;
                font-size: 20px;
                cursor: pointer;
            }

            .ns-tutorial-step-count {
                color: #8a8799;
                font-size: 11px;
                font-weight: 600;
                text-align: right;
            }

            .ns-tutorial-icon {
                width: 58px;
                height: 58px;
                border-radius: 17px;
                background: #eeeaff;
                display: flex;
                align-items: center;
                justify-content: center;
                font-size: 28px;
                margin: 5px 0 18px;
            }

            .ns-tutorial-card h2 {
                margin: 0 0 10px;
                color: #1d1d2e;
                font-size: 23px;
                line-height: 1.25;
            }

            .ns-tutorial-card p {
                margin: 0;
                color: #77778a;
                font-size: 14px;
                line-height: 1.65;
            }

            .ns-tutorial-dots {
                display: flex;
                gap: 5px;
                margin: 23px 0;
            }

            .ns-tutorial-dot {
                width: 7px;
                height: 7px;
                border-radius: 50%;
                background: #dedee8;
                transition: .2s;
            }

            .ns-tutorial-dot.active {
                width: 20px;
                border-radius: 10px;
                background: #7657e8;
            }

            .ns-tutorial-actions {
                display: flex;
                justify-content: space-between;
                align-items: center;
                gap: 10px;
            }

            .ns-tutorial-back,
            .ns-tutorial-next {
                border: none;
                border-radius: 11px;
                padding: 11px 17px;
                font-family: inherit;
                font-size: 13px;
                font-weight: 600;
                cursor: pointer;
            }

            .ns-tutorial-back {
                background: #f3f3f7;
                color: #666679;
            }

            .ns-tutorial-next {
                background: #7355e7;
                color: #ffffff;
                margin-left: auto;
            }

            @media (max-width: 500px) {

                .ns-tutorial-card {
                    padding: 22px;
                    border-radius: 18px;
                }

                .ns-tutorial-card h2 {
                    font-size: 20px;
                }

                .ns-tutorial-card p {
                    font-size: 13px;
                }

            }

        `;


        document.head.appendChild(style);

    }


    // =========================================
    // EVENTS
    // =========================================

    function setupTutorialEvents() {

        document
            .getElementById("nsTutorialNext")
            .addEventListener(
                "click",
                nextStep
            );


        document
            .getElementById("nsTutorialBack")
            .addEventListener(
                "click",
                previousStep
            );


        document
            .getElementById("nsTutorialSkip")
            .addEventListener(
                "click",
                finishTutorial
            );

    }


    // =========================================
    // RENDER STEP
    // =========================================

    function renderStep() {

        const step =
            tutorialSteps[currentStep];


        const title =
            document.getElementById(
                "nsTutorialTitle"
            );

        const text =
            document.getElementById(
                "nsTutorialText"
            );

        const count =
            document.getElementById(
                "nsTutorialStepCount"
            );

        const nextButton =
            document.getElementById(
                "nsTutorialNext"
            );

        const backButton =
            document.getElementById(
                "nsTutorialBack"
            );

        const icon =
            document.getElementById(
                "nsTutorialIcon"
            );


        title.textContent =
            step.title;

        text.textContent =
            step.text;

        count.textContent =
            `${currentStep + 1} / ${tutorialSteps.length}`;

        icon.textContent =
            getIcon(currentStep);


        backButton.style.visibility =
            currentStep === 0
                ? "hidden"
                : "visible";


        nextButton.textContent =
            currentStep === tutorialSteps.length - 1
                ? "Let's Go! 🚀"
                : "Next →";


        renderDots();

        positionTutorial();

    }


    // =========================================
    // ICONS
    // =========================================

    function getIcon(step) {

        const icons = [
            "👋",
            "🔎",
            "📚",
            "📈",
            "❤️",
            "📍",
            "✨",
            "🎉"
        ];

        return icons[step] || "✨";

    }


    // =========================================
    // DOTS
    // =========================================

    function renderDots() {

        const container =
            document.getElementById(
                "nsTutorialDots"
            );

        container.innerHTML = "";


        tutorialSteps.forEach(
            (_, index) => {

                const dot =
                    document.createElement(
                        "div"
                    );

                dot.className =
                    "ns-tutorial-dot";


                if (index === currentStep) {

                    dot.classList.add(
                        "active"
                    );

                }


                container.appendChild(dot);

            }
        );

    }


    // =========================================
    // POSITION TUTORIAL
    // =========================================

    function positionTutorial() {

        const step =
            tutorialSteps[currentStep];

        const highlight =
            document.getElementById(
                "nsTutorialHighlight"
            );

        const card =
            document.getElementById(
                "nsTutorialCard"
            );


        if (!step.target) {

            highlight.style.display =
                "none";

            card.style.left =
                "50%";

            card.style.top =
                "50%";

            card.style.transform =
                "translate(-50%, -50%)";

            return;
        }


        const target =
            document.querySelector(
                step.target
            );


        if (!target) {

            highlight.style.display =
                "none";

            card.style.left =
                "50%";

            card.style.top =
                "50%";

            card.style.transform =
                "translate(-50%, -50%)";

            return;
        }


        const rect =
            target.getBoundingClientRect();


        highlight.style.display =
            "block";

        highlight.style.left =
            `${rect.left - 5}px`;

        highlight.style.top =
            `${rect.top - 5}px`;

        highlight.style.width =
            `${rect.width + 10}px`;

        highlight.style.height =
            `${rect.height + 10}px`;


        if (window.innerWidth < 750) {

            card.style.left =
                "50%";

            card.style.top =
                "50%";

            card.style.transform =
                "translate(-50%, -50%)";

            return;
        }


        const cardWidth = 420;

        let left =
            rect.left;

        let top =
            rect.bottom + 20;


        if (
            left + cardWidth >
            window.innerWidth - 20
        ) {

            left =
                window.innerWidth -
                cardWidth -
                20;

        }


        if (
            top + 300 >
            window.innerHeight
        ) {

            top =
                rect.top - 320;

        }


        if (top < 20) {
            top = 20;
        }


        if (left < 20) {
            left = 20;
        }


        card.style.left =
            `${left}px`;

        card.style.top =
            `${top}px`;

        card.style.transform =
            "none";

    }


    // =========================================
    // NEXT
    // =========================================

    function nextStep() {

        if (
            currentStep <
            tutorialSteps.length - 1
        ) {

            currentStep++;

            renderStep();

            return;
        }


        finishTutorial();

    }


    // =========================================
    // BACK
    // =========================================

    function previousStep() {

        if (currentStep > 0) {

            currentStep--;

            renderStep();

        }

    }


    // =========================================
    // FINISH + SAVE TO SUPABASE
    // =========================================

    async function finishTutorial() {

        try {

            const {
                data: {
                    user
                },
                error: userError
            } =
                await supabaseClient.auth.getUser();


            if (!userError && user) {

                const {
                    error
                } =
                    await supabaseClient
                        .from("profiles")
                        .update({
                            tutorial_completed: true
                        })
                        .eq(
                            "id",
                            user.id
                        );


                if (error) {

                    console.error(
                        "Could not save tutorial completion:",
                        error
                    );

                    alert(
                        "Your tutorial could not be saved. Please try again."
                    );

                    return;
                }

            }


            const overlay =
                document.getElementById(
                    "nsTutorialOverlay"
                );


            if (overlay) {
                overlay.remove();
            }

        } catch (error) {

            console.error(
                "Tutorial completion error:",
                error
            );

        }

    }


    // =========================================
    // PUBLIC START FUNCTION
    // =========================================

    window.startHobbyNestTutorial =
        function () {

            loadUserAndStartTutorial();

        };


    // =========================================
    // WINDOW RESIZE
    // =========================================

    window.addEventListener(
        "resize",
        function () {

            if (
                document.getElementById(
                    "nsTutorialOverlay"
                )
            ) {

                positionTutorial();

            }

        }
    );


})();