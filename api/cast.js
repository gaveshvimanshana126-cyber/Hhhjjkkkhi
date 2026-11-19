// ============================================================================
// Movie Mania LK — Edge Function: Cast & Actors API
// Endpoints:
//   /api/cast                      -> { actors: [{ n: name, c: titleCount }] } (A–Z)
//   /api/cast?photos=Name|Name|…   -> { photos: [{ name, photo }] }  (max 24)
//   /api/cast?actor=Name           -> { name, titles: [{ id, title, poster, year, type }] }
//   /api/cast?slug=anaide-rozam    -> same as actor=, but looked up by URL slug
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { getAllMovies } from './_lib/firebase.js';
import { getCastList } from './_lib/normalize.js';
import { getPersonPhotos } from './_lib/tmdb.js';

export const config = { runtime: 'edge' };

const isTV = (t) => /^(tv|series|tv-series|tvseries|tvshows|tv_shows|tv-shows|tv show|tvshow|show|tv shows)$/i.test(String(t || '').trim());
const key = (n) => String(n).trim().toLowerCase();
const slugify = (n) =>
  String(n).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');

export default async function handler(request) {
  if (request.headers.get('X-Frontend-Access') !== 'true') return error('Not found', 404);
  if (request.method === 'OPTIONS') return handleOptions();
  if (request.method !== 'GET') return error('Method not allowed', 405);

  try {
    const url = new URL(request.url);
    const photos = url.searchParams.get('photos');
    let actor = (url.searchParams.get('actor') || '').trim();
    const slug = (url.searchParams.get('slug') || '').trim().toLowerCase();

    if (photos) {
      const names = photos.split('|').map((s) => s.trim()).filter(Boolean);
      const list = await getPersonPhotos(names, 24);
      return json({ photos: list }, 200, {}, 'detail');
    }

    const all = await getAllMovies();
    const now = Date.now();
    const items = Object.entries(all && typeof all === 'object' ? all : {})
      .map(([id, v]) => ({ id, ...(v || {}) }))
      .filter((m) => !m.scheduledAt || m.scheduledAt <= now);

    if (!actor && slug) {
      for (const m of items) {
        const hit = getCastList(m).find((n) => slugify(n) === slug);
        if (hit) { actor = hit; break; }
      }
      if (!actor) return json({ name: '', titles: [] }, 200, {}, 'list');
    }

    if (actor) {
      const k = key(actor);
      const titles = items
        .filter((m) => getCastList(m).some((n) => key(n) === k))
        .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))
        .map((m) => ({ id: m.id, title: m.title, poster: m.poster, year: m.year, type: isTV(m.type) ? 'tv' : 'movie' }));
      return json({ name: actor, titles }, 200, {}, 'list');
    }

    const map = new Map();
    for (const m of items) {
      for (const n of new Set(getCastList(m))) {
        const k = key(n);
        const e = map.get(k);
        if (e) e.c++;
        else map.set(k, { n, c: 1 });
      }
    }
    const actors = [...map.values()].sort((a, b) =>
      a.n.localeCompare(b.n, 'en', { sensitivity: 'base' })
    );
    return json({ actors, total: actors.length }, 200, {}, 'list');
  } catch (e) {
    return error(e.message || 'Cast API failed', 500);
  }
}
