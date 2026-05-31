import * as SB from './js/supabase-config.js';
import { createDataService, profileRowToUser } from './js/data-service.js';
import {
    localMemberRegister,
    localMemberVerify,
    localMemberSetSessionUid,
    localMemberClearSession,
    localMemberTryRestore,
    localMemberPersistUser,
    localMemberLoadProfile
} from './js/local-member-auth.js';
import { initWelcomeHeartScene, disposeWelcomeHeartScene } from './js/welcome-heart-scene.js';

function metaConfig(name) {
    const el = document.querySelector(`meta[name="${name}"]`);
    const v = el && el.getAttribute('content');
    const t = v != null ? String(v).trim() : '';
    return t || null;
}

const EMBEDDED_TEST_UID = 'clinical-embedded-test-admin061-v1';

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
            : 'admin061';
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

/** Pharmacology deck hub path inside the combined web app. */
function getDecksUrl() {
    return resolveAppUrl('decks/');
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
        : 'admin061';
}

/** บัญชี admin061 — กด Beta ได้ไม่จำกัด */
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

/** เก็บฟอร์มลง localStorage ตอน dev (localhost) หรือเมื่อเปิด meta / flag — ไม่เปิดเองบนโดเมนจริง */
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

document.addEventListener('DOMContentLoaded', () => {

    if (typeof location !== 'undefined' && location.protocol === 'file:') {
        console.warn(
            '[Clinical Video] กำลังเปิดจาก file:// — ควรใช้เซิร์ฟเวอร์จริง เช่น: npx serve . แล้วเปิด http://localhost:3000 หรือใช้งานบน Netlify'
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
        tip.lang = 'th';
        tip.style.cssText =
            'position:fixed;top:0;left:0;right:0;z-index:99998;padding:12px 16px;background:#075985;color:#fff;font-size:14px;text-align:center;line-height:1.45;font-family:system-ui,sans-serif;';
        tip.innerHTML =
            '<strong>ยังไม่ได้ตั้งค่า Supabase</strong> — ใส่ค่าใน <code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">js/supabase-config.js</code> ' +
            'หรือใน <code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">index.html</code> (meta <code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">clinical-supabase-url</code> / ' +
            '<code style="background:rgba(255,255,255,0.15);padding:2px 6px;border-radius:4px;">clinical-supabase-anon-key</code>) จาก Dashboard → API';
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
    const IMGBB_API_KEY =
        typeof SB.IMGBB_API_KEY === 'string' && SB.IMGBB_API_KEY.trim()
            ? SB.IMGBB_API_KEY.trim()
            : '';

    // --- State ---
    let videos = [];
    let users = [];
    let allowedNames = [];
    let subjects = [];
    let currentUser = null;
    let countdownInterval = null;
    /** Epoch ms; shared exam shown when user profile has no `expiresAt`. */
    let globalExamDeadlineMs = null;
    let selectedSubject = '';
    let currentWatchVideo = null;
    let loginStuckTimer = null;

    if (useLocalMemberAuth) {
        const origSave = ds.saveProfileFull.bind(ds);
        ds.saveProfileFull = async (u) => {
            if (u && u.localMember) {
                localMemberPersistUser(u);
                return;
            }
            return origSave(u);
        };
        const origAppend = ds.appendQuizHistory.bind(ds);
        ds.appendQuizHistory = async (uid, record) => {
            const u = currentUser;
            if (u && u.localMember && (u.uid === uid || u.id === uid)) {
                const qh = u.quizHistory && typeof u.quizHistory === 'object' ? { ...u.quizHistory } : {};
                let key = String(Date.now());
                if (qh[key]) key = `${key}_${Math.random().toString(36).slice(2, 8)}`;
                qh[key] = record;
                u.quizHistory = qh;
                localMemberPersistUser(u);
                return;
            }
            return origAppend(uid, record);
        };
    }

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
                ? 'ชื่อนี้ลงทะเบียนแล้ว — กลับไปหน้า Log in และใช้รหัสเดิม'
                : 'ชื่อนี้มีบัญชีแล้ว ให้ใช้ Log in';
        }
        if (code === 'invalid_credentials' || msg.includes('Invalid login') || msg.includes('invalid')) {
            return 'ชื่อหรือรหัสไม่ถูกต้อง หรือยังไม่เคยสมัคร';
        }
        if (msg.includes('Email') && msg.includes('valid')) return 'รูปแบบชื่อไม่ถูกต้อง (ใช้ตัวอักษร ตัวเลข และวรรคได้)';
        if (code === 'weak_password' || msg.includes('Password')) return 'รหัสสั้นเกินไป — ใช้อย่างน้อย 6 ตัวอักษร';
        const status = err && err.status;
        if (
            msg.includes('rate limit') ||
            msg.includes('429') ||
            msg.includes('Too Many Requests') ||
            code === 'over_request_rate' ||
            status === 429
        ) {
            return (
                'Supabase จำกัดความถี่การสมัคร/ล็อกอิน (ไม่ใช่ดีเลย์จากแอป) — รอสักครู่หรือไปที่ ' +
                'Dashboard → Authentication → Rate limits เพื่อปรับโควต้าเมื่อทดสอบบ่อย · ' +
                'ถ้าทดสอบซ้ำด้วยชื่อเดิม ลองลบ user ใน Authentication → Users หรือใช้ชื่อคนละตัว'
            );
        }
        if (err && (err.code === 'TIMEOUT' || err.message === 'TIMEOUT')) {
            return 'เซิร์ฟเวอร์ไม่ตอบในเวลาที่กำหนด — ตรวจเน็ตหรือ Supabase';
        }
        return msg || 'เกิดข้อผิดพลาด ลองอีกครั้ง';
    }

    function getVideoSubject(v) {
        return v.subject || (subjects.length > 0 ? subjects[0] : 'anatomy');
    }

    function nameKey(name) {
        return encodeURIComponent(String(name || '').trim())
            .replace(/%/g, '_')
            .replace(/[.#$[\]]/g, '_');
    }

    function normalizeLineAllowName(name) {
        return String(name ?? '').trim().toLowerCase();
    }

    /** เทียบชื่อที่พิมพ์กับรายชื่อใน allow-list (ไม่สนตัวพิมพ์เล็ก–ใหญ่ / trim ช่องว่าง) */
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
            await ds.saveProfileFull(currentUser);
            renderStreaks();
            return;
        }

        const uniqueDates = [...new Set(rows.map(r => r.date))]
            .filter(Boolean)
            .sort()
            .reverse();

        let streak = 0;
        let expected = today;
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
        await ds.saveProfileFull(currentUser);
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
                    currentUser = {
                        uid: user.id,
                        username: user.email,
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

                const row = await ds.fetchProfile(user.id);
                const onLoginScreen = pageLogin.classList.contains('active');

                if (!row) {
                    if (onLoginScreen) {
                        loginError.textContent = 'No member profile for this account. Register first, or sign in with the Line name you used when joining.';
                        loginError.style.display = 'block';
                        setLoginLoading(false);
                        await ds.authSignOut();
                    }
                    return;
                }

                const userData = profileRowToUser(row);

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

                    currentUser = { ...userData, uid: user.id, isAdmin: false };
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
                const restored = localMemberTryRestore();
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
            if (!pageWelcome.classList.contains('active') && !pageLogin.classList.contains('active') && !pageRegister.classList.contains('active')) {
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

        if (pageId === 'page-admin') {
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
                        '\n\nเข้าผ่านรหัสลับอย่างเดียวไม่มีสิทธิ์แก้ไขตารางใน Supabase — ให้ใช้ Staff → Admin login ด้วยบัญชีที่มีแถวใน public.admin_users';
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
        const videoBadge = document.getElementById("badge-video-streak");
        if (videoBadge) videoBadge.textContent = `📺 Progress: ${currentUser.videoStreak || 0}`;
        const checkinBadge = document.getElementById("badge-checkin-streak");
        if (checkinBadge) checkinBadge.textContent = `🔥 Continue: ${currentUser.checkinStreak || 0}`;
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
    const pageVideos = document.getElementById('page-videos');
    const pageVideoWatch = document.getElementById('page-video-watch');
    const pageQuiz = document.getElementById('page-quiz');
    const pageStats = document.getElementById('page-stats');
    const pageAdmin = document.getElementById('page-admin');

    const btnGoLogin = document.getElementById('btn-go-login');
    const btnGoRegister = document.getElementById('btn-go-register');
    const btnsBackWelcome = document.querySelectorAll('.btn-back-welcome');

    const registerForm = document.getElementById('register-form');
    const regUsername = document.getElementById('reg-username');
    const regPassword = document.getElementById('reg-password');
    const regMsg = document.getElementById('reg-msg');

    const loginForm = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const loginError = document.getElementById('login-error');
    const loginSubmitBtn = loginForm ? loginForm.querySelector('button[type="submit"]') : null;

    /** @param {'auth'|'profile'} [phase] — after sign-in we show profile phase while Supabase loads profile data */
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

    const userVideoGrid = document.getElementById('user-video-grid');
    const watchNavTitle = document.getElementById('watch-nav-title');
    const watchVideoTitle = document.getElementById('watch-video-title');
    const watchIframe = document.getElementById('watch-iframe');
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
    let currentQuizData = null;
    let selectedChoice = null;
    const countdownTimerWatch = document.getElementById('countdown-timer-watch');
    const countdownTimerQuiz = document.getElementById('countdown-timer-quiz');
    const adminVideoList = document.getElementById('admin-video-list');
    const countdownTimer = document.getElementById('countdown-timer');

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

                applyAdminPanelDrafts(allowedNames, globalExamDeadlineMs);

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
            applyAdminPanelDrafts(allowedNames, null);
        });
    }

    const btnStats = document.getElementById('btn-stats');
    const btnDecks = document.getElementById('btn-decks');
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
    const newVideoSubject = document.getElementById('new-video-subject');
    const btnAddSubject = document.getElementById('btn-add-subject');

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
                        subject: newVideoSubject.value
                    })
                );
            }, 400);
            newVideoUrl.addEventListener('input', persistVid);
            newVideoTitle.addEventListener('input', persistVid);
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
            const syncExamDraft = debounce(() => saveDraft('admin_exam_deadline', examDraftEl.value), 400);
            examDraftEl.addEventListener('input', syncExamDraft);
            examDraftEl.addEventListener('change', syncExamDraft);
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

    async function imgbbUpload(file) {
        if (!IMGBB_API_KEY) {
            throw new Error('ยังไม่ได้ตั้ง IMGBB_API_KEY ใน js/supabase-config.js');
        }
        const formData = new FormData();
        formData.append('image', file);
        const res = await fetch(`https://api.imgbb.com/1/upload?key=${IMGBB_API_KEY}`, {
            method: 'POST',
            body: formData
        });
        const data = await res.json();
        if (!data.success) {
            throw new Error((data.error && data.error.message) || 'Upload failed');
        }
        return data.data.url;
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
                const url = await imgbbUpload(file);
                setImageUrl(url);
                showToast('อัปโหลดรูปแล้ว');
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
            <button type="button" class="btn icon-btn remove-question-btn" style="position: absolute; top: 0.5rem; right: 0.5rem; color: var(--danger);">🗑️</button>
            <div class="input-group">
                <input type="text" class="q-text" placeholder=" " value="${qVal}">
                <label>Question</label>
            </div>
            
            <div class="img-upload-zone" style="border: 2px dashed var(--border); padding: 1.5rem 1rem; border-radius: var(--r-card); text-align: center; cursor: pointer; margin-bottom: 1.25rem; background: var(--surface); position: relative; transition: border-color 0.2s;">
                <input type="file" class="q-img-file" accept="image/*" style="display:none;">
                <input type="hidden" class="q-img" value="${imgVal}">
                <div class="upload-placeholder" style="${hasImg ? 'display:none;' : ''}">
                    <p style="font-size: 13px; color: var(--text-muted); margin: 0; pointer-events: none;">📸 Drag & Drop image here or Click to upload</p>
                </div>
                <div class="upload-preview" style="${hasImg ? '' : 'display:none;'}">
                    <img src="${imgVal}" style="max-height: 120px; max-width: 100%; border-radius: var(--r-input); object-fit: contain;">
                    <button type="button" class="btn icon-btn remove-img-btn" style="position: absolute; top: 0.5rem; right: 0.5rem; background: rgba(255,255,255,0.9); color: var(--danger); padding: 4px; height: auto; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">🗑️</button>
                </div>
                <div class="upload-loading" style="display:none; pointer-events: none;">
                    <p style="font-size: 13px; color: var(--teal); margin: 0; font-weight: 500;">Uploading...</p>
                </div>
            </div>

            <div class="admin-field-row" style="margin-top: 0.5rem; margin-bottom: 1rem;">
                <label class="admin-field-label">Question Type</label>
                <select class="admin-select q-type">
                    <option value="mcq" ${(!qData || qData.type === 'mcq') ? 'selected' : ''}>Multiple Choice</option>
                    <option value="text" ${(qData && qData.type === 'text') ? 'selected' : ''}>Free Text (เขียน)</option>
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

    if (btnAddQuestion) {
        btnAddQuestion.addEventListener('click', () => addQuizQuestionUI());
    }

    if (btnCancelEditVideo) {
        btnCancelEditVideo.addEventListener('click', () => {
            editVideoId = null;
            btnAddVideo.textContent = 'Attach video';
            btnCancelEditVideo.style.display = 'none';
            newVideoUrl.value = '';
            newVideoTitle.value = '';
            if (quizQuestionsList) quizQuestionsList.innerHTML = '';
            showToast('ยกเลิกการแก้ไข', 'info');
        });
    }

    function renderVideoComments(video) {
        const commentsList = document.getElementById('video-comments-list');
        if (!commentsList) return;
        commentsList.innerHTML = '';
        if (!video.feedbacks || video.feedbacks.length === 0) {
            commentsList.innerHTML = '<p class="muted-empty" style="font-size: 13px;">No positive feedbacks yet.</p>';
            return;
        }
        const feedbacks = [...video.feedbacks].reverse();
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

    function openVideoWatchPage(video) {
        currentWatchVideo = video;
        watchNavTitle.textContent = subjectLabel(getVideoSubject(video));
        watchVideoTitle.textContent = video.title;
        watchIframe.src = `https://www.youtube.com/embed/${video.videoId}?autoplay=1`;
        if (videoFeedback) {
            videoFeedback.value = '';
            saveDraft('video_feedback', null);
        }
        renderVideoComments(video);
        navigateTo(pageVideoWatch);
    }

    function renderVideos() {
        userVideoGrid.innerHTML = '';
        const filtered = videos.filter(v => getVideoSubject(v) === selectedSubject);
        const newestIds = [...videos].sort((a, b) => b.id - a.id).slice(0, 2).map(v => v.id);
        if (filtered.length === 0) {
            userVideoGrid.innerHTML = `<p class="video-empty-msg">ยังไม่มีคลิปในวิชา ${subjectLabel(selectedSubject)}</p>`;
        } else {
            filtered.forEach(vid => {
                const card = document.createElement('div');
                card.className = 'video-card video-clickable';
                card.setAttribute('data-id', vid.id);
                card.innerHTML = `
                    <div class="video-thumb">
                        <img src="https://img.youtube.com/vi/${vid.videoId}/hqdefault.jpg" alt="${escapeHtml(vid.title)}" onerror="this.src='https://placehold.co/640x360?text=No+Thumbnail'">
                        <div class="video-play">▶</div>
                    </div>
                    <div class="video-meta">
                        ${newestIds.includes(vid.id) ? `<span class="video-badge">New</span>` : ''}
                        <h3 class="video-title">${escapeHtml(vid.title)}</h3>
                        <span class="video-subtitle">${subjectLabel(getVideoSubject(vid))}</span>
                        <p class="video-views">👁️ ${vid.views || 0} views</p>
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
                    video.views = (video.views || 0) + 1;
                    saveVideosDB();
                    openVideoWatchPage(video);
                }
            });
        });
        renderAdminVideos();
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
            ds.saveProfileFull(currentUser).catch((e) => console.error(e));
            renderStreaks();
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
            item.innerHTML = `
                <button type="button" class="btn icon-btn delete-video-btn" data-id="${vid.id}" style="position: absolute; top: 1rem; right: 1rem; width: 28px; height: 28px; color: var(--danger); z-index: 10;">🗑️</button>
                <img src="https://img.youtube.com/vi/${vid.videoId}/hqdefault.jpg" style="width: 100%; aspect-ratio: 16/9; object-fit: cover; border-radius: var(--r-btn);">
                <div style="flex:1;">
                    <h4 style="font-size:13px; line-height:1.4; margin-bottom:4px;">${escapeHtml(vid.title)}</h4>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span class="subject-tag" style="font-size:10px;">${subjectLabel(getVideoSubject(vid))}</span>
                        ${qCount > 0 ? `<span style="font-size:10px; color:var(--teal-700); font-weight:600;">${qCount} Qs</span>` : ''}
                    </div>
                </div>
            `;
            item.addEventListener('click', (e) => {
                if (e.target.closest('.delete-video-btn')) return;
                editVideoId = vid.id;
                newVideoUrl.value = `https://www.youtube.com/watch?v=${vid.videoId}`;
                newVideoTitle.value = vid.title;
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
            });
            adminVideoList.appendChild(item);
        });
        document.querySelectorAll('.delete-video-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const idToRemove = parseInt(e.currentTarget.getAttribute('data-id'));
                if (confirm('ลบวิดีโอนี้?')) {
                    videos = videos.filter(v => v.id !== idToRemove);
                    saveVideosDB({ successToast: 'ลบวิดีโอแล้ว' });
                    renderVideos();
                }
            });
        });
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
                <span style="font-size:12px; color:var(--muted);">👁️ ${vid.views || 0} views</span>
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
                    div.innerHTML = `<span>#${i+1} ${escapeHtml(u.username)}</span><span style="color:var(--ok);font-weight:600;">🔥 ${u.checkinStreak || 0}</span>`;
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
                    div.innerHTML = `<span>#${i+1} ${escapeHtml(u.username)}</span><span style="color:var(--info);font-weight:600;">📺 ${u.videoStreak || 0}</span>`;
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
            const prev = await ds.queryResponsesByNameKey(key);
            if (prev.some((r) => r.date === today)) {
                loading.style.display = 'none';
                taskView.style.display = 'none';
                okView.style.display = 'flex';
                document.getElementById('checkin-ok-msg').textContent = `วันนี้ check-in แล้ว ("${currentUser.username}")`;
                document.getElementById('checkin-ok-stats').style.display = 'none';
                return;
            }

            checkinCurrentQ = await ds.fetchCheckinQuestionForDate(today);

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
        const payload = { timestamp: ts, date: today, name: currentUser.username, name_key: key, answer: ans };

        try {
            await ds.pushCheckinResponse(payload);

            saveDraft('checkin_answer', null);

            document.getElementById('checkin-ok-msg').textContent = `Recorded for "${currentUser.username}".`;
            const statsEl = document.getElementById('checkin-ok-stats');
            statsEl.style.display = 'none';

            document.getElementById('checkin-task-view').style.display = 'none';
            document.getElementById('checkin-ok-view').style.display = 'flex';

            btn.disabled = false; btn.textContent = 'Submit answer';
            updateCheckinStreak();

            const cycleStart = checkinTwoWeekStart(today);
            const cycleEnd = checkinAddDays(cycleStart, 13);
            const rows = await ds.queryResponsesByNameKey(key);
            if (rows.length) {
                const daysSet = {};
                rows.forEach(r => { if (r.date >= cycleStart && r.date <= today) daysSet[r.date] = true; });
                daysSet[today] = true;
                const count = Object.keys(daysSet).length;
                const elapsed = Math.floor((parseYMD(today) - parseYMD(cycleStart)) / 86400000) + 1;
                const pct = elapsed > 0 ? Math.round((count / elapsed) * 100) : 0;
                statsEl.innerHTML = `Cycle ${cycleStart} – ${cycleEnd}: <strong>${count} day(s)</strong> checked-in (${pct}%)`;
                statsEl.style.display = 'block';
            }
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
            const rows = (await ds.fetchAllCheckinQuestions()).sort((a, b) => a.date < b.date ? -1 : 1);
            if (!rows.length) { list.innerHTML = '<p style="font-size:13px;color:var(--text-muted);">No questions scheduled.</p>'; return; }
            list.innerHTML = rows.map((r, i) => {
                const isToday = r.date === today;
                const badge = r.type === 'choice'
                    ? `<span class="checkin-q-badge choice">Choice</span>`
                    : `<span class="checkin-q-badge">Free text</span>`;
                return `<div class="checkin-q-row ${isToday ? 'today' : ''}">
                    <span class="checkin-q-date ${isToday ? 'now' : ''}">${checkinEsc(isToday ? 'Today' : r.date)}</span>
                    <span class="checkin-q-text">${checkinEsc(r.question)}</span>
                    ${badge}
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
        document.getElementById('cq-date').value = checkinTodayStr();
        document.getElementById('cq-question').value = '';
        if (cqImgZone) cqImgZone.setImageUrl('');
        ['cq-c1','cq-c2','cq-c3','cq-c4','cq-c5'].forEach(id => { document.getElementById(id).value = ''; });
        setCQType('text');
        document.getElementById('btn-cq-delete').style.display = 'none';

        if (idx !== null && window._checkinQCache) {
            const r = window._checkinQCache[idx];
            checkinEditingDate = r.date;
            document.getElementById('cq-date').value = r.date || '';
            document.getElementById('cq-question').value = r.question || '';
            if (cqImgZone) cqImgZone.setImageUrl(r.imageUrl || '');
            if (r.type === 'choice') {
                setCQType('choice');
                ['c1','c2','c3','c4','c5'].forEach(k => { document.getElementById('cq-' + k).value = r[k] || ''; });
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
    };

    function closeCheckinQForm() {
        document.getElementById('checkin-q-form').style.display = 'none';
        document.getElementById('checkin-q-list').style.display = 'flex';
        document.getElementById('btn-checkin-new-q').style.display = 'block';
    }

    async function saveCheckinQ() {
        const date = document.getElementById('cq-date').value;
        const question = document.getElementById('cq-question').value.trim();
        if (!date || !question) { alert('Please fill in date and question.'); return; }
        if (checkinCurrentType === 'choice') {
            if (!document.getElementById('cq-c1').value.trim() || !document.getElementById('cq-c2').value.trim()) {
                alert('Need at least 2 choices.'); return;
            }
        }
        const btn = document.getElementById('btn-cq-save');
        btn.disabled = true; btn.textContent = 'Saving…';
        const data = {
            date, question, type: checkinCurrentType,
            c1: document.getElementById('cq-c1').value.trim(),
            c2: document.getElementById('cq-c2').value.trim(),
            c3: document.getElementById('cq-c3').value.trim(),
            c4: document.getElementById('cq-c4').value.trim(),
            c5: document.getElementById('cq-c5').value.trim(),
            imageUrl: document.getElementById('cq-img').value.trim(),
        };
        try {
            if (checkinEditingDate && checkinEditingDate !== date) {
                await ds.removeCheckinQuestion(checkinEditingDate);
            }
            await ds.saveCheckinQuestion(date, data);
            btn.disabled = false; btn.textContent = 'Save';
            closeCheckinQForm();
            renderCheckinQuestions();
            showToast('บันทึกคำถาม check-in แล้ว');
        } catch (e) {
            btn.disabled = false; btn.textContent = 'Save';
            console.error('saveCheckinQ failed:', e, 'data:', data);
            alert('Failed to save: ' + (e && e.message ? e.message : e));
        }
    }

    async function deleteCheckinQ() {
        if (!checkinEditingDate) return;
        if (!confirm(`Delete question for ${checkinEditingDate}?`)) return;
        try {
            await ds.removeCheckinQuestion(checkinEditingDate);
            closeCheckinQForm();
            renderCheckinQuestions();
            showToast('ลบคำถามแล้ว');
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

            statsEl.innerHTML = `
                <div class="checkin-dash-stat"><div class="checkin-dash-stat-num">${all.length}</div><div class="checkin-dash-stat-lbl">Total check-ins</div></div>
                <div class="checkin-dash-stat"><div class="checkin-dash-stat-num">${todayRows.length}</div><div class="checkin-dash-stat-lbl">Today</div></div>
                <div class="checkin-dash-stat"><div class="checkin-dash-stat-num" style="font-size:14px;">${cycleStart} – ${cycleEnd}</div><div class="checkin-dash-stat-lbl">Current cycle</div></div>
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
            if (options.notifySuccess) showToast('อัปเดตแดชบอร์ด check-in แล้ว');
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
                if (confirm("ลบ Member?")) {
                    users = users.filter(u => u.id !== id);
                    saveUsersDB({ successToast: 'ลบสมาชิกแล้ว' });
                    renderAdminMembers();
                }
            });
        });
    }

    function navigateTo(pageElement) {
        if (!pageElement) return;
        if (pageElement !== pageLogin) {
            clearTimeout(loginStuckTimer);
            setLoginLoading(false);
        }
        updateAdminButtonVisibility(pageElement);
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
                        ? 'เข้าผ่านรหัส system_admin (AI agent) อย่างเดียว — การบันทึกลงฐานข้อมูลอาจไม่สำเร็จจนกว่าจะมีบัญชีใน Supabase และแถวใน admin_users'
                        : 'เข้าผ่านรหัสลับอย่างเดียว — การบันทึกลงฐานข้อมูลอาจไม่สำเร็จจนกว่าจะมีบัญชีแอดมินใน Supabase และแถวในตาราง admin_users';
                } else {
                    lb.style.display = 'none';
                }
            }
            renderAdminUsers();
            renderAdminVideos();
            renderAdminFeedbacks();
            renderCheckinQuestions();
            loadCheckinDashboard();
            if (!adminMemberList.hidden) renderAdminMembers();
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

    /** After member login from welcome/login/register: daily check-in first if not done today, else video list. */
    async function routeStudentAfterLoginFromGate() {
        if (!currentUser || currentUser.isAdmin) return;
        try {
            const today = getTodayYMD();
            const key = nameKey(currentUser.username);
            const rows = await withTimeout(ds.queryResponsesByNameKey(key), 8000);
            const doneToday = rows.some(r => r.date === today);
            navigateTo(doneToday ? pageVideos : pageQuiz);
        } catch (e) {
            console.error(e);
            navigateTo(pageVideos);
        }
    }

    function renderAdminFeedbacks() {
        const list = document.getElementById('admin-feedback-list');
        if (!list) return;
        list.innerHTML = '';
        let hasFeedback = false;
        videos.forEach(v => {
            if (v.feedbacks && v.feedbacks.length > 0) {
                hasFeedback = true;
                v.feedbacks.forEach(f => {
                    const div = document.createElement('div');
                    div.className = 'admin-list-item';
                    div.style.alignItems = 'flex-start';
                    div.innerHTML = `
                        <div style="flex:1;">
                            <div style="display:flex; justify-content:space-between; margin-bottom: 0.25rem;">
                                <strong style="color:var(--teal-700); font-size: 14px;">"${escapeHtml(f.text)}"</strong>
                            </div>
                            <div style="font-size:12px; color:var(--muted); line-height: 1.4;">
                                By <span style="font-weight: 600; color: var(--ink-2);">${escapeHtml(f.user)}</span> on video: ${escapeHtml(v.title)}
                            </div>
                            <div style="font-size:10px; color:var(--muted-2); margin-top: 0.25rem; font-family: var(--font-mono);">
                                ${new Date(f.date).toLocaleString()}
                            </div>
                        </div>
                    `;
                    list.appendChild(div);
                });
            }
        });
        if (!hasFeedback) list.innerHTML = '<p class="muted-empty">No positive feedbacks yet.</p>';
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
            regMsg.textContent = 'ชื่อนี้เป็นบัญชีทดสอบของระบบ — ใช้ Log in แทนการสมัคร';
            return;
        }
        if (allowedNames.length > 0 && !isLineNameOnAllowList(un, allowedNames)) {
            regMsg.textContent =
                'ชื่อนี้ไม่ตรงกับรายชื่อที่แอดมินอนุญาต — พิมพ์ชื่อ Line Open Chat ให้ตรงกับในรายการ (หรือติดต่อแอดมิน)';
            return;
        }
        if (registerSubmitBtn) registerSubmitBtn.disabled = true;
        (async () => {
            try {
                if (useLocalMemberAuth) {
                    const rec = await localMemberRegister(un, pw);
                    if (!rec.ok) {
                        regMsg.textContent =
                            rec.code === 'taken'
                                ? 'ชื่อนี้ถูกใช้ในเบราว์เซอร์นี้แล้ว — ลอง Log in หรือเปลี่ยนชื่อ'
                                : 'รหัสสั้นเกินไป — อย่างน้อย 6 ตัวอักษร';
                        return;
                    }
                    const uid = rec.uid;
                    const userData = {
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
                    };
                    localMemberPersistUser(userData);
                    registerForm.reset();
                    if (usernameInput) usernameInput.value = un;
                    if (passwordInput) passwordInput.value = '';
                    regMsg.textContent = '';
                    saveDraft('register', null);
                    showToast('สมัครแล้ว — เก็บในเบราว์เซอร์เครื่องนี้เท่านั้น (ไม่ใช้ Supabase Auth)');
                    navigateTo(pageLogin);
                    return;
                }
                const virtualEmail = un.toLowerCase().replace(/\s+/g, '') + "@med.local";
                const { data, error } = await ds.authSignUp(virtualEmail, pw);
                if (error) throw error;
                const u = data.user;
                if (!u) {
                    regMsg.textContent =
                        'สมัครไม่จบในครั้งเดียว — ให้ผู้ดูแลระบบตั้งค่า Supabase ให้สมัครแล้วเข้าได้ทันที (ไม่ต้องรอขั้นตอนอื่น)';
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
                await ds.saveProfileFull(userData);
                registerForm.reset();
                if (usernameInput) usernameInput.value = un;
                if (passwordInput) passwordInput.value = '';
                regMsg.textContent = '';
                saveDraft('register', null);
                showToast('สมัครสำเร็จ — เข้าสู่ระบบด้วยชื่อและรหัสเดิม');
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

        if (useLocalMemberAuth) {
            setLoginLoading(true);
            try {
                if (isEmbeddedTestLogin(un, pw)) {
                    const base = buildEmbeddedTestUser();
                    localMemberSetSessionUid(base.uid);
                    const existing = localMemberLoadProfile(base.uid);
                    const merged = existing
                        ? { ...existing, ...base, username: base.username, status: 'approved' }
                        : base;
                    localMemberPersistUser(merged);
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
                if (allowedNames.length > 0 && !isLineNameOnAllowList(un, allowedNames)) {
                    loginError.textContent =
                        'ชื่อนี้ไม่ตรงกับรายชื่อที่แอดมินอนุญาต — พิมพ์ชื่อ Line Open Chat ให้ตรงกับในรายการ (หรือติดต่อแอดมิน)';
                    loginError.style.display = 'block';
                    setLoginLoading(false);
                    return;
                }
                const v = await localMemberVerify(un, pw);
                if (!v.ok) {
                    loginError.textContent = 'ชื่อหรือรหัสไม่ถูกต้อง หรือยังไม่เคยสมัคร (บนเบราว์เซอร์นี้)';
                    loginError.style.display = 'block';
                    setLoginLoading(false);
                    return;
                }
                localMemberSetSessionUid(v.uid);
                const raw = localMemberLoadProfile(v.uid);
                if (!raw || !raw.username) {
                    loginError.textContent = 'ไม่พบข้อมูลโปรไฟล์ — สมัครใหม่';
                    loginError.style.display = 'block';
                    localMemberClearSession();
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
                const userName = normalizeLineAllowName(raw.username);
                const stillAllowed =
                    currentAllowed.length === 0 ||
                    currentAllowed.some((n) => normalizeLineAllowName(n) === userName);
                if (!stillAllowed) {
                    alert('Your name has been removed from the approved list. Please contact the admin.');
                    localMemberClearSession();
                    setLoginLoading(false);
                    return;
                }
                if (raw.status && raw.status !== 'approved') {
                    loginError.textContent =
                        'Your account is not approved yet. Please wait for an admin or contact support.';
                    loginError.style.display = 'block';
                    localMemberClearSession();
                    setLoginLoading(false);
                    return;
                }
                const exp = Number(raw.expiresAt);
                if (Number.isFinite(exp) && exp > 0 && Date.now() > exp) {
                    alert('Your access has expired. Please register again.');
                    localMemberClearSession();
                    setLoginLoading(false);
                    return;
                }
                currentUser = {
                    ...raw,
                    id: v.uid,
                    uid: v.uid,
                    isAdmin: false,
                    localMember: true
                };
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
                loginError.textContent = 'Still waiting — slow network or Supabase blocked. Check browser console.';
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

    function setAllCountdownLabels(html) {
        [countdownTimer, countdownTimerWatch, countdownTimerQuiz].forEach(el => { if (el) el.innerHTML = html; });
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

    /** โหลดแบบร่างแอดมิน (ถ้ามี) ทับค่าจากเซิร์ฟเวอร์ — ใช้ตอนเทสบน localhost */
    function applyAdminPanelDrafts(allowedNamesArr, deadlineMs) {
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
        const adminAllowedNames = document.getElementById('admin-allowed-names');
        const draftAllowed = loadDraftRaw('admin_allowed_names');
        if (adminAllowedNames && document.activeElement !== adminAllowedNames) {
            adminAllowedNames.value = draftAllowed !== null ? draftAllowed : joined;
        }
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
        if (currentUser && currentUser.localMember) {
            localMemberClearSession();
            currentUser = null;
            navigateTo(pageWelcome);
        } else {
            ds.authSignOut();
        }
    }

    function syncExamCountdown() {
        if (!currentUser || currentUser.isAdmin) {
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = null;
            setAllCountdownLabels('⏳ EXAM: —');
            return;
        }
        const resolved = resolveExamDeadline(currentUser);
        if (!resolved) {
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = null;
            setAllCountdownLabels('⏳ EXAM: no date scheduled');
            return;
        }
        if (Date.now() >= resolved.deadlineMs) {
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = null;
            setAllCountdownLabels(resolved.revokeSessionOnZero ? 'Expired' : '⏳ EXAM: ended');
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
                setAllCountdownLabels(revokeSessionOnZero ? 'Expired' : '⏳ EXAM: ended');
                if (revokeSessionOnZero) forceSignOutStudent();
                return;
            }
            const d = Math.floor(diff / 86400000);
            const h = Math.floor((diff / 3600000) % 24).toString().padStart(2, '0');
            const m = Math.floor((diff / 60000) % 60).toString().padStart(2, '0');
            const s = Math.floor((diff / 1000) % 60).toString().padStart(2, '0');
            setAllCountdownLabels(`⏳ EXAM in: ${d}d ${h}:${m}:${s}`);
        };
        tick();
        countdownInterval = setInterval(tick, 1000);
    }

    const btnCheckin = document.getElementById('btn-checkin');
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

    btnStats.addEventListener('click', () => { renderStats(); navigateTo(pageStats); });
    if (btnDecks) {
        btnDecks.addEventListener('click', () => {
            if (!currentUser) {
                showToast('กรุณาเข้าสู่ระบบก่อนเปิด Pharma Decks', 'error');
                return;
            }
            window.location.href = getDecksUrl();
        });
    }
    if (btnBeta) {
        btnBeta.addEventListener('click', () => {
            if (!currentUser) {
                showToast('กรุณาเข้าสู่ระบบก่อนใช้ Beta function', 'error');
                return;
            }
            if (!isBetaDailyExemptUser(currentUser) && hasUsedBetaToday(currentUser)) {
                showToast('Beta function ใช้ได้วันละ 1 ครั้ง — พรุ่งนี้ลองใหม่', 'info');
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
        });
    }
    btnBack.addEventListener('click', () => navigateTo(pageVideos));

    function renderSubjectPills() {
        if (!subjectPillsContainer) return;
        subjectPillsContainer.innerHTML = '';
        subjects.forEach(sub => {
            const btn = document.createElement('button');
            btn.className = `subject-pill ${selectedSubject === sub ? 'active' : ''}`;
            btn.textContent = formatSubjectName(sub);
            btn.onclick = () => { selectedSubject = sub; renderSubjectPills(); renderVideos(); };
            subjectPillsContainer.appendChild(btn);
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
                    pqFeedback.textContent = '✅ Great answer!';
                    pqFeedback.style.background = 'var(--ok-soft)';
                    pqFeedback.style.color = 'var(--ok)';
                } else if (expected) {
                    correct = false;
                    pqFeedback.textContent = `💡 Model answer includes: ${expected}`;
                    pqFeedback.style.background = 'var(--info-soft)';
                    pqFeedback.style.color = 'var(--info)';
                } else {
                    correct = null;
                    pqFeedback.textContent = '✅ Answer recorded.';
                    pqFeedback.style.background = 'var(--info-soft)';
                    pqFeedback.style.color = 'var(--info)';
                }
            } else {
                userAnswer = selectedChoice;
                correct = selectedChoice === currentQuizData.ans;
                if (correct) {
                    pqFeedback.textContent = '✅ Correct!';
                    pqFeedback.style.background = 'var(--ok-soft)';
                    pqFeedback.style.color = 'var(--ok)';
                } else {
                    pqFeedback.textContent = `❌ Incorrect. Correct answer: ${currentQuizData.ans}`;
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
                ds.appendQuizHistory(currentUser.uid, record).catch((e) => console.error(e));
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
                            ? 'บันทึกความคิดเห็นไม่ทัน — ดำเนินการต่อ (ลองเช็คเน็ตหรือ Supabase)'
                            : 'บันทึกความคิดเห็นลงเซิร์ฟเวอร์ไม่สำเร็จ — ดำเนินการต่อ',
                        'error'
                    );
                }
                saveDraft('video_feedback', null);
            }
            videoFeedback.value = '';
            watchIframe.src = '';
            incrementVideoStreak();

            const raw = currentWatchVideo && currentWatchVideo.quiz;
            const qList = (Array.isArray(raw) ? raw : raw ? [raw] : []).filter((q) => q && typeof q === 'object' && q.q);
            if (qList.length > 0) {
                showPostQuiz(currentWatchVideo);
                if (feedback) showToast('บันทึกความคิดเห็นแล้ว');
                else showToast('ไปทำแบบทดสอบหลังดู');
            } else {
                navigateTo(pageVideos);
                if (feedback) showToast('บันทึกความคิดเห็นแล้ว');
                else showToast('บันทึกความคืบหน้าแล้ว');
            }
        } finally {
            btnVideoFinished.disabled = false;
            btnVideoFinished.textContent = prevLabel;
        }
    });

    btnLogout.addEventListener('click', () => {
        if (currentUser && currentUser.localMember) {
            localMemberClearSession();
            currentUser = null;
            showToast('ออกจากระบบแล้ว', 'info');
            navigateTo(pageWelcome);
            return;
        }
        ds.authSignOut().then(() => {
            showToast('ออกจากระบบแล้ว', 'info');
            navigateTo(pageWelcome);
        });
    });
    btnAdminLogout.addEventListener('click', () => {
        try {
            if (typeof sessionStorage !== 'undefined') {
                sessionStorage.removeItem('clinical_video_admin_gate');
            }
        } catch (_) { /* noop */ }
        currentUser = null;
        const signOut = supabaseConfigReady ? ds.authSignOut().catch(() => {}) : Promise.resolve();
        signOut.finally(() => {
            showToast('ออกจากแอดมินแล้ว', 'info');
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
        btnAdminModalSubmit.textContent = 'เข้าสู่ระบบ';
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
        btnAdminModalSubmit.textContent = 'เข้าสู่ระบบ';
    }

    function formatAdminSignInError(err) {
        const code = err && err.code;
        const msg = String((err && err.message) || '');
        if (code === 'invalid_credentials' || msg.includes('Invalid login credentials')) {
            return 'รหัสไม่ถูกต้อง หรือยังไม่มีบัญชีแอดมินในระบบ — ตรวจที่ Supabase ว่าสร้างบัญชีแอดมินและรหัสตรงกัน';
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
                'Supabase จำกัดความถี่ (429) — รอสักครู่หรือปรับที่ Dashboard → Authentication → Rate limits'
            );
        }
        if (code === 'email_not_confirmed' || msg.toLowerCase().includes('confirm')) {
            return 'ระบบยังไม่ให้เข้า — ให้ผู้ดูแล Supabase ปิดขั้นตอน “ยืนยันก่อนเข้า” ใน Authentication (จะได้ไม่ต้องรอขั้นตอนใดๆ)';
        }
        if (msg.includes('JWT') || msg.includes('apikey') || msg.includes('API key')) {
            return 'คีย์ API ไม่ตรง — ใน Project Settings → API ลองใช้คีย์ anon (JWT ยาว) ใน supabase-config.js';
        }
        if (code === 'NO_USER') {
            return 'เข้าไม่ได้ชั่วคราว — ลองอีกครั้ง';
        }
        if (code === 'NOT_ADMIN') {
            return 'เข้าได้แล้วแต่ยังไม่ถูกใส่ใน admin_users — รัน insert into public.admin_users (user_id) values (\'<uuid จาก Auth>\'); สำหรับบัญชี ADMIN_AUTH_EMAIL หรือ SYSTEM_ADMIN_AUTH_EMAIL';
        }
        if (code === 'NO_ADMIN_EMAIL') {
            return 'ไม่มีอีเมลแอดมินใน config — ตั้ง ADMIN_AUTH_EMAIL (และถ้าต้องการ SYSTEM_ADMIN_AUTH_EMAIL) ใน js/supabase-config.js';
        }
        return msg || 'เข้าไม่สำเร็จ';
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
                        currentUser.localPasswordAdmin = false;
                        const lb = document.getElementById('local-admin-banner');
                        if (lb) lb.style.display = 'none';
                    }
                }).catch(() => {});
            }
        }
    }

    /** Try Supabase sign-in for each configured admin email until one has admin_users row. */
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
            lastErr = Object.assign(new Error('Not in admin_users'), { code: 'NOT_ADMIN' });
        }
        if (lastErr) throw lastErr;
        throw Object.assign(new Error('No admin login attempted'), { code: 'NO_ADMIN_EMAIL' });
    }

    btnAdminModalSubmit.addEventListener('click', async () => {
        const password = String(adminPasswordInput.value || '').trim();
        if (!password) return;

        adminLoginError.style.display = 'none';
        btnAdminModalSubmit.disabled = true;
        btnAdminModalSubmit.textContent = 'กำลังเข้า…';

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
                'ยังไม่ได้ตั้งค่า Supabase — หรือตั้ง ADMIN_GATE_PASSWORD / SYSTEM_ADMIN_GATE_PASSWORD ใน js/supabase-config.js ให้ตรงรหัสที่กรอก';
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
                adminLoginError.textContent = 'เซิร์ฟเวอร์ไม่ตอบทัน — ลองใหม่';
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
    if (btnSaveAllowedNames) {
        btnSaveAllowedNames.addEventListener('click', () => {
            const val = document.getElementById('admin-allowed-names').value;
            allowedNames = val.split(/[\n,]/).map((s) => s.trim()).filter(Boolean);
            saveAllowedNamesDB()
                .then(() => {
                    showToast('บันทึกรายชื่อที่อนุญาตแล้ว');
                    saveDraft('admin_allowed_names', null);
                })
                .catch(() => {
                    /* saveAllowedNamesDB already alerted */
                });
        });
    }

    const btnClearAllowedNames = document.getElementById('btn-clear-allowed-names');
    if (btnClearAllowedNames) {
        btnClearAllowedNames.addEventListener('click', () => {
            if (!confirm('Clear all allowed names?')) return;
            allowedNames = [];
            document.getElementById('admin-allowed-names').value = '';
            saveAllowedNamesDB()
                .then(() => {
                    showToast('ล้างรายชื่อที่อนุญาตแล้ว');
                    saveDraft('admin_allowed_names', null);
                })
                .catch(() => {
                    /* saveAllowedNamesDB already alerted */
                });
        });
    }

    const btnSaveExamDeadline = document.getElementById('btn-save-exam-deadline');
    const btnClearExamDeadline = document.getElementById('btn-clear-exam-deadline');
    if (btnSaveExamDeadline) {
        btnSaveExamDeadline.addEventListener('click', () => {
            const input = document.getElementById('admin-exam-deadline');
            const ms = parseDatetimeLocalInput(input && input.value);
            ds.saveAdminSettingsPatch({ exam_deadline_ms: ms != null ? ms : null })
                .then(() => {
                    showToast('บันทึกวันสอบแล้ว');
                    saveDraft('admin_exam_deadline', null);
                })
                .catch((err) => {
                    const base = err && err.message ? err.message : String(err);
                    let msg = 'Save failed: ' + base;
                    if (currentUser && currentUser.localPasswordAdmin) {
                        msg +=
                            '\n\nเข้าผ่านรหัสลับอย่างเดียวไม่มีสิทธิ์แก้ไขตาราง — ให้ล็อกอิน Admin ด้วยบัญชีใน public.admin_users';
                    }
                    alert(msg);
                });
        });
    }
    if (btnClearExamDeadline) {
        btnClearExamDeadline.addEventListener('click', () => {
            if (!confirm('Clear shared exam deadline for all students?')) return;
            const input = document.getElementById('admin-exam-deadline');
            if (input) input.value = '';
            ds.saveAdminSettingsPatch({ exam_deadline_ms: null })
                .then(() => {
                    showToast('ล้างวันสอบร่วมแล้ว');
                    saveDraft('admin_exam_deadline', null);
                })
                .catch((err) => {
                    const base = err && err.message ? err.message : String(err);
                    let msg = 'Clear failed: ' + base;
                    if (currentUser && currentUser.localPasswordAdmin) {
                        msg +=
                            '\n\nเข้าผ่านรหัสลับอย่างเดียวไม่มีสิทธิ์แก้ไขตาราง — ให้ล็อกอิน Admin ด้วยบัญชีใน public.admin_users';
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
                subjectAddError.textContent = 'กรุณากรอกชื่อวิชา';
                subjectAddError.style.display = 'block';
            }
            return;
        }
        const key = String(raw).trim().toLowerCase();
        if (subjects.includes(key)) {
            if (subjectAddError) {
                subjectAddError.textContent = 'มีวิชานี้อยู่แล้ว';
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
                'เพิ่มวิชา "' + key + '" ในเซสชันนี้ — ตั้งค่า Supabase เพื่อบันทึกถาวร',
                'info'
            );
            return;
        }

        saveSubjectsDB()
            .then(() => showToast('เพิ่มวิชา "' + key + '" แล้ว'))
            .catch(() => {
                subjects = subjects.filter((s) => s !== key);
                renderSubjectOptions();
                renderSubjectPills();
                if (newVideoSubject && subjects.length) {
                    newVideoSubject.value = subjects.includes(selectedSubject)
                        ? selectedSubject
                        : subjects[0];
                }
                showToast('บันทึกวิชาไม่สำเร็จ — ตรวจสิทธิ์ Supabase หรือล็อกอินแอดมินแบบเต็ม', 'error');
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
            saveUsersDB({ successToast: 'ล้างรายชื่อสมาชิกทั้งหมดแล้ว' });
            renderAdminMembers();
        });
    }

    const btnClearViews = document.getElementById('btn-clear-views');
    if (btnClearViews) {
        btnClearViews.addEventListener('click', () => {
            if (!confirm('Reset all video views to 0?')) return;
            videos.forEach(v => { v.views = 0; });
            saveVideosDB({ successToast: 'รีเซ็ตยอดดูวิดีโอแล้ว' });
            renderVideos();
        });
    }

    const btnClearFeedbacks = document.getElementById('btn-clear-feedbacks');
    if (btnClearFeedbacks) {
        btnClearFeedbacks.addEventListener('click', () => {
            if (!confirm('Clear all positive feedbacks?')) return;
            videos.forEach(v => { v.feedbacks = []; });
            saveVideosDB({ successToast: 'ล้างความคิดเห็นแล้ว' });
            renderAdminFeedbacks();
        });
    }

    const btnRefreshFeedbacks = document.getElementById('btn-refresh-feedbacks');
    if (btnRefreshFeedbacks) {
        btnRefreshFeedbacks.addEventListener('click', () => {
            renderAdminFeedbacks();
            showToast('รีเฟรชรายการความคิดเห็นแล้ว', 'info');
        });
    }

    btnAddVideo.addEventListener('click', () => {
        const wasEditing = editVideoId !== null;
        const url = newVideoUrl.value.trim();
        const vId = extractVideoId(url);
        if (!vId) return alert('Invalid URL');

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

        if (editVideoId !== null) {
            const idx = videos.findIndex(v => v.id === editVideoId);
            if (idx !== -1) {
                videos[idx] = { ...videos[idx], videoId: vId, url: `https://www.youtube.com/embed/${vId}`, title: newVideoTitle.value.trim(), subject: newVideoSubject.value, quiz: quiz.length > 0 ? quiz : null };
            }
            editVideoId = null;
            btnAddVideo.textContent = 'Attach video';
            if (btnCancelEditVideo) btnCancelEditVideo.style.display = 'none';
        } else {
            const vidData = { id: Date.now(), subject: newVideoSubject.value, url: `https://www.youtube.com/embed/${vId}`, videoId: vId, title: newVideoTitle.value.trim(), views: 0, quiz: quiz.length > 0 ? quiz : null };
            videos.push(vidData);
        }

        newVideoUrl.value = '';
        newVideoTitle.value = '';
        if (quizQuestionsList) quizQuestionsList.innerHTML = '';
        saveVideosDB({
            successToast: wasEditing ? 'บันทึกการแก้ไขวิดีโอแล้ว' : 'เพิ่มวิดีโอแล้ว'
        });
        saveDraft('admin_new_video', null);
        renderVideos();
    });

    if (useLocalMemberAuth) {
        const loc = localMemberTryRestore();
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

    if (pageWelcome && pageWelcome.classList.contains('active')) {
        document.body.classList.add('welcome-hero-active');
        const heartHost = document.getElementById('welcome-heart-host');
        if (heartHost) initWelcomeHeartScene(heartHost).catch(() => {});
    }
});
