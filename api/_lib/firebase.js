// ============================================================================
// Movie Mania LK — Firebase Realtime Database Client (Server/Edge)
// Securely interacts with Firebase RTDB using environment variables.
// ============================================================================

import { dbJsonUrl } from './db.js';

// In-memory cache for Edge Function performance.
// The catalog changes only when an admin saves a title, so a longer TTL is
// safe and cuts repeated full-catalog downloads (the biggest CPU cost).
const memoryCache = new Map();
const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
// Deduplicate concurrent cold-start fetches inside one isolate.
const inFlight = new Map();
// RTDB rejects orderBy on a child unless the rules define .indexOn. Remember
// that once so we do not pay for a failed request on every call.
let recentQueryDisabled = false;

function getCache(key) {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data;
}

function setCache(key, data) {
  memoryCache.set(key, { data, timestamp: Date.now() });
}

function buildUrl(path, queryParams = {}) {
  return dbJsonUrl(path, queryParams);
}

/**
 * Fetch a single movie or TV series record by ID.
 */
export async function getMovie(id) {
  if (!id) return null;
  const res = await fetch(buildUrl(`movies/${encodeURIComponent(id)}`));
  if (!res.ok) {
    if (res.status === 404) return null;
    throw new Error(`Firebase error ${res.status}`);
  }
  return res.json();
}

/**
 * Fetch all movies/shows dictionary from Firebase.
 */
export async function getAllMovies() {
  const cacheKey = 'allMovies';
  const cached = getCache(cacheKey);
  if (cached) return cached;

  // One cold-start fetch shared by every concurrent request in this isolate.
  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const res = await fetch(buildUrl('movies'), {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`Firebase error ${res.status}`);
    const data = await res.json();
    setCache(cacheKey, data);
    return data;
  })();

  inFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(cacheKey);
  }
}

/**
 * Fetch only the newest N records (Firebase orderBy + limitToLast).
 * Used by the homepage's first paint instead of downloading/parsing the whole
 * catalog. Falls back to the caller's own path when this query fails.
 */
export async function getRecentMovies(limit = 60) {
  if (recentQueryDisabled) return null;
  const n = Math.max(1, Math.min(200, parseInt(limit, 10) || 60));
  const cacheKey = 'recent:' + n;
  const cached = getCache(cacheKey);
  if (cached) return cached;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const res = await fetch(
      buildUrl('movies', { orderBy: '"addedAt"', limitToLast: n }),
      { headers: { Accept: 'application/json' } }
    );
    if (res.status === 400) {
      // No .indexOn rule for addedAt: fall back to the full cached catalog.
      recentQueryDisabled = true;
      return null;
    }
    if (!res.ok) throw new Error(`Firebase error ${res.status}`);
    const data = await res.json();
    const out = data && typeof data === 'object' ? data : {};
    setCache(cacheKey, out);
    return out;
  })();

  inFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(cacheKey);
  }
}

/**
 * Number of catalog records without downloading any of their fields.
 */
export async function getCatalogCount() {
  const cacheKey = 'catalogCount';
  const cached = getCache(cacheKey);
  if (cached !== null && cached !== undefined) return cached;

  const pending = inFlight.get(cacheKey);
  if (pending) return pending;

  const task = (async () => {
    const res = await fetch(
      buildUrl('movies', { shallow: 'true' }),
      { headers: { Accept: 'application/json' } }
    );
    if (!res.ok) throw new Error(`Firebase error ${res.status}`);
    const data = await res.json();
    const count = data && typeof data === 'object' ? Object.keys(data).length : 0;
    setCache(cacheKey, count);
    return count;
  })();

  inFlight.set(cacheKey, task);
  try {
    return await task;
  } finally {
    inFlight.delete(cacheKey);
  }
}

/**
 * Fetch comments for a specific movie or TV show.
 */
export async function getComments(movieId) {
  if (!movieId) return [];
  const res = await fetch(buildUrl(`comments/${encodeURIComponent(movieId)}`));
  if (!res.ok) return [];
  const data = await res.json();
  if (!data || typeof data !== 'object') return [];
  return Object.entries(data)
    .map(([key, val]) => ({ id: key, ...(val || {}) }))
    .reverse();
}

/**
 * Add a new comment to a movie or TV show.
 */
export async function postComment(movieId, comment) {
  if (!movieId || !comment) throw new Error('Missing movieId or comment');
  const res = await fetch(buildUrl(`comments/${encodeURIComponent(movieId)}`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(comment),
  });
  if (!res.ok) throw new Error(`Failed to post comment: ${res.status}`);
  return res.json();
}

/**
 * Fetch all submitted requests (latest 50).
 */
export async function getRequests(limit = 50) {
  const res = await fetch(buildUrl('requests'));
  if (!res.ok) return [];
  const data = await res.json();
  if (!data || typeof data !== 'object') return [];
  const list = Object.entries(data)
    .map(([key, val]) => ({ id: key, ...(val || {}) }))
    .reverse();
  return list.slice(0, limit);
}

/**
 * Add a new user request.
 */
export async function postRequest(request) {
  if (!request) throw new Error('Missing request data');
  const res = await fetch(buildUrl('requests'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  if (!res.ok) throw new Error(`Failed to post request: ${res.status}`);
  return res.json();
}

/**
 * Atomically increment a counter (e.g. 'views' or 'downloads_count').
 */
export async function incrementField(id, field) {
  const isDownload = ['downloads_count', 'downloads', 'subDownloads', 'subtitle_downloads_count'].includes(field);
  const isOnlineWatch = field === 'online_watch';
  const isView = field === 'views';

  if (!id || (!isDownload && !isView && !isOnlineWatch)) {
    throw new Error('Invalid ID or metric field');
  }

  const dbField = isDownload ? 'downloads_count' : (isOnlineWatch ? 'online_watch' : 'views');
  const movieUrl = buildUrl(`movies/${encodeURIComponent(id)}/${dbField}`);
  const getRes = await fetch(movieUrl);
  const current = getRes.ok ? await getRes.json() : 0;
  const nextVal = (typeof current === 'number' ? current : 0) + 1;

  const putRes = await fetch(movieUrl, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(nextVal),
  });
  if (!putRes.ok) throw new Error(`Failed to update metric: ${putRes.status}`);

  // Atomically update daily analytics (YYYY-MM-DD)
  try {
    const today = new Date().toISOString().split('T')[0];
    const dailyKey = isDownload ? 'downloadsDaily' : (isOnlineWatch ? 'onlineWatchDaily' : 'viewsDaily');
    const dailyUrl = buildUrl(`analytics/${dailyKey}/${today}`);
    const dailyRes = await fetch(dailyUrl);
    const dailyCurrent = dailyRes.ok ? await dailyRes.json() : 0;
    const dailyNext = (typeof dailyCurrent === 'number' ? dailyCurrent : 0) + 1;

    await fetch(dailyUrl, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(dailyNext),
    });
  } catch (_) {
    // Non-critical background daily stats update
  }

  return { id, field: dbField, value: nextVal };
}

/**
 * Log recent download entry for analytics.
 */
export async function logRecentDownload(entry) {
  if (!entry) return null;
  const item = {
    movieId: entry.movieId || '',
    title: entry.title || 'Unknown',
    poster: entry.poster || '',
    quality: entry.quality || 'HD',
    type: entry.type || 'movie',
    timestamp: entry.timestamp || Date.now(),
    dateStr: entry.dateStr || new Date().toISOString(),
    url: entry.url ? String(entry.url).slice(0, 100) : ''
  };
  const res = await fetch(buildUrl('analytics/recentDownloads'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(item),
  });
  if (!res.ok) throw new Error(`Failed to log download: ${res.status}`);
  return res.json();
}

/**
 * Get notice bar config (settings/noticeBar).
 * Returns { active: boolean, notices: string[] }
 */
export async function getNoticeBar() {
  try {
    const res = await fetch(buildUrl('settings/noticeBar'));
    if (!res.ok) return { active: false, notices: [] };
    const data = await res.json();
    if (!data || typeof data !== 'object') return { active: false, notices: [] };
    // Firebase RTDB may return arrays as objects {"0": "..."} — normalize both.
    let raw = data.notices;
    let list = [];
    if (Array.isArray(raw)) list = raw;
    else if (raw && typeof raw === 'object') list = Object.values(raw);
    const notices = list
      .map((x) => (typeof x === 'string' ? x : (x && x.text) || ''))
      .map((s) => String(s).trim())
      .filter(Boolean);
    return { active: data.active !== false, notices };
  } catch (_) {
    return { active: false, notices: [] };
  }
}

/**
 * Get user profile by uid.
 */
export async function getUserProfile(uid) {
  if (!uid) return null;
  const res = await fetch(buildUrl(`users/${encodeURIComponent(uid)}`));
  if (!res.ok) return null;
  return res.json();
}

/**
 * Get a single setting value by path (e.g. 'settings/wpBotNumber').
 */
export async function getSetting(path) {
  try {
    const res = await fetch(buildUrl(path));
    if (!res.ok) return null;
    return await res.json();
  } catch (_) {
    return null;
  }
}

/**
 * Set a single setting value by path (e.g. 'settings/wpBotNumber').
 */
export async function setSetting(path, value) {
  const res = await fetch(buildUrl(path), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  });
  if (!res.ok) throw new Error(`Failed to set setting ${path}: ${res.status}`);
  return res.json();
}

/**
 * Save user profile by uid.
 */
export async function saveUserProfile(uid, profile) {
  if (!uid || !profile) return null;
  const res = await fetch(buildUrl(`users/${encodeURIComponent(uid)}`), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  });
  if (!res.ok) throw new Error(`Failed to save user profile: ${res.status}`);
  return res.json();
}

