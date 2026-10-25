// ============================================================================
// Movie Mania LK — Edge Function: Movies & Shows Catalog API
// Endpoint: /api/movies?type=...&genre=...&limit=...
// ============================================================================

import { json, error, handleOptions } from './_lib/respond.js';
import { getAllMovies } from './_lib/firebase.js';
import { normalizeSeasons, genreList } from './_lib/normalize.js';

export const config = {
  runtime: 'edge',
};

export default async function handler(request) {
  // Security: Block direct browser/API access — require custom header
  const customHeader = request.headers.get('X-Frontend-Access');
  if (customHeader !== 'true') {
    return error('Access denied: Direct access not allowed', 403);
  }

  if (request.method === 'OPTIONS') {
    return handleOptions();
  }

  if (request.method !== 'GET') {
    return error('Method not allowed', 405);
  }

  try {
    const url = new URL(request.url);
    const type = url.searchParams.get('type');
    const genre = url.searchParams.get('genre');
    const q = (url.searchParams.get('q') || url.searchParams.get('search') || '').trim().toLowerCase();
    const limit = parseInt(url.searchParams.get('limit') || '0', 10);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const allData = await getAllMovies();
    if (!allData || typeof allData !== 'object') {
      return json({ movies: [], total: 0 }, 200, {}, 'list');
    }

    const now = Date.now();
    let list = Object.entries(allData)
      .map(([id, val]) => ({ id, ...(val || {}) }))
      .filter((m) => !m.scheduledAt || m.scheduledAt <= now)
      .sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));

    list.forEach(normalizeSeasons);

    // Canonical type check — tolerant of legacy/variant values written over time
    // ('tv', 'series', 'tv-series', 'tvshows', ...) vs movies ('movie', 'film', missing).
    const normType = (v) => String(v == null ? '' : v).trim().toLowerCase();
    const isTVType = (t) =>
      t === 'tv' || t === 'series' || t === 'tv-series' || t === 'tvseries' ||
      t === 'tvshows' || t === 'tv_shows' || t === 'tv-shows' ||
      t === 'tv show' || t === 'tvshow' || t === 'show' || t === 'tv shows';

    if (type) {
      const t = normType(type);
      if (t === 'movie' || t === 'movies' || t === 'film' || t === 'films') {
        list = list.filter((m) => !isTVType(normType(m.type)));
      } else if (t === 'tv' || t === 'series' || t === 'tv-series' || t === 'tvshows' || t === 'show') {
        list = list.filter((m) => isTVType(normType(m.type)));
      }
    }

    if (q) {
      list = list.filter((m) => String(m.title || '').toLowerCase().includes(q));
    }

    if (genre) {
      const g = genre.toLowerCase().trim();
      const slug = (s) => (s || '').toLowerCase().replace(/[^a-z0-9+]+/g, '');
      const normG = slug(g);
      list = list.filter((m) =>
        genreList(m).some((item) => {
          const li = item.toLowerCase();
          const normLi = slug(item);
          // exact match (back-compat)
          if (li === g) return true;
          // alias: scifi matches "sci-fi", "science fiction", "sci-fi & fantasy"
          if (normG === 'scifi' && (normLi.includes('sci') && normLi.includes('fi'))) return true;
          if (normG === '18+' || normG === '18') return li === '18+';
          // slug match (handles "action & adventure" slug forms) + partial contains
          if (normLi === normG) return true;
          if (normLi.includes(normG) || normG.includes(normLi)) return true;
          return false;
        })
      );
    }

    const total = list.length;

    if (limit > 0) {
      list = list.slice(offset, offset + limit);
    }

    // Optimize response: only include fields needed by index.html, including descriptions for hero slides.
    // Include seriesStatus + lightweight seasons summary so TV status badges ("S{n} Complete" / "S{n} XEP") can render on homepage.
    const optimizedList = list.map(m => {
      const isTV = m.type === 'tv' || m.type === 'series' || m.type === 'tv-series';
      const seasonsSummary = isTV && Array.isArray(m.seasons)
        ? m.seasons.map(s => ({
            season: s.season,
            episodeCount: Array.isArray(s.episodes) ? s.episodes.length : (s.episodeCount || 0)
          }))
        : undefined;

      return {
        id: m.id,
        type: m.type,
        genre: m.genre,
        poster: m.poster,
        title: m.title,
        description: m.description || m.desc || '',
        quality: m.quality,
        rating: m.rating,
        year: m.year,
        seriesStatus: isTV ? (m.seriesStatus || 'ongoing') : undefined,
        seasons: seasonsSummary,
      };
    });

    return json({ movies: optimizedList, total }, 200, {}, 'list');
  } catch (err) {
    console.error('Edge Function /api/movies failed:', err);
    return error(err.message || 'Internal Server Error', 500);
  }
}
