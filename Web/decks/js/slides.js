/**
 * Web-Slide core
 */
(function initSlideSystem() {
    const PROGRESS_KEY_PREFIX = "tbp.deckProgress.";
    let currentIndex = 0;
    let slides = [];
    let slideIds = [];
    let navBtns = [];
    let dotsContainer = null;
    let counterEl = null;
    let sectionObserver = null;
    let slideObserver = null;
    const deckId = new URLSearchParams(window.location.search).get("deck") || "";

    function getProgressKey() {
        return deckId ? `${PROGRESS_KEY_PREFIX}${deckId}` : "";
    }

    function readProgress() {
        const key = getProgressKey();
        if (!key) return null;

        try {
            const raw = localStorage.getItem(key);
            if (!raw) return null;
            return JSON.parse(raw);
        } catch {
            return null;
        }
    }

    function saveProgress(index) {
        const key = getProgressKey();
        if (!key || !slides.length) return;

        const safeIndex = Math.max(0, Math.min(index, slides.length - 1));
        const slide = slides[safeIndex];
        if (!slide) return;

        try {
            localStorage.setItem(
                key,
                JSON.stringify({
                    deckId,
                    slideId: slide.dataset.slideId,
                    sectionId: getSectionId(slide),
                    index: safeIndex,
                    totalSlides: slides.length,
                    updatedAt: new Date().toISOString(),
                })
            );
        } catch {
            // Ignore localStorage failures so deck navigation still works.
        }
    }

    function resolveInitialIndex() {
        if (!slides.length) return 0;

        const params = new URLSearchParams(window.location.search);
        const requestedSlide = params.get("slide");
        if (requestedSlide) {
            const requestedIndex = getIndexById(requestedSlide);
            if (requestedIndex >= 0) return requestedIndex;
        }

        if (params.get("resume") !== "1") return 0;

        const progress = readProgress();
        if (!progress) return 0;

        const savedIndex = Number(progress.index);
        if (Number.isInteger(savedIndex) && savedIndex >= 0 && savedIndex < slides.length) {
            return savedIndex;
        }

        if (progress.slideId) {
            const bySlideId = slideIds.indexOf(progress.slideId);
            if (bySlideId >= 0) return bySlideId;
        }

        if (progress.sectionId) {
            const bySectionId = getIndexById(progress.sectionId);
            if (bySectionId >= 0) return bySectionId;
        }

        return 0;
    }

    function getSectionId(slide) {
        return slide.dataset.sectionId || slide.dataset.slideId;
    }

    function getIndexById(id) {
        const direct = slideIds.indexOf(id);
        if (direct >= 0) return direct;
        return slides.findIndex((s) => getSectionId(s) === id);
    }

    function navTargetForSlide(slide) {
        return getSectionId(slide);
    }

    function updateUI(index, options = {}) {
        const { persist = true } = options;
        currentIndex = index;
        const activeSection = navTargetForSlide(slides[index]);

        navBtns.forEach((btn) => {
            btn.classList.toggle("active", btn.dataset.target === activeSection);
        });

        const dots = dotsContainer?.querySelectorAll(".slide-dot");
        dots?.forEach((dot, i) => dot.classList.toggle("active", i === index));

        if (counterEl && slides.length) {
            counterEl.textContent = `${index + 1} / ${slides.length}`;
        }

        updatePagePhase();

        if (persist) {
            saveProgress(index);
        }
    }

    function goToSlide(index, behavior) {
        if (!slides.length) return;

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        const scrollBehavior = behavior ?? (reducedMotion ? "auto" : "smooth");

        if (typeof window.stopAutoScroll === "function") {
            window.stopAutoScroll();
        }

        const clamped = Math.max(0, Math.min(index, slides.length - 1));
        slides[clamped].scrollIntoView({ behavior: scrollBehavior, block: "start" });
        updateUI(clamped);
    }

    window.scrollToSection = function scrollToSection(id) {
        const index = getIndexById(id);
        if (index >= 0) goToSlide(index);
    };

    window.goToSlide = goToSlide;

    function updatePagePhase() {
        const inIntro = currentIndex === 0;
        document.body.classList.toggle("phase-intro", inIntro);
        document.body.classList.toggle("phase-journey", !inIntro);
    }

    function onKeydown(e) {
        if (e.target.matches("input, textarea, select, [contenteditable]")) return;
        if (typeof window.isFigureLightboxOpen === "function" && window.isFigureLightboxOpen()) {
            return;
        }

        switch (e.key) {
            case "ArrowRight":
            case "ArrowDown":
            case "PageDown":
            case " ":
                e.preventDefault();
                goToSlide(currentIndex + 1);
                break;
            case "ArrowLeft":
            case "ArrowUp":
            case "PageUp":
                e.preventDefault();
                goToSlide(currentIndex - 1);
                break;
            case "Home":
                e.preventDefault();
                goToSlide(0);
                break;
            case "End":
                e.preventDefault();
                goToSlide(slides.length - 1);
                break;
        }
    }

    function bind() {
        slides = [...document.querySelectorAll(".slide[data-slide-id]")];
        navBtns = [...document.querySelectorAll(".nav-btn[data-target]")];
        dotsContainer = document.getElementById("slide-dots");
        counterEl = document.getElementById("slide-counter");
        slideIds = slides.map((s) => s.dataset.slideId);

        if (!slides.length) {
            if (dotsContainer) dotsContainer.innerHTML = "";
            if (counterEl) counterEl.textContent = "0 / 0";
            updatePagePhase();
            return;
        }

        if (dotsContainer) {
            dotsContainer.innerHTML = "";
            slideIds.forEach((id, i) => {
                const dot = document.createElement("button");
                dot.type = "button";
                dot.className = "slide-dot" + (i === 0 ? " active" : "");
                dot.setAttribute("aria-label", `ไปสไลด์ ${i + 1}: ${id}`);
                dot.addEventListener("click", () => goToSlide(i));
                dotsContainer.appendChild(dot);
            });
        }

        if (sectionObserver) sectionObserver.disconnect();
        if (slideObserver) slideObserver.disconnect();

        slideObserver = new IntersectionObserver(
            (entries) => {
                const visible = entries
                    .filter((e) => e.isIntersecting)
                    .sort((a, b) => b.intersectionRatio - a.intersectionRatio);
                if (!visible.length) return;
                const index = slides.indexOf(visible[0].target);
                if (index >= 0) updateUI(index);
            },
            { threshold: [0.45, 0.6, 0.75] }
        );
        slides.forEach((slide) => slideObserver.observe(slide));

        const initialIndex = resolveInitialIndex();

        updatePagePhase();
        updateUI(initialIndex, { persist: false });

        if (initialIndex > 0) {
            slides[initialIndex].scrollIntoView({ behavior: "auto", block: "start" });
        }

        saveProgress(initialIndex);
    }

    window.addEventListener("scroll", updatePagePhase, { passive: true });
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("slides:built", () => {
        bind();
        if (typeof window.initReveal === "function") window.initReveal();
    });

    bind();
})();
