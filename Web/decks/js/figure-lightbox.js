/**
 * Tap / click slide figures to view full-size in a lightbox.
 */
(function initFigureLightbox() {
    let lightbox = document.getElementById("figure-lightbox");
    let imgEl;
    let captionEl;
    let closeBtn;

    function ensureLightbox() {
        if (lightbox) return;

        lightbox = document.createElement("div");
        lightbox.id = "figure-lightbox";
        lightbox.className = "figure-lightbox";
        lightbox.setAttribute("role", "dialog");
        lightbox.setAttribute("aria-modal", "true");
        lightbox.setAttribute("aria-hidden", "true");
        lightbox.innerHTML = `
            <button type="button" class="figure-lightbox-backdrop" aria-label="ปิดการขยายรูป"></button>
            <div class="figure-lightbox-panel">
                <button type="button" class="figure-lightbox-close" aria-label="ปิด">×</button>
                <div class="figure-lightbox-frame">
                    <img class="figure-lightbox-img" alt="">
                </div>
                <p class="figure-lightbox-caption"></p>
            </div>`;

        document.body.appendChild(lightbox);
        imgEl = lightbox.querySelector(".figure-lightbox-img");
        captionEl = lightbox.querySelector(".figure-lightbox-caption");
        closeBtn = lightbox.querySelector(".figure-lightbox-close");
        const backdrop = lightbox.querySelector(".figure-lightbox-backdrop");

        closeBtn.addEventListener("click", close);
        backdrop.addEventListener("click", close);
        lightbox.querySelector(".figure-lightbox-panel").addEventListener("click", (e) => {
            if (e.target === e.currentTarget) close();
        });
    }

    function isOpen() {
        return lightbox?.classList.contains("is-open");
    }

    function open(figureImg) {
        ensureLightbox();
        const figure = figureImg.closest(".slide-figure");
        const caption = figure?.querySelector(".slide-figure-caption")?.textContent?.trim() || "";

        imgEl.src = figureImg.currentSrc || figureImg.src;
        imgEl.alt = figureImg.alt || caption || "Textbook figure";
        captionEl.textContent = caption;
        captionEl.hidden = !caption;

        lightbox.classList.add("is-open");
        lightbox.setAttribute("aria-hidden", "false");
        document.body.classList.add("lightbox-open");
        closeBtn.focus();
    }

    function close() {
        if (!isOpen()) return;
        lightbox.classList.remove("is-open");
        lightbox.setAttribute("aria-hidden", "true");
        document.body.classList.remove("lightbox-open");
        imgEl.removeAttribute("src");
    }

    function onFigureClick(e) {
        const img = e.target.closest(".slide-figure-frame img");
        if (!img) return;
        e.preventDefault();
        e.stopPropagation();
        open(img);
    }

    function onKeydown(e) {
        if (!isOpen()) return;
        if (e.key === "Escape") {
            e.preventDefault();
            e.stopImmediatePropagation();
            close();
            return;
        }
        if (e.key === " " || e.key === "ArrowDown" || e.key === "ArrowRight") {
            e.stopImmediatePropagation();
        }
    }

    function onFigureKeydown(e) {
        const frame = e.target.closest(".slide-figure-frame[role='button']");
        if (!frame || (e.key !== "Enter" && e.key !== " ")) return;
        const img = frame.querySelector("img");
        if (!img) return;
        e.preventDefault();
        open(img);
    }

    document.addEventListener("click", onFigureClick);
    document.addEventListener("keydown", onFigureKeydown);
    document.addEventListener("keydown", onKeydown, true);

    window.closeFigureLightbox = close;
    window.isFigureLightboxOpen = isOpen;
})();
