// ============================================================================
// Movie Mania LK — Firebase Realtime Database Client (Server/Edge)
// Securely interacts with Firebase RTDB using environment variables.
// ============================================================================

// In-memory cache for Edge Function performance
const memoryCache = new Map();
const CACHE_TTL = 3 * 60 * 1000; // 3 minutes

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

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL || 'https://cineflix1-1fdc6-default-rtdb.firebaseio.com';
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8';

function buildUrl(path, queryParams = {}) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(`${FIREBASE_DB_URL}/${cleanPath}.json`);
  if (FIREBASE_API_KEY) {
    url.searchParams.set('key', FIREBASE_API_KEY);
  }
  for (const [k, v] of Object.entries(queryParams)) {
    if (v !== undefined && v !== null) {
      url.searchParams.set(k, String(v));
    }
  }
  return url.toString();
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
  const res = await fetch(buildUrl('movies'));
  if (!res.ok) throw new Error(`Firebase error ${res.status}`);
  const data = await res.json();
  setCache(cacheKey, data);
  return data;
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

