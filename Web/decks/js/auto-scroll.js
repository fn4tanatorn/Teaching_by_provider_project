/**
 * Auto-scroll — แกะจาก v3.html
 * เลื่อนสไลด์อัตโนมัติแบบ Play / Stop
 */
(function initAutoScroll() {
    const btn = document.getElementById("auto-scroll-btn");
    if (!btn) return;

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const pxPerSecond = reducedMotion ? 32 : 52;
    let playing = false;
    let rafId = null;
    let lastTime = 0;

    function maxScrollY() {
        return Math.max(0, document.documentElement.scrollHeight - window.innerHeight);
    }

    function setPlaying(on) {
        playing = on;
        btn.classList.toggle("is-playing", on);
        btn.setAttribute("aria-pressed", on ? "true" : "false");
        btn.setAttribute(
            "aria-label",
            on ? "หยุดการเลื่อนอัตโนมัติ" : "เล่นการเลื่อนหน้าอัตโนมัติ"
        );
        document.body.classList.toggle("auto-scroll-active", on);
    }

    function stop() {
        if (rafId) cancelAnimationFrame(rafId);
        rafId = null;
        lastTime = 0;
        setPlaying(false);
    }

    function tick(now) {
        if (!playing) return;
        if (!lastTime) lastTime = now;
        const dt = Math.min(48, now - lastTime) / 1000;
        lastTime = now;

        const maxY = maxScrollY();
        const nextY = window.scrollY + pxPerSecond * dt;

        if (nextY >= maxY - 0.5) {
            window.scrollTo(0, maxY);
            stop();
            return;
        }

        window.scrollTo(0, nextY);
        rafId = requestAnimationFrame(tick);
    }

    function play() {
        if (maxScrollY() <= 0) return;

        if (window.scrollY >= maxScrollY() - 4) {
            window.scrollTo({ top: 0, behavior: reducedMotion ? "auto" : "smooth" });
            window.setTimeout(() => {
                lastTime = 0;
                setPlaying(true);
                rafId = requestAnimationFrame(tick);
            }, reducedMotion ? 80 : 700);
            return;
        }

        lastTime = 0;
        setPlaying(true);
        rafId = requestAnimationFrame(tick);
    }

    btn.addEventListener("click", () => {
        if (playing) stop();
        else play();
    });

    window.addEventListener("wheel", () => { if (playing) stop(); }, { passive: true });
    window.addEventListener("touchstart", () => { if (playing) stop(); }, { passive: true });
    window.addEventListener("keydown", (e) => {
        if (!playing) return;
        const keys = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];
        if (keys.includes(e.key)) stop();
    });

    window.stopAutoScroll = stop;
})();
