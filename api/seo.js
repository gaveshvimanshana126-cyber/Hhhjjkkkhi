// ============================================================================
// Movie Mania LK — SEO router + prerender for detail pages
// Endpoint: /api/seo?type=movie|tv&id=:id
//
// Why this exists:
//  - /movie/:id and /tv/:id must keep clean URLs, but the pages are static
//    HTML shells (movie.html / tv.html) whose <title> / og:* tags are only
//    injected by client-side JS AFTER load.
//  - Google / Facebook / WhatsApp / Twitter / Telegram scrapers DO NOT run
//    JS, so they only ever saw the generic fallback tags — no title, no
//    poster, no description in link previews, weak indexing.
//
// How it works (no vercel.json `has` rules — those are ignored by some
// servers / local dev setups, so ALL /movie/:id + /tv/:id traffic comes here
// and THIS function branches on User-Agent):
//  - Bot / scraper UA  → fetch title from Firebase server-side, return HTML
//    with FINAL meta tags already in <head> (200, edge-cached).
//  - Human UA          → proxy the matching static shell (movie.html/tv.html)
//    with the browser URL left untouched, so the app boots exactly as before.
//  - Unknown id + bot → 404 + noindex (so Google drops dead links).
//  - Shell fetch fails → 307 redirect to the static shell (never a dead page).
//
// No auth header required (public movie data only).
// ============================================================================

export const config = {
  runtime: 'edge',
};

const FIREBASE_DB_URL =
  (typeof process !== 'undefined' && process.env && process.env.FIREBASE_DB_URL) ||
  'https://cineflix1-1fdc6-default-rtdb.firebaseio.com';
const FIREBASE_API_KEY =
  (typeof process !== 'undefined' && process.env && process.env.FIREBASE_API_KEY) ||
  'AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8';

const SITE = 'https://www.moviemanialk.com';
const FALLBACK_IMG = SITE + '/baner.png';
const LOGO_IMG = SITE + '/logo.png';

// SEO slug suffix (competitor parity: cinesubz / baiscope rank with
// "...-sinhala-subtitles" in URL + bilingual "Sinhala Subtitles | සිංහල උපසිරැසි සමඟ" titles).
// Canonical detail URLs are /movie/:id-sinhala-subtitles and /tv/:id-sinhala-subtitles.
// Old suffix-less URLs keep working: the suffix is stripped before the DB lookup
// and the canonical tag consolidates both variants for Google.
const SEO_SUFFIX = '-sinhala-subtitles';
const SI_SUB = 'සිංහල උපසිරැසි සමඟ';
function stripSeoSuffix(s) {
  return String(s || '').replace(/-sinhala-subtitles?-?$/i, '').replace(/-sinhala-sub-?$/i, '');
}
function canonicalDetailUrl(kind, id) {
  return SITE + '/' + kind + '/' + encodeURIComponent(id) + SEO_SUFFIX;
}

// Bot / link-preview scraper signatures. Tested HERE in JS (case-insensitive)
// instead of vercel.json `has` rules, which plain static servers and some
// `vercel dev` versions silently ignore.
const BOT_UA_RE = /bot|crawler|spider|crawling|facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|telegrambot|whatsapp|discordbot|googlebot|google-inspectiontool|inspectiontool|google-extended|bingbot|bingpreview|applebot|applebot-extended|duckduckbot|baiduspider|yandex|bytespider|pinterest|embedly|quora|outbrain|vkshare|slack-imgproxy|telegram|discord|preview|fetch|gptbot|chatgpt|claude|anthropic|perplexity|perplexitybot|youbot|cohere|mistral|ai-agent/i;

function isBotRequest(request, url) {
  // Manual override for testing: /movie/<id>?_bot=1 forces the bot branch,
  // ?_bot=0 forces the human branch.
  const force = url.searchParams.get('_bot');
  if (force === '1') return true;
  if (force === '0') return false;
  const ua = (request.headers.get('user-agent') || '').trim();
  if (!ua) return true; // headless scrapers often send no UA at all
  return BOT_UA_RE.test(ua);
}

// Humans: serve the bytes of the static shell so the clean URL keeps working
// exactly as before (client JS reads the id from the pathname). The shell is
// identical for every id, so it is CDN-cached aggressively.
async function serveShell(request, url, kind) {
  const shellPath = kind === 'tv' ? '/tv.html' : '/movie.html';
  try {
    const upstream = await fetch(new URL(shellPath, url), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MovieManiaLK-shell/1.0)' },
    });
    if (!upstream.ok) throw new Error('shell ' + upstream.status);
    const html = await upstream.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch (_) {
    // Last resort: redirect to the static file (client JS parses ?id= there).
    const id = pickId(url);
    const dest = new URL(shellPath, url);
    if (id) dest.searchParams.set('id', id);
    return Response.redirect(dest.toString(), 307);
  }
}

// Archive paths (/genre/*, /year/*) are listings: humans get the homepage app
// shell (it reads ?genre= / ?year= equivalents via filter state), URL untouched.
async function serveIndexShell(request, url) {
  try {
    const upstream = await fetch(new URL('/index.html', url), {
      headers: { 'user-agent': 'Mozilla/5.0 (compatible; MovieManiaLK-shell/1.0)' },
    });
    if (!upstream.ok) throw new Error('shell ' + upstream.status);
    const html = await upstream.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=86400',
      },
    });
  } catch (_) {
    return Response.redirect(new URL('/', url).toString(), 307);
  }
}

// --- P2: per-episode + archive helpers (server-side only, no extra deps) ---
function normalizeSeasonsLocal(m) {
  if (!m || !m.seasons) return [];
  let seasons = m.seasons;
  if (!Array.isArray(seasons) && typeof seasons === 'object') seasons = Object.values(seasons);
  return (seasons || []).filter(Boolean).map((s, si) => {
    let eps = s.episodes;
    if (eps && !Array.isArray(eps) && typeof eps === 'object') eps = Object.values(eps);
    eps = (eps || []).filter(Boolean).map((e, ei) => ({ ...(e || {}), _ep: (e && e.ep) || (ei + 1) }));
    return { ...(s || {}), _season: (s && s.season) || (si + 1), episodes: eps };
  });
}

function pad2(n) { n = parseInt(n, 10); return isFinite(n) && n >= 0 ? String(n).padStart(2, '0') : '01'; }

// Canonical episode slug: s01-e05 (competitor parity: S01 EP01-05 in titles).
function parseEpisodeSlug(s) {
  if (!s) return null;
  const m = String(s).match(/s(\d{1,3})[\s\-_]*e(\d{1,3})/i)
    || String(s).match(/season[\s\-_]*(\d{1,3})[\s\-_]*episode[\s\-_]*(\d{1,3})/i);
  if (!m) return null;
  return { s: parseInt(m[1], 10), e: parseInt(m[2], 10) };
}

function episodeSlug(sNum, eNum) { return 's' + pad2(sNum) + '-e' + pad2(eNum); }

function episodeUrl(kind, id, sNum, eNum) {
  return canonicalDetailUrl(kind, id) + '/' + episodeSlug(sNum, eNum);
}

function findEpisode(item, sNum, eNum) {
  const seasons = normalizeSeasonsLocal(item);
  for (const s of seasons) {
    if (Number(s._season) !== Number(sNum)) continue;
    for (const ep of s.episodes) {
      if (Number(ep._ep) === Number(eNum)) return { season: s, ep };
    }
  }
  return null;
}

function listEpisodes(item, limit) {
  const seasons = normalizeSeasonsLocal(item);
  const out = [];
  for (const s of seasons) {
    for (const ep of s.episodes) {
      out.push({ s: Number(s._season), e: Number(ep._ep), title: ep.title || '' });
      if (out.length >= (limit || 30)) return out;
    }
  }
  return out;
}

// Best-effort comments fetch (fresh UGC text for the bot HTML). Never throws.
async function fetchComments(id, limit) {
  try {
    const r = await fetch(
      FIREBASE_DB_URL + '/comments/' + encodeURIComponent(id) + '.json?key=' + FIREBASE_API_KEY,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) return [];
    const data = await r.json();
    if (!data || typeof data !== 'object') return [];
    return Object.values(data)
      .filter((c) => c && (c.text || c.comment))
      .map((c) => ({
        name: String(c.name || 'Anonymous').slice(0, 30),
        text: String(c.text || c.comment || '').slice(0, 200),
      }))
      .filter((c) => c.text.trim())
      .slice(-(limit || 5));
  } catch (_) { return []; }
}

// Genre matching mirrors api/movies.js (alias-tolerant: scifi etc).
function genreMatches(itemGenres, slug) {
  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9+]+/g, '');
  const g = String(slug || '').toLowerCase().trim();
  const normG = norm(g);
  return genreArr({ genre: itemGenres }).some((it) => {
    const li = it.toLowerCase();
    const normLi = norm(it);
    if (li === g) return true;
    if (normG === 'scifi' && normLi.includes('sci') && normLi.includes('fi')) return true;
    if ((normG === '18+' || normG === '18') && li === '18+') return true;
    if (normLi === normG) return true;
    if (normLi.includes(normG) || normG.includes(normLi)) return true;
    return false;
  });
}

function archiveLabel(kind, value) {
  const pretty = String(value || '').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  if (kind === 'genre') return pretty + ' Movies & TV Series';
  return 'Movies & TV Series (' + pretty + ')';
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function absImg(u) {
  const s = String(u || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) return s;
  if (s.startsWith('//')) return 'https:' + s;
  if (s.startsWith('/')) return SITE + s;
  return SITE + '/' + s;
}

// WhatsApp/Facebook scrapers time out on multi-MB TMDB "original" posters.
// Downsize to w780 (fast, still 1200x630-compatible) for og:image only —
// the on-page <img> keeps the full-quality poster.
function ogSizedImg(u) {
  const s = absImg(u);
  if (!s) return s;
  if (s.includes('image.tmdb.org/t/p/original/')) return s.replace('/t/p/original/', '/t/p/w780/');
  return s;
}

function isTVItem(m) {
  const t = String((m && m.type) || '').trim().toLowerCase();
  return (
    t === 'tv' || t === 'series' || t === 'tv-series' ||
    t === 'tvshows' || t === 'tvshow' || t === 'show'
  );
}

function pickId(url, typeParam) {
  const norm = (v) => {
    // Trailing slashes / whitespace must not turn a valid id into a 404:
    // /movie/foo/ and /movie/foo resolve to the same canonical page.
    // Also strips the -sinhala-subtitles SEO suffix so
    // /movie/foo-sinhala-subtitles resolves to record "foo".
    // Wildcard rewrites may pass "foo-sinhala-subtitles/s01-e01" as ?id= —
    // only the first segment is the record id (episode handled separately).
    let s = String(v == null ? '' : v).trim().replace(/^\/+|\/+$/g, '');
    try { s = decodeURIComponent(s); } catch (_) {}
    s = s.trim().replace(/^\/+|\/+$/g, '').split('/').filter(Boolean)[0] || '';
    s = stripSeoSuffix(s).trim().replace(/^\/+|\/+$/g, '');
    return s;
  };
  let id = url.searchParams.get('id');
  if (id) return norm(id) || null;
  // Fallback: last path segment (in case of direct /api/seo/<id> hits)
  const parts = url.pathname.split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (last && last !== 'seo' && last !== '[id]' && !last.includes('.js')) {
    return norm(last) || null;
  }
  return null;
}

// Best-effort in-memory cache of the full catalog (663KB) for computing
// genuinely related titles. Edge isolates may drop it; CDN caching
// (s-maxage) means most bot hits never reach this code anyway.
let _allCache = null;
let _allCacheTs = 0;
const ALL_CACHE_TTL = 10 * 60 * 1000;
async function getAllCached() {
  if (_allCache && Date.now() - _allCacheTs < ALL_CACHE_TTL) return _allCache;
  const r = await fetch(
    FIREBASE_DB_URL + '/movies.json?key=' + FIREBASE_API_KEY,
    { headers: { Accept: 'application/json' } }
  );
  if (!r.ok) throw new Error('catalog ' + r.status);
  const data = await r.json();
  _allCache = data && typeof data === 'object' ? data : {};
  _allCacheTs = Date.now();
  return _allCache;
}

function genreArr(m) {
  return String((m && m.genre) || '').split(',').map((s) => s.trim()).filter(Boolean);
}

function kindOf(m) {
  return isTVItem(m) ? 'tv' : 'movie';
}

// Genuinely related titles only: same collection first, then shared genres.
// Never fabricates — every link is a real catalog record with a real page.
function computeRelated(all, selfId, selfItem, limit) {
  limit = limit || 12;
  if (!all || typeof all !== 'object') return [];
  const now = Date.now();
  const mine = genreArr(selfItem).map((g) => g.toLowerCase());
  const myCol = selfItem && selfItem.collection ? String(selfItem.collection).toLowerCase() : '';
  const out = [];
  const seen = new Set([selfId]);
  const push = (id, m) => {
    if (seen.has(id) || out.length >= limit) return;
    if (!m || !m.title) return;
    if (m.scheduledAt && m.scheduledAt > now) return;
    seen.add(id);
    const kind = kindOf(m);
    out.push({
      id,
      title: String(m.title),
      year: m.year ? String(m.year) : '',
      href: canonicalDetailUrl(kind, id),
    });
  };
  const entries = Object.entries(all);
  if (myCol) {
    for (const [id, m] of entries) {
      if (out.length >= Math.min(6, limit)) break;
      if (m && m.collection && String(m.collection).toLowerCase() === myCol) push(id, m);
    }
  }
  if (mine.length) {
    for (const [id, m] of entries) {
      if (out.length >= limit) break;
      if (seen.has(id) || !m) continue;
      if (genreArr(m).some((g) => mine.includes(g.toLowerCase()))) push(id, m);
    }
  }
  return out;
}

async function fetchMovie(id) {
  try {
    const r = await fetch(
      FIREBASE_DB_URL + '/movies/' + encodeURIComponent(id) + '.json?key=' + FIREBASE_API_KEY,
      { headers: { Accept: 'application/json' } }
    );
    if (!r.ok) return null;
    const data = await r.json();
    if (!data || typeof data !== 'object') return null;
    return data;
  } catch (_) {
    return null;
  }
}

function buildTags({ item, id, type, related }) {
  const isTV = type === 'tv' || isTVItem(item);
  const kind = isTV ? 'tv' : 'movie';
  const cleanUrl = canonicalDetailUrl(kind, id);

  const title = item && item.title ? String(item.title) : null;
  const year = item && item.year ? String(item.year) : '';
  const genres = genreArr(item).slice(0, 3).join(', ');
  const genresFull = genreArr(item);
  const rating = item && item.rating != null && String(item.rating).trim() !== ''
    ? String(item.rating).trim()
    : '';
  const quality = item && item.quality ? String(item.quality) : '';

  // Bilingual competitor-parity titles: "Title (Year) Sinhala Subtitles | සිංහල උපසිරැසි සමඟ"
  const pageTitle = title
    ? title + (year ? ' (' + year + ')' : '') + ' Sinhala Subtitles | ' + SI_SUB + ' | Movie Mania LK'
    : isTV
      ? 'TV Series Sinhala Subtitles | ' + SI_SUB + ' — Movie Mania LK'
      : 'Movies Sinhala Subtitles | ' + SI_SUB + ' — Movie Mania LK';

  const fullDesc = item && (item.description || item.desc) ? String(item.description || item.desc).trim() : '';
  const rawDesc = fullDesc;
  let desc = rawDesc
    ? (title ? title + (year ? ' (' + year + ')' : '') + ' Sinhala Subtitles | ' + SI_SUB + '. ' : '') + rawDesc.slice(0, 150) + (rawDesc.length > 150 ? '…' : '')
    : title
      ? title + (year ? ' (' + year + ')' : '') + ' Sinhala Subtitles | ' + SI_SUB +
        (genres ? ' — ' + genres : '') +
        (rating ? ' — IMDb ' + rating : '') +
        '. Watch with Sinhala subtitles on Movie Mania LK.'
      : 'Movie Mania LK — Sri Lanka\u2019s movie & TV series platform with Sinhala subtitles | ' + SI_SUB + '.';

  const img = absImg((item && (item.backdrop || item.poster)) || '') || absImg((item && item.poster) || '') || FALLBACK_IMG;
  const posterOnly = absImg((item && item.poster) || '') || img;

  const keywords = title
    ? [title, title + ' sinhala subtitles', title + ' ' + SI_SUB, title + ' sinhala sub', (isTV ? 'tv series' : 'movie') + ' sinhala subtitles', genres, 'movie mania lk', 'sri lanka movie site', SI_SUB]
        .filter(Boolean).join(', ')
    : 'movie mania lk, sinhala subtitles, ' + SI_SUB + ', sinhala sub movies, tv series sinhala subtitles, sri lanka movie site';

  const ogType = isTV ? 'video.tv_show' : 'video.movie';
  const schemaType = isTV ? 'TVSeries' : 'Movie';

  // Only properties backed by real record data. No aggregateRating: the page
  // collects text comments, not star reviews, so rating markup would be fake.
  const schema = {
    '@context': 'https://schema.org',
    '@type': schemaType,
    name: title ? title + (year ? ' (' + year + ')' : '') + ' Sinhala Subtitles | ' + SI_SUB : pageTitle,
    url: cleanUrl,
    image: posterOnly,
    description: desc,
    inLanguage: ['en', 'si'],
  };
  if (year && /^\d{4}$/.test(year)) schema.datePublished = year + '-01-01';
  if (genres) schema.genre = genres.split(',').map((s) => s.trim());
  const castArr = item && item.cast
    ? String(item.cast).split(',').map((s) => s.trim()).filter(Boolean).slice(0, 12)
    : [];
  if (castArr.length) {
    schema.actor = castArr.slice(0, 8).map((n) => ({ '@type': 'Person', name: n }));
  }

  const sectionName = isTV ? 'TV Series' : 'Movies';
  const sectionHref = SITE + '/?cat=' + (isTV ? 'series' : 'movie');
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: sectionName, item: sectionHref },
      { '@type': 'ListItem', position: 3, name: title || pageTitle, item: cleanUrl },
    ],
  };

  // Availability, stated only when the record actually contains the data.
  const qualities = [];
  try {
    const dls = item && Array.isArray(item.downloads) ? item.downloads : [];
    for (const d of dls) {
      if (!d) continue;
      if (d.pd480 || (d.res && /480/i.test(String(d.res)))) qualities.push('480p');
      if (d.pd720 || (d.res && /720/i.test(String(d.res)))) qualities.push('720p');
      if (d.pd1080 || (d.res && /1080/i.test(String(d.res)))) qualities.push('1080p');
    }
  } catch (_) {}
  const uniqQualities = [...new Set(qualities)];
  const subUrl = item && (item.dlSubUrl || item.subUrl) ? String(item.dlSubUrl || item.subUrl) : '';
  const subBy = item && item.subBy ? String(item.subBy) : '';

  return {
    pageTitle, desc, fullDesc, img, posterOnly, keywords, cleanUrl, ogType,
    schema, breadcrumbSchema, title, kind, year, genresFull, rating, quality,
    castArr, uniqQualities, hasSub: !!subUrl, subBy,
    related: Array.isArray(related) ? related : [],
    sectionName, sectionHref, isTV,
  };
}

function renderHtml(t, id, extra) {
  // t = output of buildTags(). Plain HTML, no app JS — scrapers read <head> only.
  // Humans never see this (bot-only rewrite), but a JS redirect is included
  // as a safety net in case a real browser ever lands here.
  // extra = { episodes: [{href,label}], comments: [{name,text}] } (P2: internal
  // linking to per-episode URLs + fresh UGC text). No player/download URLs ever.
  const realPage = t.kind === 'tv' ? '/tv.html?id=' + encodeURIComponent(id) : '/movie.html?id=' + encodeURIComponent(id);
  const ex = extra || {};
  const epLinks = Array.isArray(ex.episodes) ? ex.episodes.slice(0, 30) : [];
  const comments = Array.isArray(ex.comments) ? ex.comments.slice(-5) : [];
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>' + esc(t.pageTitle) + '</title>\n' +
'<meta name="description" content="' + esc(t.desc) + '">\n' +
'<meta name="keywords" content="' + esc(t.keywords) + '">\n' +
'<meta name="robots" content="index, follow, max-image-preview:large">\n' +
'<meta name="author" content="Movie Mania LK">\n' +
'<link rel="canonical" href="' + esc(t.cleanUrl) + '">\n' +
'<meta property="og:type" content="' + esc(t.ogType) + '">\n' +
'<meta property="og:site_name" content="Movie Mania LK">\n' +
'<meta property="og:title" content="' + esc(t.pageTitle) + '">\n' +
'<meta property="og:description" content="' + esc(t.desc) + '">\n' +
'<meta property="og:url" content="' + esc(t.cleanUrl) + '">\n' +
'<meta property="og:image" content="' + esc(ogSizedImg(t.img)) + '">\n' +
'<meta property="og:image:width" content="1200">\n' +
'<meta property="og:image:height" content="630">\n' +
'<meta property="og:locale" content="en_US">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta name="twitter:title" content="' + esc(t.pageTitle) + '">\n' +
'<meta name="twitter:description" content="' + esc(t.desc) + '">\n' +
'<meta name="twitter:image" content="' + esc(ogSizedImg(t.img)) + '">\n' +
'<link rel="icon" type="image/png" href="/logo.png">\n' +
'<meta name="theme-color" content="#0a0908">\n' +
'<script type="application/ld+json">' + JSON.stringify(t.schema) + '</script>\n' +
'<script type="application/ld+json">' + JSON.stringify(t.breadcrumbSchema) + '</script>\n' +
'</head>\n' +
'<body style="margin:0;background:#0a0908;color:#f2ece2;font-family:system-ui,sans-serif;padding:24px">\n' +
'<main style="max-width:640px;margin:0 auto">\n' +
'<nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:16px;opacity:.85"><a style="color:#f2ece2" href="' + SITE + '/">Home</a><span> › </span><a style="color:#f2ece2" href="' + esc(t.sectionHref) + '">' + esc(t.sectionName) + '</a><span> › </span><span>' + esc(t.title || 'Details') + '</span></nav>\n' +
'<img src="' + esc(t.posterOnly) + '" alt="' + esc((t.title || 'Movie Mania LK') + (t.year ? ' ' + t.year : '') + ' poster') + '" style="max-width:240px;width:60%;border-radius:12px;margin-bottom:16px">\n' +
'<h1 style="font-size:24px;margin:0 0 8px">' + esc(t.title || 'Movie Mania LK') + (t.year ? ' (' + esc(t.year) + ')' : '') + '</h1>\n' +
'<ul style="list-style:none;padding:0;margin:0 0 12px;display:flex;flex-wrap:wrap;gap:8px;font-size:13px">' +
(t.year ? '<li style="background:rgba(255,255,255,.08);padding:4px 12px;border-radius:999px">' + esc(t.year) + '</li>' : '') +
(t.genresFull.map((g) => '<li style="background:rgba(255,255,255,.08);padding:4px 12px;border-radius:999px">' + esc(g) + '</li>').join('')) +
(t.rating ? '<li style="background:rgba(255,255,255,.08);padding:4px 12px;border-radius:999px">⭐ ' + esc(t.rating) + '</li>' : '') +
(t.quality ? '<li style="background:rgba(255,255,255,.08);padding:4px 12px;border-radius:999px">' + esc(t.quality) + '</li>' : '') +
'</ul>\n' +
(t.fullDesc ? '<p style="opacity:.85;font-size:15px;line-height:1.7">' + esc(t.fullDesc) + '</p>\n' : '<p style="opacity:.85;font-size:15px;line-height:1.7">' + esc(t.desc) + '</p>\n') +
(t.castArr.length ? '<h2 style="font-size:16px;margin:20px 0 8px">Cast</h2>\n<p style="opacity:.8;font-size:14px;line-height:1.7">' + esc(t.castArr.join(', ')) + '</p>\n' : '') +
((t.uniqQualities.length || t.hasSub) ? '<h2 style="font-size:16px;margin:20px 0 8px">Sinhala Subtitles</h2>\n<ul style="font-size:14px;line-height:1.8;opacity:.85;margin:0;padding-left:20px">' +
(t.uniqQualities.length ? '<li>Versions: ' + esc(t.uniqQualities.join(', ')) + '</li>' : '') +
(t.hasSub ? '<li>Sinhala subtitles available' + (t.subBy ? ' (by ' + esc(t.subBy) + ')' : '') + '</li>' : '') +
'</ul>\n' : '') +
(t.related.length ? '<h2 style="font-size:16px;margin:20px 0 8px">You May Also Like</h2>\n<ul style="font-size:14px;line-height:2;margin:0;padding-left:20px">' +
t.related.map((r) => '<li><a style="color:#f2ece2" href="' + esc(r.href) + '">' + esc(r.title) + (r.year ? ' (' + esc(r.year) + ')' : '') + '</a></li>').join('') +
'</ul>\n' : '') +
(epLinks.length ? '<h2 style="font-size:16px;margin:20px 0 8px">Episodes</h2>\n<ul style="font-size:14px;line-height:2;margin:0;padding-left:20px">' +
epLinks.map((e) => '<li><a style="color:#f2ece2" href="' + esc(e.href) + '">' + esc(e.label) + '</a></li>').join('') +
'</ul>\n' : '') +
(comments.length ? '<h2 style="font-size:16px;margin:20px 0 8px">Comments (' + comments.length + ')</h2>\n' +
comments.map((c) => '<p style="font-size:14px;line-height:1.7;opacity:.85;margin:0 0 10px"><b>' + esc(c.name) + ':</b> ' + esc(c.text) + '</p>').join('') : '') +
'<p style="margin-top:20px"><a href="' + esc(t.cleanUrl) + '" style="display:inline-block;background:#E8262A;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px">View with Sinhala Subtitles on Movie Mania LK</a></p>\n' +
'</main>\n' +
'<script>try{window.location.replace(' + JSON.stringify(realPage) + ')}catch(e){}</script>\n' +
'</body>\n' +
'</html>';
}

function renderGenericHtml() {
  const title = 'Movie Mania LK — Watch & Download Movies, TV Series with Sinhala Subtitles';
  const desc = 'Sri Lanka\u2019s free movie & TV series streaming and download platform. Watch and download the latest movies and TV series with Sinhala subtitles, updated daily.';
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
'<meta property="og:image:width" content="1200">\n' +
'<meta property="og:image:height" content="630">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta name="twitter:title" content="' + esc(title) + '">\n' +
'<meta name="twitter:description" content="' + esc(desc) + '">\n' +
'<meta name="twitter:image" content="' + FALLBACK_IMG + '">\n' +
'<link rel="icon" type="image/png" href="/logo.png">\n' +
'</head>\n' +
'<body><a href="' + SITE + '/">Movie Mania LK</a></body>\n' +
'</html>';
}

function renderEpisodeHtml({ item, id, sNum, eNum, epTitle, seriesUrl, cleanUrl, related, comments }) {
  const title = item && item.title ? String(item.title) : 'TV Series';
  const year = item && item.year ? String(item.year) : '';
  const epLabel = 'S' + pad2(sNum) + ' E' + pad2(eNum);
  const pageTitle = title + (year ? ' (' + year + ')' : '') + ' ' + epLabel + ' Sinhala Subtitles | ' + SI_SUB + ' | Movie Mania LK';
  const desc = title + ' ' + epLabel + ' Sinhala Subtitles | ' + SI_SUB + '.' + (epTitle ? ' ' + epTitle + '.' : '') + ' Watch with Sinhala subtitles on Movie Mania LK.';
  const img = absImg((item && (item.backdrop || item.poster)) || '') || FALLBACK_IMG;
  const posterOnly = absImg((item && item.poster) || '') || img;
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'TVEpisode',
    name: pageTitle,
    url: cleanUrl,
    image: posterOnly,
    description: desc,
    episodeNumber: Number(eNum),
    partOfSeries: { '@type': 'TVSeries', name: title, url: seriesUrl },
    inLanguage: ['en', 'si'],
  };
  const breadcrumbSchema = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: 'Home', item: SITE + '/' },
      { '@type': 'ListItem', position: 2, name: 'TV Series', item: SITE + '/?cat=series' },
      { '@type': 'ListItem', position: 3, name: title, item: seriesUrl },
      { '@type': 'ListItem', position: 4, name: epLabel, item: cleanUrl },
    ],
  };
  const rel = Array.isArray(related) ? related.slice(0, 12) : [];
  const cmts = Array.isArray(comments) ? comments.slice(-5) : [];
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>' + esc(pageTitle) + '</title>\n' +
'<meta name="description" content="' + esc(desc) + '">\n' +
'<meta name="keywords" content="' + esc(title + ', ' + title + ' ' + epLabel + ' sinhala subtitles, ' + title + ' ' + SI_SUB + ', movie mania lk') + '">\n' +
'<meta name="robots" content="index, follow, max-image-preview:large">\n' +
'<link rel="canonical" href="' + esc(cleanUrl) + '">\n' +
'<meta property="og:type" content="video.tv_show">\n' +
'<meta property="og:site_name" content="Movie Mania LK">\n' +
'<meta property="og:title" content="' + esc(pageTitle) + '">\n' +
'<meta property="og:description" content="' + esc(desc) + '">\n' +
'<meta property="og:url" content="' + esc(cleanUrl) + '">\n' +
'<meta property="og:image" content="' + esc(ogSizedImg(img)) + '">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta name="twitter:title" content="' + esc(pageTitle) + '">\n' +
'<meta name="twitter:description" content="' + esc(desc) + '">\n' +
'<meta name="twitter:image" content="' + esc(ogSizedImg(img)) + '">\n' +
'<link rel="icon" type="image/png" href="/logo.png">\n' +
'<script type="application/ld+json">' + JSON.stringify(schema) + '</script>\n' +
'<script type="application/ld+json">' + JSON.stringify(breadcrumbSchema) + '</script>\n' +
'</head>\n' +
'<body style="margin:0;background:#0a0908;color:#f2ece2;font-family:system-ui,sans-serif;padding:24px">\n' +
'<main style="max-width:640px;margin:0 auto">\n' +
'<nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:16px;opacity:.85"><a style="color:#f2ece2" href="' + SITE + '/">Home</a><span> › </span><a style="color:#f2ece2" href="' + SITE + '/?cat=series">TV Series</a><span> › </span><a style="color:#f2ece2" href="' + esc(seriesUrl) + '">' + esc(title) + '</a><span> › </span><span>' + esc(epLabel) + '</span></nav>\n' +
'<img src="' + esc(posterOnly) + '" alt="' + esc(title + ' ' + epLabel + ' poster') + '" style="max-width:240px;width:60%;border-radius:12px;margin-bottom:16px">\n' +
'<h1 style="font-size:24px;margin:0 0 8px">' + esc(title) + (year ? ' (' + esc(year) + ')' : '') + ' ' + esc(epLabel) + '</h1>\n' +
'<p style="opacity:.85;font-size:15px;line-height:1.7">' + esc(desc) + '</p>\n' +
(epTitle ? '<p style="opacity:.8;font-size:14px">Episode title: ' + esc(epTitle) + '</p>\n' : '') +
'<p style="opacity:.85;font-size:14px">Sinhala subtitles available | ' + esc(SI_SUB) + '.</p>\n' +
'<p><a style="color:#f2ece2" href="' + esc(seriesUrl) + '">← Back to ' + esc(title) + ' all episodes</a></p>\n' +
(rel.length ? '<h2 style="font-size:16px;margin:20px 0 8px">You May Also Like</h2>\n<ul style="font-size:14px;line-height:2;margin:0;padding-left:20px">' +
rel.map((r) => '<li><a style="color:#f2ece2" href="' + esc(r.href) + '">' + esc(r.title) + (r.year ? ' (' + esc(r.year) + ')' : '') + '</a></li>').join('') + '</ul>\n' : '') +
(cmts.length ? '<h2 style="font-size:16px;margin:20px 0 8px">Comments (' + cmts.length + ')</h2>\n' +
cmts.map((c) => '<p style="font-size:14px;line-height:1.7;opacity:.85;margin:0 0 10px"><b>' + esc(c.name) + ':</b> ' + esc(c.text) + '</p>').join('') : '') +
'<p style="margin-top:20px"><a href="' + esc(seriesUrl) + '" style="display:inline-block;background:#E8262A;color:#fff;padding:12px 28px;border-radius:999px;text-decoration:none;font-weight:700;font-size:14px">View Series on Movie Mania LK</a></p>\n' +
'</main>\n' +
'<script>try{window.location.replace(' + JSON.stringify('/tv.html?id=' + encodeURIComponent(id)) + ')}catch(e){}</script>\n' +
'</body>\n' +
'</html>';
}

function renderArchiveHtml({ kind, value, label, cleanUrl, items }) {
  const pageTitle = label + ' Sinhala Subtitles | ' + SI_SUB + ' | Movie Mania LK';
  const desc = 'Browse ' + label + ' with Sinhala subtitles | ' + SI_SUB + ' on Movie Mania LK. Updated daily.';
  const list = Array.isArray(items) ? items.slice(0, 50) : [];
  const schema = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: pageTitle,
    url: cleanUrl,
    description: desc,
    inLanguage: ['en', 'si'],
  };
  return '<!DOCTYPE html>\n' +
'<html lang="en">\n' +
'<head>\n' +
'<meta charset="UTF-8">\n' +
'<meta name="viewport" content="width=device-width, initial-scale=1.0">\n' +
'<title>' + esc(pageTitle) + '</title>\n' +
'<meta name="description" content="' + esc(desc) + '">\n' +
'<meta name="keywords" content="' + esc(label + ' sinhala subtitles, ' + SI_SUB + ', movie mania lk') + '">\n' +
'<meta name="robots" content="index, follow, max-image-preview:large">\n' +
'<link rel="canonical" href="' + esc(cleanUrl) + '">\n' +
'<meta property="og:type" content="website">\n' +
'<meta property="og:site_name" content="Movie Mania LK">\n' +
'<meta property="og:title" content="' + esc(pageTitle) + '">\n' +
'<meta property="og:description" content="' + esc(desc) + '">\n' +
'<meta property="og:url" content="' + esc(cleanUrl) + '">\n' +
'<meta property="og:image" content="' + FALLBACK_IMG + '">\n' +
'<meta name="twitter:card" content="summary_large_image">\n' +
'<meta name="twitter:title" content="' + esc(pageTitle) + '">\n' +
'<meta name="twitter:description" content="' + esc(desc) + '">\n' +
'<meta name="twitter:image" content="' + FALLBACK_IMG + '">\n' +
'<link rel="icon" type="image/png" href="/logo.png">\n' +
'<script type="application/ld+json">' + JSON.stringify(schema) + '</script>\n' +
'</head>\n' +
'<body style="margin:0;background:#0a0908;color:#f2ece2;font-family:system-ui,sans-serif;padding:24px">\n' +
'<main style="max-width:640px;margin:0 auto">\n' +
'<nav aria-label="Breadcrumb" style="font-size:13px;margin-bottom:16px;opacity:.85"><a style="color:#f2ece2" href="' + SITE + '/">Home</a><span> › </span><span>' + esc(label) + '</span></nav>\n' +
'<h1 style="font-size:24px;margin:0 0 8px">' + esc(label) + ' Sinhala Subtitles | ' + esc(SI_SUB) + '</h1>\n' +
'<p style="opacity:.85;font-size:15px;line-height:1.7">' + esc(desc) + ' (' + list.length + ' titles)</p>\n' +
(list.length ? '<ul style="font-size:14px;line-height:2;margin:0;padding-left:20px">' +
list.map((m) => '<li><a style="color:#f2ece2" href="' + esc(m.href) + '">' + esc(m.title) + (m.year ? ' (' + esc(m.year) + ')' : '') + '</a></li>').join('') + '</ul>\n'
: '<p style="opacity:.7">No titles found yet.</p>\n') +
'</main>\n' +
'</body>\n' +
'</html>';
}

function htmlResponse(html, status, cache) {
  return new Response(html, {
    status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': cache || 'public, s-maxage=3600, stale-while-revalidate=86400',
      'X-Robots-Tag': 'index, follow, max-image-preview:large',
    },
  });
}

export default async function handler(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204 });
  }

  const url = new URL(request.url);
  const typeParam = (url.searchParams.get('type') || '').toLowerCase();
  const shellKind = typeParam === 'tv' || typeParam === 'series' ? 'tv' : 'movie';

  // ── P2: archive routes (/genre/:slug, /year/:yyyy) ──
  // Works via vercel.json rewrites (?archive=&slug=/&year=) or direct pathname
  // (local dev). Humans get the homepage app shell; bots get a rendered list.
  const archiveParam = (url.searchParams.get('archive') || '').toLowerCase();
  const pathParts = url.pathname.split('/').filter(Boolean);
  let archiveKind = null;
  let archiveValue = '';
  if (archiveParam === 'genre' || archiveParam === 'year') {
    archiveKind = archiveParam;
    archiveValue = url.searchParams.get(archiveParam === 'genre' ? 'slug' : 'year') || '';
  } else if (pathParts[0] === 'genre' && pathParts[1]) {
    archiveKind = 'genre'; archiveValue = pathParts[1];
  } else if (pathParts[0] === 'year' && pathParts[1]) {
    archiveKind = 'year'; archiveValue = pathParts[1];
  }
  if (archiveKind) {
    archiveValue = stripSeoSuffix(decodeURIComponent(String(archiveValue || '').replace(/\/+$/g, '')));
    if (!isBotRequest(request, url)) {
      return serveIndexShell(request, url);
    }
    const cleanArchiveUrl = SITE + '/' + archiveKind + '/' + encodeURIComponent(archiveValue.toLowerCase());
    try {
      const all = await getAllCached();
      const now = Date.now();
      const entries = Object.entries(all || {});
      let list = [];
      for (const [aid, m] of entries) {
        if (!m || !m.title || !String(m.title).trim()) continue;
        if (m.scheduledAt && m.scheduledAt > now) continue;
        if (archiveKind === 'genre') {
          if (!genreMatches(m.genre || '', archiveValue)) continue;
        } else {
          if (String(m.year || '') !== String(archiveValue)) continue;
        }
        list.push({ id: aid, title: String(m.title), year: m.year ? String(m.year) : '', addedAt: m.addedAt || 0, m });
      }
      list.sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0));
      const items = list.slice(0, 50).map((x) => ({
        href: canonicalDetailUrl(isTVItem(x.m) ? 'tv' : 'movie', x.id),
        title: x.title, year: x.year,
      }));
      return htmlResponse(renderArchiveHtml({
        kind: archiveKind, value: archiveValue,
        label: archiveLabel(archiveKind, archiveValue),
        cleanUrl: cleanArchiveUrl, items,
      }), 200);
    } catch (_) {
      return htmlResponse(renderArchiveHtml({
        kind: archiveKind, value: archiveValue,
        label: archiveLabel(archiveKind, archiveValue),
        cleanUrl: cleanArchiveUrl, items: [],
      }), 200);
    }
  }

  // ── P2: per-episode detection (/tv/:id/.../s01-e05 or ?ep=s01-e05) ──
  // NOTE: after a Vercel rewrite the edge function sees pathname /api/seo,
  // so query params (?ep= from the explicit /tv/:id/:ep rewrite, ?id= subpath
  // from the wildcard rewrite) are the source of truth; raw /tv/ path parsing
  // only applies to local dev (no rewrites).
  let epSlug = url.searchParams.get('ep') || url.searchParams.get('episode') || '';
  if (!epSlug) {
    const rawIdParam = url.searchParams.get('id') || '';
    const segs = String(rawIdParam).split('/').filter(Boolean);
    if (segs.length >= 2) epSlug = segs[segs.length - 1];
  }
  if (!epSlug && pathParts[0] === 'tv' && pathParts.length >= 3) {
    epSlug = pathParts[pathParts.length - 1];
  }
  const epParsed = parseEpisodeSlug(epSlug);

  // Human traffic → static shell, clean URL untouched.
  if (!isBotRequest(request, url)) {
    return serveShell(request, url, shellKind);
  }

  // ── Bot / scraper branch: server-rendered meta tags ──
  const id = pickId(url);

  if (!id) {
    return htmlResponse(renderGenericHtml(), 200);
  }

  const [item, all] = await Promise.all([
    fetchMovie(id),
    // Related links are best-effort: the page must never fail because the
    // catalog fetch did. An empty related list is still a complete page.
    getAllCached().catch(() => null),
  ]);

  if (!item) {
    // Genuine 404 + noindex so Google drops dead links instead of
    // indexing them under the generic title.
    const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
      + '<title>Title Not Found — Movie Mania LK</title>'
      + '<meta name="robots" content="noindex, follow">'
      + '<link rel="canonical" href="' + SITE + '/"></head>'
      + '<body><a href="' + SITE + '/">Back to Movie Mania LK</a></body></html>';
    return htmlResponse(html, 404, 'public, s-maxage=600, stale-while-revalidate=3600');
  }

  // DB truth wins: a TV id shared as /movie/:id still canonicalizes to /tv/:id.
  const type = isTVItem(item) ? 'tv' : 'movie';
  const related = computeRelated(all, id, { ...item, id }, 12);
  // P2: fresh UGC text (best-effort, never blocks the page).
  const comments = await fetchComments(id, 5).catch(() => []);

  // ── P2: per-episode page (bot-only; humans get the tv shell above) ──
  if (epParsed && type === 'tv') {
    const found = findEpisode(item, epParsed.s, epParsed.e);
    if (!found) {
      const html = '<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">'
        + '<title>Episode Not Found — Movie Mania LK</title>'
        + '<meta name="robots" content="noindex, follow">'
        + '<link rel="canonical" href="' + esc(canonicalDetailUrl('tv', id)) + '"></head>'
        + '<body><a href="' + esc(canonicalDetailUrl('tv', id)) + '">Back to series</a></body></html>';
      return htmlResponse(html, 404, 'public, s-maxage=600, stale-while-revalidate=3600');
    }
    const seriesUrl = canonicalDetailUrl('tv', id);
    const epClean = episodeUrl('tv', id, epParsed.s, epParsed.e);
    return htmlResponse(renderEpisodeHtml({
      item, id, sNum: epParsed.s, eNum: epParsed.e,
      epTitle: (found.ep && found.ep.title) || '',
      seriesUrl, cleanUrl: epClean, related, comments,
    }), 200);
  }

  const tags = buildTags({ item, id, type, related });
  // P2: episode index links for series (internal linking to episode URLs).
  let epLinks = [];
  if (type === 'tv') {
    try {
      epLinks = listEpisodes(item, 30).map((x) => ({
        href: episodeUrl('tv', id, x.s, x.e),
        label: (item.title || 'Series') + ' S' + pad2(x.s) + ' E' + pad2(x.e) + ' Sinhala Subtitles | ' + SI_SUB,
      }));
    } catch (_) { epLinks = []; }
  }
  return htmlResponse(renderHtml(tags, id, { episodes: epLinks, comments }), 200);
}
