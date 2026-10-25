// ============================================================================
// Movie Mania LK — TMDB API Client (Server/Edge)
// Securely proxies TMDB requests and enriches movie/show metadata.
// ============================================================================

const TMDB_API = 'https://api.themoviedb.org/3';
export const TMDB_IMG = 'https://image.tmdb.org/t/p/';

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
  try {
    const data = await tmdbFetch(`/${endpointType}/${tmdbId}/images`);
    const backdrops = data.backdrops || [];
    return backdrops.slice(0, 10).map((b) => `${TMDB_IMG}w500${b.file_path}`);
  } catch (err) {
    console.warn(`Failed to fetch stills for TMDB ${tmdbId}:`, err.message);
    return [];
  }
}

/**
 * Search and fetch stills using title as a fallback when tmdbId is absent.
 */
export async function searchStillsByTitle(title, type = 'movie') {
  if (!title) return [];
  const endpointType =
    type === 'tv' || type === 'series' || type === 'tv-series' ? 'tv' : 'movie';
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
}

/**
 * Fetch profile images for up to 8 cast members concurrently.
 */
export async function getCastPhotos(castNames) {
  if (!Array.isArray(castNames) || !castNames.length) return [];
  const targets = castNames.slice(0, 8);

  const results = await Promise.allSettled(
    targets.map(async (name) => {
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
  );

  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { name: targets[i], photo: null }
  );
}

/**
 * Multi-search (movies, TV, people) for user title request modal.
 */
export async function searchMulti(query) {
  if (!query || !query.trim()) return [];
  try {
    const data = await tmdbFetch(
      `/search/multi?query=${encodeURIComponent(query.trim())}&language=en-US`
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
}
