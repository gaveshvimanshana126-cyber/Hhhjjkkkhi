// ============================================================================
// Movie Mania LK — TMDB API Client (Server/Edge)
// Securely proxies TMDB requests and enriches movie/show metadata.
// ============================================================================

const TMDB_API = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p/';

// TMDB metadata is effectively static. Caching it per isolate removes up to
// 9 upstream requests (1 stills + 8 cast searches) from most detail-page hits,
// which is the single biggest contributor to Fluid CPU duration here.
const TMDB_TTL = 24 * 60 * 60 * 1000;
const tmdbCache = new Map();
const tmdbInflight = new Map();

function cached(key, producer) {
  const hit = tmdbCache.get(key);
  if (hit && Date.now() - hit.ts < TMDB_TTL) return Promise.resolve(hit.data);
  const pending = tmdbInflight.get(key);
  if (pending) return pending;
  const task = Promise.resolve()
    .then(producer)
    .then((data) => {
      tmdbCache.set(key, { data, ts: Date.now() });
      return data;
    })
    .finally(() => tmdbInflight.delete(key));
  tmdbInflight.set(key, task);
  return task;
}

const TMDB_TOKEN =
  process.env.TMDB_TOKEN ||
  'eyJhbGciOiJIUzI1NiJ9.eyJhdWQiOiI2ZWJkMDRhMTVhNzY0YWVmYmJjNzEyMGY5YTFmN2ZjYyIsIm5iZiI6MTc3NDA1OTkzNi43MjMsInN1YiI6IjY5YmUwMWEwMDI2ZjU1MjkwZmE1ZGVlYyIsInNjb3BlcyI6WyJhcGlfcmVhZCJdLCJ2ZXJzaW9uIjoxfQ.RcaHm0ztmGjBYFjJ5VFs6bnTtXrj95oK1dlPXj4cGdg';

async function tmdbFetch(path) {
  const res = await fetch(`${TMDB_API}${path}`, {
    headers: {
      Authorization: `Bearer ${TMDB_TOKEN}`,
      'Content-Type': 'application/json',
    },
  });
  if (!res.ok) throw new Error(`TMDB error ${res.status}`);
  return res.json();
}

/**
 * Fetch backdrops/stills by TMDB ID.
 */
export async function getStills(tmdbId, type = 'movie') {
  if (!tmdbId) return [];
  const endpointType =
    type === 'tv' || type === 'series' || type === 'tv-series' ? 'tv' : 'movie';
  return cached('stills:' + endpointType + ':' + tmdbId, async () => {
    try {
      const data = await tmdbFetch(`/${endpointType}/${tmdbId}/images`);
      const backdrops = data.backdrops || [];
      return backdrops.slice(0, 10).map((b) => `${TMDB_IMG}w500${b.file_path}`);
    } catch (err) {
      console.warn(`Failed to fetch stills for TMDB ${tmdbId}:`, err.message);
      return [];
    }
  });
}

/**
 * Search and fetch stills using title as a fallback when tmdbId is absent.
 */
export async function searchStillsByTitle(title, type = 'movie') {
  if (!title) return [];
  const endpointType =
    type === 'tv' || type === 'series' || type === 'tv-series' ? 'tv' : 'movie';
  return cached('stills-search:' + endpointType + ':' + String(title).toLowerCase(), async () => {
    try {
      const searchData = await tmdbFetch(
        `/search/${endpointType}?query=${encodeURIComponent(title)}`
      );
      const firstResult = searchData.results?.[0];
      if (firstResult?.id) {
        return await getStills(firstResult.id, endpointType);
      }
    } catch (err) {
      console.warn(`Failed to search stills by title "${title}":`, err.message);
    }
    return [];
  });
}

/**
 * Fetch profile images for up to 8 cast members concurrently.
 */
export async function getCastPhotos(castNames) {
  if (!Array.isArray(castNames) || !castNames.length) return [];
  const targets = castNames.slice(0, 8);

  return Promise.all(
    targets.map((name) =>
      cached('person:' + String(name).toLowerCase(), async () => {
        try {
          const data = await tmdbFetch(
            `/search/person?query=${encodeURIComponent(name)}`
          );
          const match = data.results?.[0];
          return {
            name,
            photo: match?.profile_path ? `${TMDB_IMG}w185${match.profile_path}` : null,
          };
        } catch (_) {
          return { name, photo: null };
        }
      })
    )
  );
}

/**
 * Multi-search (movies, TV, people) for user title request modal.
 */
export async function searchMulti(query) {
  if (!query || !query.trim()) return [];
  const q = query.trim();
  return cached('multi:' + q.toLowerCase(), async () => {
    try {
      const data = await tmdbFetch(
        `/search/multi?query=${encodeURIComponent(q)}&language=en-US`
      );
      return (data.results || []).slice(0, 20).map((r) => ({
        id: r.id,
        title: r.title || r.name || 'Untitled',
        media_type: r.media_type || 'movie',
        release_date: r.release_date || r.first_air_date || '',
        poster_path: r.poster_path ? `${TMDB_IMG}w185${r.poster_path}` : null,
      }));
    } catch (err) {
      console.warn('TMDB multi search failed:', err.message);
      return [];
    }
  });
}
