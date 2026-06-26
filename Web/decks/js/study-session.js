(function initStudySession() {
    const SESSION_KEY = "tbp.deckStudySession.v1";
    const MANIFEST_URL = "data/manifest.json?v=20260626-middle-session";
    let manifestDecks = [];

    function readSession() {
        try {
            const parsed = JSON.parse(localStorage.getItem(SESSION_KEY) || "[]");
            return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
        } catch {
            return [];
        }
    }

    function writeSession(ids) {
        try {
            const clean = Array.from(new Set(ids.filter(Boolean)));
            localStorage.setItem(SESSION_KEY, JSON.stringify(clean));
            return clean;
        } catch {
            return ids;
        }
    }

    function deckUrl(deckId) {
        const params = new URLSearchParams({ deck: deckId, session: "1" });
        return `deck.html?${params.toString()}`;
    }

    function getCurrentDeckId() {
        return new URLSearchParams(window.location.search).get("deck") || "";
    }

    function escapeHtml(value) {
        return String(value ?? "").replace(/[&<>"']/g, function (ch) {
            return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
        });
    }

    function estimateMinutes(decks) {
        const sections = decks.reduce((sum, deck) => sum + Number(deck.sections || 0), 0);
        return Math.max(5, Math.round(sections * 1.6));
    }

    function getSelectedDecks(ids) {
        const order = new Map(ids.map((id, index) => [id, index]));
        return manifestDecks
            .filter((deck) => order.has(deck.id))
            .sort((a, b) => order.get(a.id) - order.get(b.id));
    }

    async function loadManifest() {
        if (manifestDecks.length) return manifestDecks;
        const response = await fetch(MANIFEST_URL);
        if (!response.ok) throw new Error("Failed to load deck manifest");
        const manifest = await response.json();
        manifestDecks = Array.isArray(manifest.decks) ? manifest.decks : [];
        return manifestDecks;
    }

    function renderHubBuilder() {
        const root = document.getElementById("studySessionBuilder");
        const list = document.getElementById("studySessionList");
        const summary = document.getElementById("studySessionSummary");
        const startButton = root?.querySelector('[data-session-action="open"]');
        if (!root || !list || !summary || !startButton) return;

        const sessionIds = readSession();
        const selected = getSelectedDecks(sessionIds);
        const selectedIds = new Set(sessionIds);
        const totalSections = selected.reduce((sum, deck) => sum + Number(deck.sections || 0), 0);

        list.innerHTML = manifestDecks
            .map((deck) => {
                const checked = selectedIds.has(deck.id) ? " checked" : "";
                return `
                    <label class="study-session-item">
                        <input type="checkbox" value="${escapeHtml(deck.id)}"${checked}>
                        <span>
                            <span class="study-session-item-title">Ch.${escapeHtml(deck.chapter)} ${escapeHtml(deck.title)}</span>
                            <span class="study-session-item-meta">${escapeHtml(deck.sections)} sections · ${deck.hasImages ? "figures included" : "text only"}</span>
                        </span>
                    </label>`;
            })
            .join("");

        if (selected.length) {
            summary.textContent = `${selected.length} chapter(s), ${totalSections} sections, about ${estimateMinutes(selected)} minutes. Queue is saved on this browser.`;
            startButton.disabled = false;
        } else {
            summary.textContent = "Choose chapters to create a persistent study route.";
            startButton.disabled = true;
        }
    }

    function bindHubBuilder() {
        const root = document.getElementById("studySessionBuilder");
        const list = document.getElementById("studySessionList");
        if (!root || !list) return;

        list.addEventListener("change", function () {
            const ids = Array.from(list.querySelectorAll("input:checked")).map((input) => input.value);
            writeSession(ids);
            renderHubBuilder();
        });

        root.addEventListener("click", function (event) {
            const actionButton = event.target.closest("[data-session-action]");
            if (!actionButton) return;
            const action = actionButton.dataset.sessionAction;

            if (action === "clear") {
                writeSession([]);
                renderHubBuilder();
                return;
            }

            if (action === "select-short") {
                const shortDecks = manifestDecks.filter((deck) => Number(deck.sections || 0) <= 12).map((deck) => deck.id);
                writeSession(shortDecks);
                renderHubBuilder();
                return;
            }

            if (action === "open") {
                const first = readSession()[0];
                if (first) window.location.href = deckUrl(first);
            }
        });

        renderHubBuilder();
    }

    function sessionNeighbor(currentId, direction) {
        const ids = readSession();
        const index = ids.indexOf(currentId);
        if (index < 0) return null;
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= ids.length) return null;
        return manifestDecks.find((deck) => deck.id === ids[nextIndex]) || null;
    }

    function renderDeckRail() {
        const rail = document.getElementById("studySessionRail");
        if (!rail) return;

        const currentId = getCurrentDeckId();
        const ids = readSession();
        const selected = getSelectedDecks(ids);
        const currentIndex = ids.indexOf(currentId);
        const currentDeck = manifestDecks.find((deck) => deck.id === currentId);

        if (!selected.length || currentIndex < 0) {
            rail.hidden = true;
            return;
        }

        const prev = sessionNeighbor(currentId, -1);
        const next = sessionNeighbor(currentId, 1);
        const remaining = selected.length - currentIndex - 1;

        rail.hidden = false;
        rail.innerHTML = `
            <div class="study-rail-card">
                <span class="study-rail-kicker">Study session</span>
                <strong>${currentIndex + 1}/${selected.length}: Ch.${escapeHtml(currentDeck?.chapter || "")}</strong>
                <span>${remaining ? `${remaining} deck(s) after this` : "Last deck in queue"}</span>
                <div class="study-rail-actions">
                    ${prev ? `<a href="${deckUrl(prev.id)}" aria-label="Previous session deck">Prev</a>` : ""}
                    ${next ? `<a href="${deckUrl(next.id)}" aria-label="Next session deck">Next</a>` : `<a href="index.html#studySessionBuilder">Edit</a>`}
                </div>
            </div>`;

        window.dispatchEvent(
            new CustomEvent("study-session:ready", {
                detail: { currentDeck, nextDeck: next, position: currentIndex + 1, total: selected.length },
            })
        );
    }

    function enhanceOutro(event) {
        const nextDeck = event.detail?.nextDeck;
        const outro = document.querySelector(".outro-scene");
        if (!outro || outro.querySelector(".study-session-next")) return;

        if (nextDeck) {
            const link = document.createElement("a");
            link.className = "btn-primary outro-hub-link study-session-next";
            link.href = deckUrl(nextDeck.id);
            link.textContent = `Next: Ch.${nextDeck.chapter} ${nextDeck.title}`;
            outro.appendChild(link);
        }
    }

    async function init() {
        try {
            await loadManifest();
            bindHubBuilder();
            renderDeckRail();
        } catch (err) {
            const summary = document.getElementById("studySessionSummary");
            if (summary) summary.textContent = "Study session builder is unavailable until the deck manifest loads.";
            console.error(err);
        }
    }

    window.addEventListener("study-session:ready", enhanceOutro);
    window.addEventListener("slides:built", renderDeckRail);
    init();
})();
