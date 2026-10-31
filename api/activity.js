// ============================================================================
// Movie Mania LK — Edge Function: Activity feed ("What's New" bell)
// Endpoint: /api/activity
// Merges: newly added titles, TV series that got new episodes, and user requests.
// Never returns e-mail addresses (requests are masked to a first name only).
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { getAllMovies, getRequests } from './_lib/firebase.js';

export const config = {
  runtime: 'edge',
};

const norm = (v) => String(v == null ? '' : v).trim().toLowerCase();
const isTV = (t) =>
  ['tv', 'series', 'tv-series', 'tvseries', 'tvshows', 'tv_shows', 'tv-shows', 'tv show', 'tvshow', 'show', 'tv shows'].includes(norm(t));

const firstName = (s) => {
  const w = String(s || '').trim().split(/\s+/)[0] || 'Someone';
  return w.slice(0, 14);
};

export default async function handler(request) {
  if (request.headers.get('X-Frontend-Access') !== 'true') {
    return error('Access denied: Direct access not allowed', 403);
  }
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return error('Method not allowed', 405);

  try {
    const now = Date.now();
    const [all, reqs] = await Promise.all([
      getAllMovies().catch(() => ({})),
      getRequests(30).catch(() => []),
    ]);

    const items = [];

    // Titles: "new" at addedAt; TV series that were edited later → "new episodes"
    Object.entries(all || {}).forEach(([id, m]) => {
      if (!m || (m.scheduledAt && m.scheduledAt > now)) return;
      const tv = isTV(m.type);
      const added = m.addedAt || 0;
      const base = { id, type: tv ? 'tv' : 'movie', title: String(m.title || '').slice(0, 120), poster: m.poster || '' };
      if (added) items.push({ ...base, kind: 'upload', time: added });
      if (tv && m.heroAt && added && m.heroAt - added > 10 * 60 * 1000) {
        items.push({ ...base, kind: 'episodes', time: m.heroAt });
      }
    });

    // Requests: pending → "requested"; done → "now available"
    (reqs || []).forEach((r) => {
      if (!r || !r.movie) return;
      const done = r.status === 'done';
      items.push({
        kind: done ? 'available' : 'request',
        type: norm(r.mediaType) === 'tv' ? 'tv' : 'movie',
        title: String(r.movie).slice(0, 120),
        user: firstName(r.user),
        poster: r.posterPath ? 'https://image.tmdb.org/t/p/w185' + r.posterPath : '',
        time: (done && r.doneAt) || r.time || 0,
      });
    });

    items.sort((a, b) => (b.time || 0) - (a.time || 0));
    return json({ items: items.filter((i) => i.time).slice(0, 30) }, 200, {}, 'list');
  } catch (err) {
    return error(err.message || 'Failed to load activity', 500);
  }
}
