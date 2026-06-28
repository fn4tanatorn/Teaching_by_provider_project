import * as PUBLIC_SB from './js/supabase-config.js';
import { createDataService, profileRowToUser } from './js/data-service.js';
import { createUserStateService } from './js/user-state-service.js';
import { initWelcomeHeartScene, disposeWelcomeHeartScene } from './js/welcome-heart-scene.js';

const LOCAL_SB =
    typeof location !== 'undefined' && ['localhost', '127.0.0.1'].includes(location.hostname)
        ? await import('./js/supabase-config.local.js').catch(() => ({}))
        : {};
const SB = { ...PUBLIC_SB, ...LOCAL_SB };

function metaConfig(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    const v = el && el.getAttribute('content');
    const t = v != null ? String(v).trim() : '';
    return t || null;
}

const EMBEDDED_TEST_UID = 'clinical-embedded-test-user-v1';

function lineNameKey(s) {
    return String(s ?? '')
        .trim()
        .toLowerCase();
}

function isEmbeddedTestLogin(username, password) {
    const wantU =
        typeof SB.EMBEDDED_TEST_LOGIN_USERNAME === 'string' ? SB.EMBEDDED_TEST_LOGIN_USERNAME.trim() : '';
    const wantP =
        typeof SB.EMBEDDED_TEST_LOGIN_PASSWORD === 'string' ? SB.EMBEDDED_TEST_LOGIN_PASSWORD : '';
    if (!wantU || !wantP) return false;
    return lineNameKey(username) === lineNameKey(wantU) && password === wantP;
}

function buildEmbeddedTestUser() {
    const un =
        typeof SB.EMBEDDED_TEST_LOGIN_USERNAME === 'string'
            ? SB.EMBEDDED_TEST_LOGIN_USERNAME.trim()
            : 'embedded_test';
    return {
        id: EMBEDDED_TEST_UID,
        uid: EMBEDDED_TEST_UID,
        username: un,
        status: 'approved',
        expiresAt: null,
        createdAt: Date.now(),
        videoStreak: 0,
        checkinStreak: 0,
        lastCheckinDate: null,
        lastVideoDate: null,
        quizHistory: {}
    };
}

function resolveAppUrl(target) {
    try {
        return new URL(target, window.location.href).href;
    } catch (_) {
        return target;
    }
}

/** MedQuiz path inside the combined web app. */
function getBetaFunctionUrl() {
    return resolveAppUrl(metaConfig('clinical-beta-url') || 'medquiz/');
}

/** Live classroom quiz path inside the combined web app. */
function getLiveQuizUrl() {
    return resolveAppUrl(metaConfig('clinical-livequiz-url') || 'livequiz/');
}

/** Pharmacology deck hub path inside the combined web app. */
function getDecksUrl() {
    return resolveAppUrl('decks/');
}

/** Image-supported spaced repetition app inside the combined web app. */
function getFlashcardsUrl() {
    return resolveAppUrl('flashcards/');
}

const BETA_DAILY_PREFIX = 'clinical_video_beta_used_v1:';

function getLocalTodayYMD() {
    const d = new Date();
    return (
        d.getFullYear() +
        '-' +
        String(d.getMonth() + 1).padStart(2, '0') +
        '-' +
        String(d.getDate()).padStart(2, '0')
    );
}

function embeddedTestUsername() {
    return typeof SB.EMBEDDED_TEST_LOGIN_USERNAME === 'string'
        ? SB.EMBEDDED_TEST_LOGIN_USERNAME.trim()
        : '';
}

/** Optional configured test account can open MedQuiz without the daily limit. */
function isBetaDailyExemptUser(user) {
    if (!user) return false;
    if (user.uid === EMBEDDED_TEST_UID || user.embeddedTestLogin) return true;
    const exempt = embeddedTestUsername();
    if (!exempt) return false;
    return lineNameKey(user.username) === lineNameKey(exempt);
}

function betaDailyStorageKey(user) {
    const uid = user && (user.uid || user.id);
    if (uid) return BETA_DAILY_PREFIX + uid;
    const name = user && user.username ? String(user.username).trim() : 'anonymous';
    return BETA_DAILY_PREFIX + encodeURIComponent(name).replace(/%/g, '_');
}

function hasUsedBetaToday(user) {
    if (!user) return false;
    try {
        return localStorage.getItem(betaDailyStorageKey(user)) === getLocalTodayYMD();
    } catch {
        return false;
    }
}

function markBetaUsedToday(user) {
    if (!user) return;
    try {
        localStorage.setItem(betaDailyStorageKey(user), getLocalTodayYMD());
    } catch {
        /* private mode */
    }
}

const CLINICAL_DRAFT_PREFIX = 'clinical_video_draft_v1:';
const CLINICAL_LAST_VIDEO_PREFIX = 'clinical_video_last_video_v1:';
const CLINICAL_SIDEBAR_COLLAPSED_KEY = 'clinical_video_sidebar_collapsed_v1';

/** Store form drafts on localhost, or when explicitly enabled by meta or localStorage flag. */
function persistFormsEnabled() {
    try {
        const v = metaConfig('clinical-persist-forms');
        if (v === '1' || /^true$/i.test(v || '') || /^yes$/i.test(v || '')) return true;
        if (typeof localStorage !== 'undefined' && localStorage.getItem('clinical_video_persist_forms') === '1') {
            return true;
        }
        const h = location.hostname;
        return h === 'localhost' || h === '127.0.0.1' || h === '[::1]';
    } catch {
        return false;
    }
}

function debounce(fn, wait) {
    let t;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), wait);
    };
}

function saveDraft(key, value) {
    if (!persistFormsEnabled()) return;
    try {
        const k = CLINICAL_DRAFT_PREFIX + key;
        if (value === null || value === undefined) {
            localStorage.removeItem(k);
        } else {
            localStorage.setItem(k, typeof value === 'string' ? value : JSON.stringify(value));
        }
    } catch (_) {
        /* quota */
    }
}

function loadDraftRaw(key) {
    if (!persistFormsEnabled()) return null;
    try {
        return localStorage.getItem(CLINICAL_DRAFT_PREFIX + key);
    } catch {
        return null;
    }
}

function loadDraftJson(key) {
    const raw = loadDraftRaw(key);
    if (raw == null) return null;
    try {
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

function initClinicalVideoApp() {

    if (typeof location !== 'undefined' && location.protocol === 'file:') {
        console.warn(
            '[Clinical Study Hub] Running from file://. Use a local server such as node Web/server.js, then open http://localhost:3000.'
        );
    }

    const SUPABASE_URL = metaConfig('clinical-supabase-url') || SB.SUPABASE_URL;
    const SUPABASE_ANON_KEY = metaConfig('clinical-supabase-anon-key') || SB.SUPABASE_ANON_KEY;

    const supabaseConfigReady = Boolean(
        SUPABASE_URL &&
        SUPABASE_ANON_KEY &&
        !String(SUPABASE_URL).includes('YOUR_PROJECT') &&
        !String(SUPABASE_ANON_KEY).includes('YOUR_ANON')
    );

    const useLocalMemberAuth = Boolean(SB.LOCAL_MEMBER_AUTH);

    if (!supabaseConfigReady) {
        const tip = document.createElement('div');
        tip.setAttribute('role', 'alert');
        tip.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99998;padding:12px 16px;background:#111827;color:#fff;font-size:14px;text-align:center;line-height:1.45;font-family:system-ui,sans-serif;';
        tip.innerHTML =
            '<strong>Supabase is not configured.</strong> Add values in <code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">js/supabase-config.js</code> ' +
            'or in <code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">index.html</code> using the <code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">clinical-supabase-url</code> and ' +
            '<code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">clinical-supabase-anon-key</code> meta tags from Project Settings, API.';
        document.body.prepend(tip);
    }

    const ds = createDataService(SUPABASE_URL, SUPABASE_ANON_KEY);

    const ADMIN_AUTH_EMAIL =
        typeof SB.ADMIN_AUTH_EMAIL === 'string' && SB.ADMIN_AUTH_EMAIL.trim()
            ? SB.ADMIN_AUTH_EMAIL.trim()
            : 'admin@med.local';
    const SYSTEM_ADMIN_AUTH_EMAIL =
        typeof SB.SYSTEM_ADMIN_AUTH_EMAIL === 'string' && SB.SYSTEM_ADMIN_AUTH_EMAIL.trim()
            ? SB.SYSTEM_ADMIN_AUTH_EMAIL.trim()
            : '';
    const ADMIN_GATE_PASSWORD =
        typeof SB.ADMIN_GATE_PASSWORD === 'string' ? SB.ADMIN_GATE_PASSWORD : '';
    const SYSTEM_ADMIN_GATE_PASSWORD =
        typeof SB.SYSTEM_ADMIN_GATE_PASSWORD === 'string' ? SB.SYSTEM_ADMIN_GATE_PASSWORD : '';

    // --- State ---
    let videos = [];
    let users = [];
    let allowedNames = [];
    let subjects = [];
    let currentUser = null;
    let countdownInterval = null;
    /** Epoch ms; shared exam shown when user profile has no `expiresAt`. */
    let globalExamDeadlineMs = null;
    let globalExamNote = '';
    let sharedMenuOrder = null;
    let currentEditorOrder = null;
    let selectedSubject = '';
    let currentWatchVideo = null;
    let videoSearchQuery = '';
    let loginStuckTimer = null;
    let brainGraph = null;
    let presenceTimer = null;
    let flashcardDeckOptions = [];

    const useLocalMemberStorage = useLocalMemberAuth || Boolean(embeddedTestUsername());
    const userState = createUserStateService({ dataService: ds, useLocalMemberStorage });

    function withTimeout(promise, ms) {
        return Promise.race([
            promise,
            new Promise((_, reject) => {
                setTimeout(() => reject(Object.assign(new Error('TIMEOUT'), { code: 'TIMEOUT' })), ms || 15000);
            })
        ]);
    }

    /** Supabase Auth / PostgREST user-facing errors */
    function formatAuthError(err, context) {
        const msg = String((err && err.message) || '');
        const code = err && err.code;
        if (code === 'email_exists' || msg.includes('already registered')) {
            return context === 'register'
                ? 'This name is already registered. Go back to Log in and use the same password.'
                : 'This name already has an account. Use Log in.';
        }
        if (code === 'invalid_credentials' || msg.includes('Invalid login') || msg.includes('invalid')) {
            return 'The name or password is incorrect, or this account has not been registered.';
        }
        if (msg.includes('Email') && msg.includes('valid')) return 'The name format is not valid. Use letters, numbers, and spaces.';
        if (code === 'weak_password' || msg.includes('Password')) return 'Password is too short. Use at least 6 characters.';
        const status = err && err.status;
        if (
            msg.includes('rate limit') ||
            msg.includes('429') ||
            msg.includes('Too Many Requests') ||
            code === 'over_request_rate' ||
            status === 429
        ) {
            return (
                'Supabase is rate limiting sign-ins. Wait a moment, or adjust Dashboard > Authentication > Rate limits while testing. ' +
                'If you are testing the same name repeatedly, remove that user in Authentication > Users or use another name.'
            );
        }
        if (err && (err.code === 'TIMEOUT' || err.message === 'TIMEOUT')) {
            return 'The server did not respond in time. Check your connection or Supabase project status.';
        }
        return msg || 'Something went wrong. Please try again.';
    }

    function getVideoSubject(v) {
        return v.subject || (subjects.length > 0 ? subjects[0] : 'anatomy');
    }

    function getVideoSlide(video) {
        const url = String(video?.slideUrl || video?.slidesUrl || '').trim();
        if (!url) return null;
        const title = String(video?.slideTitle || '').trim() || 'Open slide';
        return { url, title };
    }

    function flashcardDeckLabel(deckId) {
        const deck = flashcardDeckOptions.find((item) => item.id === deckId);
        return deck?.name || 'Linked deck';
    }

    function renderFlashcardDeckSelect(selectedId = '') {
        if (!newVideoFlashcardDeck) return;
        const current = selectedId || newVideoFlashcardDeck.value || '';
        newVideoFlashcardDeck.innerHTML = '<option value="">No linked deck</option>';
        flashcardDeckOptions.forEach((deck) => {
            const option = document.createElement('option');
            option.value = deck.id;
            option.textContent = deck.name;
            newVideoFlashcardDeck.append(option);
        });
        newVideoFlashcardDeck.value = flashcardDeckOptions.some((deck) => deck.id === current) ? current : '';
    }

    function openLinkedFlashcards(deckId) {
        if (!currentUser) {
            showToast('Log in before opening Flashcards.', 'error');
            return;
        }
        const linkedDeckId = String(deckId || '').trim();
        if (!linkedDeckId) {
            handleLearningNavigation('flashcards');
            return;
        }
        if (flashcardsFrame) {
            flashcardsFrame.src = getFlashcardsUrlForDeck(linkedDeckId, true);
        }
        navigateTo(pageFlashcards);
    }

    function getLinkedFlashcardDeckId(item) {
        return String(item?.flashcardDeckId || item?.linkedFlashcardDeckId || '').trim();
    }

    function getFlashcardsUrlForDeck(deckId, embed = false) {
        const url = new URL('flashcards/index.html', window.location.href);
        if (embed) url.searchParams.set('embed', '1');
        if (deckId) url.searchParams.set('deck', deckId);
        return url.href;
    }

    function fallbackFlashcardDecksFromStorage() {
        try {
            const parsed = JSON.parse(localStorage.getItem('flashcards-web:v1') || '{}');
            return Array.isArray(parsed.decks)
                ? parsed.decks
                    .map((deck) => ({
                        id: String(deck.id || ''),
                        name: String(deck.name || '').trim()
                    }))
                    .filter((deck) => deck.id && deck.name)
                : [];
        } catch {
            return [];
        }
    }

    async function fetchFlashcardDeckOptions() {
        try {
            const response = await fetch('/.netlify/functions/flashcards-api', { headers: { Accept: 'application/json' } });
            if (!response.ok) throw new Error('Flashcards bank unavailable');
            const payload = await response.json();
            const decks = payload?.state?.decks;
            if (!Array.isArray(decks)) return fallbackFlashcardDecksFromStorage();
            return decks
                .map((deck) => ({
                    id: String(deck.id || ''),
                    name: String(deck.name || '').trim()
                }))
                .filter((deck) => deck.id && deck.name);
        } catch {
            return fallbackFlashcardDecksFromStorage();
        }
    }

    function nameKey(name) {
        return encodeURIComponent(String(name || '').trim())
            .replace(/%/g, '_')
            .replace(/[.#$[\]]/g, '_');
    }

    function normalizeLineAllowName(name) {
        return String(name ?? '').trim().toLowerCase();
    }

    /** Compare typed names with the allow-list using case-insensitive trimmed values. */
    function isLineNameOnAllowList(typedName, list) {
        const key = normalizeLineAllowName(typedName);
        if (!key) return false;
        if (!list || list.length === 0) return true;
        return list.some((n) => normalizeLineAllowName(n) === key);
    }

    function escapeHtml(value) {
        return String(value ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function currentUserStorageKey() {
        if (!currentUser) return '';
        return String(currentUser.uid || currentUser.id || currentUser.username || '').trim();
    }

    function getPresenceId() {
        let id = localStorage.getItem('clinical_presence_id');
        if (!id) {
            id = (window.crypto?.randomUUID?.() || `presence-${Date.now()}-${Math.random().toString(16).slice(2)}`);
            localStorage.setItem('clinical_presence_id', id);
        }
        return id;
    }

    function activePageLabel() {
        const active = document.querySelector('.page.active');
        return active?.dataset?.screenLabel || active?.id || 'Home';
    }

    function renderPresenceSummary(summary) {
        const countEl = document.getElementById('home-online-count');
        const copyEl = document.getElementById('home-online-copy');
        const studentsEl = document.getElementById('home-online-students');
        const staffEl = document.getElementById('home-online-staff');
        if (!countEl || !copyEl || !studentsEl || !staffEl) return;

        const total = Number(summary?.total || 0);
        const students = Number(summary?.students || 0);
        const staff = Number(summary?.staff || 0);
        countEl.textContent = String(total);
        copyEl.textContent = total === 1 ? 'Web user online now' : 'Web users online now';
        studentsEl.textContent = `Visitors ${students}`;
        staffEl.textContent = `Staff ${staff}`;
    }

    async function pingPresence() {
        try {
            const payload = {
                id: getPresenceId(),
                name: currentUser?.username || 'Guest',
                role: currentUser?.isAdmin ? 'admin' : 'student',
                page: activePageLabel()
            };
            const response = await fetch('/.netlify/functions/presence-api', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
            const data = await response.json();
            if (response.ok) renderPresenceSummary(data.summary);
        } catch (error) {
            console.warn('[Presence]', error);
        }
    }

    function startPresence() {
        if (presenceTimer) return;
        void pingPresence();
        presenceTimer = window.setInterval(pingPresence, 30000);
    }

    function lastVideoStorageKey() {
        const userKey = currentUserStorageKey();
        return userKey ? CLINICAL_LAST_VIDEO_PREFIX + encodeURIComponent(userKey) : '';
    }

    function saveLastOpenedVideo(video) {
        const storageKey = lastVideoStorageKey();
        if (!storageKey || !video?.id) return;
        try {
            localStorage.setItem(storageKey, JSON.stringify({
                id: video.id,
                subject: getVideoSubject(video),
                openedAt: Date.now()
            }));
        } catch (_) {
            /* private mode */
        }
    }

    function loadLastOpenedVideo() {
        const storageKey = lastVideoStorageKey();
        if (!storageKey) return null;
        try {
            const raw = localStorage.getItem(storageKey);
            if (!raw) return null;
            const parsed = JSON.parse(raw);
            return parsed && typeof parsed === 'object' ? parsed : null;
        } catch {
            return null;
        }
    }

    let clinicalToastTimer = null;
    /** @param {'success'|'error'|'info'} [variant] */
    function showToast(message, variant = 'success') {
        if (!message) return;
        let el = document.getElementById('clinical-toast');
        if (!el) {
            el = document.createElement('div');
            el.id = 'clinical-toast';
            el.setAttribute('role', 'status');
            el.setAttribute('aria-live', 'polite');
            document.body.appendChild(el);
        }
        el.className = 'clinical-toast--' + variant;
        el.textContent = message;
        requestAnimationFrame(() => {
            el.style.opacity = '1';
        });
        clearTimeout(clinicalToastTimer);
        clinicalToastTimer = setTimeout(() => {
            el.style.opacity = '0';
        }, 3200);
    }

    function usersToRecord(list = users) {
        return list.reduce((acc, user) => {
            const key = user?.uid || user?.id;
            if (!key) return acc;
            acc[key] = user;
            return acc;
        }, {});
    }

    async function updateCheckinStreak() {
        if (!currentUser) return;
        const key = nameKey(currentUser.username);
        const rows = await ds.queryResponsesByNameKey(key);
        const today = getTodayYMD();

        if (!rows.length) {
            currentUser.checkinStreak = 0;
            await userState.saveProfile(currentUser);
            renderStreaks();
            return;
        }

        const uniqueDates = [...new Set(rows.map(r => r.date))]
            .filter(Boolean)
            .sort()
            .reverse();

        let streak = 0;
        let expected = today;
        if (uniqueDates.length > 0 && uniqueDates[0] !== today) {
            const yesterdayDate = parseYMD(today);
            yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
            const yesterdayYMD = yesterdayDate.getUTCFullYear() + '-'
                + String(yesterdayDate.getUTCMonth() + 1).padStart(2, '0') + '-'
                + String(yesterdayDate.getUTCDate()).padStart(2, '0');
            if (uniqueDates[0] === yesterdayYMD) {
                expected = yesterdayYMD;
            }
        }
        for (const date of uniqueDates) {
            if (date === expected) {
                streak++;
                const d = parseYMD(expected);
                d.setUTCDate(d.getUTCDate() - 1);
                expected = d.getUTCFullYear() + '-'
                    + String(d.getUTCMonth() + 1).padStart(2, '0') + '-'
                    + String(d.getUTCDate()).padStart(2, '0');
            } else if (date < expected) {
                break;
            }
        }

        currentUser.checkinStreak = streak;
        currentUser.lastCheckinDate = today;
        await userState.saveProfile(currentUser);
        renderStreaks();
    }

    // ==========================================
    // AUTHENTICATION STATE OBSERVER (Supabase)
    // Register after sync init: Supabase may invoke the callback immediately; DOM refs
    // (pageLogin, btnAdminLogin, navigateTo, …) must exist first or the whole script throws.
    // ==========================================
    let _authStateBusy = false;
    if (supabaseConfigReady) queueMicrotask(() => {
    ds.onAuthStateChange(async (event, session) => {
        const user = session && session.user;

        if (user && currentUser && currentUser.isAdmin && currentUser.localPasswordAdmin) {
            currentUser.uid = user.id;
            currentUser.localPasswordAdmin = false;
            const lb = document.getElementById('local-admin-banner');
            if (lb) lb.style.display = 'none';
            return;
        }

        if (_authStateBusy) return;
        _authStateBusy = true;

        try {
        if (user) {
            if (useLocalMemberAuth) {
                try {
                    const onlyAdmin = await ds.isAdmin(user.id);
                    if (!onlyAdmin) {
                        await ds.authSignOut().catch(() => {});
                        return;
                    }
                } catch (_) {
                    return;
                }
            }
            try {
                const adminOk = await Promise.race([
                    ds.isAdmin(user.id),
                    new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), 10000))
                ]);

                if (adminOk) {
                    const role = await ds.fetchRole(user.id).catch(() => 'admin');
                    currentUser = {
                        uid: user.id,
                        username: user.email,
                        role,
                        isAdmin: true,
                        systemAdmin:
                            Boolean(SYSTEM_ADMIN_AUTH_EMAIL && user.email === SYSTEM_ADMIN_AUTH_EMAIL)
                    };
                    if (pageLogin.classList.contains('active') || pageRegister.classList.contains('active') || pageWelcome.classList.contains('active')) {
                        navigateTo(pageAdmin);
                        renderAdminUsers();
                        renderAdminFeedbacks();
                    } else {
                        updateAdminButtonVisibility(document.querySelector('.page.active'));
                    }
                    return;
                }

                const userData = await userState.refreshProfile(user.id);
                const onLoginScreen = pageLogin.classList.contains('active');

                if (!userData) {
                    if (onLoginScreen) {
                        loginError.textContent = 'No member profile for this account. Register first, or sign in with the Line name you used when joining.';
                        loginError.style.display = 'block';
                        setLoginLoading(false);
                        await ds.authSignOut();
                    }
                    return;
                }

                const currentAllowed = await ds.fetchAllowedNames();
                const userName = normalizeLineAllowName(userData.username);
                const stillAllowed =
                    currentAllowed.length === 0 ||
                    currentAllowed.some((n) => normalizeLineAllowName(n) === userName);
                if (!stillAllowed) {
                    alert("Your name has been removed from the approved list. Please contact the admin.");
                    await ds.authSignOut();
                    return;
                }

                if (userData.status === 'approved') {
                    if (userData.expiresAt && Date.now() > userData.expiresAt) {
                        alert("Your access has expired. Please register again.");
                        await ds.authSignOut();
                        return;
                    }

                    const role = await ds.fetchRole(user.id).catch(() => 'student');
                    currentUser = { ...userData, uid: user.id, role, isAdmin: false };
                    renderStreaks();
                    syncExamCountdown();

                    if (pageLogin.classList.contains('active') || pageRegister.classList.contains('active') || pageWelcome.classList.contains('active')) {
                        routeStudentAfterLoginFromGate();
                    } else {
                        updateAdminButtonVisibility(document.querySelector('.page.active'));
                    }
                } else if (onLoginScreen) {
                    loginError.textContent = 'Your account is not approved yet. Please wait for an admin or contact support.';
                    loginError.style.display = 'block';
                    setLoginLoading(false);
                    await ds.authSignOut();
                }
            } catch (err) {
                console.warn('[auth-state] verification error, keeping session:', err);
                if (pageLogin.classList.contains('active')) {
                    loginError.textContent = 'Could not verify your account. Check your connection or try again.';
                    loginError.style.display = 'block';
                    setLoginLoading(false);
                }
            }
        } else {
            if (useLocalMemberAuth) {
                const restored = userState.restoreLocalSession();
                if (restored) {
                    currentUser = restored;
                    setLoginLoading(false);
                    renderStreaks();
                    syncExamCountdown();
                    updateAdminButtonVisibility(document.querySelector('.page.active'));
                    return;
                }
            }
            const gateFlag =
                typeof sessionStorage !== 'undefined'
                    ? sessionStorage.getItem('clinical_video_admin_gate')
                    : null;
            if (gateFlag === '1' || gateFlag === 'system_admin') {
                currentUser = {
                    uid: null,
                    username: gateFlag === 'system_admin' ? 'system_admin' : 'Admin',
                    isAdmin: true,
                    localPasswordAdmin: true,
                    systemAdmin: gateFlag === 'system_admin'
                };
                setLoginLoading(false);
                updateAdminButtonVisibility(document.querySelector('.page.active'));
                if (countdownInterval) clearInterval(countdownInterval);
                countdownInterval = null;
                syncExamCountdown();
                return;
            }
            currentUser = null;
            setLoginLoading(false);
            updateAdminButtonVisibility(document.querySelector('.page.active'));
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = null;
            syncExamCountdown();
            if (wantsVideoFeedRoute()) {
                navigateTo(pageVideos);
            } else if (!pageWelcome.classList.contains('active') && !pageLogin.classList.contains('active') && !pageRegister.classList.contains('active')) {
                navigateTo(pageWelcome);
            }
        }
        } finally { _authStateBusy = false; }
    });
    });

    function updateAdminButtonVisibility(pageElement) {
        if (!btnAdminLogin || !pageElement) return;

        const pageId = pageElement.id;
        const isAdmin = currentUser && currentUser.isAdmin;

        if (pageId === 'page-admin' || pageId === 'page-checkin-bank-admin' || pageId === 'page-video-linker') {
            btnAdminLogin.style.display = 'none';
        } else if (pageId === 'page-welcome' || isAdmin) {
            btnAdminLogin.style.display = 'block';
        } else {
            btnAdminLogin.style.display = 'none';
        }

    }

    function defaultSeedVideos() {
        return [
            { id: 1, subject: 'anatomy', url: 'https://www.youtube.com/embed/jNQXAC9IVRw', videoId: 'jNQXAC9IVRw', title: 'Me at the zoo', subtitle: 'jawed', badge: 'Trending', views: 320 },
            { id: 2, subject: 'histology', url: 'https://www.youtube.com/embed/dQw4w9WgXcQ', videoId: 'dQw4w9WgXcQ', title: 'Rick Astley - Never Gonna Give You Up', subtitle: 'Rick Astley', badge: 'Music', views: 415 }
        ];
    }

    function saveVideosDB(options = {}) {
        const { successToast } = options;
        return ds
            .saveVideosArray(videos)
            .then(() => {
                if (successToast) showToast(successToast);
            })
            .catch((err) => alert('Save failed: ' + (err.message || err)));
    }

    async function saveUsersDB(options = {}) {
        const { successToast } = options;
        try {
            await ds.syncMembersFromUsersArray(users);
            if (successToast) showToast(successToast);
        } catch (err) {
            console.error('saveUsersDB', err);
            alert('Could not save members: ' + (err && err.message ? err.message : String(err)));
        }
    }

    function saveAllowedNamesDB() {
        return ds
            .saveAdminSettingsPatch({ allowed_names: allowedNames.length > 0 ? allowedNames : [] })
            .catch((err) => {
                const base = err && err.message ? err.message : String(err);
                let msg = 'Save failed: ' + base;
                if (currentUser && currentUser.localPasswordAdmin) {
                    msg +=
                        '\n\nPassword-only admin access cannot write to Supabase tables. Sign in with an admin or teacher role in public.user_roles.';
                }
                alert(msg);
                throw err;
            });
    }

    function saveSubjectsDB() {
        return ds.saveAdminSettingsPatch({ subjects }).catch((err) => {
            alert('Save failed: ' + err.message);
            throw err;
        });
    }

    function getTodayYMD() {
        const d = new Date();
        return d.getFullYear() + "-" + String(d.getMonth()+1).padStart(2,'0') + "-" + String(d.getDate()).padStart(2,'0');
    }
    function parseYMD(dateStr) {
        if (!dateStr) return null;
        const p = dateStr.split('-');
        if (p.length !== 3) return null;
        return new Date(Date.UTC(+p[0], +p[1]-1, +p[2]));
    }
    function diffDaysYMD(a, b) {
        const da = parseYMD(a);
        const db = parseYMD(b);
        if (!da || !db) return 0;
        return Math.floor((db - da) / 86400000);
    }

    function renderStreaks() {
        if (!currentUser) return;
        const todayStr = getTodayYMD();
        let displayVideo = currentUser.videoStreak || 0;
        if (currentUser.lastVideoDate) {
            const diff = diffDaysYMD(currentUser.lastVideoDate, todayStr);
            if (diff > 1) displayVideo = 0;
        } else {
            displayVideo = 0;
        }
        let displayCheckin = currentUser.checkinStreak || 0;
        if (currentUser.lastCheckinDate) {
            const diff = diffDaysYMD(currentUser.lastCheckinDate, todayStr);
            if (diff > 1) displayCheckin = 0;
        } else {
            displayCheckin = 0;
        }
        const videoBadge = document.getElementById("badge-video-streak");
        if (videoBadge) videoBadge.textContent = `Video ${displayVideo}d`;
        const checkinBadge = document.getElementById("badge-checkin-streak");
        if (checkinBadge) checkinBadge.textContent = `Check-in ${displayCheckin}d`;
        const bmVideoBadge = document.getElementById("badge-video-streak-bm");
        if (bmVideoBadge) bmVideoBadge.textContent = `Video ${displayVideo}d`;
        const bmCheckinBadge = document.getElementById("badge-checkin-streak-bm");
        if (bmCheckinBadge) bmCheckinBadge.textContent = `Check-in ${displayCheckin}d`;
        if (homeCheckinStreak) homeCheckinStreak.textContent = `${displayCheckin}d`;
        if (homeVideoStreak) homeVideoStreak.textContent = `${displayVideo}d`;
    }

    function extractVideoId(raw) {
        const s = String(raw || '')
            .trim()
            .replace(/[\u200B-\u200D\uFEFF]/g, '')
            .trim()
            .replace(/^\s*[<\[]+|[>\]]+\s*$/g, '')
            .trim()
            .split(/\s+/)[0];
        if (!s) return '';

        const safeSeg = (seg) => {
            if (!seg) return '';
            try {
                return decodeURIComponent(seg.split(/[?#&]/)[0].split('/')[0].trim());
            } catch {
                return seg.split(/[?#&]/)[0].split('/')[0].trim();
            }
        };

        try {
            const href = /^[a-z][a-z0-9+.-]*:\/\//i.test(s) ? s : `https://${s}`;
            const u = new URL(href);
            const h = u.hostname.toLowerCase();
            const yt = h.includes('youtube.com')
                || h.includes('youtu.be')
                || h.endsWith('youtube-nocookie.com');
            if (yt) {
                const vParam = u.searchParams.get('v');
                if (vParam) return safeSeg(vParam);
                const path = u.pathname;
                const shorts = path.match(/\/shorts\/([^/?#]+)/i);
                if (shorts) return safeSeg(shorts[1]);
                const live = path.match(/\/live\/([^/?#]+)/i);
                if (live) return safeSeg(live[1]);
                const embed = path.match(/\/embed\/([^/?#]+)/i);
                if (embed) return safeSeg(embed[1]);
                if (h === 'youtu.be' || h.endsWith('.youtu.be')) {
                    const first = path.replace(/^\//, '').split(/[/?#]/)[0];
                    return safeSeg(first);
                }
            }
        } catch {
            /* fall through to string heuristics */
        }

        if (s.includes('youtu.be/')) return safeSeg(s.split('youtu.be/')[1]);
        if (/\/shorts\//i.test(s)) return safeSeg(s.split(/\/shorts\//i)[1]);
        if (s.includes('watch?v=')) return safeSeg(s.split('watch?v=')[1]);
        if (s.includes('embed/')) return safeSeg(s.split('embed/')[1]);
        if (/\/live\//i.test(s)) return safeSeg(s.split(/\/live\//i)[1]);
        return '';
    }

    // --- DOM Elements ---
    const pageWelcome = document.getElementById('page-welcome');
    const pageRegister = document.getElementById('page-register');
    const pageLogin = document.getElementById('page-login');
    const pageHome = document.getElementById('page-home');
    const pageVideos = document.getElementById('page-videos');
    const pageVideoWatch = document.getElementById('page-video-watch');
    const pageQuiz = document.getElementById('page-quiz');
    const pageStats = document.getElementById('page-stats');
    const pageAdmin = document.getElementById('page-admin');
    const pageCheckinBankAdmin = document.getElementById('page-checkin-bank-admin');
    const pageBrainmap = document.getElementById('page-brainmap');
    const pageRequest = document.getElementById('page-request');
    const pageSheets = document.getElementById('page-sheets');
    const pageDecks = document.getElementById('page-decks');
    const pageFlashcards = document.getElementById('page-flashcards');
    const pageAlevel = document.getElementById('page-alevel');
    const pageLivequiz = document.getElementById('page-livequiz');
    const pageMedquiz = document.getElementById('page-medquiz');
    const pageVideoLinker = document.getElementById('page-video-linker');

    const btnGoLogin = document.getElementById('btn-go-login');
    const btnGoRegister = document.getElementById('btn-go-register');
    const btnsBackWelcome = document.querySelectorAll('.btn-back-welcome');

    function wantsVideoFeedRoute() {
        const hash = String(window.location.hash || '').toLowerCase();
        return hash === '#videos' || hash === '#video-feed';
    }

    function applyInitialGateRoute() {
        const hash = String(window.location.hash || '').toLowerCase();
        if (hash === '#login') {
            navigateTo(pageLogin);
            return true;
        }
        if (hash === '#register') {
            navigateTo(pageRegister);
            return true;
        }
        if (hash === '#admin') {
            navigateTo(pageWelcome);
            openAdminModal();
            return true;
        }
        return false;
    }

    const registerForm = document.getElementById('register-form');
    const regUsername = document.getElementById('reg-username');
    const regPassword = document.getElementById('reg-password');
    const regMsg = document.getElementById('reg-msg');

    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const loginSubmitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

    /** @param {'auth'|'profile'} [phase] after sign-in we show profile phase while Supabase loads profile data */
    function setLoginLoading(loading, phase) {
        if (!loginSubmitBtn) return;
        loginSubmitBtn.disabled = !!loading;
        if (!loading) {
            loginSubmitBtn.textContent = 'Log in';
            return;
        }
        loginSubmitBtn.textContent = phase === 'profile'
            ? 'Loading your profile…'
            : 'Signing in…';
    }

    const subjectPillsContainer = document.getElementById('sidebar-subject-pills');

    const homeGreeting = document.getElementById('home-greeting');
    const homePrimaryTitle = document.getElementById('home-primary-title');
    const homePrimaryCopy = document.getElementById('home-primary-copy');
    const homePrimaryAction = document.getElementById('home-primary-action');
    const homeCheckinStreak = document.getElementById('home-checkin-streak');
    const homeVideoStreak = document.getElementById('home-video-streak');
    const homeLessonsDone = document.getElementById('home-lessons-done');
    const homeRecallLinks = document.getElementById('home-recall-links');
    const homeLastLessonTitle = document.getElementById('home-last-lesson-title');
    const homeLastLessonMeta = document.getElementById('home-last-lesson-meta');
    const homeResumeLesson = document.getElementById('home-resume-lesson');
    const homeCheckinTitle = document.getElementById('home-checkin-title');
    const homeCheckinCopy = document.getElementById('home-checkin-copy');
    const homeLoopTitle = document.getElementById('home-loop-title');
    const homeLoopScore = document.getElementById('home-loop-score');
    const homeLoopWatched = document.getElementById('home-loop-watched');
    const homeLoopLinked = document.getElementById('home-loop-linked');
    const homeLoopNotes = document.getElementById('home-loop-notes');
    const homeRecallDue = document.getElementById('home-recall-due');
    const homeRecallDeck = document.getElementById('home-recall-deck');
    const homeRecallReviewed = document.getElementById('home-recall-reviewed');
    const homeLoopCopy = document.getElementById('home-loop-copy');
    const homeLoopPrimaryAction = document.getElementById('home-loop-primary-action');
    const homeLoopFlashcardsAction = document.getElementById('home-loop-flashcards-action');
    const homePlanTitle = document.getElementById('home-plan-title');
    const homePlanEstimate = document.getElementById('home-plan-estimate');
    const homePlanSteps = document.getElementById('home-plan-steps');
    const homePlanVideoCount = document.getElementById('home-plan-video-count');
    const homePlanSubjectCount = document.getElementById('home-plan-subject-count');
    const homePlanStatus = document.getElementById('home-plan-status');
    const homePlanPrimaryAction = document.getElementById('home-plan-primary-action');

    const userVideoGrid = document.getElementById('user-video-grid');
    const videoSearchInput = document.getElementById('video-search-input');
    const videoSearchSummary = document.getElementById('video-search-summary');
    const resumeLessonCard = document.getElementById('resume-lesson-card');
    const resumeLessonTitle = document.getElementById('resume-lesson-title');
    const resumeLessonMeta = document.getElementById('resume-lesson-meta');
    const btnResumeLesson = document.getElementById('btn-resume-lesson');
    const watchNavTitle = document.getElementById('watch-nav-title');
    const watchVideoTitle = document.getElementById('watch-video-title');
    const watchIframe = document.getElementById('watch-iframe');
    const watchSlideLink = document.getElementById('watch-slide-link');
    const watchFlashcardsLink = document.getElementById('watch-flashcards-link');
    const flashcardsFrame = document.getElementById('flashcards-frame');
    const flashcardsFullscreenButton = document.getElementById('flashcards-fullscreen-button');
    const btnBackFromWatch = document.getElementById('btn-back-from-watch');
    const btnVideoFinished = document.getElementById('btn-video-finished');
    const btnBackFromQuiz = document.getElementById('btn-back-from-quiz');

    // Post Quiz
    const pagePostQuiz = document.getElementById('page-post-quiz');
    const pqQuestion = document.getElementById('pq-question');
    const pqChoices = document.getElementById('pq-choices');
    const btnPqSubmit = document.getElementById('btn-pq-submit');
    const btnPqContinue = document.getElementById('btn-pq-continue');
    const pqFeedback = document.getElementById('pq-feedback');
    const videoFeedback = document.getElementById('video-feedback');
    const adminFeedbackSearch = document.getElementById('admin-feedback-search');
    const adminFeedbackSummary = document.getElementById('admin-feedback-summary');
    let currentQuizData = null;
    let selectedChoice = null;
    const countdownTimerWatch = document.getElementById('countdown-timer-watch');
    const countdownTimerQuiz = document.getElementById('countdown-timer-quiz');
    const adminVideoList = document.getElementById('admin-video-list');
    const countdownTimer = document.getElementById('countdown-timer');
    const countdownTimerHome = document.getElementById('countdown-timer-home');
    const countdownTimerBm = document.getElementById('countdown-timer-bm');
    const examDetailsModal = document.getElementById('exam-details-modal');
    const examDetailsNote = document.getElementById('exam-details-note');
    const btnCloseExamDetails = document.getElementById('btn-close-exam-details');

    const btnToggleMembers = document.getElementById('btn-toggle-members');
    const btnClearAllMembers = document.getElementById('btn-clear-all-members');
    const adminMemberList = document.getElementById('admin-member-list');

    if (supabaseConfigReady) {
        ds.subscribeDataBundle(
            (payload) => {
                videos = payload.videos || [];
                allowedNames = payload.allowedNames || [];
                subjects = payload.subjects && payload.subjects.length ? payload.subjects : ['anatomy', 'histology'];
                globalExamDeadlineMs =
                    payload.examDeadlineMs != null && Number.isFinite(payload.examDeadlineMs) && payload.examDeadlineMs > 0
                        ? payload.examDeadlineMs
                        : null;
                globalExamNote = typeof payload.examNote === 'string' ? payload.examNote : '';
                sharedMenuOrder = Array.isArray(payload.menuOrder) && payload.menuOrder.length
                    ? payload.menuOrder
                    : null;
                if (sharedMenuOrder) {
                    saveMenuOrderLocal(sharedMenuOrder);
                    renderAllSidebars();
                    const menuOrderEditor = document.getElementById('menu-order-editor');
                    if (menuOrderEditor && !menuOrderEditor.hidden) {
                        currentEditorOrder = getMenuOrder();
                        renderAdminMenuEditor();
                    }
                }
                users = (payload.profileRows || []).map((r) => profileRowToUser(r));

                if (!selectedSubject && subjects.length > 0) selectedSubject = subjects[0];

                if (currentUser && !currentUser.isAdmin) {
                    const uid = currentUser.uid || currentUser.id;
                    const fresh = users.find((u) => (u.uid || u.id) === uid);
                    if (fresh) {
                        Object.assign(currentUser, {
                            username: fresh.username,
                            status: fresh.status,
                            expiresAt: fresh.expiresAt,
                            createdAt: fresh.createdAt,
                            videoStreak: fresh.videoStreak,
                            checkinStreak: fresh.checkinStreak,
                            lastCheckinDate: fresh.lastCheckinDate,
                            lastVideoDate: fresh.lastVideoDate,
                            quizHistory: fresh.quizHistory
                        });
                        renderStreaks();
                    }
                }

                applyAdminPanelDrafts(allowedNames, globalExamDeadlineMs, globalExamNote);

                renderSubjectPills();
                renderSubjectOptions();
                if (persistFormsEnabled() && newVideoSubject) {
                    const sDraft = loadDraftJson('admin_new_video');
                    if (
                        sDraft &&
                        typeof sDraft === 'object' &&
                        sDraft.subject != null &&
                        [...newVideoSubject.options].some((o) => o.value === sDraft.subject)
                    ) {
                        newVideoSubject.value = sDraft.subject;
                    }
                }
                renderVideos();
                if (document.getElementById('page-stats').classList.contains('active')) renderStats();

                if (currentUser && !currentUser.isAdmin && allowedNames.length > 0) {
                    const currentName = normalizeLineAllowName(currentUser.username);
                    const stillAllowed = allowedNames.some(
                        (n) => normalizeLineAllowName(n) === currentName
                    );
                    if (!stillAllowed) {
                        alert('Your name has been removed from the approved list. You will be signed out.');
                        forceSignOutStudent();
                    }
                }

                if (currentUser?.isAdmin && pageAdmin.classList.contains('active')) {
                    renderAdminUsers();
                    if (adminMemberList && !adminMemberList.hidden) renderAdminMembers();
                }
                syncExamCountdown();
            },
            { seedVideosIfEmpty: defaultSeedVideos }
        );
    } else {
        videos = defaultSeedVideos();
        subjects = ['anatomy', 'histology'];
        allowedNames = [];
        globalExamNote = '';
        queueMicrotask(() => {
            renderSubjectPills();
            renderSubjectOptions();
            if (persistFormsEnabled() && newVideoSubject) {
                const sDraft = loadDraftJson('admin_new_video');
                if (
                    sDraft &&
                    typeof sDraft === 'object' &&
                    sDraft.subject != null &&
                    [...newVideoSubject.options].some((o) => o.value === sDraft.subject)
                ) {
                    newVideoSubject.value = sDraft.subject;
                }
            }
            renderVideos();
            applyAdminPanelDrafts(allowedNames, null, globalExamNote);
        });
    }

    const btnStats = document.getElementById('btn-stats');
    const btnSheets = document.getElementById('btn-sheets');
    const btnDecks = document.getElementById('btn-decks');
    const btnLiveQuiz = document.getElementById('btn-livequiz');
    const btnBeta = document.getElementById('btn-beta');
    const btnBack = document.getElementById('btn-back');
    const btnLogout = document.getElementById('btn-logout');

    const topVideosList = document.getElementById('top-videos-list');

    // Admin Elements
    const btnAdminLogin = document.getElementById('btn-admin-login');
    const btnAdminStaff = document.getElementById('btn-admin-staff');
    const btnAdminLogout = document.getElementById('btn-admin-logout');
    const btnAddVideo = document.getElementById('btn-add-video');
    const btnCancelEditVideo = document.getElementById('btn-cancel-edit-video');
    const quizQuestionsList = document.getElementById('quiz-questions-list');
    const btnAddQuestion = document.getElementById('btn-add-question');
    let editVideoId = null;
    const newVideoUrl = document.getElementById('new-video-url');
    const newVideoTitle = document.getElementById('new-video-title');
    const newVideoSlideUrl = document.getElementById('new-video-slide-url');
    const newVideoSlideFile = document.getElementById('new-video-slide-file');
    const newVideoSlideTitle = document.getElementById('new-video-slide-title');
    const newVideoSlideStatus = document.getElementById('new-video-slide-status');
    const btnUploadVideoSlide = document.getElementById('btn-upload-video-slide');
    const btnRemoveVideoSlide = document.getElementById('btn-remove-video-slide');
    const newVideoSubject = document.getElementById('new-video-subject');
    const newVideoFlashcardDeck = document.getElementById('new-video-flashcard-deck');
    const btnAddSubject = document.getElementById('btn-add-subject');

    fetchFlashcardDeckOptions().then((decks) => {
        flashcardDeckOptions = decks;
        renderFlashcardDeckSelect(newVideoFlashcardDeck?.value || '');
        renderLearningHome();
        renderVideos();
    });

    if (persistFormsEnabled()) {
        if (usernameInput && passwordInput) {
            const loginDraft = loadDraftJson('login');
            if (loginDraft && typeof loginDraft === 'object') {
                if (loginDraft.u) usernameInput.value = loginDraft.u;
                if (loginDraft.p != null) passwordInput.value = loginDraft.p;
            }
            const persistLogin = debounce(() => {
                saveDraft('login', JSON.stringify({ u: usernameInput.value, p: passwordInput.value }));
            }, 400);
            usernameInput.addEventListener('input', persistLogin);
            passwordInput.addEventListener('input', persistLogin);
        }
        if (regUsername && regPassword) {
            const regDraft = loadDraftJson('register');
            if (regDraft && typeof regDraft === 'object') {
                if (regDraft.u) regUsername.value = regDraft.u;
                if (regDraft.p != null) regPassword.value = regDraft.p;
            }
            const persistReg = debounce(() => {
                saveDraft('register', JSON.stringify({ u: regUsername.value, p: regPassword.value }));
            }, 400);
            regUsername.addEventListener('input', persistReg);
            regPassword.addEventListener('input', persistReg);
        }
        if (newVideoUrl && newVideoTitle && newVideoSubject) {
            const vidDraft = loadDraftJson('admin_new_video');
            if (vidDraft && typeof vidDraft === 'object') {
                if (vidDraft.url != null) newVideoUrl.value = vidDraft.url;
                if (vidDraft.title != null) newVideoTitle.value = vidDraft.title;
                if (newVideoSlideUrl && vidDraft.slideUrl != null) newVideoSlideUrl.value = vidDraft.slideUrl;
                if (newVideoSlideTitle && vidDraft.slideTitle != null) newVideoSlideTitle.value = vidDraft.slideTitle;
                if (newVideoFlashcardDeck && vidDraft.flashcardDeckId != null) {
                    newVideoFlashcardDeck.value = vidDraft.flashcardDeckId;
                }
                if (
                    vidDraft.subject != null &&
                    [...newVideoSubject.options].some((o) => o.value === vidDraft.subject)
                ) {
                    newVideoSubject.value = vidDraft.subject;
                }
            }
            const persistVid = debounce(() => {
                saveDraft(
                    'admin_new_video',
                    JSON.stringify({
                        url: newVideoUrl.value,
                        title: newVideoTitle.value,
                        slideUrl: newVideoSlideUrl ? newVideoSlideUrl.value : '',
                        slideTitle: newVideoSlideTitle ? newVideoSlideTitle.value : '',
                        flashcardDeckId: newVideoFlashcardDeck ? newVideoFlashcardDeck.value : '',
                        subject: newVideoSubject.value
                    })
                );
            }, 400);
            newVideoUrl.addEventListener('input', persistVid);
            newVideoTitle.addEventListener('input', persistVid);
            if (newVideoSlideUrl) newVideoSlideUrl.addEventListener('input', persistVid);
            if (newVideoSlideTitle) newVideoSlideTitle.addEventListener('input', persistVid);
            if (newVideoFlashcardDeck) newVideoFlashcardDeck.addEventListener('change', persistVid);
            newVideoSubject.addEventListener('change', persistVid);
        }
        const vfEl = document.getElementById('video-feedback');
        if (vfEl) {
            const vfd = loadDraftRaw('video_feedback');
            if (vfd !== null) vfEl.value = vfd;
            vfEl.addEventListener('input', debounce(() => saveDraft('video_feedback', vfEl.value), 400));
        }
        const checkinAnsEl = document.getElementById('checkin-answer');
        if (checkinAnsEl) {
            const cad = loadDraftRaw('checkin_answer');
            if (cad !== null) checkinAnsEl.value = cad;
            checkinAnsEl.addEventListener('input', debounce(() => saveDraft('checkin_answer', checkinAnsEl.value), 400));
        }
        const examDraftEl = document.getElementById('admin-exam-deadline');
        if (examDraftEl) {
            const syncExamDraft = debounce(() => {
                saveDraft('admin_exam_deadline', examDraftEl.value);
                updateExamInfoSummary();
            }, 400);
            examDraftEl.addEventListener('input', syncExamDraft);
            examDraftEl.addEventListener('change', syncExamDraft);
        }
        const examNoteEl = document.getElementById('admin-exam-note');
        if (examNoteEl) {
            examNoteEl.addEventListener(
                'input',
                debounce(() => {
                    saveDraft('admin_exam_note', examNoteEl.value);
                    updateExamInfoSummary();
                }, 400)
            );
        }
        const allowedEl = document.getElementById('admin-allowed-names');
        if (allowedEl) {
            allowedEl.addEventListener(
                'input',
                debounce(() => saveDraft('admin_allowed_names', allowedEl.value), 400)
            );
        }
        const adminPassEl = document.getElementById('admin-password');
        if (adminPassEl) {
            const ap = loadDraftRaw('admin_modal_password');
            if (ap !== null) adminPassEl.value = ap;
            adminPassEl.addEventListener(
                'input',
                debounce(() => saveDraft('admin_modal_password', adminPassEl.value), 400)
            );
        }
    }

    function formatSubjectName(key) {
        if (!key) return '';
        return key.charAt(0).toUpperCase() + key.slice(1);
    }

    function subjectLabel(key) {
        return formatSubjectName(key);
    }

    function safeStorageFileName(name) {
        return String(name || 'slide.pdf')
            .normalize('NFKD')
            .replace(/[^\w.\-]+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '')
            .toLowerCase() || 'slide.pdf';
    }

    async function uploadVideoSlidePdf(file) {
        if (!supabaseConfigReady || !ds.supabase) {
            throw new Error('Supabase is not configured.');
        }
        const looksPdf = file && (file.type === 'application/pdf' || /\.pdf$/i.test(file.name));
        if (!looksPdf) {
            throw new Error('Please upload a PDF file.');
        }
        const bucket = SB.SHEETS_STORAGE_BUCKET || 'sheets';
        const path = `video-slides/${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${safeStorageFileName(file.name)}`;
        const { error: uploadError } = await ds.supabase.storage
            .from(bucket)
            .upload(path, file, {
                contentType: file.type || 'application/pdf',
                upsert: false
            });
        if (uploadError) throw uploadError;
        const { data } = ds.supabase.storage.from(bucket).getPublicUrl(path);
        const publicUrl = data?.publicUrl || '';
        if (!publicUrl) throw new Error('Could not create a public URL for the uploaded PDF.');
        return { publicUrl, path, fileName: file.name };
    }

    async function uploadImage(file) {
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch('/.netlify/functions/image-upload', {
            method: 'POST',
            body: formData
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data.url) {
            throw new Error(data.error || 'Upload failed');
        }
        return data.url;
    }

    function setupImgDropZone(zoneEl) {
        if (!zoneEl || zoneEl._imgZoneInited) return zoneEl && zoneEl._imgZoneApi;
        const fileInput = zoneEl.querySelector('.q-img-file');
        const hiddenImg = zoneEl.querySelector('.q-img');
        const placeholder = zoneEl.querySelector('.upload-placeholder');
        const preview = zoneEl.querySelector('.upload-preview');
        const previewImg = preview ? preview.querySelector('img') : null;
        const loading = zoneEl.querySelector('.upload-loading');
        const removeImgBtn = zoneEl.querySelector('.remove-img-btn');
        if (!fileInput || !hiddenImg || !placeholder || !preview || !previewImg || !loading || !removeImgBtn) return null;

        const showState = (state) => {
            placeholder.style.display = state === 'placeholder' ? 'block' : 'none';
            preview.style.display = state === 'preview' ? 'block' : 'none';
            loading.style.display = state === 'loading' ? 'block' : 'none';
        };

        const setImageUrl = (url) => {
            if (url) {
                hiddenImg.value = url;
                previewImg.src = url;
                showState('preview');
            } else {
                hiddenImg.value = '';
                previewImg.src = '';
                fileInput.value = '';
                showState('placeholder');
            }
        };

        async function handleFile(file) {
            if (!file.type.startsWith('image/')) {
                alert('Please upload an image file.');
                return;
            }
            showState('loading');
            try {
                const url = await uploadImage(file);
                setImageUrl(url);
                showToast('Image uploaded.');
            } catch (err) {
                alert('Upload error: ' + err.message);
                showState(hiddenImg.value ? 'preview' : 'placeholder');
            }
        }

        zoneEl.addEventListener('click', (e) => {
            if (e.target !== removeImgBtn && !removeImgBtn.contains(e.target)) {
                fileInput.click();
            }
        });
        zoneEl.addEventListener('dragover', (e) => {
            e.preventDefault();
            zoneEl.style.borderColor = 'var(--teal)';
        });
        zoneEl.addEventListener('dragleave', () => {
            zoneEl.style.borderColor = 'var(--border)';
        });
        zoneEl.addEventListener('drop', (e) => {
            e.preventDefault();
            zoneEl.style.borderColor = 'var(--border)';
            if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                handleFile(e.dataTransfer.files[0]);
            }
        });
        fileInput.addEventListener('change', () => {
            if (fileInput.files && fileInput.files.length > 0) {
                handleFile(fileInput.files[0]);
            }
        });
        removeImgBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            setImageUrl('');
        });

        const api = { setImageUrl };
        zoneEl._imgZoneInited = true;
        zoneEl._imgZoneApi = api;
        return api;
    }

    function addQuizQuestionUI(qData = null) {
        if (!quizQuestionsList) return;
        const div = document.createElement('div');
        div.className = 'quiz-question-block';
        div.style.padding = '1rem';
        div.style.border = '1px solid var(--border)';
        div.style.borderRadius = 'var(--r-card)';
        div.style.position = 'relative';
        div.style.background = 'var(--surface-soft)';

        const qVal = escapeHtml(qData && qData.q ? qData.q : '');
        const imgVal = escapeHtml(qData && qData.img ? qData.img : '');
        const aVal = escapeHtml(qData && qData.a ? qData.a : '');
        const bVal = escapeHtml(qData && qData.b ? qData.b : '');
        const cVal = escapeHtml(qData && qData.c ? qData.c : '');
        const dVal = escapeHtml(qData && qData.d ? qData.d : '');
        const expectedVal = escapeHtml(qData && qData.expected ? qData.expected : '');
        const hasImg = !!(qData && qData.img);

        div.innerHTML = `
                <button type="button" class="btn icon-btn remove-question-btn" style="position: absolute; top: 0.5rem; right: 0.5rem; color: var(--danger);">Remove</button>
            <div class="input-group">
                <input type="text" class="q-text" placeholder=" " value="${qVal}">
                <label>Question</label>
            </div>

            <div class="img-upload-zone" style="border: 2px dashed var(--border); padding: 1.5rem 1rem; border-radius: var(--r-card); text-align: center; cursor: pointer; margin-bottom: 1.25rem; background: var(--surface); position: relative; transition: border-color 0.2s;">
                <input type="file" class="q-img-file" accept="image/*" style="display:none;">
                <input type="hidden" class="q-img" value="${imgVal}">
                <div class="upload-placeholder" style="${hasImg ? 'display:none;' : ''}">
                    <p style="font-size: 13px; color: var(--text-muted); margin: 0; pointer-events: none;">Drag and drop an image here, or click to upload.</p>
                </div>
                <div class="upload-preview" style="${hasImg ? '' : 'display:none;'}">
                    <img src="${imgVal}" style="max-height: 120px; max-width: 100%; border-radius: var(--r-input); object-fit: contain;">
                    <button type="button" class="btn icon-btn remove-img-btn" style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255,255,255,0.9); color: var(--danger); padding: 4px; height: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">Remove</button>
                </div>
                <div class="upload-loading" style="display:none; pointer-events: none;">
                    <p style="font-size: 13px; color: var(--teal); margin: 0; font-weight: 500;">Uploading...</p>
                </div>
            </div>

            <div class="admin-field-row" style="margin-top: 0.5rem; margin-bottom: 1rem;">
                <label class="admin-field-label">Question Type</label>
                <select class="admin-select q-type">
                    <option value="mcq" ${(!qData || qData.type === 'mcq') ? 'selected' : ''}>Multiple Choice</option>
                    <option value="text" ${(qData && qData.type === 'text') ? 'selected' : ''}>Free text</option>
                </select>
            </div>

            <div class="mcq-fields" style="${(qData && qData.type === 'text') ? 'display:none;' : ''}">
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 0.5rem;">
                    <div class="input-group"><input type="text" class="q-a" placeholder=" " value="${aVal}"><label>Choice A</label></div>
                    <div class="input-group"><input type="text" class="q-b" placeholder=" " value="${bVal}"><label>Choice B</label></div>
                    <div class="input-group"><input type="text" class="q-c" placeholder=" " value="${cVal}"><label>Choice C</label></div>
                    <div class="input-group"><input type="text" class="q-d" placeholder=" " value="${dVal}"><label>Choice D</label></div>
                </div>
                <div class="admin-field-row" style="margin-top: 0.5rem;">
                    <label class="admin-field-label">Correct Answer</label>
                    <select class="admin-select q-ans">
                        <option value="A" ${qData && qData.ans === 'A' ? 'selected' : ''}>A</option>
                        <option value="B" ${qData && qData.ans === 'B' ? 'selected' : ''}>B</option>
                        <option value="C" ${qData && qData.ans === 'C' ? 'selected' : ''}>C</option>
                        <option value="D" ${qData && qData.ans === 'D' ? 'selected' : ''}>D</option>
                    </select>
                </div>
            </div>

            <div class="text-fields" style="${(!qData || qData.type === 'mcq') ? 'display:none;' : ''}">
                <div class="input-group" style="margin-top: 0.5rem;">
                    <input type="text" class="q-expected" placeholder=" " value="${expectedVal}">
                    <label>Expected Keywords (Optional, for auto-grading)</label>
                </div>
            </div>
        `;

        const typeSelect = div.querySelector('.q-type');
        const mcqFields = div.querySelector('.mcq-fields');
        const textFields = div.querySelector('.text-fields');

        typeSelect.addEventListener('change', (e) => {
            if (e.target.value === 'mcq') {
                mcqFields.style.display = 'block';
                textFields.style.display = 'none';
            } else {
                mcqFields.style.display = 'none';
                textFields.style.display = 'block';
            }
        });

        div.querySelector('.remove-question-btn').addEventListener('click', () => div.remove());

        setupImgDropZone(div.querySelector('.img-upload-zone'));
        quizQuestionsList.appendChild(div);
    }

    function updateVideoSlideUploadState() {
        if (!newVideoSlideStatus || !btnRemoveVideoSlide) return;
        const slideUrl = String(newVideoSlideUrl?.value || '').trim();
        const slideTitle = String(newVideoSlideTitle?.value || '').trim();
        if (slideUrl) {
            newVideoSlideStatus.textContent = `${slideTitle || 'Slide PDF'} attached.`;
            btnRemoveVideoSlide.hidden = false;
        } else {
            newVideoSlideStatus.textContent = 'No PDF attached.';
            btnRemoveVideoSlide.hidden = true;
        }
    }

    if (btnAddQuestion) {
        btnAddQuestion.addEventListener('click', () => addQuizQuestionUI());
    }

    if (btnUploadVideoSlide && newVideoSlideFile) {
        btnUploadVideoSlide.addEventListener('click', () => newVideoSlideFile.click());
        newVideoSlideFile.addEventListener('change', async () => {
            const file = newVideoSlideFile.files && newVideoSlideFile.files[0];
            if (!file) return;
            btnUploadVideoSlide.disabled = true;
            btnUploadVideoSlide.textContent = 'Uploading...';
            if (newVideoSlideStatus) newVideoSlideStatus.textContent = `Uploading ${file.name}...`;
            try {
                const uploaded = await uploadVideoSlidePdf(file);
                if (newVideoSlideUrl) newVideoSlideUrl.value = uploaded.publicUrl;
                if (newVideoSlideTitle && !newVideoSlideTitle.value.trim()) {
                    newVideoSlideTitle.value = file.name.replace(/\.pdf$/i, '');
                }
                updateVideoSlideUploadState();
                showToast('Slide PDF uploaded.');
            } catch (err) {
                alert('PDF upload failed: ' + (err.message || err));
                updateVideoSlideUploadState();
            } finally {
                newVideoSlideFile.value = '';
                btnUploadVideoSlide.disabled = false;
                btnUploadVideoSlide.textContent = 'Upload PDF';
            }
        });
    }

    if (btnRemoveVideoSlide) {
        btnRemoveVideoSlide.addEventListener('click', () => {
            if (newVideoSlideUrl) newVideoSlideUrl.value = '';
            if (newVideoSlideFile) newVideoSlideFile.value = '';
            updateVideoSlideUploadState();
        });
    }

    if (newVideoSlideTitle) {
        newVideoSlideTitle.addEventListener('input', updateVideoSlideUploadState);
    }

    if (btnCancelEditVideo) {
        btnCancelEditVideo.addEventListener('click', () => {
            editVideoId = null;
            if (typeof window._invalidateLinkerSession === 'function') window._invalidateLinkerSession();
            btnAddVideo.textContent = 'Attach video';

            btnCancelEditVideo.style.display = 'none';
            newVideoUrl.value = '';
            newVideoTitle.value = '';
            if (newVideoSlideUrl) newVideoSlideUrl.value = '';
            if (newVideoSlideTitle) newVideoSlideTitle.value = '';
            if (newVideoFlashcardDeck) newVideoFlashcardDeck.value = '';
            if (quizQuestionsList) quizQuestionsList.innerHTML = '';
            renderVideoConnectionsCheckboxes(null, []);
            showToast('Edit cancelled.', 'info');
        });
    }

    function renderVideoComments(video) {
        const commentsList = document.getElementById('video-comments-list');
        if (!commentsList) return;
        commentsList.innerHTML = '';
        if (!video.feedbacks || video.feedbacks.length === 0) {
            commentsList.innerHTML = '<p class="muted-empty" style="font-size: 13px;">No lesson notes yet.</p>';
            return;
        }

        const currentUsername = currentUser ? String(currentUser.username).trim().toLowerCase() : '';
        const isAdmin = currentUser && currentUser.isAdmin;

        let feedbacks = [...video.feedbacks];
        if (!isAdmin) {
            feedbacks = feedbacks.filter(f => f.user && String(f.user).trim().toLowerCase() === currentUsername);
        }

        feedbacks.reverse();

        if (feedbacks.length === 0) {
            commentsList.innerHTML = '<p class="muted-empty" style="font-size: 13px;">No lesson notes yet.</p>';
            return;
        }

        feedbacks.forEach(f => {
            const div = document.createElement('div');
            div.style.padding = '0.75rem';
            div.style.background = 'var(--surface-soft)';
            div.style.borderRadius = 'var(--r-input)';
            div.style.border = '1px solid var(--border)';
            div.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:baseline; margin-bottom:0.25rem;">
                    <strong style="font-size:13px; color:var(--ink-2);">${escapeHtml(f.user)}</strong>
                    <span style="font-size:10px; color:var(--muted-2); font-family:var(--font-mono);">${new Date(f.date).toLocaleDateString()}</span>
                </div>
                <div style="font-size:13px; color:var(--body); line-height:1.5;">${escapeHtml(f.text)}</div>
            `;
            commentsList.appendChild(div);
        });
    }

    function getSavedLastVideo() {
        const saved = loadLastOpenedVideo();
        const video = saved && saved.id != null ? videos.find((item) => item.id === saved.id) : null;
        return { saved, video };
    }

    function getWatchedVideoIds() {
        return new Set(
            Array.isArray(currentUser?.watchedVideos)
                ? currentUser.watchedVideos.map((id) => Number(id)).filter((id) => Number.isFinite(id))
                : []
        );
    }

    function getCurrentUserLessonNoteCount() {
        if (!currentUser) return 0;
        const currentUsername = String(currentUser.username || '').trim().toLowerCase();
        if (!currentUsername) return 0;
        return videos.reduce((total, video) => {
            const feedbacks = Array.isArray(video.feedbacks) ? video.feedbacks : [];
            return total + feedbacks.filter((item) =>
                String(item?.user || '').trim().toLowerCase() === currentUsername &&
                String(item?.text || '').trim()
            ).length;
        }, 0);
    }

    function getLearningLoopStats() {
        const watchedIds = getWatchedVideoIds();
        const linkedVideos = videos.filter((video) => getLinkedFlashcardDeckId(video));
        const watchedLinked = linkedVideos.filter((video) => watchedIds.has(Number(video.id)));
        const watchedCount = videos.filter((video) => watchedIds.has(Number(video.id))).length;
        const totalVideos = videos.length;
        const notesCount = getCurrentUserLessonNoteCount();
        const lessonScore = totalVideos > 0 ? watchedCount / totalVideos : 0;
        const recallScore = linkedVideos.length > 0 ? watchedLinked.length / linkedVideos.length : 0;
        const noteScore = watchedCount > 0 ? Math.min(notesCount / Math.max(1, watchedCount), 1) : 0;
        const loopScore = Math.round(((lessonScore * 0.45) + (recallScore * 0.4) + (noteScore * 0.15)) * 100);

        return {
            watchedIds,
            watchedCount,
            totalVideos,
            linkedVideos,
            linkedCount: linkedVideos.length,
            watchedLinkedCount: watchedLinked.length,
            notesCount,
            loopScore
        };
    }

    function findRecommendedRecallVideo(preferredVideo) {
        const watchedIds = getWatchedVideoIds();
        if (preferredVideo && getLinkedFlashcardDeckId(preferredVideo)) return preferredVideo;

        const watchedLinked = videos
            .filter((video) => watchedIds.has(Number(video.id)) && getLinkedFlashcardDeckId(video))
            .sort((a, b) => Number(b.id) - Number(a.id));
        if (watchedLinked.length) return watchedLinked[0];

        const anyLinkedInSubject = videos.find((video) =>
            selectedSubject && getVideoSubject(video) === selectedSubject && getLinkedFlashcardDeckId(video)
        );
        return anyLinkedInSubject || videos.find((video) => getLinkedFlashcardDeckId(video)) || null;
    }

    function loadFlashcardProgressState() {
        try {
            const parsed = JSON.parse(localStorage.getItem('flashcards-web:v1') || 'null');
            if (!parsed || !Array.isArray(parsed.decks) || !Array.isArray(parsed.cards)) return null;
            return parsed;
        } catch {
            return null;
        }
    }

    function getFlashcardProgressSummary(preferredDeckId = '') {
        const state = loadFlashcardProgressState();
        const now = Date.now();
        const deckMap = new Map();

        flashcardDeckOptions.forEach((deck) => {
            if (deck.id) {
                deckMap.set(deck.id, {
                    id: deck.id,
                    name: deck.name || 'Flashcards',
                    total: 0,
                    due: 0,
                    reviewed: 0
                });
            }
        });

        if (state) {
            state.decks.forEach((deck) => {
                const id = String(deck?.id || '');
                if (!id) return;
                const existing = deckMap.get(id) || { id, name: 'Flashcards', total: 0, due: 0, reviewed: 0 };
                existing.name = String(deck?.name || existing.name || 'Flashcards').trim();
                deckMap.set(id, existing);
            });

            state.cards.forEach((card) => {
                const deckId = String(card?.deckId || '');
                if (!deckId) return;
                const deck = deckMap.get(deckId) || { id: deckId, name: 'Flashcards', total: 0, due: 0, reviewed: 0 };
                const dueAt = Date.parse(card?.dueAt || '');
                deck.total += 1;
                if (Number.isFinite(dueAt) && dueAt <= now) deck.due += 1;
                if ((Number(card?.reps) || 0) > 0) deck.reviewed += 1;
                deckMap.set(deckId, deck);
            });
        }

        const decks = [...deckMap.values()].filter((deck) => deck.id);
        const totalCards = decks.reduce((sum, deck) => sum + deck.total, 0);
        const totalDue = decks.reduce((sum, deck) => sum + deck.due, 0);
        const totalReviewed = decks.reduce((sum, deck) => sum + deck.reviewed, 0);
        const preferred = preferredDeckId ? deckMap.get(preferredDeckId) : null;
        const bestDueDeck = [...decks]
            .filter((deck) => deck.due > 0)
            .sort((a, b) => (b.due - a.due) || (b.total - a.total) || a.name.localeCompare(b.name))[0] || null;
        const bestDeck = bestDueDeck || preferred || decks
            .filter((deck) => deck.total > 0)
            .sort((a, b) => (b.total - a.total) || a.name.localeCompare(b.name))[0] || null;

        return {
            hasLocalState: Boolean(state),
            decks,
            bestDeck,
            totalCards,
            totalDue,
            totalReviewed
        };
    }

    function renderHomeLearningLoop(currentVideo) {
        if (!homeLoopTitle || !homeLoopPrimaryAction || !homeLoopFlashcardsAction) return;

        const stats = getLearningLoopStats();
        const recommendedVideo = findRecommendedRecallVideo(currentVideo);
        const recommendedDeckId = getLinkedFlashcardDeckId(recommendedVideo);
        const flashcardSummary = getFlashcardProgressSummary(recommendedDeckId);
        const checkedInToday = currentUser && currentUser.lastCheckinDate === getTodayYMD();

        if (homeLessonsDone) homeLessonsDone.textContent = `${stats.watchedCount}/${stats.totalVideos}`;
        if (homeRecallLinks) homeRecallLinks.textContent = String(stats.watchedLinkedCount);
        if (homeLoopScore) homeLoopScore.textContent = `${stats.loopScore}%`;
        if (homeLoopWatched) homeLoopWatched.textContent = String(stats.watchedCount);
        if (homeLoopLinked) homeLoopLinked.textContent = `${stats.watchedLinkedCount}/${stats.linkedCount}`;
        if (homeLoopNotes) homeLoopNotes.textContent = String(stats.notesCount);
        if (homeRecallDue) homeRecallDue.textContent = String(flashcardSummary.totalDue);
        if (homeRecallDeck) homeRecallDeck.textContent = flashcardSummary.bestDeck?.name || 'No deck yet';
        if (homeRecallReviewed) {
            homeRecallReviewed.textContent = flashcardSummary.totalCards
                ? `${flashcardSummary.totalReviewed}/${flashcardSummary.totalCards}`
                : '0';
        }

        if (!stats.totalVideos) {
            homeLoopTitle.textContent = 'Ready for lessons';
            if (homeLoopCopy) homeLoopCopy.textContent = flashcardSummary.totalDue > 0
                ? `${flashcardSummary.totalDue} flashcards are due. Clear them while lessons are being prepared.`
                : 'Add lessons from the back office, then this panel will track watch, note, and recall habits.';
            homeLoopPrimaryAction.textContent = 'Open videos';
            homeLoopPrimaryAction.onclick = () => navigateTo(pageVideos);
            homeLoopFlashcardsAction.textContent = flashcardSummary.totalDue > 0 ? 'Review due cards' : 'Open flashcards';
            homeLoopFlashcardsAction.onclick = () => openLinkedFlashcards(flashcardSummary.bestDeck?.id || '');
            return;
        }

        if (!checkedInToday) {
            homeLoopTitle.textContent = 'Prime recall first';
            if (homeLoopCopy) homeLoopCopy.textContent = flashcardSummary.totalDue > 0
                ? `A short check-in first, then ${flashcardSummary.totalDue} due cards are waiting.`
                : 'A short check-in makes the rest of the session easier to anchor.';
            homeLoopPrimaryAction.textContent = 'Open check-in';
            homeLoopPrimaryAction.onclick = () => navigateTo(pageQuiz);
        } else if (currentVideo) {
            homeLoopTitle.textContent = 'Continue the loop';
            if (homeLoopCopy) homeLoopCopy.textContent = flashcardSummary.totalDue > 0
                ? `Resume ${currentVideo.title || 'the current lesson'}, then clear ${flashcardSummary.totalDue} due cards.`
                : `Resume ${currentVideo.title || 'the current lesson'}, then review the linked cards.`;
            homeLoopPrimaryAction.textContent = 'Resume lesson';
            homeLoopPrimaryAction.onclick = () => openVideoWatchPage(currentVideo);
        } else {
            homeLoopTitle.textContent = stats.watchedCount ? 'Keep momentum' : 'Start the first loop';
            if (homeLoopCopy) {
                homeLoopCopy.textContent = flashcardSummary.totalDue > 0
                    ? `${flashcardSummary.totalDue} flashcards are due. Review them after one focused lesson block.`
                    : (stats.watchedCount
                        ? 'Pick one unfinished lesson, save a note, then finish with active recall.'
                        : 'Watch one lesson, save one note, then close with active recall.');
            }
            homeLoopPrimaryAction.textContent = 'Open videos';
            homeLoopPrimaryAction.onclick = () => navigateTo(pageVideos);
        }

        homeLoopFlashcardsAction.disabled = false;
        if (flashcardSummary.totalDue > 0 && flashcardSummary.bestDeck?.id) {
            homeLoopFlashcardsAction.textContent = `Review due: ${flashcardSummary.bestDeck.name}`;
            homeLoopFlashcardsAction.onclick = () => openLinkedFlashcards(flashcardSummary.bestDeck.id);
        } else if (recommendedDeckId) {
            homeLoopFlashcardsAction.textContent = `Review: ${flashcardDeckLabel(recommendedDeckId)}`;
            homeLoopFlashcardsAction.onclick = () => openLinkedFlashcards(recommendedDeckId);
        } else {
            homeLoopFlashcardsAction.textContent = 'Open flashcards';
            homeLoopFlashcardsAction.onclick = () => openLinkedFlashcards('');
        }
    }

    function renderHomeStudyPlan({ checkedInToday, video }) {
        if (!homePlanTitle || !homePlanSteps || !homePlanPrimaryAction) return;

        const totalVideos = videos.length;
        const subjectCount = subjects.length || new Set(videos.map((item) => getVideoSubject(item))).size;
        const videoStreak = currentUser?.videoStreak || 0;
        const recallVideo = findRecommendedRecallVideo(video);
        const recallDeckId = getLinkedFlashcardDeckId(recallVideo);
        const plan = [];
        let primaryLabel = 'Start plan';
        let primaryHandler = () => navigateTo(pageVideos);
        let statusLabel = videoStreak > 0 ? `${videoStreak}d` : 'New';

        if (!checkedInToday) {
            plan.push({
                label: '1',
                title: 'Answer the daily check-in',
                copy: 'Begin with one recall prompt before opening longer material.'
            });
            primaryLabel = 'Open check-in';
            primaryHandler = () => navigateTo(pageQuiz);
            statusLabel = 'Check-in due';
        }

        if (video) {
            plan.push({
                label: String(plan.length + 1),
                title: 'Resume the current lesson',
                copy: `${subjectLabel(getVideoSubject(video))}: ${video.title || 'last opened lesson'}`
            });
            if (checkedInToday) {
                primaryLabel = 'Resume lesson';
                primaryHandler = () => openVideoWatchPage(video);
            }
        } else {
            plan.push({
                label: String(plan.length + 1),
                title: 'Pick one lesson block',
                copy: totalVideos ? `${totalVideos} lessons are available across the workspace.` : 'Open the video feed when lessons are added.'
            });
        }

        plan.push({
            label: String(plan.length + 1),
            title: 'Close with active recall',
            copy: recallDeckId
                ? `Review ${flashcardDeckLabel(recallDeckId)} after the lesson.`
                : (checkedInToday ? 'Use MedQuiz or flashcards to test the same topic.' : 'After the lesson, use MedQuiz or flashcards for retrieval.')
        });

        homePlanTitle.textContent = checkedInToday ? 'Study plan is ready' : 'Start with recall';
        if (homePlanEstimate) homePlanEstimate.textContent = video ? '30 min' : '20 min';
        if (homePlanVideoCount) homePlanVideoCount.textContent = String(totalVideos);
        if (homePlanSubjectCount) homePlanSubjectCount.textContent = String(subjectCount);
        if (homePlanStatus) homePlanStatus.textContent = statusLabel;
        homePlanPrimaryAction.textContent = primaryLabel;
        homePlanPrimaryAction.onclick = primaryHandler;
        homePlanSteps.innerHTML = plan.map((item) => `
            <li>
                <span>${escapeHtml(item.label)}</span>
                <div>
                    <strong>${escapeHtml(item.title)}</strong>
                    <p>${escapeHtml(item.copy)}</p>
                </div>
            </li>
        `).join('');
    }

    function renderLearningHome() {
        if (!homePrimaryTitle || !homePrimaryCopy || !homePrimaryAction) return;
        const { saved, video } = getSavedLastVideo();
        const today = getTodayYMD();
        const checkedInToday = currentUser && currentUser.lastCheckinDate === today;
        const displayName = currentUser?.username ? String(currentUser.username).trim() : '';

        if (homeGreeting) {
            homeGreeting.textContent = displayName ? `Welcome back, ${displayName}` : 'Learning home';
        }
        if (homeCheckinStreak) homeCheckinStreak.textContent = `${currentUser?.checkinStreak || 0}d`;
        if (homeVideoStreak) homeVideoStreak.textContent = `${currentUser?.videoStreak || 0}d`;
        renderHomeLearningLoop(video);

        if (video) {
            const openedAt = saved?.openedAt ? new Date(saved.openedAt) : null;
            const openedAtLabel = openedAt && !Number.isNaN(openedAt.getTime())
                ? openedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
                : '';
            const meta = openedAtLabel
                ? `${subjectLabel(getVideoSubject(video))}. Last opened ${openedAtLabel}`
                : subjectLabel(getVideoSubject(video));
            if (homeLastLessonTitle) homeLastLessonTitle.textContent = video.title || 'Last opened lesson';
            if (homeLastLessonMeta) homeLastLessonMeta.textContent = meta;
            if (homeResumeLesson) {
                homeResumeLesson.disabled = false;
                homeResumeLesson.textContent = 'Resume lesson';
                homeResumeLesson.onclick = () => openVideoWatchPage(video);
            }
        } else {
            if (homeLastLessonTitle) homeLastLessonTitle.textContent = 'No recent lesson yet';
            if (homeLastLessonMeta) homeLastLessonMeta.textContent = 'Open any video lesson and it will appear here.';
            if (homeResumeLesson) {
                homeResumeLesson.disabled = true;
                homeResumeLesson.onclick = null;
            }
        }

        if (homeCheckinTitle && homeCheckinCopy) {
            homeCheckinTitle.textContent = checkedInToday ? 'Check-in complete' : 'Daily check-in';
            homeCheckinCopy.textContent = checkedInToday
                ? 'Your daily answer is recorded. Keep moving into lessons or review practice.'
                : 'Answer today\'s question to keep your learning cadence visible.';
        }

        if (video) {
            homePrimaryTitle.textContent = 'Continue lesson';
            homePrimaryCopy.textContent = `Resume ${video.title || 'your last lesson'} before switching tools.`;
            homePrimaryAction.textContent = 'Resume lesson';
            homePrimaryAction.onclick = () => openVideoWatchPage(video);
        } else if (!checkedInToday) {
            homePrimaryTitle.textContent = 'Start today';
            homePrimaryCopy.textContent = 'Begin with the daily check-in, then move into the lesson feed.';
            homePrimaryAction.textContent = 'Open check-in';
            homePrimaryAction.onclick = () => navigateTo(pageQuiz);
        } else {
            homePrimaryTitle.textContent = 'Browse lessons';
            homePrimaryCopy.textContent = 'Your check-in is done. Choose a subject and continue studying.';
            homePrimaryAction.textContent = 'Open videos';
            homePrimaryAction.onclick = () => navigateTo(pageVideos);
        }

        renderHomeStudyPlan({ checkedInToday, video });
    }

    function renderResumeLessonCard() {
        if (!resumeLessonCard || !resumeLessonTitle || !resumeLessonMeta || !btnResumeLesson) return;
        const { saved, video } = getSavedLastVideo();
        if (!currentUser || !video) {
            resumeLessonCard.hidden = true;
            btnResumeLesson.onclick = null;
            renderLearningHome();
            return;
        }
        const openedAt = saved?.openedAt ? new Date(saved.openedAt) : null;
        const openedAtLabel = openedAt && !Number.isNaN(openedAt.getTime())
            ? openedAt.toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })
            : '';
        const videoSubject = getVideoSubject(video);
        resumeLessonTitle.textContent = video.title || 'Last opened lesson';
        resumeLessonMeta.textContent = openedAtLabel
            ? `${subjectLabel(videoSubject)}. Last opened ${openedAtLabel}`
            : subjectLabel(videoSubject);
        btnResumeLesson.textContent = selectedSubject && videoSubject !== selectedSubject
            ? `Continue in ${subjectLabel(videoSubject)}`
            : 'Continue watching';
        btnResumeLesson.onclick = () => openVideoWatchPage(video);
        resumeLessonCard.hidden = false;
        renderLearningHome();
    }

    function openVideoWatchPage(video) {
        currentWatchVideo = video;
        saveLastOpenedVideo(video);
        watchNavTitle.textContent = subjectLabel(getVideoSubject(video));
        watchVideoTitle.textContent = video.title;
        watchIframe.src = `https://www.youtube.com/embed/${video.videoId}?autoplay=1`;
        if (watchSlideLink) {
            const slide = getVideoSlide(video);
            if (slide) {
                watchSlideLink.href = slide.url;
                watchSlideLink.textContent = 'Slide❗️';
                watchSlideLink.hidden = false;
            } else {
                watchSlideLink.href = '#';
                watchSlideLink.hidden = true;
            }
        }
        if (watchFlashcardsLink) {
            const deckId = getLinkedFlashcardDeckId(video);
            if (deckId) {
                watchFlashcardsLink.textContent = `Flashcards: ${flashcardDeckLabel(deckId)}`;
                watchFlashcardsLink.hidden = false;
                watchFlashcardsLink.onclick = () => openLinkedFlashcards(deckId);
            } else {
                watchFlashcardsLink.hidden = true;
                watchFlashcardsLink.onclick = null;
            }
        }
        if (videoFeedback) {
            videoFeedback.value = '';
            saveDraft('video_feedback', null);
        }
        renderVideoComments(video);
        renderResumeLessonCard();
        navigateTo(pageVideoWatch);
    }

    async function recordVideoView(video) {
        if (!video) return;
        const previousViews = Number(video.views) || 0;
        video.views = previousViews + 1;

        if (!supabaseConfigReady) return;

        try {
            const savedViews = await ds.incrementVideoView(video.id);
            if (Number.isFinite(savedViews)) video.views = savedViews;
        } catch (err) {
            console.error('incrementVideoView', err);
            video.views = previousViews;
            if (currentUser && currentUser.isAdmin) {
                video.views = previousViews + 1;
                await saveVideosDB();
                return;
            }
            showToast('View count could not be saved. Ask admin to run the latest Supabase SQL.', 'error');
        }
    }

    function renderVideos() {
        renderResumeLessonCard();
        userVideoGrid.innerHTML = '';
        const inSubject = videos.filter(v => getVideoSubject(v) === selectedSubject);
        const query = videoSearchQuery.trim().toLowerCase();
        const filtered = query
            ? inSubject.filter((v) => String(v.title || '').toLowerCase().includes(query))
            : inSubject;
        const newestIds = [...videos].sort((a, b) => b.id - a.id).slice(0, 2).map(v => v.id);
        if (videoSearchSummary) {
            if (query) {
                videoSearchSummary.textContent = `Showing ${filtered.length} of ${inSubject.length} lessons in ${subjectLabel(selectedSubject)}.`;
            } else {
                videoSearchSummary.textContent = `Showing all ${inSubject.length} lessons in ${subjectLabel(selectedSubject)}.`;
            }
        }
        if (filtered.length === 0) {
            userVideoGrid.innerHTML = query
                ? `<p class="video-empty-msg">No lessons in ${subjectLabel(selectedSubject)} match "${escapeHtml(videoSearchQuery.trim())}".</p>`
                : `<p class="video-empty-msg">No lessons in ${subjectLabel(selectedSubject)} yet.</p>`;
        } else {
            filtered.forEach(vid => {
                const slide = getVideoSlide(vid);
                const linkedDeckId = getLinkedFlashcardDeckId(vid);
                const card = document.createElement('div');
                card.className = 'video-card video-clickable';
                card.setAttribute('data-id', vid.id);
                card.innerHTML = `
                    <div class="video-thumb">
                        <img src="https://img.youtube.com/vi/${vid.videoId}/hqdefault.jpg" alt="${escapeHtml(vid.title)}" onerror="this.src='https://placehold.co/640x360?text=No+Thumbnail'">
                        <div class="video-play">Play</div>
                    </div>
                    <div class="video-meta">
                        ${newestIds.includes(vid.id) ? `<span class="video-badge">New</span>` : ''}
                        <h3 class="video-title">${escapeHtml(vid.title)}</h3>
                        <span class="video-subtitle">${subjectLabel(getVideoSubject(vid))}</span>
                        ${slide ? '<span class="video-slide-badge">Slide attached</span>' : ''}
                        ${linkedDeckId ? `<span class="video-slide-badge">Flashcards</span>` : ''}
                        <p class="video-views">${vid.views || 0} views</p>
                    </div>
                `;
                userVideoGrid.appendChild(card);
            });
        }
        document.querySelectorAll('.video-clickable').forEach(el => {
            el.addEventListener('click', (e) => {
                const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
                const video = videos.find(v => v.id === id);
                if (video) {
                    recordVideoView(video);
                    openVideoWatchPage(video);
                }
            });
        });
        renderAdminVideos();
    }

    function createTextSprite(text, color = '#ffffff') {
        if (!window.THREE) return null;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');

        const fontSize = 24;
        ctx.font = `${fontSize}px system-ui, -apple-system, sans-serif`;
        const textWidth = ctx.measureText(text).width;

        canvas.width = textWidth + 24;
        canvas.height = fontSize + 16;

        // Background bubble
        ctx.fillStyle = 'rgba(15, 23, 42, 0.7)';
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
        } else {
            ctx.rect(0, 0, canvas.width, canvas.height);
        }
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 1.5;
        if (ctx.roundRect) {
            ctx.roundRect(0, 0, canvas.width, canvas.height, 8);
        } else {
            ctx.rect(0, 0, canvas.width, canvas.height);
        }
        ctx.stroke();

        // Text
        ctx.font = `600 ${fontSize}px system-ui, -apple-system, sans-serif`;
        ctx.fillStyle = color;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, canvas.width / 2, canvas.height / 2);

        const texture = new window.THREE.CanvasTexture(canvas);
        texture.minFilter = window.THREE.LinearFilter;

        const spriteMaterial = new window.THREE.SpriteMaterial({
            map: texture,
            transparent: true
        });

        const sprite = new window.THREE.Sprite(spriteMaterial);
        const aspect = canvas.width / canvas.height;
        const spriteHeight = 4.5;
        sprite.scale.set(spriteHeight * aspect, spriteHeight, 1);

        return sprite;
    }

    function renderBrainMap() {
        const graphContainer = document.getElementById('3d-graph');
        const detailCard = document.getElementById('brainmap-detail-card');
        const cardSubject = document.getElementById('brainmap-card-subject');
        const cardTitle = document.getElementById('brainmap-card-title');
        const cardViews = document.getElementById('brainmap-card-views');
        const cardStatus = document.getElementById('brainmap-card-status');
        const btnPlay = document.getElementById('btn-brainmap-play');
        const btnCloseCard = document.getElementById('btn-close-brainmap-card');

        if (!graphContainer) return;

        if (btnCloseCard) {
            btnCloseCard.onclick = () => {
                detailCard.hidden = true;
            };
        }

        // 1. Prepare Nodes and Links
        const graphData = { nodes: [], links: [] };

        // Subject Hub Nodes removed as requested

        const watchedList = (currentUser && currentUser.watchedVideos) || [];

        // 1a. Build the complete list of video-to-video directed edges
        const videoEdges = []; // Array of { sourceId, targetId }
        const hasCustomConnections = videos.some(v => v.connectedIds && v.connectedIds.length > 0);

        if (hasCustomConnections) {
            videos.forEach(video => {
                if (video.connectedIds && Array.isArray(video.connectedIds)) {
                    video.connectedIds.forEach(targetId => {
                        const targetVideo = videos.find(v => v.id === targetId);
                        if (targetVideo) {
                            videoEdges.push({ sourceId: video.id, targetId: targetVideo.id });
                        }
                    });
                }
            });
        } else {
            // Fallback: Sequential learning path links within each subject
            subjects.forEach(subject => {
                const subjectVideos = videos
                    .filter(v => getVideoSubject(v) === subject)
                    .sort((a, b) => a.id - b.id); // Sort chronologically

                for (let i = 0; i < subjectVideos.length - 1; i++) {
                    videoEdges.push({
                        sourceId: subjectVideos[i].id,
                        targetId: subjectVideos[i+1].id
                    });
                }
            });
        }

        // 1c. Determine visibility of each video
        // Visible if: Completed, OR is a direct target (next step) of any completed video
        const visibleVideoIds = new Set();
        videos.forEach(video => {
            if (watchedList.includes(video.id)) {
                visibleVideoIds.add(video.id);
            }
        });
        videoEdges.forEach(edge => {
            if (watchedList.includes(edge.sourceId)) {
                visibleVideoIds.add(edge.targetId);
            }
        });

        // 1d. Add Visible Video Nodes
        videos.forEach(video => {
            if (!visibleVideoIds.has(video.id)) return;

            const videoSubject = getVideoSubject(video);
            const isCompleted = watchedList.includes(video.id);

            graphData.nodes.push({
                id: `video_${video.id}`,
                name: video.title,
                val: 12,
                color: isCompleted ? '#06b6d4' : '#6b7280', // Cyan for completed, Gray for not started
                type: 'video',
                video: video,
                subject: videoSubject
            });

        });

        // 1e. Add Video-to-Video Links (only if both endpoints are visible)
        videoEdges.forEach(edge => {
            if (visibleVideoIds.has(edge.sourceId) && visibleVideoIds.has(edge.targetId)) {
                const isSrcCompleted = watchedList.includes(edge.sourceId);
                const isTgtCompleted = watchedList.includes(edge.targetId);
                const isPathCompleted = isSrcCompleted && isTgtCompleted;

                graphData.links.push({
                    source: `video_${edge.sourceId}`,
                    target: `video_${edge.targetId}`,
                    color: isPathCompleted ? 'rgba(6, 182, 212, 0.75)' : 'rgba(255, 255, 255, 0.15)',
                    width: isPathCompleted ? 2 : 0.8,
                    curvature: 0.1
                });
            }
        });

        // 2. Initialize or Update ForceGraph3D
        if (!brainGraph) {
            const tempThree = window.THREE;
            if (tempThree) {
                try {
                    delete window.THREE;
                } catch (_) {
                    window.THREE = undefined;
                }
            }

            try {
                brainGraph = ForceGraph3D()(graphContainer)
                    .graphData(graphData)
                    .nodeLabel('name')
                    .nodeColor('color')
                    .nodeVal('val')
                    .nodeThreeObject(node => {
                        const currentWatched = (currentUser && currentUser.watchedVideos) || [];
                        const isCompleted = node.type === 'video' && currentWatched.includes(node.video?.id);
                        const labelColor = node.type === 'hub' ? '#34d399' : (isCompleted ? '#a5f3fc' : '#9ca3af');
                        const displayName = node.type === 'hub' ? subjectLabel(node.subject) : node.name;
                        const sprite = createTextSprite(displayName, labelColor);
                        if (sprite) {
                            const offset = node.type === 'hub' ? 10 : 7;
                            sprite.position.set(0, offset, 0);
                        }
                        return sprite;
                    })
                    .nodeThreeObjectExtend(true)
                    .linkColor('color')
                    .linkWidth('width')
                    .linkCurvature('curvature')
                    .linkOpacity(1.0)
                    .onNodeClick(node => {
                        // Smooth zoom/camera focus
                        const distance = 80;
                        const distRatio = 1 + distance/Math.hypot(node.x, node.y, node.z);
                        brainGraph.cameraPosition(
                            { x: node.x * distRatio, y: node.y * distRatio, z: node.z * distRatio }, // position
                            node, // lookAt
                            1500  // duration ms
                        );

                        // Show info card for videos
                        if (node.type === 'video') {
                            const vid = node.video;
                            cardSubject.textContent = subjectLabel(node.subject);
                            cardTitle.textContent = vid.title;
                            cardViews.textContent = vid.views || 0;

                            const isCompleted = watchedList.includes(vid.id);
                            cardStatus.textContent = isCompleted ? 'Completed' : 'Not started';
                            cardStatus.style.color = isCompleted ? '#10b981' : '#ef4444';

                            btnPlay.onclick = () => {
                                recordVideoView(vid);
                                openVideoWatchPage(vid);
                            };

                            detailCard.hidden = false;
                        } else {
                            detailCard.hidden = true;
                        }
                    });

                const controls = brainGraph.controls();
                if (controls) {
                    controls.autoRotate = true;
                    controls.autoRotateSpeed = 0.5;
                }
            } finally {
                if (tempThree) {
                    window.THREE = tempThree;
                }
            }

            // Adjust size to fit container
            const resizeObserver = new ResizeObserver(() => {
                if (brainGraph && graphContainer) {
                    brainGraph.width(graphContainer.clientWidth);
                    brainGraph.height(graphContainer.clientHeight);
                }
            });
            resizeObserver.observe(graphContainer);
        } else {
            brainGraph.graphData(graphData);
            brainGraph.refresh();
        }
    }

    function incrementVideoStreak() {
        if (!currentUser) return;
        const todayStr = getTodayYMD();
        if (currentUser.lastVideoDate !== todayStr) {
            if (currentUser.lastVideoDate) {
                const diff = diffDaysYMD(currentUser.lastVideoDate, todayStr);
                if (diff === 1) { currentUser.videoStreak = (currentUser.videoStreak || 0) + 1; }
                else if (diff > 1) { currentUser.videoStreak = 1; }
            } else { currentUser.videoStreak = 1; }
            currentUser.lastVideoDate = todayStr;
            userState.saveProfile(currentUser).catch((e) => console.error(e));
            renderStreaks();
        }
    }

    function renderVideoConnectionsCheckboxes(excludeId = null, selectedIds = []) {
        const container = document.getElementById('video-connections-list');
        if (!container) return;
        container.innerHTML = '';

        const availableVideos = videos.filter(v => v.id !== excludeId);

        if (availableVideos.length === 0) {
            container.innerHTML = '<span style="font-size: 13px; color: var(--muted);">No other videos available to link.</span>';
            return;
        }

        availableVideos.forEach(vid => {
            const row = document.createElement('label');
            row.style.cssText = 'display: flex; align-items: center; gap: 0.5rem; font-size: 13px; cursor: pointer; color: var(--ink); padding: 2px 0;';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.value = vid.id;
            checkbox.className = 'video-conn-checkbox';
            checkbox.checked = selectedIds.includes(vid.id);
            checkbox.style.cssText = 'cursor: pointer; accent-color: var(--teal);';

            const labelText = document.createElement('span');
            labelText.textContent = `[${subjectLabel(getVideoSubject(vid))}] ${vid.title}`;

            row.appendChild(checkbox);
            row.appendChild(labelText);
            container.appendChild(row);
        });

        // Sync the visible summary chips
        if (typeof window._refreshLinkerSummary === 'function') {
            window._refreshLinkerSummary(selectedIds);
        }
    }


    function renderAdminVideos() {
        if (!adminVideoList) return;
        adminVideoList.innerHTML = '';
        if (videos.length === 0) {
            adminVideoList.innerHTML = '<p class="muted-empty">No videos attached yet.</p>';
        }
        videos.forEach(vid => {
            const item = document.createElement('div');
            item.className = 'admin-video-item glass-card';
            item.style.padding = '0.75rem';
            item.style.position = 'relative';
            const qCount = vid.quiz && Array.isArray(vid.quiz) ? vid.quiz.length : (vid.quiz ? 1 : 0);
            const slide = getVideoSlide(vid);
            const linkedDeckId = getLinkedFlashcardDeckId(vid);
            item.innerHTML = `
                <button type="button" class="btn icon-btn delete-video-btn" data-id="${vid.id}" style="position: absolute; top: 1rem; right: 1rem; width: 28px; height: 28px; color: var(--danger); z-index: 10;">Remove</button>
                <img src="https://img.youtube.com/vi/${vid.videoId}/hqdefault.jpg" style="width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--r-btn);">
                <div style="flex:1;">
                    <h4 style="font-size:13px; line-height:1.4; margin-bottom:4px;">${escapeHtml(vid.title)}</h4>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="subject-tag" style="font-size:10px;">${subjectLabel(getVideoSubject(vid))}</span>
                        <span style="display:inline-flex; gap:0.35rem; align-items:center;">
                            ${slide ? '<span class="video-slide-badge video-slide-badge--compact">Slide</span>' : ''}
                            ${linkedDeckId ? '<span class="video-slide-badge video-slide-badge--compact">Flashcards</span>' : ''}
                            ${qCount > 0 ? `<span style="font-size:10px; color:var(--teal-700); font-weight:600;">${qCount} Qs</span>` : ''}
                        </span>
                    </div>
                    ${slide ? `<a class="admin-video-slide-link" href="${escapeHtml(slide.url)}" target="_blank" rel="noopener">${escapeHtml(slide.title)}</a>` : ''}
                </div>
            `;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-video-btn') || e.target.closest('.admin-video-slide-link')) return;
                editVideoId = vid.id;
                if (typeof window._invalidateLinkerSession === 'function') window._invalidateLinkerSession();
                newVideoUrl.value = `https://www.youtube.com/watch?v=${vid.videoId}`;

                newVideoTitle.value = vid.title;
                if (newVideoSlideUrl) newVideoSlideUrl.value = slide ? slide.url : '';
                if (newVideoSlideTitle) newVideoSlideTitle.value = vid.slideTitle || '';
                if (newVideoFlashcardDeck) newVideoFlashcardDeck.value = getLinkedFlashcardDeckId(vid);
                newVideoSubject.value = getVideoSubject(vid);
                btnAddVideo.textContent = 'Save changes';
                if(btnCancelEditVideo) btnCancelEditVideo.style.display = 'block';
                if (quizQuestionsList) {
                    quizQuestionsList.innerHTML = '';
                    if (vid.quiz) {
                        const qList = Array.isArray(vid.quiz) ? vid.quiz : [vid.quiz];
                        qList.forEach(q => addQuizQuestionUI(q));
                    }
                }
                renderVideoConnectionsCheckboxes(vid.id, vid.connectedIds || []);
            });
            adminVideoList.appendChild(item);
        });
        document.querySelectorAll('.delete-video-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idToRemove = parseInt(e.currentTarget.getAttribute('data-id'));
                if (confirm('Delete this video?')) {
                    videos = videos.filter(v => v.id !== idToRemove);
                    saveVideosDB({ successToast: 'Video deleted.' });
                    renderVideos();
                }
            });
        });

        if (editVideoId !== null) {
            const vid = videos.find(v => v.id === editVideoId);
            if (vid) {
                renderVideoConnectionsCheckboxes(editVideoId, vid.connectedIds || []);
            } else {
                editVideoId = null;
                renderVideoConnectionsCheckboxes(null, []);
            }
        } else {
            renderVideoConnectionsCheckboxes(null, []);
        }
    }

    function renderStats() {
        topVideosList.innerHTML = '';
        let sortedVideos = [...videos].sort((a, b) => (b.views || 0) - (a.views || 0)).slice(0, 5);
        sortedVideos.forEach((vid, index) => {
            let div = document.createElement('div');
            div.className = 'glass-card';
            div.innerHTML = `
                <img src="https://img.youtube.com/vi/${vid.videoId}/hqdefault.jpg" style="width: 100%; border-radius: var(--r-btn);">
                <h4 style="font-size:13px;">#${index+1} ${escapeHtml(vid.title)}</h4>
                <span style="font-size:12px; color:var(--muted);">${vid.views || 0} views</span>
            `;
            topVideosList.appendChild(div);
        });

        const quizStreakList = document.getElementById('top-quiz-streak-list');
        if (quizStreakList) {
            quizStreakList.innerHTML = '';
            const sorted = [...users].sort((a, b) => (b.checkinStreak || 0) - (a.checkinStreak || 0)).slice(0, 10);
            if (sorted.length === 0) {
                quizStreakList.innerHTML = '<p class="muted-empty">No data yet.</p>';
            } else {
                sorted.forEach((u, i) => {
                    const div = document.createElement('div');
                    div.style.cssText = 'display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:13px;';
                    div.innerHTML = `<span>#${i+1} ${escapeHtml(u.username)}</span><span style="color:var(--ok);font-weight:600;">${u.checkinStreak || 0}d</span>`;
                    quizStreakList.appendChild(div);
                });
            }
        }

        const videoStreakList = document.getElementById('top-video-streak-list');
        if (videoStreakList) {
            videoStreakList.innerHTML = '';
            const sorted = [...users].sort((a, b) => (b.videoStreak || 0) - (a.videoStreak || 0)).slice(0, 10);
            if (sorted.length === 0) {
                videoStreakList.innerHTML = '<p class="muted-empty">No data yet.</p>';
            } else {
                sorted.forEach((u, i) => {
                    const div = document.createElement('div');
                    div.style.cssText = 'display:flex;justify-content:space-between;padding:0.5rem 0;border-bottom:1px solid var(--border);font-size:13px;';
                    div.innerHTML = `<span>#${i+1} ${escapeHtml(u.username)}</span><span style="color:var(--info);font-weight:600;">${u.videoStreak || 0}d</span>`;
                    videoStreakList.appendChild(div);
                });
            }
        }
    }

    function renderAdminUsers() {}

    // ==========================================
    // CHECK-IN (merged from check_in.html)
    // ==========================================

    let checkinCurrentQ = null;
    let checkinEditingDate = null;
    let checkinCurrentType = 'text';

    function checkinTodayStr() {
        return getTodayYMD();
    }

    function checkinFmtDate(dateStr) {
        if (!dateStr) return '';
        const [y, m, d] = dateStr.split('-');
        return new Date(+y, +m - 1, +d).toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    }

    function checkinEsc(s) {
        return String(s ?? '').replace(/[&<>"']/g, (char) => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function checkinAddDays(dateStr, days) {
        const d = parseYMD(dateStr);
        if (!d) return '';
        d.setUTCDate(d.getUTCDate() + days);
        return d.getUTCFullYear() + '-' + String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
    }

    function checkinTwoWeekStart(today) {
        const anchor = '2026-05-09';
        const diffDays = (a, b) => {
            const da = parseYMD(a), db = parseYMD(b);
            return da && db ? Math.floor((db - da) / 86400000) : 0;
        };
        if (today < anchor) {
            const back = Math.ceil(diffDays(today, anchor) / 14) * 14;
            return checkinAddDays(anchor, -back);
        }
        const delta = diffDays(anchor, today);
        return checkinAddDays(anchor, Math.floor(delta / 14) * 14);
    }

    function createCheckinPoolKey() {
        if (window.crypto && typeof window.crypto.randomUUID === 'function') {
            return `pool:${window.crypto.randomUUID()}`;
        }
        return `pool:${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
    }

    async function initCheckin() {
        const taskView = document.getElementById('checkin-task-view');
        const okView = document.getElementById('checkin-ok-view');
        const loading = document.getElementById('checkin-loading');
        const qBox = document.getElementById('checkin-question-box');
        if (!taskView) return;

        taskView.style.display = 'flex';
        okView.style.display = 'none';
        loading.style.display = 'block';
        qBox.style.display = 'none';
        document.getElementById('checkin-err-ans').style.display = 'none';

        const today = checkinTodayStr();
        const key = nameKey(currentUser.username);

        try {
            checkinCurrentQ = await ds.fetchCheckinQuestionForDate(today);

            const prev = await ds.queryResponsesByNameKey(key);
            const userTodayResp = prev.find((r) => r.date === today);
            if (userTodayResp) {
                if (userTodayResp.questionSnapshot) checkinCurrentQ = userTodayResp.questionSnapshot;
                loading.style.display = 'none';
                taskView.style.display = 'none';
                okView.style.display = 'flex';
                document.getElementById('checkin-ok-msg').textContent = `Check-in already recorded for "${currentUser.username}".`;

                showCheckinFeedback(userTodayResp.answer);
                await showCheckinCycleStats(today, key);
                return;
            }

            document.getElementById('checkin-date').textContent = checkinFmtDate(today);
            document.getElementById('checkin-question-text').textContent = checkinCurrentQ?.question || '(No question scheduled for today)';

            const img = document.getElementById('checkin-img');
            if (checkinCurrentQ?.imageUrl) { img.src = checkinCurrentQ.imageUrl; img.style.display = 'block'; } else { img.style.display = 'none'; }

            const wrapText = document.getElementById('checkin-wrap-text');
            const wrapChoice = document.getElementById('checkin-wrap-choice');
            const submitBtn = document.getElementById('btn-checkin-submit');
            document.getElementById('checkin-answer').value = '';
            saveDraft('checkin_answer', null);

            if (!checkinCurrentQ) {
                wrapText.style.display = 'none';
                wrapChoice.style.display = 'none';
                if (submitBtn) submitBtn.style.display = 'none';
                loading.style.display = 'none';
                qBox.style.display = 'flex';
                return;
            }
            if (submitBtn) submitBtn.style.display = 'block';

            if (checkinCurrentQ?.type === 'choice') {
                wrapText.style.display = 'none';
                const choices = [checkinCurrentQ.c1, checkinCurrentQ.c2, checkinCurrentQ.c3, checkinCurrentQ.c4, checkinCurrentQ.c5].filter(c => c && c.trim());
                wrapChoice.style.display = 'flex';
                wrapChoice.innerHTML = choices.map(c =>
                    `<div class="checkin-choice-item" onclick="checkinPickChoice(this)"><div class="checkin-c-radio"></div><span>${checkinEsc(c)}</span></div>`
                ).join('');
            } else {
                wrapText.style.display = 'block';
                wrapChoice.style.display = 'none';
                wrapChoice.innerHTML = '';
            }

            loading.style.display = 'none';
            qBox.style.display = 'flex';
        } catch (e) {
            loading.textContent = 'Failed to load. Please try again.';
            console.error('initCheckin failed', e);
        }
    }

    function showCheckinFeedback(userAns) {
        const feedbackBox = document.getElementById('checkin-feedback-box');
        if (!feedbackBox) return;

        if (!checkinCurrentQ) {
            feedbackBox.style.display = 'none';
            return;
        }

        feedbackBox.style.display = 'block';
        feedbackBox.innerHTML = '';

        let isCorrect = null;
        let correctAnswerLabel = '';

        if (checkinCurrentQ.type === 'choice') {
            const correctKey = checkinCurrentQ.correctChoice; // 'c1', 'c2', etc.
            if (correctKey && checkinCurrentQ[correctKey]) {
                const correctVal = checkinCurrentQ[correctKey].trim();
                correctAnswerLabel = correctVal;
                isCorrect = (userAns.trim().toLowerCase() === correctVal.toLowerCase());
            }
        } else if (checkinCurrentQ.type === 'text') {
            const correctText = checkinCurrentQ.correctText;
            if (correctText && correctText.trim()) {
                correctAnswerLabel = correctText.trim();
                isCorrect = (userAns.trim().toLowerCase() === correctAnswerLabel.toLowerCase());
            }
        }

        if (isCorrect === true) {
            feedbackBox.style.background = 'var(--ok-soft)';
            feedbackBox.style.border = '1px solid rgba(21, 128, 61, 0.2)';
            feedbackBox.style.color = 'var(--ok)';
            feedbackBox.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.4rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                    Correct!
                </div>
                <div style="color: var(--ink);">Your answer: <strong>${escapeHtml(userAns)}</strong></div>
            `;
        } else if (isCorrect === false) {
            feedbackBox.style.background = 'var(--danger-soft)';
            feedbackBox.style.border = '1px solid rgba(185, 28, 28, 0.2)';
            feedbackBox.style.color = 'var(--danger)';
            feedbackBox.innerHTML = `
                <div style="font-weight: 700; margin-bottom: 0.25rem; display: flex; align-items: center; gap: 0.4rem;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    Incorrect
                </div>
                <div style="color: var(--ink); margin-bottom: 0.25rem;">Your answer: <strong>${escapeHtml(userAns)}</strong></div>
                <div style="color: var(--ink);">Correct answer: <strong style="color: var(--ok);">${escapeHtml(correctAnswerLabel)}</strong></div>
            `;
        } else {
            feedbackBox.style.background = 'var(--surface-soft)';
            feedbackBox.style.border = '1px solid var(--border)';
            feedbackBox.style.color = 'var(--muted)';
            feedbackBox.innerHTML = `
                <div style="color: var(--ink);">Your response: <strong>${escapeHtml(userAns)}</strong></div>
            `;
        }
    }

    async function showCheckinCycleStats(today, key) {
        const statsEl = document.getElementById('checkin-ok-stats');
        if (!statsEl) return;
        statsEl.style.display = 'none';
        try {
            const cycleStart = checkinTwoWeekStart(today);
            const cycleEnd = checkinAddDays(cycleStart, 13);
            const rows = await ds.queryResponsesByNameKey(key);
            if (rows.length) {
                const daysSet = {};
                rows.forEach(r => { if (r.date >= cycleStart && r.date <= today) daysSet[r.date] = true; });
                const count = Object.keys(daysSet).length;
                const elapsed = Math.floor((parseYMD(today) - parseYMD(cycleStart)) / 86400000) + 1;
                const pct = elapsed > 0 ? Math.round((count / elapsed) * 100) : 0;
                statsEl.innerHTML = `Cycle ${cycleStart} to ${cycleEnd}: <strong>${count} day(s)</strong> checked in (${pct}%)`;
                statsEl.style.display = 'block';
            }
        } catch (e) {
            console.error('showCheckinCycleStats failed', e);
        }
    }

    window.checkinPickChoice = function(el) {
        document.querySelectorAll('.checkin-choice-item').forEach(c => c.classList.remove('sel'));
        el.classList.add('sel');
    };

    async function submitCheckin() {
        const errEl = document.getElementById('checkin-err-ans');
        let ans;
        if (checkinCurrentQ?.type === 'choice') {
            const sel = document.querySelector('.checkin-choice-item.sel span');
            ans = sel ? sel.textContent : '';
        } else {
            ans = document.getElementById('checkin-answer').value.trim();
        }
        if (!ans) { errEl.textContent = 'Please enter an answer.'; errEl.style.display = 'block'; return; }
        errEl.style.display = 'none';

        const btn = document.getElementById('btn-checkin-submit');
        btn.disabled = true; btn.textContent = 'Saving…';

        const today = checkinTodayStr();
        const key = nameKey(currentUser.username);
        const ts = new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' });
        const payload = {
            timestamp: ts,
            date: today,
            name: currentUser.username,
            name_key: key,
            answer: ans,
            questionId: checkinCurrentQ?.id || checkinCurrentQ?.poolId || checkinCurrentQ?.storageKey || null,
            question: checkinCurrentQ?.question || '',
            questionSnapshot: checkinCurrentQ ? { ...checkinCurrentQ } : null
        };

        try {
            await ds.pushCheckinResponse(payload);

            saveDraft('checkin_answer', null);

            document.getElementById('checkin-ok-msg').textContent = `Recorded for "${currentUser.username}".`;

            showCheckinFeedback(ans);

            document.getElementById('checkin-task-view').style.display = 'none';
            document.getElementById('checkin-ok-view').style.display = 'flex';

            btn.disabled = false; btn.textContent = 'Submit answer';
            await updateCheckinStreak();
            renderLearningHome();

            await showCheckinCycleStats(today, key);
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Submit answer';
            alert('Something went wrong. Please try again.');
            console.error('submitCheckin failed', e);
        }
    }

    // ── Check-in Admin ──────────────────────────────────────

    async function renderCheckinQuestions() {
        const list = document.getElementById('checkin-q-list');
        if (!list) return;
        list.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Loading…</p>';
        const today = checkinTodayStr();
        try {
            const [rowsRaw, todayPick] = await Promise.all([
                ds.fetchAllCheckinQuestions(),
                ds.fetchCheckinQuestionForDate(today)
            ]);
            const rows = rowsRaw.sort((a, b) =>
                String(b.updatedAt || b.createdAt || b.date || '').localeCompare(String(a.updatedAt || a.createdAt || a.date || ''))
            );
            if (!rows.length) { list.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">No questions in the bank yet.</p>'; return; }
            list.innerHTML = rows.map((r, i) => {
                const isToday = todayPick && (r.storageKey === todayPick.storageKey || r.id === todayPick.id);
                const badge = r.type === 'choice'
                    ? `<span class="checkin-q-badge choice">Choice</span>`
                    : `<span class="checkin-q-badge">Free text</span>`;
                const answerBadge = (r.correctChoice || (r.correctText && r.correctText.trim()))
                    ? `<span class="checkin-q-badge" style="background:var(--ok-soft); color:var(--ok); border:1px solid rgba(21,128,61,0.25);">✓ Answer Key</span>`
                    : ``;
                return `<div class="checkin-q-row ${isToday ? 'today' : ''}">
                    <span class="checkin-q-date ${isToday ? 'now' : ''}">${checkinEsc(isToday ? 'Today pick' : `Bank #${i + 1}`)}</span>
                    <span class="checkin-q-text">${checkinEsc(r.question)}</span>
                    ${badge}
                    ${answerBadge}
                    <button type="button" class="btn outline-btn btn-compact" onclick="openCheckinQForm(${i})">Edit</button>
                </div>`;
            }).join('');
            window._checkinQCache = rows;
        } catch (e) {
            list.innerHTML = '<p style="font-size:13px;color:var(--danger);">Failed to load.</p>';
        }
    }

    window.openCheckinQForm = function(idx) {
        checkinEditingDate = null;
        checkinCurrentType = 'text';
        const cqImgZone = setupImgDropZone(document.getElementById('cq-img-zone'));
        document.getElementById('cq-date').value = '';
        document.getElementById('cq-question').value = '';
        if (cqImgZone) cqImgZone.setImageUrl('');
        ['cq-c1','cq-c2','cq-c3','cq-c4','cq-c5'].forEach(id => { document.getElementById(id).value = ''; });
        document.getElementById('cq-correct-text').value = '';
        document.getElementById('cq-correct-choice').value = '';
        setCQType('text');
        document.getElementById('btn-cq-delete').style.display = 'none';

        if (idx !== null && window._checkinQCache) {
            const r = window._checkinQCache[idx];
            checkinEditingDate = r.storageKey || r.date;
            document.getElementById('cq-date').value = checkinEditingDate || '';
            document.getElementById('cq-question').value = r.question || '';
            if (cqImgZone) cqImgZone.setImageUrl(r.imageUrl || '');
            if (r.type === 'choice') {
                setCQType('choice');
                ['c1','c2','c3','c4','c5'].forEach(k => { document.getElementById('cq-' + k).value = r[k] || ''; });
            }
            if (r.correctText) {
                document.getElementById('cq-correct-text').value = r.correctText;
            }
            if (r.correctChoice) {
                document.getElementById('cq-correct-choice').value = r.correctChoice;
            }
            document.getElementById('btn-cq-delete').style.display = 'block';
        }

        document.getElementById('checkin-q-list').style.display = 'none';
        document.getElementById('btn-checkin-new-q').style.display = 'none';
        document.getElementById('checkin-q-form').style.display = 'flex';
    };

    window.setCQType = function(t) {
        checkinCurrentType = t;
        document.getElementById('cq-type-text').classList.toggle('cq-type-active', t === 'text');
        document.getElementById('cq-type-choice').classList.toggle('cq-type-active', t === 'choice');
        document.getElementById('cq-choice-fields').style.display = t === 'choice' ? 'flex' : 'none';

        const textWrapper = document.getElementById('cq-correct-text-wrapper');
        const choiceWrapper = document.getElementById('cq-correct-choice-wrapper');
        if (textWrapper) textWrapper.style.display = t === 'text' ? 'block' : 'none';
        if (choiceWrapper) choiceWrapper.style.display = t === 'choice' ? 'block' : 'none';
    };

    function closeCheckinQForm() {
        document.getElementById('checkin-q-form').style.display = 'none';
        document.getElementById('checkin-q-list').style.display = 'flex';
        document.getElementById('btn-checkin-new-q').style.display = 'block';
    }

    async function saveCheckinQ() {
        const existing = checkinEditingDate && window._checkinQCache
            ? window._checkinQCache.find((q) => (q.storageKey || q.date) === checkinEditingDate)
            : null;
        const storageKey = checkinEditingDate || createCheckinPoolKey();
        const question = document.getElementById('cq-question').value.trim();
        if (!question) { alert('Please fill in the question.'); return; }
        if (checkinCurrentType === 'choice') {
            if (!document.getElementById('cq-c1').value.trim() || !document.getElementById('cq-c2').value.trim()) {
                alert('Need at least 2 choices.'); return;
            }
        }
        const btn = document.getElementById('btn-cq-save');
        btn.disabled = true; btn.textContent = 'Saving…';
        const poolId = String(storageKey).startsWith('pool:') ? String(storageKey).slice(5) : String(storageKey);
        const data = {
            id: existing?.id || poolId,
            poolId: existing?.poolId || poolId,
            storageKey,
            date: existing?.date || '',
            question,
            type: checkinCurrentType,
            c1: document.getElementById('cq-c1').value.trim(),
            c2: document.getElementById('cq-c2').value.trim(),
            c3: document.getElementById('cq-c3').value.trim(),
            c4: document.getElementById('cq-c4').value.trim(),
            c5: document.getElementById('cq-c5').value.trim(),
            imageUrl: document.getElementById('cq-img').value.trim(),
            correctText: document.getElementById('cq-correct-text').value.trim(),
            correctChoice: document.getElementById('cq-correct-choice').value,
            createdAt: existing?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            active: true
        };
        try {
            await ds.saveCheckinQuestion(storageKey, data);
            btn.disabled = false; btn.textContent = 'Save';
            closeCheckinQForm();
            renderCheckinQuestions();
            showToast('Question bank updated.');
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Save';
            console.error('saveCheckinQ failed:', e, 'data:', data);
            alert('Failed to save: ' + (e && e.message ? e.message : e));
        }
    }

    async function deleteCheckinQ() {
        if (!checkinEditingDate) return;
        if (!confirm('Delete this question from the bank?')) return;
        try {
            await ds.removeCheckinQuestion(checkinEditingDate);
            closeCheckinQForm();
            renderCheckinQuestions();
            showToast('Question deleted.');
        } catch (e) { alert('Failed to delete.'); }
    }

    async function loadCheckinDashboard(options = {}) {
        const statsEl = document.getElementById('checkin-dash-stats');
        const leadersEl = document.getElementById('checkin-dash-leaders');
        const todayEl = document.getElementById('checkin-dash-today');
        if (!statsEl) return;
        statsEl.innerHTML = leadersEl.innerHTML = todayEl.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">Loading…</p>';

        try {
            const today = checkinTodayStr();
            const cycleStart = checkinTwoWeekStart(today);
            const cycleEnd = checkinAddDays(cycleStart, 13);
            const elapsed = Math.floor((parseYMD(today) - parseYMD(cycleStart)) / 86400000) + 1;
            const all = await ds.fetchAllCheckinResponses();
            const todayRows = all.filter(r => r.date === today);
            const cycleRows = all.filter(r => r.date >= cycleStart && r.date <= today);
            const summaryEl = document.getElementById('checkin-dash-summary');
            if (summaryEl) {
                summaryEl.textContent = `${all.length} total check-ins, ${todayRows.length} today.`;
            }

            statsEl.innerHTML = `
                <div class="checkin-dash-stat"><div class="checkin-dash-stat-num">${all.length}</div><div class="checkin-dash-stat-lbl">Total check-ins</div></div>
                <div class="checkin-dash-stat"><div class="checkin-dash-stat-num">${todayRows.length}</div><div class="checkin-dash-stat-lbl">Today</div></div>
                <div class="checkin-dash-stat"><div class="checkin-dash-stat-num" style="font-size:14px;">${cycleStart} to ${cycleEnd}</div><div class="checkin-dash-stat-lbl">Current cycle</div></div>
                <div class="checkin-dash-stat"><div class="checkin-dash-stat-num">${elapsed}</div><div class="checkin-dash-stat-lbl">Days elapsed</div></div>
            `;

            const byKey = {};
            cycleRows.forEach(r => {
                if (!r.name_key) return;
                if (!byKey[r.name_key]) byKey[r.name_key] = { name: r.name, dates: {} };
                byKey[r.name_key].dates[r.date] = true;
            });
            const leaders = Object.values(byKey).map(e => {
                const count = Object.keys(e.dates).length;
                return { name: e.name, count, pct: elapsed > 0 ? Math.round((count / elapsed) * 100) : 0 };
            }).sort((a, b) => b.pct - a.pct || b.count - a.count);

            leadersEl.innerHTML = leaders.length ? leaders.map((u, i) =>
                `<div class="checkin-resp-card">
                    <div style="display:flex;justify-content:space-between;align-items:center;">
                        <span class="checkin-resp-name">${i + 1}. ${checkinEsc(u.name)}</span>
                        <span style="color:var(--teal-700);font-weight:600;">${u.pct}%</span>
                    </div>
                    <div style="height:6px;border-radius:999px;background:var(--border);margin-top:0.4rem;overflow:hidden;">
                        <div style="height:100%;width:${u.pct}%;background:var(--teal);border-radius:999px;"></div>
                    </div>
                    <div class="checkin-resp-ans">${u.count}/${elapsed} days</div>
                </div>`
            ).join('') : '<p style="font-size:13px;color:var(--text-muted);">No data yet.</p>';

            todayEl.innerHTML = todayRows.length ? [...todayRows].reverse().map(r =>
                `<div class="checkin-resp-card">
                    <div style="display:flex;justify-content:space-between;">
                        <span class="checkin-resp-name">${checkinEsc(r.name)}</span>
                        <span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono);">${checkinEsc(r.timestamp)}</span>
                    </div>
                    <div class="checkin-resp-ans">${checkinEsc(r.answer)}</div>
                </div>`
            ).join('') : '<p style="font-size:13px;color:var(--text-muted);">No check-ins today.</p>';
            if (options.notifySuccess) showToast('Check-in dashboard updated.');
        } catch (e) {
            statsEl.innerHTML = '<p style="font-size:13px;color:var(--danger);">Failed to load.</p>';
            console.error('loadCheckinDashboard failed', e);
        }
    }

    function renderAdminMembers() {
        adminMemberList.innerHTML = '';
        users.forEach(u => {
            const div = document.createElement('div');
            div.className = 'admin-user-item glass-card';
            div.innerHTML = `
                <div class="user-info"><h4>${escapeHtml(u.username)}</h4></div>
                <button type="button" class="btn outline-btn btn-delete-member btn-compact" data-id="${u.id}">Delete</button>
            `;
            adminMemberList.appendChild(div);
        });
        document.querySelectorAll('.btn-delete-member').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.target.getAttribute('data-id');
                if (confirm("Delete this member?")) {
                    users = users.filter(u => u.id !== id);
                    saveUsersDB({ successToast: 'Member deleted.' });
                    renderAdminMembers();
                }
            });
        });
    }

    function setActiveShellNav(pageElement) {
        const targetByPage = new Map([
            [pageHome, 'home'],
            [pageVideos, 'videos'],
            [pageBrainmap, 'brainmap'],
            [pageQuiz, 'checkin'],
            [pageStats, 'stats'],
            [pageRequest, 'request'],
            [pageSheets, 'sheets'],
            [pageDecks, 'decks'],
            [pageFlashcards, 'flashcards'],
            [pageAlevel, 'alevel'],
            [pageLivequiz, 'livequiz'],
            [pageMedquiz, 'medquiz']
        ]);
        const activeTarget = targetByPage.get(pageElement) || '';
        document.querySelectorAll('.shell-nav-link').forEach((link) => {
            if (link.getAttribute('data-nav-target') === activeTarget) {
                link.setAttribute('aria-current', 'page');
                setTimeout(() => {
                    const pageParent = link.closest('.page');
                    if (pageParent && pageParent.classList.contains('active')) {
                        link.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
                    }
                }, 50);
            } else {
                link.removeAttribute('aria-current');
            }
        });
    }

    function navigateTo(pageElement) {
        if (!pageElement) return;
        if (pageElement !== pageLogin) {
            clearTimeout(loginStuckTimer);
            setLoginLoading(false);
        }
        if (pageElement === pageHome) renderLearningHome();
        if (pageElement === pageBrainmap) renderBrainMap();
        updateAdminButtonVisibility(pageElement);
        setActiveShellNav(pageElement);
        document.querySelectorAll('.page').forEach(p => {
            const isActive = p === pageElement;
            p.style.display = isActive ? 'block' : 'none';
            p.classList.toggle('active', isActive);
        });
        if (pageElement === pageAdmin && currentUser?.isAdmin) {
            const lb = document.getElementById('local-admin-banner');
            if (lb) {
                if (currentUser.localPasswordAdmin) {
                    lb.style.display = 'block';
                    lb.textContent = currentUser.systemAdmin
                        ? 'System admin password access is active. Database writes may fail until the Supabase account has an admin role in public.user_roles.'
                        : 'Password-only admin access is active. Database writes may fail until the Supabase account has an admin or teacher role in public.user_roles.';
                } else {
                    lb.style.display = 'none';
                }
            }
            renderAdminUsers();
            renderAdminVideos();
            renderAdminFeedbacks();
            if (!adminMemberList.hidden) renderAdminMembers();
            // Restore whichever tab was active before leaving (call twice: immediately + rAF safety net)
            if (typeof window._restoreAdminTab === 'function') window._restoreAdminTab();
            requestAnimationFrame(() => {
                if (typeof window._restoreAdminTab === 'function') window._restoreAdminTab();
            });

        } else if (pageElement === pageCheckinBankAdmin && currentUser?.isAdmin) {
            renderCheckinQuestions();
        } else {
            const lb = document.getElementById('local-admin-banner');
            if (lb) lb.style.display = 'none';
        }
        if (pageElement === pageQuiz && currentUser) {
            initCheckin();
        }
        const isWelcomeHero = pageElement === pageWelcome;
        document.body.classList.toggle('welcome-hero-active', isWelcomeHero);
        const heartHost = document.getElementById('welcome-heart-host');
        if (isWelcomeHero && heartHost) {
            initWelcomeHeartScene(heartHost).catch(() => {});
        } else {
            disposeWelcomeHeartScene();
        }
        window.scrollTo({ top: 0, behavior: 'auto' });
    }

    /** After member login from welcome/login/register: land on Home unless the URL explicitly asks for videos. */
    async function routeStudentAfterLoginFromGate() {
        if (!currentUser || currentUser.isAdmin) return;
        if (wantsVideoFeedRoute()) {
            navigateTo(pageVideos);
            return;
        }
        try {
            const today = getTodayYMD();
            const key = nameKey(currentUser.username);
            const rows = await withTimeout(ds.queryResponsesByNameKey(key), 8000);
            const doneToday = rows.some(r => r.date === today);
            if (doneToday) currentUser.lastCheckinDate = today;
            renderLearningHome();
            navigateTo(pageHome);
        } catch (e) {
            console.error(e);
            navigateTo(pageHome);
        }
    }

    function renderAdminFeedbacks() {
        const list = document.getElementById('admin-feedback-list');
        if (!list) return;
        list.innerHTML = '';
        const query = (adminFeedbackSearch?.value || '').trim().toLowerCase();
        const notes = videos.flatMap((v) => {
            const feedbacks = Array.isArray(v.feedbacks) ? v.feedbacks : [];
            return feedbacks
                .filter((f) => f && String(f.text || '').trim())
                .map((f) => ({
                    ...f,
                    videoTitle: v.title || 'Untitled lesson',
                    subject: getVideoSubject(v),
                    videoId: v.id
                }));
        }).sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
        const filtered = query
            ? notes.filter((n) => [n.text, n.user, n.videoTitle, subjectLabel(n.subject)].some((v) => String(v || '').toLowerCase().includes(query)))
            : notes;

        if (adminFeedbackSummary) {
            adminFeedbackSummary.textContent = notes.length
                ? `${filtered.length} of ${notes.length} lesson note${notes.length === 1 ? '' : 's'} shown.`
                : 'Review student notes from all lessons.';
        }
        if (!notes.length) {
            list.innerHTML = '<p class="muted-empty">No lesson notes yet. Notes appear here after students type a note and mark a lesson as finished.</p>';
            return;
        }
        if (!filtered.length) {
            list.innerHTML = '<p class="muted-empty">No lesson notes match this search.</p>';
            return;
        }

        // ── Expand / Collapse all bar ────────────────────────────
        let allExpanded = false;
        const bar = document.createElement('div');
        bar.style.cssText = 'display:flex; justify-content:flex-end; margin-bottom:0.5rem;';
        const toggleAllBtn = document.createElement('button');
        toggleAllBtn.type = 'button';
        toggleAllBtn.className = 'btn outline-btn btn-compact';
        toggleAllBtn.style.fontSize = '12px';
        toggleAllBtn.textContent = 'Expand all';
        toggleAllBtn.addEventListener('click', () => {
            allExpanded = !allExpanded;
            list.querySelectorAll('.admin-note-item').forEach(card => {
                card.classList.toggle('is-open', allExpanded);
            });
            toggleAllBtn.textContent = allExpanded ? 'Collapse all' : 'Expand all';
        });
        bar.appendChild(toggleAllBtn);
        list.appendChild(bar);

        // ── Note cards ───────────────────────────────────────────
        filtered.forEach((f) => {
            const card = document.createElement('div');
            card.className = 'admin-list-item admin-note-item'; // collapsed by default
            card.innerHTML = `
                <div class="admin-note-header">
                    <div class="admin-note-meta">
                        <span class="admin-note-user">${escapeHtml(f.user || 'Anon')}</span>
                        <span class="admin-note-subject-pill">${escapeHtml(subjectLabel(f.subject))}</span>
                        <span class="admin-note-date">${escapeHtml(new Date(f.date || Date.now()).toLocaleString())}</span>
                    </div>
                    <div style="display:flex; align-items:center; gap:0.5rem; flex-shrink:0;">
                        <span class="admin-note-lesson-tag">${escapeHtml(f.videoTitle)}</span>
                        <span class="admin-note-chevron">›</span>
                    </div>
                </div>
                <div class="admin-note-body">
                    <p class="admin-note-text">${escapeHtml(f.text)}</p>
                </div>
            `;

            // Toggle on header click
            card.querySelector('.admin-note-header').addEventListener('click', () => {
                card.classList.toggle('is-open');
                // Sync expand-all button label
                const allOpen = list.querySelectorAll('.admin-note-item:not(.is-open)').length === 0;
                toggleAllBtn.textContent = allOpen ? 'Collapse all' : 'Expand all';
                allExpanded = allOpen;
            });

            list.appendChild(card);
        });
    }


    btnGoLogin.addEventListener('click', () => {
        loginError.style.display = 'none';
        if (!persistFormsEnabled()) loginForm.reset();
        navigateTo(pageLogin);
    });
    btnGoRegister.addEventListener('click', () => {
        regMsg.textContent = '';
        if (!persistFormsEnabled()) registerForm.reset();
        navigateTo(pageRegister);
    });
    btnsBackWelcome.forEach(btn => { btn.addEventListener('click', () => navigateTo(pageWelcome)); });

    const registerSubmitBtn = registerForm ? registerForm.querySelector('button[type="submit"]') : null;

    registerForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const un = regUsername.value.trim();
        const pw = regPassword.value.trim();
        if (!un || !pw) return;
        if (registerSubmitBtn?.disabled) return;
        if (isEmbeddedTestLogin(un, pw)) {
            regMsg.textContent = 'This is a system test account. Use Log in instead of registering.';
            return;
        }
        if (allowedNames.length > 0 && !isLineNameOnAllowList(un, allowedNames)) {
            regMsg.textContent =
                'This name is not on the approved list. Check the spelling or contact your instructor.';
            return;
        }
        if (registerSubmitBtn) registerSubmitBtn.disabled = true;
        (async () => {
            try {
                if (useLocalMemberAuth) {
                    const rec = await userState.registerLocalMember(un, pw, (uid) => ({
                        id: uid,
                        uid,
                        username: un,
                        status: 'approved',
                        expiresAt: null,
                        createdAt: Date.now(),
                        videoStreak: 0,
                        checkinStreak: 0,
                        lastCheckinDate: null,
                        lastVideoDate: null,
                        quizHistory: {},
                        localMember: true
                    }));
                    if (!rec.ok) {
                        regMsg.textContent =
                            rec.code === 'taken'
                                ? 'This name is already used in this browser. Try Log in or use another approved name.'
                                : 'Password is too short. Use at least 6 characters.';
                        return;
                    }
                    registerForm.reset();
                    if (usernameInput) usernameInput.value = un;
                    if (passwordInput) passwordInput.value = '';
                    regMsg.textContent = '';
                    saveDraft('register', null);
                    showToast('Account created for this browser. Supabase Auth is not enabled.');
                    navigateTo(pageLogin);
                    return;
                }
                const virtualEmail = un.toLowerCase().replace(/\s+/g, '') + "@med.local";
                const { data, error } = await ds.authSignUp(virtualEmail, pw);
                if (error) throw error;
                const u = data.user;
                if (!u) {
                    regMsg.textContent =
                        'Registration could not finish in one step. Ask an admin to configure Supabase so members can sign in immediately.';
                    return;
                }
                const userData = {
                    id: u.id,
                    uid: u.id,
                    username: un,
                    status: 'approved',
                    expiresAt: null,
                    createdAt: Date.now()
                };
                await userState.saveProfile(userData);
                registerForm.reset();
                if (usernameInput) usernameInput.value = un;
                if (passwordInput) passwordInput.value = '';
                regMsg.textContent = '';
                saveDraft('register', null);
                showToast('Account created. Log in with the same name and password.');
                navigateTo(pageLogin);
            } catch (err) {
                regMsg.textContent = formatAuthError(err, 'register');
            } finally {
                if (registerSubmitBtn) registerSubmitBtn.disabled = false;
            }
        })();
    });

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const un = usernameInput.value.trim();
        const pw = passwordInput.value;
        loginError.style.display = 'none';
        if (!un || !pw) return;
        if (loginSubmitBtn?.disabled) return;
        clearTimeout(loginStuckTimer);

        if (isEmbeddedTestLogin(un, pw)) {
            setLoginLoading(true);
            const base = buildEmbeddedTestUser();
            const merged = userState.hydrateEmbeddedLocalUser(base);
            currentUser = {
                ...merged,
                isAdmin: false,
                localMember: true,
                embeddedTestLogin: true
            };
            renderStreaks();
            syncExamCountdown();
            setLoginLoading(false);
            routeStudentAfterLoginFromGate();
            return;
        }

        if (useLocalMemberAuth) {
            setLoginLoading(true);
            try {
                if (allowedNames.length > 0 && !isLineNameOnAllowList(un, allowedNames)) {
                    loginError.textContent =
                        'This name is not on the approved list. Check the spelling or contact your instructor.';
                    loginError.style.display = 'block';
                    setLoginLoading(false);
                    return;
                }
                const v = await userState.loginLocalMember(un, pw);
                if (!v.ok) {
                    loginError.textContent =
                        v.code === 'missing_profile'
                            ? 'No member profile was found. Register again.'
                            : 'The name or password is incorrect, or this browser has not registered the account.';
                    loginError.style.display = 'block';
                    setLoginLoading(false);
                    return;
                }
                let currentAllowed = [];
                if (supabaseConfigReady) {
                    try {
                        currentAllowed = await withTimeout(ds.fetchAllowedNames(), 8000);
                    } catch (_) {
                        currentAllowed = [];
                    }
                }
                const userName = normalizeLineAllowName(v.user.username);
                const stillAllowed =
                    currentAllowed.length === 0 ||
                    currentAllowed.some((n) => normalizeLineAllowName(n) === userName);
                if (!stillAllowed) {
                    alert('Your name has been removed from the approved list. Please contact the admin.');
                    await userState.signOut(v.user, { signOutRemote: false });
                    setLoginLoading(false);
                    return;
                }
                if (v.user.status && v.user.status !== 'approved') {
                    loginError.textContent =
                        'Your account is not approved yet. Please wait for an admin or contact support.';
                    loginError.style.display = 'block';
                    await userState.signOut(v.user, { signOutRemote: false });
                    setLoginLoading(false);
                    return;
                }
                const exp = Number(v.user.expiresAt);
                if (Number.isFinite(exp) && exp > 0 && Date.now() > exp) {
                    alert('Your access has expired. Please register again.');
                    await userState.signOut(v.user, { signOutRemote: false });
                    setLoginLoading(false);
                    return;
                }
                currentUser = v.user;
                renderStreaks();
                syncExamCountdown();
                setLoginLoading(false);
                routeStudentAfterLoginFromGate();
            } catch (err) {
                console.error(err);
                loginError.textContent =
                    err && (err.code === 'TIMEOUT' || err.message === 'TIMEOUT')
                        ? 'Supabase did not respond in time. Check internet or project status.'
                        : 'Could not log in. Check your connection.';
                loginError.style.display = 'block';
                setLoginLoading(false);
            }
            return;
        }

        setLoginLoading(true);
        // Covers only the email/password round-trip; cleared once sign-in resolves so we do not
        // Covers sign-in only; profile load is handled by auth state + subscriptions.
        loginStuckTimer = setTimeout(() => {
            if (pageLogin.classList.contains('active') && loginSubmitBtn?.disabled) {
                setLoginLoading(false);
                loginError.textContent = 'Still waiting. Slow network or Supabase may be blocked. Check browser console.';
                loginError.style.display = 'block';
            }
        }, 26000);
        const virtualEmail = un.toLowerCase().replace(/\s+/g, '') + "@med.local";
        try {
            const res = await withTimeout(Promise.resolve(ds.authSignIn(virtualEmail, pw)), 25000);
            if (res.error) throw res.error;
            clearTimeout(loginStuckTimer);
            loginStuckTimer = null;
            setLoginLoading(true, 'profile');
        } catch (err) {
            clearTimeout(loginStuckTimer);
            loginError.textContent = formatAuthError(err, 'login');
            loginError.style.display = 'block';
            setLoginLoading(false);
        }
    });

    const countdownTimerRequest = document.getElementById('countdown-timer-request');
    const countdownTimerSheets = document.getElementById('countdown-timer-sheets');
    const countdownTimerDecks = document.getElementById('countdown-timer-decks');
    const countdownTimerFlashcards = document.getElementById('countdown-timer-flashcards');
    const countdownTimerAlevel = document.getElementById('countdown-timer-alevel');
    const countdownTimerLivequiz = document.getElementById('countdown-timer-livequiz');
    const countdownTimerMedquiz = document.getElementById('countdown-timer-medquiz');

    function setAllCountdownLabels(html) {
        [countdownTimerHome, countdownTimer, countdownTimerWatch, countdownTimerQuiz, countdownTimerBm, countdownTimerRequest, countdownTimerSheets, countdownTimerDecks, countdownTimerFlashcards, countdownTimerAlevel, countdownTimerLivequiz, countdownTimerMedquiz].forEach(el => { if (el) el.innerHTML = html; });
    }

    function formatDatetimeLocal(ms) {
        const d = new Date(ms);
        const pad = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    }

    function parseDatetimeLocalInput(value) {
        if (!value || !String(value).trim()) return null;
        const t = new Date(value).getTime();
        return Number.isFinite(t) ? t : null;
    }

    /** Apply local admin drafts over server values while testing on localhost. */
    function applyAdminPanelDrafts(allowedNamesArr, deadlineMs, examNote) {
        const joined = (allowedNamesArr || []).join('\n');
        const examInput = document.getElementById('admin-exam-deadline');
        const draftExam = loadDraftRaw('admin_exam_deadline');
        if (examInput && document.activeElement !== examInput) {
            if (draftExam !== null) {
                examInput.value = draftExam;
            } else if (deadlineMs != null && Number.isFinite(deadlineMs) && deadlineMs > 0) {
                examInput.value = formatDatetimeLocal(deadlineMs);
            } else {
                examInput.value = '';
            }
        }
        const examNoteInput = document.getElementById('admin-exam-note');
        const draftExamNote = loadDraftRaw('admin_exam_note');
        if (examNoteInput && document.activeElement !== examNoteInput) {
            examNoteInput.value = draftExamNote !== null ? draftExamNote : (examNote || '');
        }
        const adminAllowedNames = document.getElementById('admin-allowed-names');
        const draftAllowed = loadDraftRaw('admin_allowed_names');
        if (adminAllowedNames && document.activeElement !== adminAllowedNames) {
            adminAllowedNames.value = draftAllowed !== null ? draftAllowed : joined;
        }
        updateAllowedNamesSummary();
        updateExamInfoSummary();
    }

    function resolveExamDeadline(profile) {
        if (!profile) return null;
        const pe = Number(profile.expiresAt);
        if (Number.isFinite(pe) && pe > 0) {
            return { deadlineMs: pe, revokeSessionOnZero: true };
        }
        const ge = Number(globalExamDeadlineMs);
        if (Number.isFinite(ge) && ge > 0) {
            return { deadlineMs: ge, revokeSessionOnZero: false };
        }
        return null;
    }

    function forceSignOutStudent() {
        const user = currentUser;
        currentUser = null;
        userState.signOut(user, { signOutRemote: true }).finally(() => {
            navigateTo(pageWelcome);
        });
    }

    function syncExamCountdown() {
        if (!currentUser || currentUser.isAdmin) {
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = null;
            setAllCountdownLabels('Exam date');
            return;
        }
        const resolved = resolveExamDeadline(currentUser);
        if (!resolved) {
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = null;
            setAllCountdownLabels('No exam date');
            return;
        }
        if (Date.now() >= resolved.deadlineMs) {
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = null;
            setAllCountdownLabels(resolved.revokeSessionOnZero ? 'Expired' : 'Exam ended');
            if (resolved.revokeSessionOnZero) forceSignOutStudent();
            return;
        }
        startCountdown(resolved.deadlineMs, resolved.revokeSessionOnZero);
    }

    function startCountdown(expiresAt, revokeSessionOnZero = true) {
        if (countdownInterval) clearInterval(countdownInterval);
        countdownInterval = null;
        const tick = () => {
            const diff = expiresAt - Date.now();
            if (diff <= 0) {
                if (countdownInterval) clearInterval(countdownInterval);
                countdownInterval = null;
                setAllCountdownLabels(revokeSessionOnZero ? 'Expired' : 'Exam ended');
                if (revokeSessionOnZero) forceSignOutStudent();
                return;
            }
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff / 3600000) % 24).toString().padStart(2, '0');
            const m = Math.floor((diff / 60000) % 60).toString().padStart(2, '0');
            const s = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
            setAllCountdownLabels(`Exam in ${d}d ${h}:${m}:${s}`);
        };
        tick();
        countdownInterval = setInterval(tick, 1000);
    }

    function renderExamDetailsModal() {
        if (!examDetailsNote) return;
        const note = String(globalExamNote || '').trim();
        examDetailsNote.textContent = note || 'No exam details yet.';
        examDetailsNote.classList.toggle('exam-details-note--empty', !note);
    }

    function openExamDetailsModal() {
        if (!examDetailsModal) return;
        renderExamDetailsModal();
        examDetailsModal.classList.add('open');
        examDetailsModal.setAttribute('aria-hidden', 'false');
        if (btnCloseExamDetails) btnCloseExamDetails.focus();
    }

    function closeExamDetailsModal() {
        if (!examDetailsModal) return;
        examDetailsModal.classList.remove('open');
        examDetailsModal.setAttribute('aria-hidden', 'true');
    }

    [countdownTimerHome, countdownTimer, countdownTimerWatch, countdownTimerQuiz, countdownTimerBm, countdownTimerRequest, countdownTimerSheets, countdownTimerDecks, countdownTimerFlashcards, countdownTimerAlevel, countdownTimerLivequiz, countdownTimerMedquiz].forEach((el) => {
        if (el) el.addEventListener('click', openExamDetailsModal);
    });
    if (btnCloseExamDetails) btnCloseExamDetails.addEventListener('click', closeExamDetailsModal);
    if (examDetailsModal) {
        examDetailsModal.addEventListener('click', (event) => {
            if (event.target === examDetailsModal) closeExamDetailsModal();
        });
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && examDetailsModal?.classList.contains('open')) {
            closeExamDetailsModal();
        }
    });

    function rotateCamera(deltaTheta, deltaPhi, durationMs = 200) {
        if (!brainGraph) return;
        const camera = brainGraph.camera();
        const controls = brainGraph.controls();
        if (!camera || !controls) return;

        const target = controls.target || { x: 0, y: 0, z: 0 };
        const dx = camera.position.x - target.x;
        const dy = camera.position.y - target.y;
        const dz = camera.position.z - target.z;

        const radius = Math.hypot(dx, dy, dz);
        if (radius === 0) return;

        let phi = Math.acos(dy / radius);
        let theta = Math.atan2(dz, dx);

        theta += deltaTheta;
        phi = Math.max(0.01, Math.min(Math.PI - 0.01, phi + deltaPhi));

        const newX = target.x + radius * Math.sin(phi) * Math.cos(theta);
        const newY = target.y + radius * Math.cos(phi);
        const newZ = target.z + radius * Math.sin(phi) * Math.sin(theta);

        brainGraph.cameraPosition(
            { x: newX, y: newY, z: newZ },
            target,
            durationMs
        );
    }

    function zoomCamera(scaleFactor, durationMs = 200) {
        if (!brainGraph) return;
        const camera = brainGraph.camera();
        const controls = brainGraph.controls();
        if (!camera || !controls) return;

        const target = controls.target || { x: 0, y: 0, z: 0 };
        const dx = camera.position.x - target.x;
        const dy = camera.position.y - target.y;
        const dz = camera.position.z - target.z;

        const newX = target.x + dx * scaleFactor;
        const newY = target.y + dy * scaleFactor;
        const newZ = target.z + dz * scaleFactor;

        const newDist = Math.hypot(newX - target.x, newY - target.y, newZ - target.z);
        if (newDist < 15 || newDist > 400) return;

        brainGraph.cameraPosition(
            { x: newX, y: newY, z: newZ },
            target,
            durationMs
        );
    }

    // Press and hold continuous rotation/zoom handler
    let activeHoldTimeout = null;
    let activeHoldInterval = null;

    function clearHold() {
        if (activeHoldTimeout) clearTimeout(activeHoldTimeout);
        if (activeHoldInterval) clearInterval(activeHoldInterval);
        activeHoldTimeout = null;
        activeHoldInterval = null;
    }

    function setupPressAndHold(btnSelector, actionFn) {
        document.addEventListener('mousedown', (e) => {
            const btn = e.target.closest(btnSelector);
            if (!btn) return;
            e.preventDefault();

            actionFn();

            clearHold();
            activeHoldTimeout = setTimeout(() => {
                activeHoldInterval = setInterval(() => {
                    actionFn();
                }, 40); // Repeat every 40ms
            }, 250); // Delay before repeating
        });

        document.addEventListener('touchstart', (e) => {
            const btn = e.target.closest(btnSelector);
            if (!btn) return;
            e.preventDefault();

            actionFn();

            clearHold();
            activeHoldTimeout = setTimeout(() => {
                activeHoldInterval = setInterval(() => {
                    actionFn();
                }, 40);
            }, 250);
        }, { passive: false });
    }

    // Bind hold release globally
    ['mouseup', 'mouseleave', 'touchend', 'touchcancel'].forEach(event => {
        document.addEventListener(event, clearHold);
    });

    // Setup controls
    setupPressAndHold('#btn-control-zoomin', () => zoomCamera(0.97, 50));
    setupPressAndHold('#btn-control-zoomout', () => zoomCamera(1.03, 50));
    setupPressAndHold('#btn-control-left', () => rotateCamera(-Math.PI / 90, 0, 50));
    setupPressAndHold('#btn-control-right', () => rotateCamera(Math.PI / 90, 0, 50));
    setupPressAndHold('#btn-control-up', () => rotateCamera(0, -Math.PI / 90, 50));
    setupPressAndHold('#btn-control-down', () => rotateCamera(0, Math.PI / 90, 50));

    document.addEventListener('click', (e) => {
        const resetBtn = e.target.closest('#btn-control-reset');
        if (resetBtn && brainGraph) {
            brainGraph.zoomToFit(800);
        }

        const rotateToggleBtn = e.target.closest('#btn-control-rotate');
        if (rotateToggleBtn && brainGraph) {
            const controls = brainGraph.controls();
            if (controls) {
                controls.autoRotate = !controls.autoRotate;
                rotateToggleBtn.classList.toggle('control-btn--active', controls.autoRotate);
            }
        }
    });

    const btnCheckin = document.getElementById('btn-checkin');
    const btnOpenCheckinBankPage = document.getElementById('btn-open-checkin-bank-page');
    const btnBackToAdminFromBank = document.getElementById('btn-back-to-admin-from-bank');

    if (btnOpenCheckinBankPage) {
        btnOpenCheckinBankPage.addEventListener('click', () => navigateTo(pageCheckinBankAdmin));
    }
    if (btnBackToAdminFromBank) {
        btnBackToAdminFromBank.addEventListener('click', () => navigateTo(pageAdmin));
    }

    // ─── Video Link Designer ──────────────────────────────────────────
    (function initVideoLinker() {
        // ── DOM refs ─────────────────────────────────────────────
        const btnOpen        = document.getElementById('btn-open-video-linker');
        const btnBack        = document.getElementById('btn-back-from-linker');
        const btnSave        = document.getElementById('btn-linker-save');
        const btnClear       = document.getElementById('btn-linker-clear');
        const btnZoomIn      = document.getElementById('btn-canvas-zoom-in');
        const btnZoomOut     = document.getElementById('btn-canvas-zoom-out');
        const btnZoomFit     = document.getElementById('btn-canvas-zoom-fit');
        const zoomLabel      = document.getElementById('canvas-zoom-label');
        const saveStatus     = document.getElementById('linker-save-status');
        const viewport       = document.getElementById('canvas-viewport');
        const world          = document.getElementById('canvas-world');
        const edgeSvg        = document.getElementById('canvas-edge-svg');
        const tempEdge       = document.getElementById('canvas-temp-edge');
        const sidebarList    = document.getElementById('canvas-sidebar-list');
        const searchEl       = document.getElementById('canvas-search');
        const pillsEl        = document.getElementById('canvas-subject-pills');
        const emptyState     = document.getElementById('canvas-empty');

        // ── Canvas state ─────────────────────────────────────────
        let pan   = { x: 60, y: 60 };  // world offset
        let scale = 1;
        const MIN_SCALE = 0.2, MAX_SCALE = 3;

        // nodes: Map<videoId, { x, y, el }>
        const nodes = new Map();
        // edges: Set of "id1:id2" (always sorted so id1 < id2)
        const edges = new Set();
        // edge DOM elements: Map<"id1:id2", svgPathEl>
        const edgeEls = new Map();

        // drag-from-sidebar state
        let sidebarDrag = null;   // { videoId, ghost }
        // node drag state
        let nodeDrag = null;      // { videoId, startNodeX, startNodeY, startMouseX, startMouseY }
        // edge drawing state
        let portDrag = null;      // { fromId, tempLine, startX, startY }
        // pan state
        let isPanning = false, panStart = null;
        // space held for pan mode
        let spaceDown = false;

        let linkerSourceId  = null;
        let sbSubjectFilter = 'all';

        // ── Ghost element ─────────────────────────────────────────
        const ghost = document.createElement('div');
        ghost.className = 'canvas-drag-ghost';
        ghost.innerHTML = '<img>';
        document.body.appendChild(ghost);

        // ── Transform helpers ─────────────────────────────────────
        function applyTransform() {
            world.style.transform = `translate(${pan.x}px,${pan.y}px) scale(${scale})`;
            if (zoomLabel) zoomLabel.textContent = Math.round(scale * 100) + '%';
        }

        function screenToWorld(sx, sy) {
            const r = viewport.getBoundingClientRect();
            return {
                x: (sx - r.left - pan.x) / scale,
                y: (sy - r.top  - pan.y) / scale,
            };
        }

        function clampScale(s) {
            return Math.min(MAX_SCALE, Math.max(MIN_SCALE, s));
        }

        function zoomAt(clientX, clientY, delta) {
            const factor = delta > 0 ? 0.9 : 1.1;
            const newScale = clampScale(scale * factor);
            const r = viewport.getBoundingClientRect();
            const wx = clientX - r.left, wy = clientY - r.top;
            pan.x = wx - (wx - pan.x) * (newScale / scale);
            pan.y = wy - (wy - pan.y) * (newScale / scale);
            scale = newScale;
            applyTransform();
        }

        // ── Edge helpers ──────────────────────────────────────────
        function edgeKey(a, b) { return a < b ? `${a}:${b}` : `${b}:${a}`; }

        function nodeCenter(videoId) {
            const n = nodes.get(videoId);
            if (!n) return { x: 0, y: 0 };
            const NODE_W = 168;
            const NODE_H = n.el.offsetHeight || 120;
            return { x: n.x + NODE_W / 2, y: n.y + NODE_H / 2 };
        }

        function bezierPath(x1, y1, x2, y2) {
            const cy = (y1 + y2) / 2;
            return `M ${x1} ${y1} C ${x1} ${cy}, ${x2} ${cy}, ${x2} ${y2}`;
        }

        function portPos(videoId, which) {
            const n = nodes.get(videoId);
            if (!n) return { x: 0, y: 0 };
            const NODE_W = 168;
            const NODE_H = n.el.offsetHeight || 120;
            if (which === 'top')    return { x: n.x + NODE_W / 2, y: n.y };
            return { x: n.x + NODE_W / 2, y: n.y + NODE_H };
        }

        function redrawEdge(key) {
            const [a, b] = key.split(':').map(Number);
            const pA = portPos(a, 'bottom');
            const pB = portPos(b, 'top');
            let el = edgeEls.get(key);
            if (!el) {
                el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
                el.setAttribute('class', 'c-edge');
                el.setAttribute('stroke', 'var(--teal)');
                el.setAttribute('stroke-width', '2.5');
                el.setAttribute('fill', 'none');
                el.setAttribute('opacity', '0.75');
                el.setAttribute('stroke-linecap', 'round');
                edgeSvg.appendChild(el);
                edgeEls.set(key, el);
                // click to delete edge
                el.addEventListener('click', () => {
                    edges.delete(key);
                    edgeEls.get(key)?.remove();
                    edgeEls.delete(key);
                    updateEmpty();
                });
            }
            el.setAttribute('d', bezierPath(pA.x, pA.y, pB.x, pB.y));
        }

        function redrawAllEdges() {
            edges.forEach(k => redrawEdge(k));
        }

        // ── Sidebar ───────────────────────────────────────────────
        function getAllVideos() { return videos || []; }

        function renderSidebar() {
            if (!sidebarList) return;
            sidebarList.innerHTML = '';
            const q = (searchEl?.value || '').trim().toLowerCase();
            getAllVideos()
                .filter(v => v.id !== linkerSourceId)
                .filter(v => sbSubjectFilter === 'all' || getVideoSubject(v) === sbSubjectFilter)
                .filter(v => !q || v.title.toLowerCase().includes(q) || subjectLabel(getVideoSubject(v)).toLowerCase().includes(q))
                .forEach(v => {
                    const item = document.createElement('div');
                    item.className = 'csb-item' + (nodes.has(v.id) ? ' on-canvas' : '');
                    item.dataset.vid = v.id;
                    item.innerHTML = `
                        <img class="csb-item-thumb" src="https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg" loading="lazy" alt="">
                        <div class="csb-item-info">
                            <div class="csb-item-title">${escapeHtml(v.title)}</div>
                            <div class="csb-item-subj">${escapeHtml(subjectLabel(getVideoSubject(v)))}</div>
                        </div>
                    `;
                    // start drag
                    item.addEventListener('mousedown', (e) => {
                        if (nodes.has(v.id)) return;
                        e.preventDefault();
                        ghost.querySelector('img').src = `https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg`;
                        ghost.style.display = 'block';
                        ghost.style.left = e.clientX + 'px';
                        ghost.style.top  = e.clientY + 'px';
                        sidebarDrag = { videoId: v.id };
                    });
                    sidebarList.appendChild(item);
                });
        }

        function renderPills() {
            if (!pillsEl) return;
            pillsEl.innerHTML = '';
            const subjects = ['all', ...new Set(getAllVideos().filter(v => v.id !== linkerSourceId).map(v => getVideoSubject(v)).filter(Boolean))];
            subjects.forEach(s => {
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'csb-pill' + (s === sbSubjectFilter ? ' is-active' : '');
                btn.textContent = s === 'all' ? 'All' : subjectLabel(s);
                btn.addEventListener('click', () => { sbSubjectFilter = s; renderPills(); renderSidebar(); });
                pillsEl.appendChild(btn);
            });
        }

        // ── Node placement ────────────────────────────────────────
        function updateEmpty() {
            if (emptyState) emptyState.classList.toggle('hidden', nodes.size > 0);
        }

        function placeNode(videoId, x, y) {
            if (nodes.has(videoId)) return;
            const v = getAllVideos().find(v => v.id === videoId);
            if (!v) return;

            const el = document.createElement('div');
            el.className = 'canvas-node' + (videoId === linkerSourceId ? ' is-source-node' : '');
            el.style.left = x + 'px';
            el.style.top  = y + 'px';
            el.dataset.vid = videoId;

            el.innerHTML = `
                <img class="canvas-node-thumb" src="https://img.youtube.com/vi/${v.videoId}/hqdefault.jpg" loading="lazy" alt="">
                <div class="canvas-node-body">
                    <p class="canvas-node-title">${escapeHtml(v.title)}</p>
                    <span class="canvas-node-subj">${escapeHtml(subjectLabel(getVideoSubject(v)))}</span>
                </div>
                <button class="canvas-node-del" title="Remove" type="button">✕</button>
                <div class="canvas-port top-port" data-port="top" data-vid="${videoId}"></div>
                <div class="canvas-port" data-port="bottom" data-vid="${videoId}"></div>
            `;

            world.appendChild(el);
            nodes.set(videoId, { x, y, el });

            // Remove node
            el.querySelector('.canvas-node-del').addEventListener('click', (e) => {
                e.stopPropagation();
                removeNode(videoId);
            });

            // Node drag
            el.addEventListener('mousedown', (e) => {
                if (e.target.closest('.canvas-port') || e.target.closest('.canvas-node-del')) return;
                e.preventDefault();
                const n = nodes.get(videoId);
                nodeDrag = { videoId, startNodeX: n.x, startNodeY: n.y, startMouseX: e.clientX, startMouseY: e.clientY };
                el.classList.add('is-dragging');
            });

            // Port drag – start edge drawing
            el.querySelectorAll('.canvas-port').forEach(port => {
                port.addEventListener('mousedown', (e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    const which = port.dataset.port;
                    const p = portPos(videoId, which);
                    portDrag = { fromId: videoId, fromPort: which };
                    if (tempEdge) {
                        tempEdge.style.display = '';
                        tempEdge.setAttribute('d', bezierPath(p.x, p.y, p.x, p.y));
                    }
                });
            });

            updateEmpty();
            renderSidebar();
        }

        function removeNode(videoId) {
            const n = nodes.get(videoId);
            if (!n) return;
            n.el.remove();
            nodes.delete(videoId);
            // remove all edges involving this node
            [...edges].forEach(k => {
                const [a, b] = k.split(':').map(Number);
                if (a === videoId || b === videoId) {
                    edges.delete(k);
                    edgeEls.get(k)?.remove();
                    edgeEls.delete(k);
                }
            });
            updateEmpty();
            renderSidebar();
        }

        // ── Mouse events on viewport ──────────────────────────────
        viewport.addEventListener('wheel', (e) => {
            e.preventDefault();
            // Pinch-to-zoom (trackpad) sends ctrlKey=true; Ctrl/Cmd+scroll = zoom
            if (e.ctrlKey || e.metaKey) {
                zoomAt(e.clientX, e.clientY, e.deltaY);
            } else {
                // Two-finger scroll = pan in both axes
                pan.x -= e.deltaX;
                pan.y -= e.deltaY;
                applyTransform();
            }
        }, { passive: false });

        viewport.addEventListener('mousedown', (e) => {
            // middle mouse or space+left = pan
            if (e.button === 1 || (e.button === 0 && spaceDown)) {
                e.preventDefault();
                isPanning = true;
                panStart = { x: e.clientX - pan.x, y: e.clientY - pan.y };
                viewport.style.cursor = 'grabbing';
                return;
            }
            // drop sidebar drag on canvas background
            if (sidebarDrag && e.target === viewport) {
                const w = screenToWorld(e.clientX, e.clientY);
                placeNode(sidebarDrag.videoId, w.x - 84, w.y - 60);
                ghost.style.display = 'none';
                sidebarDrag = null;
                renderSidebar();
            }
        });

        window.addEventListener('mousemove', (e) => {
            // sidebar ghost
            if (sidebarDrag) {
                ghost.style.left = e.clientX + 'px';
                ghost.style.top  = e.clientY + 'px';
            }
            // pan
            if (isPanning && panStart) {
                pan.x = e.clientX - panStart.x;
                pan.y = e.clientY - panStart.y;
                applyTransform();
                return;
            }
            // node drag
            if (nodeDrag) {
                const dx = (e.clientX - nodeDrag.startMouseX) / scale;
                const dy = (e.clientY - nodeDrag.startMouseY) / scale;
                const n = nodes.get(nodeDrag.videoId);
                if (n) {
                    n.x = nodeDrag.startNodeX + dx;
                    n.y = nodeDrag.startNodeY + dy;
                    n.el.style.left = n.x + 'px';
                    n.el.style.top  = n.y + 'px';
                    redrawAllEdges();
                }
                return;
            }
            // edge drawing
            if (portDrag && tempEdge) {
                const from = portPos(portDrag.fromId, portDrag.fromPort);
                const w = screenToWorld(e.clientX, e.clientY);
                tempEdge.setAttribute('d', bezierPath(from.x, from.y, w.x, w.y));
            }
        });

        window.addEventListener('mouseup', (e) => {
            // end pan
            if (isPanning) {
                isPanning = false;
                panStart = null;
                viewport.style.cursor = 'default';
            }
            // end node drag
            if (nodeDrag) {
                nodes.get(nodeDrag.videoId)?.el.classList.remove('is-dragging');
                nodeDrag = null;
            }
            // drop sidebar drag on canvas world
            if (sidebarDrag) {
                const r = viewport.getBoundingClientRect();
                if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
                    const w = screenToWorld(e.clientX, e.clientY);
                    placeNode(sidebarDrag.videoId, w.x - 84, w.y - 60);
                }
                ghost.style.display = 'none';
                sidebarDrag = null;
                renderSidebar();
                return;
            }
            // complete edge on a port
            if (portDrag) {
                if (tempEdge) { tempEdge.style.display = 'none'; tempEdge.setAttribute('d', ''); }
                const target = e.target.closest('.canvas-port');
                if (target) {
                    const toId = parseInt(target.dataset.vid, 10);
                    if (toId !== portDrag.fromId) {
                        const key = edgeKey(portDrag.fromId, toId);
                        if (!edges.has(key)) {
                            edges.add(key);
                            redrawEdge(key);
                        } else {
                            // toggle off
                            edges.delete(key);
                            edgeEls.get(key)?.remove();
                            edgeEls.delete(key);
                        }
                    }
                }
                portDrag = null;
            }
        });

        // space bar for pan mode
        window.addEventListener('keydown', (e) => { if (e.code === 'Space') { spaceDown = true; viewport.style.cursor = 'grab'; } });
        window.addEventListener('keyup',   (e) => { if (e.code === 'Space') { spaceDown = false; viewport.style.cursor = 'default'; } });

        // ── Zoom buttons ──────────────────────────────────────────
        function zoomCenter(delta) {
            const r = viewport.getBoundingClientRect();
            zoomAt(r.left + r.width / 2, r.top + r.height / 2, delta);
        }
        if (btnZoomIn)  btnZoomIn.addEventListener('click',  () => zoomCenter(-1));
        if (btnZoomOut) btnZoomOut.addEventListener('click', () => zoomCenter(1));
        if (btnZoomFit) btnZoomFit.addEventListener('click', () => fitAll());

        function fitAll() {
            if (nodes.size === 0) { pan = { x: 60, y: 60 }; scale = 1; applyTransform(); return; }
            const NODE_W = 168;
            let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            nodes.forEach(n => {
                const h = n.el.offsetHeight || 120;
                minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
                maxX = Math.max(maxX, n.x + NODE_W); maxY = Math.max(maxY, n.y + h);
            });
            const r = viewport.getBoundingClientRect();
            const pw = r.width - 80, ph = r.height - 80;
            const bw = maxX - minX, bh = maxY - minY;
            scale = clampScale(Math.min(pw / (bw || 1), ph / (bh || 1)));
            pan.x = (r.width  - bw * scale) / 2 - minX * scale;
            pan.y = (r.height - bh * scale) / 2 - minY * scale;
            applyTransform();
        }

        // ── Save / Clear ──────────────────────────────────────────
        function getConnectedIds() {
            if (!linkerSourceId) return [...nodes.keys()];
            const connected = new Set();
            edges.forEach(key => {
                const [a, b] = key.split(':').map(Number);
                if (a === linkerSourceId) connected.add(b);
                if (b === linkerSourceId) connected.add(a);
            });
            return [...connected];
        }

        function syncCheckboxListFromLinker() {
            const container = document.getElementById('video-connections-list');
            if (!container) return;
            container.innerHTML = '';
            getAllVideos().filter(v => v.id !== linkerSourceId).forEach(vid => {
                const cb = document.createElement('input');
                cb.type = 'checkbox'; cb.className = 'video-conn-checkbox'; cb.value = vid.id;
                cb.checked = getConnectedIds().includes(vid.id);
                container.appendChild(cb);
            });
        }

        function updateConnectionSummaryChips(ids) {
            const summary = document.getElementById('video-connections-summary');
            if (!summary) return;
            summary.innerHTML = '';
            if (!ids || ids.length === 0) {
                summary.innerHTML = '<span style="font-size:13px; color:var(--text-muted);">No links yet. Open the designer to connect videos.</span>';
                return;
            }
            ids.forEach(id => {
                const vid = getAllVideos().find(v => v.id === id);
                if (!vid) return;
                const chip = document.createElement('span');
                chip.className = 'conn-chip';
                chip.textContent = vid.title.length > 28 ? vid.title.slice(0, 26) + '…' : vid.title;
                summary.appendChild(chip);
            });
        }

        if (btnSave) btnSave.addEventListener('click', () => {
            syncCheckboxListFromLinker();
            const ids = getConnectedIds();
            updateConnectionSummaryChips(ids);
            if (saveStatus) {
                saveStatus.textContent = `${ids.length} link${ids.length === 1 ? '' : 's'} saved ✓`;
                saveStatus.style.display = 'inline';
                setTimeout(() => { if (saveStatus) saveStatus.style.display = 'none'; }, 2500);
            }
            navigateTo(pageAdmin);
        });

        if (btnClear) btnClear.addEventListener('click', () => {
            nodes.forEach((_, id) => removeNode(id));
            edges.clear();
            edgeEls.forEach(el => el.remove());
            edgeEls.clear();
            updateEmpty();
            renderSidebar();
        });

        // ── Open / init ───────────────────────────────────────────
        // Track whether the canvas has been initialised for a given source
        let _lastOpenSourceId = '__UNINIT__'; // sentinel distinct from null

        function openLinker() {
            const newSourceId = (typeof editVideoId !== 'undefined' && editVideoId !== null) ? editVideoId : null;
            const isSameSession = newSourceId === _lastOpenSourceId && nodes.size > 0;

            if (isSameSession) {
                // Canvas state preserved — just re-render sidebar+pills and navigate back
                renderPills();
                renderSidebar();
                navigateTo(pageVideoLinker);
                return;
            }

            // Source video changed (or first open) → full reset
            _lastOpenSourceId = newSourceId;
            linkerSourceId = newSourceId;

            // Gather existing connections
            const existingConnected = [];
            if (linkerSourceId !== null) {
                const src = getAllVideos().find(v => v.id === linkerSourceId);
                if (src && Array.isArray(src.connectedIds)) {
                    existingConnected.push(...src.connectedIds);
                }
                document.querySelectorAll('#video-connections-list .video-conn-checkbox:checked').forEach(cb => {
                    const id = parseInt(cb.value, 10);
                    if (!existingConnected.includes(id)) existingConnected.push(id);
                });
            }

            // Clear canvas
            [...nodes.keys()].forEach(id => removeNode(id));
            edges.clear();
            edgeEls.forEach(el => el.remove());
            edgeEls.clear();

            // Reset view
            pan = { x: 60, y: 60 }; scale = 1; applyTransform();
            sbSubjectFilter = 'all';
            if (searchEl) searchEl.value = '';

            // Place source node + pre-existing connections
            if (linkerSourceId !== null) {
                placeNode(linkerSourceId, 120, 80);
                let col = 0;
                existingConnected.forEach(id => {
                    placeNode(id, 360 + (col % 3) * 220, 80 + Math.floor(col / 3) * 160);
                    const key = edgeKey(linkerSourceId, id);
                    edges.add(key);
                    col++;
                });
                setTimeout(() => { redrawAllEdges(); fitAll(); }, 50);
            }

            renderPills();
            renderSidebar();
            updateEmpty();
            navigateTo(pageVideoLinker);
        }

        // When user edits a different video, invalidate saved session
        function invalidateLinkerSession() { _lastOpenSourceId = '__UNINIT__'; }
        // Expose so renderAdminVideos (edit click) can reset it
        window._invalidateLinkerSession = invalidateLinkerSession;

        if (btnOpen) btnOpen.addEventListener('click', openLinker);
        if (btnBack) btnBack.addEventListener('click', () => navigateTo(pageAdmin));
        if (searchEl) searchEl.addEventListener('input', renderSidebar);

        window._refreshLinkerSummary = function(selectedIds) {
            updateConnectionSummaryChips(Array.isArray(selectedIds) ? selectedIds : []);
        };
    })();


    function openSheets() {

        window.location.href = resolveAppUrl('sheets/index.html');
    }

    function openDecks() {
        if (!currentUser) {
            showToast('Log in before opening Pharma Decks.', 'error');
            return;
        }
        window.location.href = getDecksUrl();
    }

    function openFlashcards() {
        if (!currentUser) {
            showToast('Log in before opening Flashcards.', 'error');
            return;
        }
        window.location.href = getFlashcardsUrl();
    }

    async function toggleFlashcardsFullscreen() {
        if (!flashcardsFrame) return;
        try {
            if (document.fullscreenElement === flashcardsFrame) {
                await document.exitFullscreen();
            } else {
                await flashcardsFrame.requestFullscreen();
            }
        } catch (error) {
            showToast('Could not open full screen.', 'error');
        }
    }

    function syncFlashcardsFullscreenButton() {
        if (!flashcardsFullscreenButton || !flashcardsFrame) return;
        const isActive = document.fullscreenElement === flashcardsFrame;
        flashcardsFullscreenButton.textContent = isActive ? 'Exit full screen' : 'Full screen';
        flashcardsFullscreenButton.setAttribute('aria-pressed', isActive ? 'true' : 'false');
    }

    flashcardsFullscreenButton?.addEventListener('click', toggleFlashcardsFullscreen);
    document.addEventListener('fullscreenchange', syncFlashcardsFullscreenButton);
    syncFlashcardsFullscreenButton();

    window.addEventListener('message', (event) => {
        if (event.origin !== window.location.origin) return;
        const data = event.data;
        if (!data) return;
        if (data.type === 'open-flashcards-deck') {
            openLinkedFlashcards(data.deckId);
            return;
        }
        if (data.type === 'toggle-flashcards-fullscreen' && flashcardsFrame) {
            toggleFlashcardsFullscreen();
        }
    });

    function openLiveQuiz() {
        window.location.href = getLiveQuizUrl();
    }

    function openMedQuiz() {
        if (!currentUser) {
            showToast('Log in before opening MedQuiz.', 'error');
            return;
        }
        if (!isBetaDailyExemptUser(currentUser) && hasUsedBetaToday(currentUser)) {
            showToast('MedQuiz is available once per day. Try again tomorrow.', 'info');
            return;
        }
        const url = getBetaFunctionUrl();
        if (!url) {
            showToast(
                'MedQuiz path is not configured. Set meta clinical-beta-url in index.html.',
                'error'
            );
            return;
        }
        if (!isBetaDailyExemptUser(currentUser)) markBetaUsedToday(currentUser);
        window.location.href = url;
    }

    function signOutCurrentUser() {
        const user = currentUser;
        currentUser = null;
        userState.signOut(user, { signOutRemote: true }).then(() => {
            showToast('Signed out.', 'info');
            navigateTo(pageWelcome);
        });
    }

    function handleLearningNavigation(target) {
        if (target === 'home') navigateTo(pageHome);
        else if (target === 'videos') navigateTo(pageVideos);
        else if (target === 'brainmap') navigateTo(pageBrainmap);
        else if (target === 'checkin') navigateTo(pageQuiz);
        else if (target === 'stats') { renderStats(); navigateTo(pageStats); }
        else if (target === 'sheets') navigateTo(pageSheets);
        else if (target === 'decks') {
            if (!currentUser) {
                showToast('Log in before opening Pharma Decks.', 'error');
                return;
            }
            navigateTo(pageDecks);
        }
        else if (target === 'flashcards') {
            if (!currentUser) {
                showToast('Log in before opening Flashcards.', 'error');
                return;
            }
            if (flashcardsFrame) {
                flashcardsFrame.src = getFlashcardsUrlForDeck('', true);
            }
            navigateTo(pageFlashcards);
        }
        else if (target === 'alevel') {
            if (!currentUser) {
                showToast('Log in before opening A-Level MCQ.', 'error');
                return;
            }
            navigateTo(pageAlevel);
        }
        else if (target === 'livequiz') navigateTo(pageLivequiz);
        else if (target === 'medquiz') {
            if (!currentUser) {
                showToast('Log in before opening MedQuiz.', 'error');
                return;
            }
            if (!isBetaDailyExemptUser(currentUser) && hasUsedBetaToday(currentUser)) {
                showToast('MedQuiz is available once per day. Try again tomorrow.', 'info');
                return;
            }
            navigateTo(pageMedquiz);
        }
        else if (target === 'request') { renderContentRequests(); navigateTo(pageRequest); }
    }

    // Dynamic Sidebar Menu reordering
    const DEFAULT_MENU_ORDER = ['home', 'videos', 'brainmap', 'checkin', 'request', 'stats', 'sheets', 'decks', 'flashcards', 'livequiz', 'medquiz', 'alevel'];

    const MENU_METADATA = {
        home: { label: 'Home', class: 'shell-nav-link' },
        videos: { label: 'Videos', class: 'shell-nav-link' },
        brainmap: { label: 'Brain Map', class: 'shell-nav-link' },
        checkin: { label: 'Check-in', class: 'shell-nav-link' },
        request: { label: 'Request Topic', class: 'shell-nav-link' },
        stats: { label: 'Progress', class: 'shell-nav-link', hidden: true },
        sheets: { label: 'Sheets', class: 'shell-nav-link' },
        decks: { label: 'Pharma Decks', class: 'shell-nav-link' },
        flashcards: { label: 'Flashcards', class: 'shell-nav-link' },
        alevel: { label: 'A-Level', class: 'shell-nav-link' },
        livequiz: { label: 'LiveQuiz', class: 'shell-nav-link' },
        medquiz: { label: 'MedQuiz', class: 'shell-nav-link shell-nav-link--accent' }
    };

    function getMenuOrder() {
        const sharedOrder = normalizeMenuOrder(sharedMenuOrder);
        if (sharedOrder.length) return sharedOrder;

        try {
            const saved = localStorage.getItem('clinical_menu_order');
            if (saved) {
                const parsed = JSON.parse(saved);
                const localOrder = normalizeMenuOrder(parsed);
                if (localOrder.length) return localOrder;
            }
        } catch (e) {
            console.error(e);
        }
        return [...DEFAULT_MENU_ORDER];
    }

    function normalizeMenuOrder(order) {
        if (!Array.isArray(order) || order.length === 0) return [];
        const seen = new Set();
        const savedOrder = order.filter(item => {
            if (!DEFAULT_MENU_ORDER.includes(item) || seen.has(item)) return false;
            seen.add(item);
            return true;
        });
        const missingDefaults = DEFAULT_MENU_ORDER.filter(item => !savedOrder.includes(item));
        return [...savedOrder, ...missingDefaults];
    }

    function saveMenuOrderLocal(order) {
        try {
            localStorage.setItem('clinical_menu_order', JSON.stringify(normalizeMenuOrder(order)));
        } catch (e) {
            console.error(e);
        }
    }

    function saveMenuOrder(order) {
        const normalized = normalizeMenuOrder(order);
        sharedMenuOrder = normalized;
        saveMenuOrderLocal(normalized);
        if (!supabaseConfigReady || !ds?.saveAdminSettingsPatch) {
            return Promise.resolve(true);
        }
        return ds
            .saveAdminSettingsPatch({ menu_order: normalized })
            .then(() => true)
            .catch((err) => {
                console.error('saveMenuOrder', err);
                const base = err && err.message ? err.message : String(err);
                let msg = 'Menu order saved locally, but shared sync failed: ' + base;
                if (base.includes('menu_order')) {
                    msg += '\n\nRun supabase/menu-order.sql in Supabase SQL Editor, then save again.';
                }
                showToast(msg, 'error');
                return false;
            });
    }

    function renderAllSidebars() {
        const order = getMenuOrder();
        const navContainers = document.querySelectorAll('.learning-nav');

        navContainers.forEach(container => {
            container.innerHTML = '';
            order.forEach(target => {
                const meta = MENU_METADATA[target];
                if (!meta) return;

                const btn = document.createElement('button');
                btn.type = 'button';
                meta.class.split(' ').filter(c => c).forEach(c => btn.classList.add(c));
                btn.setAttribute('data-nav-target', target);
                btn.textContent = meta.label;
                btn.title = meta.label;
                if (meta.hidden) {
                    btn.setAttribute('hidden', '');
                }

                btn.addEventListener('click', (event) => {
                    event.preventDefault();
                    event.stopImmediatePropagation();
                    handleLearningNavigation(target);
                });

                container.appendChild(btn);
            });
        });

        const activePage = document.querySelector('.page.active');
        if (activePage) {
            setActiveShellNav(activePage);
        }
    }

    currentEditorOrder = getMenuOrder();

    function renderAdminMenuEditor() {
        const listContainer = document.getElementById('admin-menu-list');
        if (!listContainer) return;
        listContainer.innerHTML = '';

        const icons = {
            home: '⌂',
            videos: '▶',
            brainmap: '◈',
            checkin: '✓',
            request: '✎',
            stats: '↗',
            sheets: '□',
            decks: '▤',
            flashcards: '◫',
            alevel: 'A',
            livequiz: '◉',
            medquiz: '?'
        };

        currentEditorOrder.forEach((target, index) => {
            const meta = MENU_METADATA[target];
            if (!meta) return;

            const row = document.createElement('div');
            row.className = 'menu-editor-row';
            row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; padding:0.6rem 0.8rem; background:var(--surface-soft); border:1px solid var(--border); border-radius:var(--r-input); cursor:grab; transition:all 0.15s ease; user-select:none;';
            row.setAttribute('draggable', 'true');

            row.addEventListener('dragstart', (e) => {
                row.style.opacity = '0.5';
                e.dataTransfer.setData('text/plain', index);
                row.style.borderStyle = 'dashed';
            });
            row.addEventListener('dragend', () => {
                row.style.opacity = '1';
                row.style.borderStyle = 'solid';
            });
            row.addEventListener('dragover', (e) => {
                e.preventDefault();
            });
            row.addEventListener('drop', (e) => {
                e.preventDefault();
                const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
                const toIndex = index;
                if (fromIndex !== toIndex) {
                    const temp = currentEditorOrder[fromIndex];
                    currentEditorOrder.splice(fromIndex, 1);
                    currentEditorOrder.splice(toIndex, 0, temp);
                    renderAdminMenuEditor();
                }
            });

            const info = document.createElement('div');
            info.style.cssText = 'display:flex; align-items:center; gap:0.6rem; font-weight:600; color:var(--ink-2);';

            const icon = document.createElement('span');
            icon.textContent = icons[target] || '•';
            icon.style.cssText = 'font-size:16px; color:var(--muted); width:20px; text-align:center;';

            const label = document.createElement('span');
            label.textContent = meta.label;

            info.appendChild(icon);
            info.appendChild(label);
            row.appendChild(info);

            const actions = document.createElement('div');
            actions.style.cssText = 'display:flex; gap:0.25rem;';

            const btnUp = document.createElement('button');
            btnUp.type = 'button';
            btnUp.className = 'btn outline-btn btn-compact';
            btnUp.style.cssText = 'padding:2px 8px; font-size:12px; height:26px;';
            btnUp.innerHTML = '▲';
            btnUp.disabled = index === 0;
            btnUp.addEventListener('click', () => {
                if (index > 0) {
                    const temp = currentEditorOrder[index];
                    currentEditorOrder[index] = currentEditorOrder[index - 1];
                    currentEditorOrder[index - 1] = temp;
                    renderAdminMenuEditor();
                }
            });

            const btnDown = document.createElement('button');
            btnDown.type = 'button';
            btnDown.className = 'btn outline-btn btn-compact';
            btnDown.style.cssText = 'padding:2px 8px; font-size:12px; height:26px;';
            btnDown.innerHTML = '▼';
            btnDown.disabled = index === currentEditorOrder.length - 1;
            btnDown.addEventListener('click', () => {
                if (index < currentEditorOrder.length - 1) {
                    const temp = currentEditorOrder[index];
                    currentEditorOrder[index] = currentEditorOrder[index + 1];
                    currentEditorOrder[index + 1] = temp;
                    renderAdminMenuEditor();
                }
            });

            actions.appendChild(btnUp);
            actions.appendChild(btnDown);
            row.appendChild(actions);

            listContainer.appendChild(row);
        });
    }

    function initMenuOrderWiring() {
        const btnToggleMenuOrder = document.getElementById('btn-toggle-menu-order');
        const menuOrderEditor = document.getElementById('menu-order-editor');
        const btnSaveMenuOrder = document.getElementById('btn-save-menu-order');
        const btnResetMenuOrder = document.getElementById('btn-reset-menu-order');

        if (btnToggleMenuOrder) {
            btnToggleMenuOrder.addEventListener('click', () => {
                const open = menuOrderEditor.hidden;
                menuOrderEditor.hidden = !open;
                btnToggleMenuOrder.setAttribute('aria-expanded', open ? 'true' : 'false');
                btnToggleMenuOrder.textContent = open ? 'Hide menu editor' : 'Show menu editor';
                if (open) {
                    currentEditorOrder = getMenuOrder();
                    renderAdminMenuEditor();
                }
            });
        }

        if (btnSaveMenuOrder) {
            btnSaveMenuOrder.addEventListener('click', async () => {
                btnSaveMenuOrder.disabled = true;
                try {
                    const synced = await saveMenuOrder(currentEditorOrder);
                    renderAllSidebars();
                    if (synced) showToast('Menu order saved successfully.');
                    if (synced && menuOrderEditor) {
                        menuOrderEditor.hidden = true;
                    }
                    if (synced && btnToggleMenuOrder) {
                        btnToggleMenuOrder.setAttribute('aria-expanded', 'false');
                        btnToggleMenuOrder.textContent = 'Show menu editor';
                    }
                } finally {
                    btnSaveMenuOrder.disabled = false;
                }
            });
        }

        if (btnResetMenuOrder) {
            btnResetMenuOrder.addEventListener('click', async () => {
                if (confirm('Reset sidebar menu order to default?')) {
                    btnResetMenuOrder.disabled = true;
                    currentEditorOrder = [...DEFAULT_MENU_ORDER];
                    renderAdminMenuEditor();
                    try {
                        const synced = await saveMenuOrder(currentEditorOrder);
                        renderAllSidebars();
                        if (synced) showToast('Menu order reset to default.');
                    } finally {
                        btnResetMenuOrder.disabled = false;
                    }
                }
            });
        }
    }

    // Remembers which admin tab was last active so navigating away and back restores it
    let _lastAdminTab = 'admin-tab-content'; // default to Content & Lessons (where the linker button lives)

    function initAdminTabs() {
        const tabButtons = document.querySelectorAll('.admin-tab-btn');
        const tabPanes   = document.querySelectorAll('.admin-tab-pane');

        function activateTab(target) {
            _lastAdminTab = target;
            tabButtons.forEach(b => {
                const isTarget = b.getAttribute('data-tab-target') === target;
                b.classList.toggle('is-active', isTarget);
                b.setAttribute('aria-selected', isTarget ? 'true' : 'false');
            });
            tabPanes.forEach(pane => {
                pane.style.display = pane.id === target ? 'flex' : 'none';
            });
        }

        tabButtons.forEach(btn => {
            btn.addEventListener('click', () => activateTab(btn.getAttribute('data-tab-target')));
        });

        // Expose for navigateTo to call
        window._restoreAdminTab = () => activateTab(_lastAdminTab);
    }

    function setLearningSidebarCollapsed(collapsed) {
        document.body.classList.toggle('learning-sidebar-collapsed', collapsed);
        document.querySelectorAll('.learning-sidebar-toggle').forEach((btn) => {
            btn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            btn.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar');
            btn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
        });
        try {
            localStorage.setItem(CLINICAL_SIDEBAR_COLLAPSED_KEY, collapsed ? '1' : '0');
        } catch (_) {
            /* private mode */
        }
    }

    function initLearningSidebarToggle() {
        let collapsed = false;
        try {
            collapsed = localStorage.getItem(CLINICAL_SIDEBAR_COLLAPSED_KEY) === '1';
        } catch (_) {
            collapsed = false;
        }

        renderAllSidebars();
        initAdminTabs();
        initMenuOrderWiring();

        document.querySelectorAll('.shell-nav-link').forEach((link) => {
            const label = link.textContent.trim();
            if (label) link.title = label;
        });
        setLearningSidebarCollapsed(collapsed);
        document.querySelectorAll('.learning-sidebar-toggle').forEach((btn) => {
            btn.addEventListener('click', () => {
                setLearningSidebarCollapsed(!document.body.classList.contains('learning-sidebar-collapsed'));
            });
        });
    }

    initLearningSidebarToggle();

    // Bind navigation listeners for static home elements that have data-nav-target
    document.querySelectorAll('body:not(.learning-sidebar) [data-nav-target]:not(.shell-nav-link)').forEach((el) => {
        el.addEventListener('click', (event) => {
            const target = el.getAttribute('data-nav-target');
            if (!target) return;
            event.preventDefault();
            event.stopImmediatePropagation();
            handleLearningNavigation(target);
        });
    });

    document.querySelectorAll('[data-action="logout"]').forEach((el) => {
        el.addEventListener('click', (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            signOutCurrentUser();
        });
    });

    if (btnCheckin) btnCheckin.addEventListener('click', () => navigateTo(pageQuiz));

    const btnCheckinSubmit = document.getElementById('btn-checkin-submit');
    if (btnCheckinSubmit) btnCheckinSubmit.addEventListener('click', submitCheckin);

    const btnCheckinContinue = document.getElementById('btn-checkin-continue');
    if (btnCheckinContinue) btnCheckinContinue.addEventListener('click', () => navigateTo(pageVideos));

    const btnCheckinNewQ = document.getElementById('btn-checkin-new-q');
    if (btnCheckinNewQ) btnCheckinNewQ.addEventListener('click', () => openCheckinQForm(null));

    const btnCqSave = document.getElementById('btn-cq-save');
    if (btnCqSave) btnCqSave.addEventListener('click', saveCheckinQ);

    const btnCqCancel = document.getElementById('btn-cq-cancel');
    if (btnCqCancel) btnCqCancel.addEventListener('click', closeCheckinQForm);

    const btnCqDelete = document.getElementById('btn-cq-delete');
    if (btnCqDelete) btnCqDelete.addEventListener('click', deleteCheckinQ);

    const btnCheckinDashRefresh = document.getElementById('btn-checkin-dash-refresh');
    if (btnCheckinDashRefresh) {
        btnCheckinDashRefresh.addEventListener('click', () => loadCheckinDashboard({ notifySuccess: true }));
    }
    const btnToggleCheckinDashboard = document.getElementById('btn-toggle-checkin-dashboard');
    const checkinDashboardPanel = document.getElementById('checkin-dashboard-panel');
    if (btnToggleCheckinDashboard && checkinDashboardPanel) {
        btnToggleCheckinDashboard.addEventListener('click', async () => {
            const opening = checkinDashboardPanel.hidden;
            checkinDashboardPanel.hidden = !opening;
            btnToggleCheckinDashboard.setAttribute('aria-expanded', opening ? 'true' : 'false');
            btnToggleCheckinDashboard.textContent = opening ? 'Hide dashboard' : 'Show dashboard';
            if (opening && !checkinDashboardPanel.dataset.loaded) {
                await loadCheckinDashboard();
                checkinDashboardPanel.dataset.loaded = '1';
            }
        });
    }

    btnStats.addEventListener('click', () => { renderStats(); navigateTo(pageStats); });
    // if (btnSheets) btnSheets.addEventListener('click', openSheets);
    // if (btnDecks) btnDecks.addEventListener('click', openDecks);
    // if (btnBeta) btnBeta.addEventListener('click', openMedQuiz);
    btnBack.addEventListener('click', () => navigateTo(pageVideos));

    document.querySelectorAll('[data-action="clear-progress"]').forEach((el) => {
        el.addEventListener('click', async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!currentUser) return;
            if (!confirm('Are you sure you want to clear your learning progress? This will reset all your watched videos and video streak.')) return;

            currentUser.watchedVideos = [];
            currentUser.videoStreak = 0;

            try {
                showToast('Clearing progress...', 'info');
                await withTimeout(userState.saveProfile(currentUser), 15000);
                showToast('Learning progress cleared.', 'success');
                renderStreaks();
                renderVideos();
                if (typeof renderBrainMap === 'function') renderBrainMap();
            } catch (e) {
                console.error(e);
                showToast('Failed to save reset progress on the server.', 'error');
            }
        });
    });

    function renderSubjectPills() {
        if (!subjectPillsContainer) return;
        subjectPillsContainer.innerHTML = '';
        subjects.forEach(sub => {
            const btn = document.createElement('button');
            btn.className = `subject-pill ${selectedSubject === sub ? 'active' : ''}`;
            btn.textContent = formatSubjectName(sub);
            btn.onclick = () => {
                selectedSubject = sub;
                videoSearchQuery = '';
                if (videoSearchInput) videoSearchInput.value = '';
                renderSubjectPills();
                renderVideos();
            };
            subjectPillsContainer.appendChild(btn);
        });
    }

    if (videoSearchInput) {
        videoSearchInput.addEventListener('input', (event) => {
            videoSearchQuery = event.target.value || '';
            renderVideos();
        });
    }

    function renderSubjectOptions() {
        if (!newVideoSubject) return;
        newVideoSubject.innerHTML = subjects.map(sub => `<option value="${sub}">${formatSubjectName(sub)}</option>`).join('');
    }

    btnBackFromWatch.addEventListener('click', () => { watchIframe.src = ''; navigateTo(pageVideos); });

    if (btnBackFromQuiz) {
        btnBackFromQuiz.addEventListener('click', () => navigateTo(pageVideos));
    }

    function showPostQuiz(video) {
        const quiz = video && video.quiz;
        const qList = (Array.isArray(quiz) ? quiz : quiz ? [quiz] : []).filter((q) => q && typeof q === 'object' && q.q);
        if (!qList.length) {
            navigateTo(pageVideos);
            return;
        }
        currentQuizData = qList[Math.floor(Math.random() * qList.length)];
        selectedChoice = null;

        const pqImage = document.getElementById('pq-image');
        pqQuestion.textContent = currentQuizData.q;
        if (pqImage) {
            if (currentQuizData.img) { pqImage.src = currentQuizData.img; pqImage.style.display = 'block'; }
            else { pqImage.removeAttribute('src'); pqImage.style.display = 'none'; }
        }
        pqChoices.innerHTML = '';
        pqFeedback.style.display = 'none';
        pqFeedback.style.background = '';
        pqFeedback.style.color = '';
        pqFeedback.textContent = '';
        btnPqSubmit.disabled = true;
        btnPqSubmit.style.display = 'block';
        btnPqContinue.style.display = 'none';

        if (currentQuizData.type === 'text') {
            const textarea = document.createElement('textarea');
            textarea.rows = 3;
            textarea.placeholder = 'Type your answer here...';
            textarea.style.cssText = 'width:100%;border-radius:var(--r-input);border:1px solid var(--border);padding:0.75rem;font-family:inherit;font-size:14px;resize:vertical;outline:none;background:var(--surface);color:var(--ink);';
            textarea.addEventListener('input', () => { btnPqSubmit.disabled = !textarea.value.trim(); });
            pqChoices.appendChild(textarea);
        } else {
            ['a', 'b', 'c', 'd'].forEach(k => {
                if (!currentQuizData[k]) return;
                const btn = document.createElement('button');
                btn.type = 'button';
                btn.className = 'btn outline-btn';
                btn.style.cssText = 'width:100%;text-align:left;padding:0.75rem 1rem;';
                btn.textContent = `${k.toUpperCase()}. ${currentQuizData[k]}`;
                btn.addEventListener('click', () => {
                    pqChoices.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    selectedChoice = k.toUpperCase();
                    btnPqSubmit.disabled = false;
                });
                pqChoices.appendChild(btn);
            });
        }
        navigateTo(pagePostQuiz);
    }

    if (btnPqSubmit) {
        btnPqSubmit.addEventListener('click', () => {
            if (!currentQuizData) return;
            btnPqSubmit.style.display = 'none';
            btnPqContinue.style.display = 'block';
            pqFeedback.style.display = 'block';

            let userAnswer = '';
            let correct = null;

            if (currentQuizData.type === 'text') {
                const taEl = pqChoices.querySelector('textarea');
                userAnswer = taEl ? taEl.value.trim() : '';
                const expected = currentQuizData.expected || '';
                if (expected && userAnswer.toLowerCase().includes(expected.toLowerCase())) {
                    correct = true;
                    pqFeedback.textContent = 'Great answer.';
                    pqFeedback.style.background = 'var(--ok-soft)';
                    pqFeedback.style.color = 'var(--ok)';
                } else if (expected) {
                    correct = false;
                    pqFeedback.textContent = `Model answer includes: ${expected}`;
                    pqFeedback.style.background = 'var(--info-soft)';
                    pqFeedback.style.color = 'var(--info)';
                } else {
                    correct = null;
                    pqFeedback.textContent = 'Answer recorded.';
                    pqFeedback.style.background = 'var(--info-soft)';
                    pqFeedback.style.color = 'var(--info)';
                }
            } else {
                userAnswer = selectedChoice;
                correct = selectedChoice === currentQuizData.ans;
                if (correct) {
                    pqFeedback.textContent = 'Correct.';
                    pqFeedback.style.background = 'var(--ok-soft)';
                    pqFeedback.style.color = 'var(--ok)';
                } else {
                    pqFeedback.textContent = `Incorrect. Correct answer: ${currentQuizData.ans}`;
                    pqFeedback.style.background = '#fff0f0';
                    pqFeedback.style.color = 'var(--danger)';
                }
                pqChoices.querySelectorAll('button').forEach(btn => {
                    if (btn.textContent[0] === currentQuizData.ans) btn.style.borderColor = 'var(--ok)';
                    btn.disabled = true;
                });
            }

            if (currentUser) {
                const record = {
                    videoId: currentWatchVideo ? currentWatchVideo.videoId : null,
                    videoTitle: currentWatchVideo ? currentWatchVideo.title : null,
                    question: currentQuizData.q,
                    type: currentQuizData.type,
                    answer: userAnswer,
                    correct,
                    date: new Date().toISOString()
                };
                userState.appendQuizHistory(currentUser, record).catch((e) => console.error(e));
            }
        });
    }

    if (btnPqContinue) {
        btnPqContinue.addEventListener('click', () => navigateTo(pageVideos));
    }

    btnVideoFinished.addEventListener('click', async () => {
        if (!btnVideoFinished || btnVideoFinished.disabled) return;
        const feedback = videoFeedback.value.trim();
        const prevLabel = btnVideoFinished.textContent;
        btnVideoFinished.disabled = true;
        if (feedback && currentWatchVideo) btnVideoFinished.textContent = 'Saving…';
        try {
            if (feedback && currentWatchVideo) {
                currentWatchVideo.feedbacks = currentWatchVideo.feedbacks || [];
                currentWatchVideo.feedbacks.push({
                    user: currentUser ? currentUser.username : 'Anon',
                    text: feedback,
                    date: new Date().toISOString()
                });
                try {
                    await withTimeout(saveVideosDB(), 20000);
                } catch (e) {
                    console.error('saveVideosDB (video feedback)', e);
                    const timedOut = e && (e.code === 'TIMEOUT' || e.message === 'TIMEOUT');
                    showToast(
                        timedOut
                            ? 'Lesson note did not finish saving. Continuing anyway. Check your connection or Supabase status.'
                            : 'Lesson note could not be saved on the server. Continuing anyway.',
                        'error'
                    );
                }
                saveDraft('video_feedback', null);
            }
            videoFeedback.value = '';
            watchIframe.src = '';
            incrementVideoStreak();

            if (currentUser && currentWatchVideo) {
                currentUser.watchedVideos = currentUser.watchedVideos || [];
                if (!currentUser.watchedVideos.includes(currentWatchVideo.id)) {
                    currentUser.watchedVideos.push(currentWatchVideo.id);
                    try {
                        await withTimeout(userState.saveProfile(currentUser), 15000);
                    } catch (e) {
                        console.error('saveProfileFull (watchedVideos)', e);
                    }
                }
            }

            const raw = currentWatchVideo && currentWatchVideo.quiz;
            const qList = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((q) => q && typeof q === 'object' && q.q);
            if (qList.length > 0) {
                showPostQuiz(currentWatchVideo);
                if (feedback) showToast('Lesson note saved.');
                else showToast('Opening the post-lesson quiz.');
            } else {
                navigateTo(pageVideos);
                if (feedback) showToast('Lesson note saved.');
                else showToast('Progress saved.');
            }
        } finally {
            btnVideoFinished.disabled = false;
            btnVideoFinished.textContent = prevLabel;
        }
    });

    if (btnLogout) btnLogout.addEventListener('click', signOutCurrentUser);
    btnAdminLogout.addEventListener('click', () => {
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem('clinical_video_admin_gate');
            }
        } catch (_) { /* noop */ }
        currentUser = null;
        const signOut = supabaseConfigReady ? ds.authSignOut().catch(() => {}) : Promise.resolve();
        signOut.finally(() => {
            showToast('Admin signed out.', 'info');
            navigateTo(pageWelcome);
        });
    });

    const adminModal = document.getElementById('admin-login-modal');
    const adminPasswordInput = document.getElementById('admin-password');
    const adminLoginError = document.getElementById('admin-login-error');
    const btnAdminModalCancel = document.getElementById('btn-admin-modal-cancel');
    const btnAdminModalSubmit = document.getElementById('btn-admin-modal-submit');

    function openAdminModal() {
        adminPasswordInput.value = '';
        adminLoginError.style.display = 'none';
        btnAdminModalSubmit.disabled = false;
        btnAdminModalSubmit.textContent = 'Sign in';
        adminModal.style.display = 'flex';
        setTimeout(() => adminPasswordInput.focus(), 50);
    }

    function closeAdminModal() {
        adminModal.style.display = 'none';
        adminPasswordInput.value = '';
    }

    btnAdminLogin.addEventListener('click', openAdminModal);
    if (btnAdminStaff) btnAdminStaff.addEventListener('click', openAdminModal);
    btnAdminModalCancel.addEventListener('click', closeAdminModal);

    adminModal.addEventListener('click', (e) => {
        if (e.target === adminModal) closeAdminModal();
    });

    adminPasswordInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') btnAdminModalSubmit.click();
    });

    function resetAdminModalSubmitButton() {
        btnAdminModalSubmit.disabled = false;
        btnAdminModalSubmit.textContent = 'Sign in';
    }

    function formatAdminSignInError(err) {
        const code = err && err.code;
        const msg = String((err && err.message) || '');
        if (code === 'invalid_credentials' || msg.includes('Invalid login credentials')) {
            return 'Password is incorrect, or the admin account does not exist. Check the configured Supabase admin account.';
        }
        const adminStatus = err && err.status;
        if (
            msg.includes('rate limit') ||
            msg.includes('429') ||
            msg.includes('Too Many Requests') ||
            code === 'over_request_rate' ||
            adminStatus === 429
        ) {
            return (
                'Supabase is rate limiting this request. Wait a moment, or adjust Dashboard > Authentication > Rate limits while testing.'
            );
        }
        if (code === 'email_not_confirmed' || msg.toLowerCase().includes('confirm')) {
            return 'This admin account still requires confirmation. Disable email confirmation for this internal tool or confirm the account in Supabase.';
        }
        if (msg.includes('JWT') || msg.includes('apikey') || msg.includes('API key')) {
            return 'The API key does not match this project. Use the anon key from Project Settings > API.';
        }
        if (code === 'NO_USER') {
            return 'Could not sign in right now. Try again.';
        }
        if (code === 'NOT_ADMIN') {
            return 'This account can sign in, but it does not have an admin or teacher role in public.user_roles.';
        }
        if (code === 'NO_ADMIN_EMAIL') {
            return 'No admin email is configured. Set ADMIN_AUTH_EMAIL in js/supabase-config.js.';
        }
        return msg || 'Sign-in failed.';
    }

    /** @param {'admin'|'system_admin'} kind @param {string} [password] */
    function openAdminWithGatePasswordOnly(kind, password) {
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.setItem(
                    'clinical_video_admin_gate',
                    kind === 'system_admin' ? 'system_admin' : '1'
                );
            }
        } catch (_) { /* noop */ }
        currentUser = {
            uid: null,
            username: kind === 'system_admin' ? 'system_admin' : 'Admin',
            isAdmin: true,
            role: kind === 'system_admin' ? 'admin' : 'admin',
            localPasswordAdmin: true,
            systemAdmin: kind === 'system_admin'
        };
        resetAdminModalSubmitButton();
        closeAdminModal();
        navigateTo(pageAdmin);

        if (password && supabaseConfigReady) {
            const email = kind === 'system_admin' ? SYSTEM_ADMIN_AUTH_EMAIL : ADMIN_AUTH_EMAIL;
            if (email) {
                ds.authSignIn(email, password).then(res => {
                    if (!res.error && res.data && res.data.user) {
                        currentUser.uid = res.data.user.id;
                        currentUser.role = kind === 'system_admin' ? 'admin' : 'admin';
                        currentUser.localPasswordAdmin = false;
                        const lb = document.getElementById('local-admin-banner');
                        if (lb) lb.style.display = 'none';
                    }
                }).catch(() => {});
            }
        }
    }

    /** Try Supabase sign-in for each configured admin email until one has an admin/teacher role. */
    async function signInAsConfiguredAdmin(password) {
        const emails = [...new Set([ADMIN_AUTH_EMAIL, SYSTEM_ADMIN_AUTH_EMAIL].filter(Boolean))];
        let lastErr = null;
        for (let i = 0; i < emails.length; i++) {
            const email = emails[i];
            if (i > 0) await new Promise((r) => setTimeout(r, 650));
            const res = await withTimeout(Promise.resolve(ds.authSignIn(email, password)), 20000);
            if (res.error) {
                lastErr = res.error;
                continue;
            }
            const uid = res.data && res.data.user && res.data.user.id;
            if (!uid) {
                lastErr = Object.assign(new Error('No user after sign-in'), { code: 'NO_USER' });
                continue;
            }
            let isAd = false;
            try {
                isAd = await withTimeout(ds.isAdmin(uid), 12000);
            } catch (checkErr) {
                console.error('[Admin] isAdmin check failed', checkErr);
                try {
                    await ds.authSignOut();
                } catch (_) { /* noop */ }
                throw checkErr;
            }
            if (isAd) {
                return;
            }
            await ds.authSignOut().catch(() => {});
            lastErr = Object.assign(new Error('Not assigned admin or teacher role'), { code: 'NOT_ADMIN' });
        }
        if (lastErr) throw lastErr;
        throw Object.assign(new Error('No admin login attempted'), { code: 'NO_ADMIN_EMAIL' });
    }

    btnAdminModalSubmit.addEventListener('click', async () => {
        const password = String(adminPasswordInput.value || '').trim();
        if (!password) return;

        adminLoginError.style.display = 'none';
        btnAdminModalSubmit.disabled = true;
        btnAdminModalSubmit.textContent = 'Signing in...';

        if (ADMIN_GATE_PASSWORD && password === ADMIN_GATE_PASSWORD) {
            openAdminWithGatePasswordOnly('admin', password);
            return;
        }
        if (SYSTEM_ADMIN_GATE_PASSWORD && password === SYSTEM_ADMIN_GATE_PASSWORD) {
            openAdminWithGatePasswordOnly('system_admin', password);
            return;
        }

        if (!supabaseConfigReady) {
            adminLoginError.textContent =
                'Supabase is not configured. Set ADMIN_GATE_PASSWORD or SYSTEM_ADMIN_GATE_PASSWORD in js/supabase-config.js to match this password.';
            adminLoginError.style.display = 'block';
            resetAdminModalSubmitButton();
            return;
        }

        try {
            try {
                if (typeof sessionStorage !== 'undefined') {
                    sessionStorage.removeItem('clinical_video_admin_gate');
                }
            } catch (_) { /* noop */ }

            await signInAsConfiguredAdmin(password);
            resetAdminModalSubmitButton();
            closeAdminModal();
        } catch (err) {
            const timedOut = err && (err.code === 'TIMEOUT' || err.message === 'TIMEOUT');
            if (timedOut) {
                try {
                    await ds.authSignOut();
                } catch (_) { /* noop */ }
            }
            if (timedOut) {
                adminLoginError.textContent = 'The server did not respond in time. Try again.';
            } else {
                console.error('[Admin login]', err);
                adminLoginError.textContent = formatAdminSignInError(err);
            }
            adminLoginError.style.display = 'block';
            resetAdminModalSubmitButton();
        }
    });

    btnToggleMembers.addEventListener('click', () => {
        adminMemberList.hidden = !adminMemberList.hidden;
        if (!adminMemberList.hidden) renderAdminMembers();
    });

    const btnSaveAllowedNames = document.getElementById('btn-save-allowed-names');
    const btnToggleAllowedNames = document.getElementById('btn-toggle-allowed-names');

    function allowedNamesFromTextarea() {
        const el = document.getElementById('admin-allowed-names');
        return String(el?.value || '').split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
    }

    function updateAllowedNamesSummary() {
        const allowedNamesSummary = document.getElementById('allowed-names-summary');
        if (!allowedNamesSummary) return;
        const count = allowedNamesFromTextarea().length || allowedNames.length;
        const suffix = count === 1 ? 'name' : 'names';
        allowedNamesSummary.textContent = count
            ? `${count} approved ${suffix} hidden.`
            : 'No approved names yet.';
    }

    function setAllowedNamesEditorOpen(open) {
        const allowedNamesEditor = document.getElementById('allowed-names-editor');
        const btnToggleAllowedNames = document.getElementById('btn-toggle-allowed-names');
        if (!allowedNamesEditor || !btnToggleAllowedNames) return;
        allowedNamesEditor.hidden = !open;
        btnToggleAllowedNames.setAttribute('aria-expanded', open ? 'true' : 'false');
        btnToggleAllowedNames.textContent = open ? 'Hide names' : 'Show names';
        if (open) {
            const input = document.getElementById('admin-allowed-names');
            setTimeout(() => input && input.focus(), 50);
        }
    }

    function updateExamInfoSummary() {
        const summary = document.getElementById('exam-info-summary');
        if (!summary) return;
        const input = document.getElementById('admin-exam-deadline');
        const noteInput = document.getElementById('admin-exam-note');
        const ms = parseDatetimeLocalInput(input && input.value);
        const hasNote = Boolean(String(noteInput?.value || '').trim());
        if (ms) {
            const dateText = new Date(ms).toLocaleString([], {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });
            summary.textContent = hasNote ? `Exam date set: ${dateText}. Note hidden.` : `Exam date set: ${dateText}.`;
        } else {
            summary.textContent = hasNote ? 'No exam date. Note hidden.' : 'No shared exam info yet.';
        }
    }

    function setExamInfoEditorOpen(open, persist = true) {
        const editor = document.getElementById('exam-info-editor');
        const button = document.getElementById('btn-toggle-exam-info');
        if (!editor || !button) return;
        editor.hidden = !open;
        button.setAttribute('aria-expanded', open ? 'true' : 'false');
        button.textContent = open ? 'Hide info' : 'Show info';
        if (persist) {
            try {
                localStorage.setItem('admin_exam_info_open', open ? '1' : '0');
            } catch {
                /* Non-critical UI preference. */
            }
        }
        if (open) {
            const input = document.getElementById('admin-exam-deadline');
            setTimeout(() => input && input.focus(), 50);
        }
    }

    updateAllowedNamesSummary();
    updateExamInfoSummary();

    if (btnToggleAllowedNames) {
        btnToggleAllowedNames.addEventListener('click', () => {
            const allowedNamesEditor = document.getElementById('allowed-names-editor');
            setAllowedNamesEditorOpen(allowedNamesEditor?.hidden !== false);
        });
    }

    const btnToggleExamInfo = document.getElementById('btn-toggle-exam-info');
    if (btnToggleExamInfo) {
        let open = false;
        try {
            open = localStorage.getItem('admin_exam_info_open') === '1';
        } catch {
            open = false;
        }
        setExamInfoEditorOpen(open, false);
        btnToggleExamInfo.addEventListener('click', () => {
            const editor = document.getElementById('exam-info-editor');
            setExamInfoEditorOpen(editor?.hidden !== false);
        });
    }

    if (btnSaveAllowedNames) {
        btnSaveAllowedNames.addEventListener('click', () => {
            const val = document.getElementById('admin-allowed-names').value;
            allowedNames = val.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
            saveAllowedNamesDB()
                .then(() => {
                    showToast('Approved names saved.');
                    saveDraft('admin_allowed_names', null);
                    updateAllowedNamesSummary();
                    setAllowedNamesEditorOpen(false);
                })
                .catch(() => {
                    /* saveAllowedNamesDB already alerted */
                });
        });
    }

    const btnClearAllowedNames = document.getElementById('btn-clear-allowed-names');
    if (btnClearAllowedNames) {
        btnClearAllowedNames.addEventListener('click', () => {
            if (!confirm('Clear all allowed user names?')) return;
            allowedNames = [];
            document.getElementById('admin-allowed-names').value = '';
            saveAllowedNamesDB()
                .then(() => {
                    showToast('Approved names cleared.');
                    saveDraft('admin_allowed_names', null);
                    updateAllowedNamesSummary();
                    setAllowedNamesEditorOpen(false);
                })
                .catch(() => {
                    /* saveAllowedNamesDB already alerted */
                });
        });
    }

    const btnSaveExamDeadline = document.getElementById('btn-save-exam-deadline');
    const btnSaveExamNote = document.getElementById('btn-save-exam-note');
    const btnClearExamDeadline = document.getElementById('btn-clear-exam-deadline');
    if (btnSaveExamDeadline) {
        btnSaveExamDeadline.addEventListener('click', () => {
            const input = document.getElementById('admin-exam-deadline');
            const ms = parseDatetimeLocalInput(input && input.value);
            ds.saveAdminSettingsPatch({ exam_deadline_ms: ms != null ? ms : null })
                .then(() => {
                    showToast('Exam date saved.');
                    saveDraft('admin_exam_deadline', null);
                    updateExamInfoSummary();
                })
                .catch((err) => {
                    const base = err && err.message ? err.message : String(err);
                    let msg = 'Save failed: ' + base;
                    if (currentUser && currentUser.localPasswordAdmin) {
                        msg +=
                            '\n\nPassword-only admin access cannot write to Supabase tables. Sign in with an admin or teacher role in public.user_roles.';
                    }
                    alert(msg);
                });
        });
    }
    if (btnSaveExamNote) {
        btnSaveExamNote.addEventListener('click', () => {
            const input = document.getElementById('admin-exam-note');
            const note = input ? input.value : '';
            ds.saveAdminSettingsPatch({ exam_note: note })
                .then(() => {
                    globalExamNote = note;
                    showToast('Exam details saved.');
                    saveDraft('admin_exam_note', null);
                    updateExamInfoSummary();
                    renderExamDetailsModal();
                })
                .catch((err) => {
                    const base = err && err.message ? err.message : String(err);
                    let msg = 'Save note failed: ' + base;
                    if (currentUser && currentUser.localPasswordAdmin) {
                        msg +=
                            '\n\nPassword-only admin access cannot write to Supabase tables. Sign in with an admin or teacher role in public.user_roles.';
                    }
                    alert(msg);
                });
        });
    }
    if (btnClearExamDeadline) {
        btnClearExamDeadline.addEventListener('click', () => {
            if (!confirm('Clear shared exam date and exam details note for all students?')) return;
            const input = document.getElementById('admin-exam-deadline');
            const noteInput = document.getElementById('admin-exam-note');
            if (input) input.value = '';
            if (noteInput) noteInput.value = '';
            ds.saveAdminSettingsPatch({ exam_deadline_ms: null, exam_note: '' })
                .then(() => {
                    globalExamDeadlineMs = null;
                    globalExamNote = '';
                    showToast('Shared exam info cleared.');
                    saveDraft('admin_exam_deadline', null);
                    saveDraft('admin_exam_note', null);
                    updateExamInfoSummary();
                    setExamInfoEditorOpen(false);
                    renderExamDetailsModal();
                    syncExamCountdown();
                })
                .catch((err) => {
                    const base = err && err.message ? err.message : String(err);
                    let msg = 'Clear failed: ' + base;
                    if (currentUser && currentUser.localPasswordAdmin) {
                        msg +=
                            '\n\nPassword-only admin access cannot write to Supabase tables. Sign in with an admin or teacher role in public.user_roles.';
                    }
                    alert(msg);
                });
        });
    }

    const subjectAddModal = document.getElementById('subject-add-modal');
    const subjectAddInput = document.getElementById('subject-add-input');
    const subjectAddError = document.getElementById('subject-add-error');

    function openSubjectAddModal() {
        if (subjectAddError) {
            subjectAddError.style.display = 'none';
            subjectAddError.textContent = '';
        }
        if (subjectAddInput) subjectAddInput.value = '';
        if (subjectAddModal) {
            subjectAddModal.style.display = 'flex';
            setTimeout(() => subjectAddInput && subjectAddInput.focus(), 50);
        }
    }

    function closeSubjectAddModal() {
        if (subjectAddModal) subjectAddModal.style.display = 'none';
    }

    function performAddSubject() {
        const raw = subjectAddInput ? subjectAddInput.value : '';
        if (subjectAddError) {
            subjectAddError.style.display = 'none';
            subjectAddError.textContent = '';
        }
        if (!raw || !String(raw).trim()) {
            if (subjectAddError) {
                subjectAddError.textContent = 'Enter a subject name.';
                subjectAddError.style.display = 'block';
            }
            return;
        }
        const key = String(raw).trim().toLowerCase();
        if (subjects.includes(key)) {
            if (subjectAddError) {
                subjectAddError.textContent = 'This subject already exists.';
                subjectAddError.style.display = 'block';
            }
            return;
        }

        subjects.push(key);
        renderSubjectOptions();
        renderSubjectPills();
        if (newVideoSubject) newVideoSubject.value = key;
        closeSubjectAddModal();

        if (!supabaseConfigReady) {
            showToast(
                'Subject "' + key + '" was added for this session. Configure Supabase to save it permanently.',
                'info'
            );
            return;
        }

        saveSubjectsDB()
            .then(() => showToast('Subject "' + key + '" added.'))
            .catch(() => {
                subjects = subjects.filter((s) => s !== key);
                renderSubjectOptions();
                renderSubjectPills();
                if (newVideoSubject && subjects.length) {
                    newVideoSubject.value = subjects.includes(selectedSubject)
                        ? selectedSubject
                        : subjects[0];
                }
                showToast('Could not save subject. Check Supabase permissions or sign in with a full admin account.', 'error');
            });
    }

    if (btnAddSubject) {
        btnAddSubject.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSubjectAddModal();
        });
    }

    const btnSubjectAddCancel = document.getElementById('btn-subject-add-cancel');
    const btnSubjectAddConfirm = document.getElementById('btn-subject-add-confirm');
    if (btnSubjectAddCancel) btnSubjectAddCancel.addEventListener('click', closeSubjectAddModal);
    if (btnSubjectAddConfirm) btnSubjectAddConfirm.addEventListener('click', performAddSubject);
    if (subjectAddInput) {
        subjectAddInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                performAddSubject();
            }
        });
    }
    if (subjectAddModal) {
        subjectAddModal.addEventListener('click', (e) => {
            if (e.target === subjectAddModal) closeSubjectAddModal();
        });
    }
    document.addEventListener('keydown', (e) => {
        if (e.key !== 'Escape') return;
        if (subjectAddModal && subjectAddModal.style.display === 'flex') closeSubjectAddModal();
    });


    if (btnClearAllMembers) {
        btnClearAllMembers.addEventListener('click', () => {
            if (!confirm('Clear ALL members? This cannot be undone.')) return;
            users = [];
            saveUsersDB({ successToast: 'All members cleared.' });
            renderAdminMembers();
        });
    }

    const btnClearViews = document.getElementById('btn-clear-views');
    if (btnClearViews) {
        btnClearViews.addEventListener('click', () => {
            if (!confirm('Reset all video views to 0?')) return;
            videos.forEach(v => { v.views = 0; });
            saveVideosDB({ successToast: 'Video views reset.' });
            renderVideos();
        });
    }

    const btnClearFeedbacks = document.getElementById('btn-clear-feedbacks');
    if (btnClearFeedbacks) {
        btnClearFeedbacks.addEventListener('click', () => {
            if (!confirm('Clear all lesson notes?')) return;
            videos.forEach(v => { v.feedbacks = []; });
            saveVideosDB({ successToast: 'Lesson notes cleared.' });
            renderAdminFeedbacks();
        });
    }

    const btnToggleFeedbacks = document.getElementById('btn-toggle-feedbacks');
    const adminFeedbacksPanel = document.getElementById('admin-feedbacks-panel');
    if (btnToggleFeedbacks && adminFeedbacksPanel) {
        btnToggleFeedbacks.addEventListener('click', () => {
            const opening = adminFeedbacksPanel.hidden;
            adminFeedbacksPanel.hidden = !opening;
            btnToggleFeedbacks.setAttribute('aria-expanded', opening ? 'true' : 'false');
            btnToggleFeedbacks.textContent = opening ? 'Hide notes' : 'Show notes';
            if (opening) {
                renderAdminFeedbacks();
            }
        });
    }

    const btnRefreshFeedbacks = document.getElementById('btn-refresh-feedbacks');
    if (btnRefreshFeedbacks) {
        btnRefreshFeedbacks.addEventListener('click', () => {
            renderAdminFeedbacks();
            showToast('Lesson notes refreshed.', 'info');
        });
    }
    if (adminFeedbackSearch) {
        adminFeedbackSearch.addEventListener('input', debounce(renderAdminFeedbacks, 150));
    }

    btnAddVideo.addEventListener('click', () => {
        const wasEditing = editVideoId !== null;
        const url = newVideoUrl.value.trim();
        const vId = extractVideoId(url);
        if (!vId) return alert('Invalid URL');
        const slideUrl = newVideoSlideUrl ? newVideoSlideUrl.value.trim() : '';
        const slideTitle = newVideoSlideTitle ? newVideoSlideTitle.value.trim() : '';
        const flashcardDeckId = newVideoFlashcardDeck ? newVideoFlashcardDeck.value : '';

        const quiz = [];
        if (quizQuestionsList) {
            quizQuestionsList.querySelectorAll('.quiz-question-block').forEach(block => {
                const type = block.querySelector('.q-type').value;
                const q = block.querySelector('.q-text').value.trim();
                if (!q) return;
                const img = block.querySelector('.q-img').value.trim();
                const qObj = { q, type };
                if (img) qObj.img = img;
                if (type === 'mcq') {
                    qObj.a = block.querySelector('.q-a').value.trim();
                    qObj.b = block.querySelector('.q-b').value.trim();
                    qObj.c = block.querySelector('.q-c').value.trim();
                    qObj.d = block.querySelector('.q-d').value.trim();
                    qObj.ans = block.querySelector('.q-ans').value;
                } else {
                    qObj.expected = block.querySelector('.q-expected').value.trim();
                }
                quiz.push(qObj);
            });
        }

        const connectedIds = [];
        const connContainer = document.getElementById('video-connections-list');
        if (connContainer) {
            connContainer.querySelectorAll('.video-conn-checkbox:checked').forEach(cb => {
                connectedIds.push(parseInt(cb.value, 10));
            });
        }

        if (editVideoId !== null) {
            const idx = videos.findIndex(v => v.id === editVideoId);
            if (idx !== -1) {
                videos[idx] = {
                    ...videos[idx],
                    videoId: vId,
                    url: `https://www.youtube.com/embed/${vId}`,
                    title: newVideoTitle.value.trim(),
                    subject: newVideoSubject.value,
                    slideUrl,
                    slideTitle,
                    flashcardDeckId,
                    quiz: quiz.length > 0 ? quiz : null,
                    connectedIds: connectedIds.length > 0 ? connectedIds : null
                };
            }
            editVideoId = null;
            btnAddVideo.textContent = 'Attach video';
            if (btnCancelEditVideo) btnCancelEditVideo.style.display = 'none';
        } else {
            const vidData = {
                id: Date.now(),
                subject: newVideoSubject.value,
                url: `https://www.youtube.com/embed/${vId}`,
                videoId: vId,
                title: newVideoTitle.value.trim(),
                slideUrl,
                slideTitle,
                flashcardDeckId,
                views: 0,
                quiz: quiz.length > 0 ? quiz : null,
                connectedIds: connectedIds.length > 0 ? connectedIds : null
            };
            videos.push(vidData);
        }

        newVideoUrl.value = '';
        newVideoTitle.value = '';
        if (newVideoSlideUrl) newVideoSlideUrl.value = '';
        if (newVideoSlideTitle) newVideoSlideTitle.value = '';
        if (newVideoFlashcardDeck) newVideoFlashcardDeck.value = '';
        if (quizQuestionsList) quizQuestionsList.innerHTML = '';
        saveVideosDB({
            successToast: wasEditing ? 'Video changes saved.' : 'Video attached.'
        });
        saveDraft('admin_new_video', null);
        renderVideos();
    });

    // --- Content Request Page Feature ---
    let cachedContentRequests = [];
    let currentRequestFilter = 'all'; // 'all' or 'my'

    async function renderContentRequests() {
        if (!supabaseConfigReady) return;
        const container = document.getElementById('requests-list-container');
        if (!container) return;

        try {
            cachedContentRequests = await ds.fetchContentRequests();
        } catch (err) {
            console.error('Error fetching content requests:', err);
            container.innerHTML = `<p style="color:var(--danger); font-size:14px; text-align:center;">Failed to load data: ${escapeHtml(err.message || err)}</p>`;
            return;
        }

        renderFilteredRequests();
    }

    function renderFilteredRequests() {
        const container = document.getElementById('requests-list-container');
        if (!container) return;

        const currentUsername = currentUser ? String(currentUser.username).trim().toLowerCase() : '';
        const filtered = cachedContentRequests.filter(r => {
            if (currentRequestFilter === 'my') {
                return r.username && r.username.trim().toLowerCase() === currentUsername;
            }
            return true;
        });

        if (filtered.length === 0) {
            container.innerHTML = `<p style="color:var(--text-muted); font-size:14px; text-align:center; padding: 1.5rem 0;">No suggestions in this category yet...</p>`;
            return;
        }

        container.innerHTML = '';
        filtered.forEach(r => {
            const dateStr = new Date(r.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            const card = document.createElement('div');
            card.className = 'request-item-card';

            const isMyRequest = r.username && r.username.trim().toLowerCase() === currentUsername;
            const authorText = isMyRequest ? 'Suggested by me' : `By: ${r.username}`;
            const badgeClass = `status-badge--${r.status || 'pending'}`;
            const statusLabel = {
                'pending': 'Pending',
                'approved': 'Approved',
                'rejected': 'Rejected',
                'in-progress': 'In Progress',
                'completed': 'Completed'
            }[r.status] || r.status;

            card.innerHTML = `
                <div class="request-item-header">
                    <h4 class="request-item-title">${escapeHtml(r.title)}</h4>
                    <span class="status-badge ${badgeClass}">${statusLabel}</span>
                </div>
                <div class="request-item-meta">
                    <span>Category: <strong>${escapeHtml(r.subject || 'General')}</strong></span>
                    <span>${escapeHtml(authorText)}</span>
                    <span>${escapeHtml(dateStr)}</span>
                </div>
                ${r.details ? `<p class="request-item-details">${escapeHtml(r.details)}</p>` : ''}
            `;
            container.appendChild(card);
        });
    }

    async function renderAdminContentRequests() {
        if (!supabaseConfigReady) return;
        const listContainer = document.getElementById('admin-requests-list');
        const summaryText = document.getElementById('admin-requests-summary');
        if (!listContainer) return;

        let requests = [];
        try {
            requests = await ds.fetchContentRequests();
        } catch (err) {
            console.error('Error fetching admin content requests:', err);
            listContainer.innerHTML = `<p style="color:var(--danger); font-size:14px; text-align:center;">Error loading requests: ${escapeHtml(err.message || err)}</p>`;
            return;
        }

        const query = document.getElementById('admin-requests-search')?.value.trim().toLowerCase() || '';
        const filtered = requests.filter(r => {
            if (!query) return true;
            return (r.title && r.title.toLowerCase().includes(query)) ||
                   (r.details && r.details.toLowerCase().includes(query)) ||
                   (r.username && r.username.toLowerCase().includes(query)) ||
                   (r.subject && r.subject.toLowerCase().includes(query));
        });

        if (summaryText) {
            summaryText.textContent = `Review student topic ideas and suggestions. Total: ${requests.length} (${filtered.length} shown)`;
        }

        if (filtered.length === 0) {
            listContainer.innerHTML = `<p style="color:var(--text-muted); font-size:14px; text-align:center; padding:1.5rem 0;">No matching requests found.</p>`;
            return;
        }

        listContainer.innerHTML = '';
        filtered.forEach(r => {
            const item = document.createElement('div');
            item.className = 'admin-request-item';
            const dateStr = new Date(r.created_at).toLocaleString();

            item.innerHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start;">
                    <strong style="color:var(--ink); font-size:15px;">${escapeHtml(r.title)}</strong>
                    <span style="font-size:12px; color:var(--text-muted);">${escapeHtml(dateStr)}</span>
                </div>
                <div style="font-size:13px; color:var(--text-muted); margin-top:2px;">
                    Category: <strong>${escapeHtml(r.subject || 'General')}</strong> • Suggested by: <strong>${escapeHtml(r.username)}</strong>
                </div>
                ${r.details ? `<p style="margin: 0.5rem 0 0; font-size:13px; color:var(--ink); white-space:pre-wrap; line-height:1.4;">${escapeHtml(r.details)}</p>` : ''}
                <div class="admin-request-actions">
                    <div>
                        <label style="font-size:12px; font-weight:600; margin-right:4px;">Status:</label>
                        <select class="admin-request-status-select" data-request-id="${r.id}">
                            <option value="pending" ${r.status === 'pending' ? 'selected' : ''}>Pending</option>
                            <option value="approved" ${r.status === 'approved' ? 'selected' : ''}>Approved</option>
                            <option value="rejected" ${r.status === 'rejected' ? 'selected' : ''}>Rejected</option>
                            <option value="in-progress" ${r.status === 'in-progress' ? 'selected' : ''}>In Progress</option>
                            <option value="completed" ${r.status === 'completed' ? 'selected' : ''}>Completed</option>
                        </select>
                    </div>
                    <button class="btn outline-btn btn-compact btn-delete-outline btn-delete-request" data-request-id="${r.id}" type="button">Delete</button>
                </div>
            `;

            const selectEl = item.querySelector('.admin-request-status-select');
            selectEl.addEventListener('change', async (e) => {
                const newStatus = e.target.value;
                try {
                    await ds.updateContentRequestStatus(r.id, newStatus);
                    showToast('Status updated successfully');
                    renderAdminContentRequests();
                    if (pageRequest && pageRequest.classList.contains('active')) {
                        renderContentRequests();
                    }
                } catch (err) {
                    console.error('Error updating status:', err);
                    showToast('Error updating status: ' + err.message, 'error');
                }
            });

            const deleteBtn = item.querySelector('.btn-delete-request');
            deleteBtn.addEventListener('click', async () => {
                if (!confirm(`Are you sure you want to delete the request "${r.title}"?`)) return;
                try {
                    await ds.deleteContentRequest(r.id);
                    showToast('Request deleted successfully');
                    renderAdminContentRequests();
                    if (pageRequest && pageRequest.classList.contains('active')) {
                        renderContentRequests();
                    }
                } catch (err) {
                    console.error('Error deleting request:', err);
                    showToast('Error deleting request: ' + err.message, 'error');
                }
            });

            listContainer.appendChild(item);
        });
    }

    const requestContentForm = document.getElementById('request-content-form');
    const btnRequestFilterAll = document.getElementById('btn-request-filter-all');
    const btnRequestFilterMy = document.getElementById('btn-request-filter-my');
    const btnToggleRequests = document.getElementById('btn-toggle-requests');
    const adminRequestsPanel = document.getElementById('admin-requests-panel');
    const adminRequestsSearch = document.getElementById('admin-requests-search');

    if (requestContentForm) {
        requestContentForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const titleInput = document.getElementById('request-title');
            const subjectInput = document.getElementById('request-subject');
            const detailsInput = document.getElementById('request-details');

            const title = titleInput.value.trim();
            const subject = subjectInput.value;
            const details = detailsInput.value.trim();

            if (!title) return;

            const submitBtn = document.getElementById('btn-request-submit');
            if (submitBtn) submitBtn.disabled = true;

            const username = currentUser?.username ? String(currentUser.username).trim() : 'Anonymous';

            try {
                await ds.createContentRequest(username, title, subject, details);
                showToast('Topic suggestion submitted successfully!');
                titleInput.value = '';
                detailsInput.value = '';

                await renderContentRequests();
            } catch (err) {
                console.error('Error submitting content request:', err);
                showToast('Error: ' + (err.message || err), 'error');
            } finally {
                if (submitBtn) submitBtn.disabled = false;
            }
        });
    }

    if (btnRequestFilterAll) {
        btnRequestFilterAll.addEventListener('click', () => {
            btnRequestFilterAll.classList.add('btn-active');
            btnRequestFilterMy.classList.remove('btn-active');
            currentRequestFilter = 'all';
            renderFilteredRequests();
        });
    }

    if (btnRequestFilterMy) {
        btnRequestFilterMy.addEventListener('click', () => {
            btnRequestFilterMy.classList.add('btn-active');
            btnRequestFilterAll.classList.remove('btn-active');
            currentRequestFilter = 'my';
            renderFilteredRequests();
        });
    }

    if (btnToggleRequests) {
        btnToggleRequests.addEventListener('click', () => {
            adminRequestsPanel.hidden = !adminRequestsPanel.hidden;
            btnToggleRequests.setAttribute('aria-expanded', !adminRequestsPanel.hidden ? 'true' : 'false');
            btnToggleRequests.textContent = !adminRequestsPanel.hidden ? 'Hide requests' : 'Show requests';
            if (!adminRequestsPanel.hidden) renderAdminContentRequests();
        });
    }

    if (adminRequestsSearch) {
        adminRequestsSearch.addEventListener('input', debounce(() => {
            renderAdminContentRequests();
        }, 300));
    }

    if (useLocalMemberStorage) {
        const loc = userState.restoreLocalSession();
        if (loc) {
            currentUser = loc;
            renderStreaks();
            syncExamCountdown();
            updateAdminButtonVisibility(document.querySelector('.page.active'));
            queueMicrotask(() => {
                routeStudentAfterLoginFromGate();
            });
        }
    }

    startPresence();

    if (wantsVideoFeedRoute()) {
        navigateTo(pageVideos);
    } else if (applyInitialGateRoute()) {
        document.body.classList.toggle('welcome-hero-active', pageWelcome && pageWelcome.classList.contains('active'));
    } else if (pageWelcome && pageWelcome.classList.contains('active')) {
        document.body.classList.add('welcome-hero-active');
        const heartHost = document.getElementById('welcome-heart-host');
        if (heartHost) initWelcomeHeartScene(heartHost).catch(() => {});
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initClinicalVideoApp, { once: true });
} else {
    initClinicalVideoApp();
}
