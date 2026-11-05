// ============================================================================
// Movie Mania LK — Data Normalization & Relation Computation
// Server-side data shaping for seasons, collections, and similar recommendations.
// ============================================================================

export function genreList(item) {
  return (item && item.genre ? String(item.genre) : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

export function normalizeSeasons(m) {
  if (!m || !m.seasons) return m;
  let seasons = m.seasons;
  if (!Array.isArray(seasons) && typeof seasons === 'object') {
    seasons = Object.values(seasons);
  }
  m.seasons = (seasons || []).filter(Boolean).map((s) => {
    let eps = s.episodes;
    if (eps && !Array.isArray(eps) && typeof eps === 'object') {
      eps = Object.values(eps);
    }
    return { ...s, episodes: (eps || []).filter(Boolean) };
  });
  return m;
}

export function computeCollection(allMovies, currentItem) {
  if (!currentItem || !currentItem.collection) return [];
  const targetCol = String(currentItem.collection).trim().toLowerCase();
  if (!targetCol) return [];
  return allMovies
    .filter((x) => x.collection && String(x.collection).trim().toLowerCase() === targetCol)
    .sort((a, b) => (parseInt(a.collectionOrder || '0') || 0) - (parseInt(b.collectionOrder || '0') || 0))
    .map((x) => ({
      id: x.id,
      title: x.title,
      year: x.year,
      poster: x.poster,
      rating: x.rating,
      collectionOrder: x.collectionOrder,
      type: x.type,
    }));
}

export function computeSimilar(allMovies, currentItem, limit = 12) {
  if (!currentItem) return [];
  const myGenres = genreList(currentItem).map((g) => g.toLowerCase());
  if (!myGenres.length) return [];

  return allMovies
    .filter(
      (mm) =>
        mm.id !== currentItem.id &&
        genreList(mm).some((g) => myGenres.includes(g.toLowerCase()))
    )
    .slice(0, limit)
    .map((x) => ({
      id: x.id,
      title: x.title,
      poster: x.poster,
      rating: x.rating,
      year: x.year,
      type: x.type,
      quality: x.quality,
    }));
}

export function getCastList(item) {
  return (item && item.cast ? String(item.cast) : '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
