// Облачный сервис «Пульт-40»: авторизация, сохранение прогресса и таблица лидеров (Supabase)

window.CloudService = (function () {
  const SUPABASE_URL = 'https://csnjgqglbqpdeagschbt.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_ELdsoK7g24X8L-Sbco4Qkw_bKs66WnI';

  let client = null;
  let currentUser = null;
  let currentProfile = null;
  let authCallback = null;
  let syncTimer = null;

  function isAvailable() {
    return Boolean(client);
  }

  function getUser() {
    return currentUser;
  }

  function getProfile() {
    return currentProfile;
  }

  function isAdmin() {
    return Boolean(currentProfile && currentProfile.is_admin === true);
  }

  function sanitizeCallsign(raw, email) {
    const cleaned = String(raw || '').trim().slice(0, 24);
    if (cleaned.length >= 2) return cleaned;
    if (email && email.includes('@')) {
      return email.split('@')[0].slice(0, 20);
    }
    return 'Дежурный';
  }

  async function loadOrCreateProfile(user, fallbackCallsign) {
    if (!client || !user) return null;

    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();

    if (error) {
      console.warn('Supabase load profile error:', error.message);
      return null;
    }

    if (data) {
      currentProfile = data;
      return data;
    }

    const callsign = sanitizeCallsign(
      fallbackCallsign || user.user_metadata?.callsign,
      user.email
    );

    const newProfile = {
      id: user.id,
      callsign,
      score: 0,
      best_shift_score: 0,
      total_perfect: 0,
      upgrades: [],
      difficulty: 'medium'
    };

    const { data: inserted, error: insErr } = await client
      .from('profiles')
      .insert(newProfile)
      .select()
      .single();

    if (insErr) {
      console.warn('Supabase create profile error:', insErr.message);
      currentProfile = newProfile;
      return newProfile;
    }

    currentProfile = inserted;
    return inserted;
  }

  async function init(onAuthChange) {
    authCallback = onAuthChange;
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      console.warn('Supabase SDK не загружен — работаем в локальном режиме.');
      return false;
    }

    try {
      client = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    } catch (e) {
      console.warn('Supabase init failed:', e);
      return false;
    }

    try {
      const { data } = await client.auth.getSession();
      if (data && data.session && data.session.user) {
        currentUser = data.session.user;
        await loadOrCreateProfile(currentUser);
        if (authCallback) authCallback(currentUser, currentProfile);
      }
    } catch (e) {
      console.warn('Supabase getSession failed:', e);
    }

    client.auth.onAuthStateChange(async (_event, session) => {
      const nextUser = session ? session.user : null;
      const changed = (nextUser?.id || null) !== (currentUser?.id || null);
      currentUser = nextUser;
      if (currentUser) {
        await loadOrCreateProfile(currentUser);
      } else {
        currentProfile = null;
      }
      if (changed && authCallback) {
        authCallback(currentUser, currentProfile);
      }
    });

    return true;
  }

  async function signUp(email, password, callsign) {
    if (!client) return { error: 'Нет подключения к облаку.' };
    const cleanSign = sanitizeCallsign(callsign, email);

    const { data, error } = await client.auth.signUp({
      email: email.trim(),
      password,
      options: {
        data: { callsign: cleanSign }
      }
    });

    if (error) return { error: translateAuthError(error.message) };

    if (data.user && data.session) {
      currentUser = data.user;
      await loadOrCreateProfile(currentUser, cleanSign);
      if (authCallback) authCallback(currentUser, currentProfile);
      return { ok: true, needsConfirm: false };
    }

    return {
      ok: true,
      needsConfirm: true,
      message: 'Регистрация прошла! Проверьте почту и подтвердите email, затем войдите.'
    };
  }

  async function signIn(email, password) {
    if (!client) return { error: 'Нет подключения к облаку.' };
    const { data, error } = await client.auth.signInWithPassword({
      email: email.trim(),
      password
    });

    if (error) return { error: translateAuthError(error.message) };

    currentUser = data.user;
    await loadOrCreateProfile(currentUser);
    if (authCallback) authCallback(currentUser, currentProfile);
    return { ok: true };
  }

  async function signOut() {
    if (!client) return;
    await client.auth.signOut();
    currentUser = null;
    currentProfile = null;
    if (authCallback) authCallback(null, null);
  }

  async function updateCallsign(newCallsign) {
    if (!client || !currentUser) return { error: 'Сначала войдите в аккаунт.' };
    const clean = sanitizeCallsign(newCallsign, currentUser.email);
    const { data, error } = await client
      .from('profiles')
      .upsert(
        { id: currentUser.id, callsign: clean, updated_at: new Date().toISOString() },
        { onConflict: 'id' }
      )
      .select()
      .single();

    if (error) return { error: error.message };
    currentProfile = data;
    if (authCallback) authCallback(currentUser, currentProfile);
    return { ok: true, callsign: clean };
  }

  function scheduleSyncProfile(payload) {
    if (!client || !currentUser) return;
    if (syncTimer) clearTimeout(syncTimer);
    syncTimer = setTimeout(() => {
      syncProfileNow(payload);
    }, 900);
  }

  async function syncProfileNow(payload) {
    if (!client || !currentUser) return;
    const prevBest = currentProfile?.best_shift_score || 0;
    const prevPerfect = currentProfile?.total_perfect || 0;

    const record = {
      id: currentUser.id,
      callsign: currentProfile?.callsign || sanitizeCallsign('', currentUser.email),
      score: Math.max(0, Math.round(payload.score || 0)),
      best_shift_score: Math.max(prevBest, Math.round(payload.bestShiftScore || 0)),
      total_perfect: prevPerfect + (payload.addPerfect || 0),
      upgrades: Array.isArray(payload.upgrades) ? payload.upgrades : [],
      difficulty: payload.difficulty || 'medium',
      updated_at: new Date().toISOString()
    };

    const { data, error } = await client
      .from('profiles')
      .upsert(record, { onConflict: 'id' })
      .select()
      .single();

    if (!error && data) {
      currentProfile = data;
    }
  }

  async function submitShiftRun({ shiftNumber, difficulty, shiftScore, perfectCount, handledCount }) {
    if (!client || !currentUser) return { skipped: true };
    if (shiftScore <= 0) return { skipped: true };

    const callsign = currentProfile?.callsign || sanitizeCallsign('', currentUser.email);
    const { error } = await client.from('leaderboard_runs').insert({
      user_id: currentUser.id,
      callsign,
      shift_number: shiftNumber,
      difficulty,
      shift_score: Math.round(shiftScore),
      perfect_count: perfectCount || 0,
      handled_count: handledCount || 0
    });

    if (error) {
      console.warn('Supabase submitShiftRun error:', error.message);
      return { error: error.message };
    }
    return { ok: true };
  }

  async function fetchLeaderboard(mode = 'all') {
    if (!client) return { error: 'Нет подключения к облаку.', rows: [] };

    if (mode === 'profiles') {
      const { data, error } = await client
        .from('profiles')
        .select('id, callsign, score, best_shift_score, total_perfect, difficulty')
        .order('score', { ascending: false })
        .limit(25);

      if (error) return { error: error.message, rows: [] };
      return { rows: data || [], kind: 'profiles' };
    }

    let query = client
      .from('leaderboard_runs')
      .select('id, user_id, callsign, shift_number, difficulty, shift_score, perfect_count, handled_count, created_at')
      .order('shift_score', { ascending: false })
      .limit(25);

    if (mode === 'easy' || mode === 'medium' || mode === 'hard') {
      query = query.eq('difficulty', mode);
    }

    const { data, error } = await query;
    if (error) return { error: error.message, rows: [] };
    return { rows: data || [], kind: 'runs' };
  }

  // --- ФУНКЦИИ АДМИНИСТРАТОРА И ПРИКАЗ ШТАБА ---
  async function fetchAnnouncement() {
    if (!client) return '';
    const { data, error } = await client
      .from('hq_announcement')
      .select('message')
      .eq('id', 1)
      .maybeSingle();
    if (error || !data) return '';
    return data.message || '';
  }

  async function saveAnnouncement(message) {
    if (!client || !isAdmin()) return { error: 'Требуются права администратора.' };
    const clean = String(message || '').trim().slice(0, 220);
    const { error } = await client
      .from('hq_announcement')
      .upsert({ id: 1, message: clean, updated_at: new Date().toISOString() }, { onConflict: 'id' });
    if (error) return { error: error.message };
    return { ok: true, message: clean };
  }

  async function deleteLeaderboardRun(runId) {
    if (!client || !isAdmin()) return { error: 'Требуются права администратора.' };
    const { error } = await client
      .from('leaderboard_runs')
      .delete()
      .eq('id', runId);
    if (error) return { error: error.message };
    return { ok: true };
  }

  async function fetchAllProfiles() {
    if (!client || !isAdmin()) return { error: 'Требуются права администратора.', rows: [] };
    const { data, error } = await client
      .from('profiles')
      .select('id, callsign, score, best_shift_score, total_perfect, is_admin, updated_at')
      .order('score', { ascending: false })
      .limit(50);
    if (error) return { error: error.message, rows: [] };
    return { rows: data || [] };
  }

  async function adminUpdateProfile(profileId, { callsign, score }) {
    if (!client || !isAdmin()) return { error: 'Требуются права администратора.' };
    const updates = { updated_at: new Date().toISOString() };
    if (typeof callsign === 'string' && callsign.trim().length >= 2) {
      updates.callsign = callsign.trim().slice(0, 24);
    }
    if (typeof score === 'number' && !Number.isNaN(score)) {
      updates.score = Math.max(0, Math.round(score));
    }
    const { data, error } = await client
      .from('profiles')
      .update(updates)
      .eq('id', profileId)
      .select()
      .single();
    if (error) return { error: error.message };
    if (currentUser && profileId === currentUser.id && data) {
      currentProfile = data;
    }
    return { ok: true, profile: data };
  }

  function translateAuthError(msg) {
    const m = String(msg || '').toLowerCase();
    if (m.includes('invalid login credentials')) return 'Неверный email или пароль.';
    if (m.includes('user already registered')) return 'Этот email уже зарегистрирован — попробуйте войти.';
    if (m.includes('password should be at least')) return 'Пароль должен содержать минимум 6 символов.';
    if (m.includes('email not confirmed')) return 'Сначала подтвердите email по ссылке из письма.';
    if (m.includes('invalid email')) return 'Проверьте правильность адреса email.';
    return msg;
  }

  return {
    isAvailable,
    getUser,
    getProfile,
    isAdmin,
    init,
    signUp,
    signIn,
    signOut,
    updateCallsign,
    scheduleSyncProfile,
    syncProfileNow,
    submitShiftRun,
    fetchLeaderboard,
    fetchAnnouncement,
    saveAnnouncement,
    deleteLeaderboardRun,
    fetchAllProfiles,
    adminUpdateProfile
  };
})();
