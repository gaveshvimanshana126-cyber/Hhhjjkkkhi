// ============================================================================
// Movie Mania LK — WhatsApp download limits
// Free account: 3 downloads per day (Sri Lanka time). Premium: unlimited.
// Counters live in Firebase RTDB at wpDownloads/<uid>/<YYYY-MM-DD>.
// ============================================================================

export const FREE_DAILY_LIMIT = 3;
const ADMIN_EMAILS = ['gavesh1@gmail.com'];

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL || 'https://cineflix1-1fdc6-default-rtdb.firebaseio.com';
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8';

function dbUrl(path) {
  const url = new URL(`${FIREBASE_DB_URL}/${path}.json`);
  if (FIREBASE_API_KEY) url.searchParams.set('key', FIREBASE_API_KEY);
  return url.toString();
}

/** Today's date (YYYY-MM-DD) in Sri Lanka time, so the limit resets at local midnight. */
export function todayKey() {
  return new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}

/** Verify a Firebase ID token. Returns { uid, email } or null. */
export async function verifyIdToken(idToken) {
  if (!idToken || typeof idToken !== 'string') return null;
  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const u = data && data.users && data.users[0];
    if (!u || !u.localId) return null;
    return { uid: u.localId, email: String(u.email || '').toLowerCase() };
  } catch (_) {
    return null;
  }
}

/** Premium = users/<uid>.premium === true, optionally limited by premiumUntil (ms). */
export async function isPremiumUser(uid, email) {
  if (ADMIN_EMAILS.includes(email)) return true;
  try {
    const res = await fetch(dbUrl(`users/${encodeURIComponent(uid)}`));
    if (!res.ok) return false;
    const p = await res.json();
    if (!p || p.premium !== true) return false;
    const until = Number(p.premiumUntil) || 0;
    return !until || until > Date.now();
  } catch (_) {
    return false;
  }
}

/** Downloads used today (no side effects). */
export async function getUsedToday(uid) {
  try {
    const res = await fetch(dbUrl(`wpDownloads/${encodeURIComponent(uid)}/${todayKey()}`));
    if (!res.ok) return 0;
    const n = await res.json();
    return typeof n === 'number' ? n : 0;
  } catch (_) {
    return 0;
  }
}

/**
 * Atomically consume one free download (ETag compare-and-set, so two quick
 * clicks can never both squeeze under the limit).
 * Returns { ok: true, used } or { ok: false, used }.
 */
export async function consumeFreeDownload(uid, limit = FREE_DAILY_LIMIT) {
  const url = dbUrl(`wpDownloads/${encodeURIComponent(uid)}/${todayKey()}`);
  for (let attempt = 0; attempt < 6; attempt++) {
    const getRes = await fetch(url, { headers: { 'X-Firebase-ETag': 'true' } });
    if (!getRes.ok) throw new Error(`Counter read failed: ${getRes.status}`);
    const etag = getRes.headers.get('etag');
    const raw = await getRes.json();
    const used = typeof raw === 'number' ? raw : 0;
    if (used >= limit) return { ok: false, used };

    const putRes = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...(etag ? { 'if-match': etag } : {}) },
      body: JSON.stringify(used + 1),
    });
    if (putRes.ok) return { ok: true, used: used + 1 };
    if (putRes.status !== 412) throw new Error(`Counter write failed: ${putRes.status}`);
    // 412 = someone else updated it first → retry with fresh value
  }
  throw new Error('Counter busy, please retry');
}
