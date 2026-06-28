import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.8/+esm';

/** Map profiles table row → user object used by script.js */
export function profileRowToUser(row) {
    if (!row) return null;
    const extra = row.extra && typeof row.extra === 'object' ? row.extra : {};
    const { quizHistory, ...restExtra } = extra;
    const u = {
        id: row.id,
        uid: row.id,
        username: row.username,
        status: row.status,
        expiresAt: row.expires_at,
        createdAt: row.created_at,
        videoStreak: row.video_streak ?? 0,
        checkinStreak: row.checkin_streak ?? 0,
        lastCheckinDate: row.last_checkin_date,
        lastVideoDate: row.last_video_date,
        quizHistory: quizHistory || {}
    };
    Object.assign(u, restExtra);
    // Column values always win — legacy `extra` blobs may still contain streak copies that would overwrite.
    u.id = row.id;
    u.uid = row.id;
    u.username = row.username;
    u.status = row.status;
    u.expiresAt = row.expires_at;
    u.createdAt = row.created_at;
    u.videoStreak = row.video_streak ?? 0;
    u.checkinStreak = row.checkin_streak ?? 0;
    u.lastCheckinDate = row.last_checkin_date;
    u.lastVideoDate = row.last_video_date;
    u.quizHistory = quizHistory && typeof quizHistory === 'object' ? quizHistory : {};
    return u;
}

function userToUpsert(user) {
    const uid = user.uid || user.id;
    const qh = user.quizHistory;
    const { quizHistory: _q, isAdmin: _a, ...rest } = user;
    const extra = { ...rest };
    delete extra.uid;
    delete extra.id;
    delete extra.isAdmin;
    delete extra.username;
    delete extra.status;
    delete extra.expiresAt;
    delete extra.videoStreak;
    delete extra.checkinStreak;
    delete extra.lastCheckinDate;
    delete extra.lastVideoDate;
    if (qh !== undefined) extra.quizHistory = qh;
    const row = {
        id: uid,
        username: user.username ?? null,
        status: user.status ?? 'approved',
        expires_at: user.expiresAt ?? null,
        video_streak: user.videoStreak ?? 0,
        checkin_streak: user.checkinStreak ?? 0,
        last_checkin_date: user.lastCheckinDate ?? null,
        last_video_date: user.lastVideoDate ?? null,
        extra
    };
    if (user.createdAt != null) row.created_at = user.createdAt;
    return row;
}

function normalizeCheckinQuestionRow(row) {
    const body = row && row.body && typeof row.body === 'object' ? row.body : {};
    const storageKey = row.q_date;
    const isPoolKey = String(storageKey || '').startsWith('pool:');
    const id = body.id || body.poolId || (isPoolKey ? String(storageKey).slice(5) : storageKey);
    return {
        ...body,
        id,
        poolId: body.poolId || id,
        storageKey,
        date: body.date || (isPoolKey ? '' : storageKey)
    };
}

function checkinDateHash(value) {
    let hash = 2166136261;
    for (let i = 0; i < String(value).length; i += 1) {
        hash ^= String(value).charCodeAt(i);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}

function pickDailyCheckinQuestion(rows, dateStr) {
    const eligible = rows
        .filter((q) => q && q.active !== false && typeof q.question === 'string' && q.question.trim())
        .sort((a, b) => String(a.storageKey || a.id).localeCompare(String(b.storageKey || b.id)));
    if (!eligible.length) return null;
    return eligible[checkinDateHash(dateStr) % eligible.length];
}

export function createDataService(supabaseUrl, supabaseAnonKey) {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });

    return {
        supabase,

        async fetchRole(uid) {
            try {
                const { data, error } = await supabase
                    .from('user_roles')
                    .select('role')
                    .eq('user_id', uid)
                    .maybeSingle();
                if (error) throw error;
                return data?.role || 'student';
            } catch (err) {
                if (String(err?.message || '').includes('user_roles')) return 'student';
                throw err;
            }
        },

        async isAdmin(uid) {
            try {
                const role = await this.fetchRole(uid);
                if (role === 'admin' || role === 'teacher') return true;
            } catch (err) {
                console.warn('[roles] Falling back to legacy admin_users check:', err);
            }
            const { data, error } = await supabase
                .from('admin_users')
                .select('user_id')
                .eq('user_id', uid)
                .maybeSingle();
            if (error) throw error;
            return !!data;
        },

        async fetchProfile(uid) {
            const { data, error } = await supabase
                .from('profiles')
                .select('*')
                .eq('id', uid)
                .maybeSingle();
            if (error) throw error;
            return data;
        },

        async fetchAllowedNames() {
            const { data, error } = await supabase
                .from('admin_settings')
                .select('allowed_names')
                .eq('id', 1)
                .single();
            if (error) throw error;
            const v = data.allowed_names;
            return Array.isArray(v) ? v : Object.values(v || {});
        },

        async saveProfileFull(user) {
            const row = userToUpsert(user);
            const { error } = await supabase.from('profiles').upsert(row, { onConflict: 'id' });
            if (error) throw error;
        },

        async appendQuizHistory(uid, record) {
            const { data: row, error: rErr } = await supabase.from('profiles').select('extra').eq('id', uid).maybeSingle();
            if (rErr) throw rErr;
            const extra = (row && row.extra) || {};
            if (!extra.quizHistory || typeof extra.quizHistory !== 'object') extra.quizHistory = {};
            let key = String(Date.now());
            if (extra.quizHistory[key]) {
                key = key + '_' + Math.random().toString(36).slice(2, 8);
            }
            extra.quizHistory[key] = record;
            const { error } = await supabase.from('profiles').update({ extra }).eq('id', uid);
            if (error) throw error;
        },

        async saveVideosArray(videos) {
            const { error } = await supabase.from('video_library').update({ videos }).eq('id', 1);
            if (error) throw error;
        },

        async incrementVideoView(videoId) {
            const { data, error } = await supabase.rpc('increment_video_view', {
                target_video_id: videoId
            });
            if (error) throw error;
            return Number.isFinite(Number(data)) ? Number(data) : null;
        },

        async saveAdminSettingsPatch(parts) {
            const { error } = await supabase.from('admin_settings').update(parts).eq('id', 1);
            if (error) throw error;
        },

        authSignUp(email, password) {
            return supabase.auth.signUp({ email, password });
        },

        authSignIn(email, password) {
            return supabase.auth.signInWithPassword({ email, password });
        },

        authSignOut() {
            return supabase.auth.signOut();
        },

        onAuthStateChange(callback) {
            return supabase.auth.onAuthStateChange(callback);
        },

        async fetchAllProfilesForMembers() {
            const { data, error } = await supabase.from('profiles').select('*');
            if (error) throw error;
            return (data || []).map(profileRowToUser);
        },

        async deleteProfilesByIds(uids) {
            if (!uids.length) return;
            const { error } = await supabase.from('profiles').delete().in('id', uids);
            if (error) throw error;
        },

        /** Replace whole members list: delete removed, upsert current */
        async syncMembersFromUsersArray(usersArray) {
            const existing = await this.fetchAllProfilesForMembers();
            const newIds = new Set(usersArray.map((u) => u.uid || u.id).filter(Boolean));
            const toRemove = existing.map((u) => u.id).filter((id) => !newIds.has(id));
            if (toRemove.length) await this.deleteProfilesByIds(toRemove);
            for (const u of usersArray) {
                if (!u.uid && !u.id) continue;
                await this.saveProfileFull(u);
            }
        },

        async fetchCheckinQuestionForDate(dateStr) {
            const { data, error } = await supabase
                .from('checkin_questions')
                .select('q_date, body');
            if (error) throw error;
            return pickDailyCheckinQuestion((data || []).map(normalizeCheckinQuestionRow), dateStr);
        },

        async fetchAllCheckinQuestions() {
            const { data, error } = await supabase.from('checkin_questions').select('q_date, body');
            if (error) throw error;
            return (data || []).map(normalizeCheckinQuestionRow);
        },

        async saveCheckinQuestion(storageKey, body) {
            const key = String(storageKey || body.storageKey || body.poolId || body.id || '').trim();
            if (!key) throw new Error('Missing check-in question id');
            const { error } = await supabase
                .from('checkin_questions')
                .upsert({ q_date: key, body }, { onConflict: 'q_date' });
            if (error) throw error;
        },

        async removeCheckinQuestion(storageKey) {
            const { error } = await supabase.from('checkin_questions').delete().eq('q_date', storageKey);
            if (error) throw error;
        },

        async pushCheckinResponse(payload) {
            const { error } = await supabase.from('checkin_responses').insert({ payload });
            if (error) throw error;
        },

        async queryResponsesByNameKey(nameKey) {
            const { data, error } = await supabase
                .from('checkin_responses')
                .select('payload')
                .eq('payload->>name_key', nameKey);
            if (error) throw error;
            return (data || []).map((r) => r.payload);
        },

        async fetchAllCheckinResponses() {
            const { data, error } = await supabase.from('checkin_responses').select('payload');
            if (error) throw error;
            return (data || []).map((r) => r.payload);
        },

        /**
         * Subscribe to video_library + admin_settings + profiles changes.
         * Callback: ({ videos, allowedNames, subjects, examDeadlineMs, examNote, profileRows }) => void
         */
        subscribeDataBundle(onChange, { seedVideosIfEmpty }) {
            const push = async () => {
                const [{ data: vrow, error: ve }, adminResult, { data: prows, error: pe }] =
                    await Promise.all([
                        supabase.from('video_library').select('videos').eq('id', 1).single(),
                        supabase.from('admin_settings').select('allowed_names, subjects, exam_deadline_ms, exam_note').eq('id', 1).single(),
                        supabase.from('profiles').select('*')
                    ]);
                let { data: arow, error: ae } = adminResult;
                if (ae && String(ae.message || '').includes('exam_note')) {
                    const fallback = await supabase
                        .from('admin_settings')
                        .select('allowed_names, subjects, exam_deadline_ms')
                        .eq('id', 1)
                        .single();
                    arow = fallback.data;
                    ae = fallback.error;
                }
                if (ve) console.error(ve);
                if (ae) console.error(ae);
                if (pe) console.error(pe);
                let videos = vrow?.videos;
                if (videos && !Array.isArray(videos) && typeof videos === 'object') {
                    videos = Object.values(videos);
                }
                if (!Array.isArray(videos) || videos.length === 0) {
                    videos = typeof seedVideosIfEmpty === 'function' ? seedVideosIfEmpty() : [];
                }
                let allowedNames = arow?.allowed_names;
                allowedNames = Array.isArray(allowedNames) ? allowedNames : Object.values(allowedNames || {});
                let subjects = arow?.subjects;
                subjects = Array.isArray(subjects) ? subjects : Object.values(subjects || {});
                if (!subjects || subjects.length === 0) subjects = ['anatomy', 'histology'];

                onChange({
                    videos,
                    allowedNames,
                    subjects,
                    examDeadlineMs: arow?.exam_deadline_ms != null ? Number(arow.exam_deadline_ms) : null,
                    examNote: typeof arow?.exam_note === 'string' ? arow.exam_note : '',
                    profileRows: prows || []
                });
            };

            push().catch((err) => console.error('subscribeDataBundle initial push failed', err));

            const ch = supabase
                .channel('data-bundle')
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'video_library' },
                    () => {
                        push();
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'admin_settings' },
                    () => {
                        push();
                    }
                )
                .on(
                    'postgres_changes',
                    { event: '*', schema: 'public', table: 'profiles' },
                    () => {
                        push();
                    }
                )
                .subscribe(async (status) => {
                    if (status === 'SUBSCRIBED') await push();
                });

            return () => {
                supabase.removeChannel(ch);
            };
        },

        async fetchContentRequests() {
            const { data, error } = await supabase
                .from('content_requests')
                .select('*')
                .order('created_at', { ascending: false });
            if (error) throw error;
            return data || [];
        },

        async createContentRequest(username, title, subject, details) {
            const { data, error } = await supabase
                .from('content_requests')
                .insert({ username, title, subject, details })
                .select()
                .single();
            if (error) throw error;
            return data;
        },

        async updateContentRequestStatus(id, status) {
            const { error } = await supabase
                .from('content_requests')
                .update({ status })
                .eq('id', id);
            if (error) throw error;
        },

        async deleteContentRequest(id) {
            const { error } = await supabase
                .from('content_requests')
                .delete()
                .eq('id', id);
            if (error) throw error;
        }
    };
}
