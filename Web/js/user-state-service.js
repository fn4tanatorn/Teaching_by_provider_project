import { profileRowToUser } from './data-service.js';
import {
    localMemberClearSession,
    localMemberLoadProfile,
    localMemberPersistUser,
    localMemberRegister,
    localMemberSetSessionUid,
    localMemberTryRestore,
    localMemberVerify
} from './local-member-auth.js';

function isLocalMember(user) {
    return Boolean(user && user.localMember);
}

export function createUserStateService({ dataService, useLocalMemberStorage = false }) {
    async function saveProfile(user) {
        if (!user) return null;
        if (useLocalMemberStorage && isLocalMember(user)) {
            localMemberPersistUser(user);
            return user;
        }
        await dataService.saveProfileFull(user);
        return user;
    }

    async function appendQuizHistory(user, record) {
        if (!user || !record) return;
        if (useLocalMemberStorage && isLocalMember(user)) {
            const nextHistory =
                user.quizHistory && typeof user.quizHistory === 'object'
                    ? { ...user.quizHistory }
                    : {};
            let key = String(Date.now());
            if (nextHistory[key]) key = `${key}_${Math.random().toString(36).slice(2, 8)}`;
            nextHistory[key] = record;
            user.quizHistory = nextHistory;
            localMemberPersistUser(user);
            return;
        }
        await dataService.appendQuizHistory(user.uid || user.id, record);
    }

    function restoreLocalSession() {
        if (!useLocalMemberStorage) return null;
        return localMemberTryRestore();
    }

    function hydrateEmbeddedLocalUser(baseUser) {
        localMemberSetSessionUid(baseUser.uid);
        const existing = localMemberLoadProfile(baseUser.uid);
        const merged = existing
            ? { ...existing, ...baseUser, username: baseUser.username, status: 'approved' }
            : baseUser;
        localMemberPersistUser(merged);
        return merged;
    }

    async function registerLocalMember(username, password, buildUser) {
        const result = await localMemberRegister(username, password);
        if (!result.ok) return result;
        const user = buildUser(result.uid);
        localMemberPersistUser(user);
        return { ok: true, uid: result.uid, user };
    }

    async function loginLocalMember(username, password) {
        const verified = await localMemberVerify(username, password);
        if (!verified.ok) return verified;

        localMemberSetSessionUid(verified.uid);
        const rawUser = localMemberLoadProfile(verified.uid);
        if (!rawUser || !rawUser.username) {
            localMemberClearSession();
            return { ok: false, code: 'missing_profile' };
        }

        return {
            ok: true,
            uid: verified.uid,
            user: {
                ...rawUser,
                id: verified.uid,
                uid: verified.uid,
                isAdmin: false,
                localMember: true
            }
        };
    }

    async function refreshProfile(uid) {
        const row = await dataService.fetchProfile(uid);
        return row ? profileRowToUser(row) : null;
    }

    async function signOut(user, options = {}) {
        const { signOutRemote = true } = options;
        if (isLocalMember(user)) {
            localMemberClearSession();
            return;
        }
        if (signOutRemote) {
            await dataService.authSignOut().catch(() => {});
        }
    }

    return {
        appendQuizHistory,
        hydrateEmbeddedLocalUser,
        loginLocalMember,
        refreshProfile,
        registerLocalMember,
        restoreLocalSession,
        saveProfile,
        signOut
    };
}
