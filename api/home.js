// ============================================================================
// Movie Mania LK — Homepage prerender for crawlers
//
// Humans keep the existing SPA shell (index.html). Crawlers get a complete,
// server-rendered homepage with:
//   - a real <h1> (the SPA only creates one after JS + API calls)
//   - links to the latest movie/TV pages (crawl discovery)
//   - links to every genre/year archive (fixes orphan archive pages)
//   - WebSite + ItemList structured data
//
// The response is CDN-cached for hours, so this function runs rarely and its
// CPU time stays negligible.
// ============================================================================

import { dbJsonUrl } from './_lib/db.js';

export const config = { runtime: 'edge' };

const SITE = 'https://www.moviemanialk.com';
const FALLBACK_IMG = SITE + '/baner.png';

const BOT_UA_RE = /bot|crawler|spider|crawling|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|googlebot|google-inspectiontool|inspectiontool|google-extended|bingbot|bingpreview|applebot|duckduckbot|baiduspider|yandex|bytespider|pinterest|embedly|quora|outbrain|vkshare|gptbot|chatgpt|claude|anthropic|perplexity|youbot|cohere|mistral|ai-agent/i;

function isBot(request, url) {
  const force = url.searchParams.get('_bot');
  if (force === '1') return true;
  if (force === '0') return false;
  const ua = (request.headers.get('user-agent') || '').trim();
  if (!ua) return true;
  return BOT_UA_RE.test(ua);
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function slugify(s) {
  return String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function isTV(m) {
  const t = String((m && m.type) || '').trim().toLowerCase();
  return t === 'tv' || t === 'series' || t === 'tv-series' ||
    t === 'tvshows' || t === 'tvshow' || t === 'show' || t === 'tv shows';
}

function cap(s, max) {
  const clean = String(s == null ? '' : s).replace(/\s+/g, ' ').trim();
  if (clean.length <= max) return clean;
  return clean.slice(0, max - 1).replace(/\s+\S*$/, '').trim() + '…';
}

function detailHref(m) {
  return SITE + '/' + (isTV(m) ? 'tv/' : 'movie/') +
    encodeURIComponent(m.id) + '-sinhala-subtitles';
}

async function fetchCatalog() {
  const res = await fetch(dbJsonUrl('movies'), {
    headers: { Accept: 'application/json' },
  });
  if (!res.ok) throw new Error('catalog ' + res.status);
  const data = await res.json();
  return data && typeof data === 'object' ? data : {};
}

function renderHome(catalog) {
  const now = Date.now();
  const entries = Object.entries(catalog || {})
    .filter(([, m]) => m && m.title && String(m.title).trim())
    .filter(([, m]) => !m.scheduledAt || m.scheduledAt <= now)
    .map(([id, m]) => ({ id, ...m }));

  entries.sort((a, b) => (b.heroAt || b.addedAt || 0) - (a.heroAt || a.addedAt || 0));

  const latest = entries.slice(0, 60);
  const tv = entries.filter(isTV).slice(0, 40);
  const movies = entries.filter((m) => !isTV(m)).slice(0, 40);

  const genreCounts = new Map();
  const yearCounts = new Map();
  for (const m of entries) {
    for (const g of String(m.genre || '').split(',').map((s) => s.trim()).filter(Boolean)) {
      const slug = slugify(g);
      if (slug) genreCounts.set(slug, (genreCounts.get(slug) || 0) + 1);
    }
    if (m.year && /^\d{4}$/.test(String(m.year))) {
      yearCounts.set(String(m.year), (yearCounts.get(String(m.year)) || 0) + 1);
    }
  }

  const genres = [...genreCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug);
  const years = [...yearCounts.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([year]) => year);

  const title = 'Movie Mania LK — Sinhala Sub Movies & TV Series';
  const desc = 'Watch and download the latest movies and TV series with Sinhala subtitles on Movie Mania LK. Updated daily.';

  const list = (items) => items.length
    ? '<ul style="font-size:15px;line-height:2;margin:0 0 24px;padding-left:20px">' +
      items.map((m) => '<li><a style="color:#f2ece2" href="' + esc(detailHref(m)) + '">' +
        esc(m.title) + (m.year ? ' (' + esc(m.year) + ')' : '') + '</a></li>').join('') + '</ul>'
    : '<p style="opacity:.7">No titles yet.</p>';

  const schema = {
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: 'Movie Mania LK',
    alternateName: 'MovieMania.lk',
    url: SITE + '/',
    description: desc,
    inLanguage: ['en', 'si'],
    potentialAction: {
      '@type': 'SearchAction',
      target: SITE + '/?s={search_term_string}',
      'query-input': 'required name=search_term_string',
    },
  };
  const itemList = {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: 'Latest movies and TV series with Sinhala subtitles',
    numberOfItems: latest.length,
    itemListElement: latest.map((m, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: detailHref(m),
      name: m.title + (m.year ? ' (' + m.year + ')' : ''),
    })),
  };

  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>' + esc(title) + '</title>\n' +
'<meta name="description" content="' + esc(desc) + '">\n' +
'<meta name="robots" content="index, follow, max-image-preview:large">\n' +
'<link rel="canonical" href="' + SITE + '/">\n' +
'<meta property="og:type" content="website">\n' +
'<meta property="og:site_name" content="Movie Mania LK">\n' +
'<meta property="og:title" content="' + esc(title) + '">\n' +
'<meta property="og:description" content="' + esc(desc) + '">\n' +
'<meta property="og:url" content="' + SITE + '/">\n' +
'<meta property="og:image" content="' + FALLBACK_IMG + '">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta name="twitter:title" content="' + esc(title) + '">\n' +
'<meta name="twitter:description" content="' + esc(desc) + '">\n' +
'<meta name="twitter:image" content="' + FALLBACK_IMG + '">\n' +
'<link rel="icon" type="image/png" href="/logo.png">\n' +
'<script type="application/ld+json">' + JSON.stringify(schema) + '</script>\n' +
'<script type="application/ld+json">' + JSON.stringify(itemList) + '</script>\n' +
'</head>\n' +
'<body style="margin:0;background:#0a0908;color:#f2ece2;font-family:system-ui,sans-serif;padding:24px">\n' +
'<main style="max-width:760px;margin:0 auto">\n' +
'<h1 style="font-size:30px;margin:0 0 10px">Movie Mania LK — Movies &amp; TV Series with Sinhala Subtitles</h1>\n' +
'<p style="opacity:.85;font-size:15px;line-height:1.7">Sri Lanka\'s home for the latest movies and TV series with Sinhala subtitles. Browse the newest additions, or jump straight to a genre or release year.</p>\n' +
'<nav aria-label="Browse genres" style="margin:18px 0 26px">\n' +
'<h2 style="font-size:17px;margin:0 0 8px">Browse by Genre</h2>\n' +
'<ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px;font-size:13px">' +
genres.map((g) => '<li><a style="color:#f2ece2;background:rgba(255,255,255,.08);padding:6px 12px;border-radius:999px;text-decoration:none" href="' + SITE + '/genre/' + encodeURIComponent(g) + '">' + esc(g.replace(/-/g, ' ')) + '</a></li>').join('') +
'</ul>\n' +
'<h2 style="font-size:17px;margin:18px 0 8px">Browse by Year</h2>\n' +
'<ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px;font-size:13px">' +
years.map((y) => '<li><a style="color:#f2ece2;background:rgba(255,255,255,.08);padding:6px 12px;border-radius:999px;text-decoration:none" href="' + SITE + '/year/' + encodeURIComponent(y) + '">' + esc(y) + '</a></li>').join('') +
'</ul>\n' +
'<h2 style="font-size:17px;margin:18px 0 8px">Browse All</h2>\n' +
'<ul style="list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:8px;font-size:13px">' +
'<li><a style="color:#f2ece2;background:rgba(255,255,255,.08);padding:6px 12px;border-radius:999px;text-decoration:none" href="' + SITE + '/movies">All Movies</a></li>' +
'<li><a style="color:#f2ece2;background:rgba(255,255,255,.08);padding:6px 12px;border-radius:999px;text-decoration:none" href="' + SITE + '/tv-series">All TV Series</a></li>' +
'</ul>\n' +
'</nav>\n' +
'<h2 style="font-size:18px;margin:0 0 8px">Latest Movies &amp; TV Series</h2>\n' +
list(latest) +
'<h2 style="font-size:18px;margin:0 0 8px">Latest Movies</h2>\n' +
list(movies) +
'<h2 style="font-size:18px;margin:0 0 8px">TV Series</h2>\n' +
list(tv) +
'<footer style="margin-top:28px;padding-top:16px;border-top:1px solid rgba(255,255,255,.12);font-size:13px;line-height:2;opacity:.85">' +
'<a style="color:#f2ece2" href="' + SITE + '/movies">Movies</a> · ' +
'<a style="color:#f2ece2" href="' + SITE + '/tv-series">TV Series</a> · ' +
'<a style="color:#f2ece2" href="' + SITE + '/sitemap.xml">Sitemap</a></footer>\n' +
'</main>\n' +
'</body>\n' +
'</html>';
}

function html(body, status, cache, robots) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache || 'public, s-maxage=21600, stale-while-revalidate=86400',
      'X-Robots-Tag': robots || 'index, follow, max-image-preview:large',
    },
  });
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204 });
  const url = new URL(request.url);

  // Humans keep the exact SPA experience.
  if (!isBot(request, url)) {
    try {
      const shell = await fetch(new URL('/index.html', url), {
        headers: { 'user-agent': 'Mozilla/5.0 (compatible; MovieManiaLK-shell/1.0)' },
      });
      if (!shell.ok) throw new Error('shell ' + shell.status);
      const body = await shell.text();
      return html(body, 200, 'public, s-maxage=3600, stale-while-revalidate=86400');
    } catch (_) {
      // Never redirect back to "/" — that would loop through this function.
      return html('<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
        '<title>Movie Mania LK</title><meta name="robots" content="noindex">' +
        '</head><body><h1>Movie Mania LK</h1>' +
        '<p>Please refresh in a moment.</p></body></html>',
        503, 'public, s-maxage=30, stale-while-revalidate=120', 'noindex, follow');
    }
  }

  try {
    const catalog = await fetchCatalog();
    return html(renderHome(catalog), 200);
  } catch (_) {
    // Never 5xx the homepage: return a minimal indexable page while the DB
    // recovers, then let stale-while-revalidate refresh it.
    const fallback = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">' +
      '<title>Movie Mania LK — Sinhala Sub Movies &amp; TV Series</title>' +
      '<meta name="description" content="Watch movies and TV series with Sinhala subtitles on Movie Mania LK.">' +
      '<link rel="canonical" href="' + SITE + '/"></head><body>' +
      '<h1>Movie Mania LK — Movies &amp; TV Series with Sinhala Subtitles</h1>' +
      '<p><a href="' + SITE + '/sitemap.xml">Browse all titles</a></p></body></html>';
    return html(fallback, 200, 'public, s-maxage=300, stale-while-revalidate=3600');
  }
}
