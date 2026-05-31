/**
 * Member auth without Supabase Auth — accounts + profiles live in localStorage only.
 * Suitable for small / internal cohorts; not multi-device sync; not server-grade security.
 */

const ACCOUNTS_KEY = 'clinical_local_member_accounts_v1';
const SESSION_UID_KEY = 'clinical_local_member_uid';
const PROFILE_PREFIX = 'clinical_local_member_profile_v1:';

const PEPPER = 'clinical-video-local-member-v1';

function accountKey(username) {
    return String(username ?? '')
        .trim()
        .toLowerCase();
}

async function hashPassword(username, password) {
    const enc = new TextEncoder();
    const data = enc.encode(`${PEPPER}\n${accountKey(username)}\n${password}`);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function readAccounts() {
    try {
        const raw = localStorage.getItem(ACCOUNTS_KEY);
        if (!raw) return { accounts: {} };
        const o = JSON.parse(raw);
        if (!o || typeof o.accounts !== 'object') return { accounts: {} };
        return o;
    } catch {
        return { accounts: {} };
    }
}

function writeAccounts(store) {
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(store));
}

function profileStorageKey(uid) {
    return PROFILE_PREFIX + uid;
}

/** @returns {{ ok: true } | { ok: false, code: 'taken'|'weak' }} */
export async function localMemberRegister(username, password) {
    const key = accountKey(username);
    if (!key) return { ok: false, code: 'weak' };
    if (password.length < 6) return { ok: false, code: 'weak' };
    const store = readAccounts();
    if (store.accounts[key]) return { ok: false, code: 'taken' };
    const uid = crypto.randomUUID();
    const pw = await hashPassword(username, password);
    store.accounts[key] = { uid, pw };
    writeAccounts(store);
    return { ok: true, uid };
}

/** @returns {{ ok: true, uid: string } | { ok: false, code: 'invalid' }} */
export async function localMemberVerify(username, password) {
    const key = accountKey(username);
    if (!key || password.length < 1) return { ok: false, code: 'invalid' };
    const store = readAccounts();
    const row = store.accounts[key];
    if (!row) return { ok: false, code: 'invalid' };
    const pw = await hashPassword(username, password);
    if (pw !== row.pw) return { ok: false, code: 'invalid' };
    return { ok: true, uid: row.uid };
}

export function localMemberSetSessionUid(uid) {
    try {
        sessionStorage.setItem(SESSION_UID_KEY, uid);
    } catch (_) {
        /* private mode */
    }
}

export function localMemberClearSession() {
    try {
        sessionStorage.removeItem(SESSION_UID_KEY);
    } catch (_) {
        /* noop */
    }
}

export function localMemberGetSessionUid() {
    try {
        return sessionStorage.getItem(SESSION_UID_KEY);
    } catch {
        return null;
    }
}

/** Persist full app user object (must include uid) */
export function localMemberPersistUser(user) {
    const uid = user && (user.uid || user.id);
    if (!uid) return;
    const copy = { ...user };
    delete copy.isAdmin;
    delete copy.localMember;
    delete copy.localPasswordAdmin;
    delete copy.systemAdmin;
    try {
        localStorage.setItem(profileStorageKey(uid), JSON.stringify(copy));
    } catch (e) {
        console.error('localMemberPersistUser', e);
    }
}

/** @returns {object | null} raw stored user fields */
export function localMemberLoadProfile(uid) {
    try {
        const raw = localStorage.getItem(profileStorageKey(uid));
        if (!raw) return null;
        return JSON.parse(raw);
    } catch {
        return null;
    }
}

/** @returns {object | null} */
export function localMemberTryRestore() {
    const uid = localMemberGetSessionUid();
    if (!uid) return null;
    const row = localMemberLoadProfile(uid);
    if (!row || !row.username) {
        localMemberClearSession();
        return null;
    }
    return {
        ...row,
        id: uid,
        uid,
        isAdmin: false,
        localMember: true
    };
}
