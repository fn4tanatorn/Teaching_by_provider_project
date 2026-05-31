/**
 * Scroll reveal — รองรับสไลด์ที่ render แบบ dynamic
 */
(function () {
    let panelObserver = null;
    let sectionObserver = null;

    function initScrollReveal() {
        const panels = document.querySelectorAll("[data-reveal-panel]");
        if (!panels.length) return;

        const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        document.documentElement.classList.add("reveal-ready");

        if (panelObserver) panelObserver.disconnect();
        if (sectionObserver) sectionObserver.disconnect();

        if (reducedMotion) {
            panels.forEach((panel) => panel.classList.add("is-visible"));
            return;
        }

        sectionObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    entry.target.classList.toggle("is-active", entry.isIntersecting);
                });
            },
            { threshold: 0.45 }
        );
        document.querySelectorAll(".slide").forEach((section) => sectionObserver.observe(section));

        panelObserver = new IntersectionObserver(
            (entries) => {
                entries.forEach((entry) => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add("is-visible");
                    }
                });
            },
            { threshold: 0.32, rootMargin: "-6% 0px -10% 0px" }
        );
        panels.forEach((panel) => panelObserver.observe(panel));

        let ticking = false;
        function updateParallax() {
            ticking = false;
            const vh = window.innerHeight;
            panels.forEach((panel) => {
                const section = panel.closest(".slide");
                if (!section || !section.classList.contains("is-active")) {
                    panel.style.setProperty("--parallax-y", "0px");
                    return;
                }
                const rect = section.getBoundingClientRect();
                const progress = (vh * 0.5 - (rect.top + rect.height * 0.5)) / vh;
                const y = Math.max(-12, Math.min(12, progress * 18));
                panel.style.setProperty("--parallax-y", `${y.toFixed(1)}px`);
            });
        }

        window.addEventListener(
            "scroll",
            () => {
                if (!ticking) {
                    ticking = true;
                    requestAnimationFrame(updateParallax);
                }
            },
            { passive: true }
        );
        updateParallax();
    }

    window.initReveal = initScrollReveal;
    initScrollReveal();
})();
