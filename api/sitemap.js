const FIREBASE_DB_URL = "https://cineflix1-1fdc6-default-rtdb.firebaseio.com";
const FIREBASE_API_KEY = "AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8";

const SITE = "https://www.moviemanialk.com";

// Static pages: ONLY canonical, fragment-free, indexable URLs.
// (Query/filter variants like /?cat=movie canonicalize to "/" and must NOT
// be listed — sitemaps may only contain canonical URLs.)
const STATIC_PAGES = [
  { loc: "/", changefreq: "daily", priority: "1.0" },
];

// Type detection mirrors api/movies.js (tolerant of legacy values).
function isTV(m) {
  const t = m && m.type ? String(m.type).trim().toLowerCase() : "";
  return (
    t === "tv" || t === "series" || t === "tv-series" || t === "tvseries" ||
    t === "tvshows" || t === "tv_shows" || t === "tv-shows" ||
    t === "tv show" || t === "tvshow" || t === "show" || t === "tv shows"
  );
}

// A record is sitemap-eligible only if it is public, has a title, and is not
// scheduled for the future. Mirrors the listing filter in api/movies.js.
function isIndexable(id, m, now) {
  if (!m || typeof m !== "object") return false;
  if (!m.title || !String(m.title).trim()) return false;
  if (m.scheduledAt && m.scheduledAt > now) return false;
  return true;
}

// Pre-built XML entity strings (built from charCodes to survive file IO)
const E_AMP  = String.fromCharCode(38) + "amp;";   // &
const E_LT   = String.fromCharCode(38) + "lt;";    // <
const E_GT   = String.fromCharCode(38) + "gt;";    // >
const E_QUOT = String.fromCharCode(38) + "quot;";  // "
const E_APOS = String.fromCharCode(38) + "apos;";  // '

// Escape XML special characters in user-supplied strings
function escapeXml(str) {
  if (str === undefined || str === null) return "";
  return String(str)
    .split(String.fromCharCode(38)).join(E_AMP)
    .split("<").join(E_LT)
    .split(">").join(E_GT)
    .split('"').join(E_QUOT)
    .split("'").join(E_APOS);
}

// Format a timestamp into ISO 8601 (W3C format Google expects)
function toIsoDate(value) {
  if (!value) return new Date().toISOString();
  const d = typeof value === "number" ? new Date(value) : new Date(value);
  if (isNaN(d.getTime())) return new Date().toISOString();
  return d.toISOString();
}

// Best lastmod timestamp for an entry: prefer updatedAt, then addedAt, then now
function pickLastMod(m) {
  const candidates = [
    m && m.updatedAt,
    m && m.updated_at,
    m && m.modifiedAt,
    m && m.editedAt,
    m && m.addedAt,
    m && m.createdAt,
    m && m.added,
    m && m.date
  ].filter(Boolean);
  for (const c of candidates) {
    const iso = toIsoDate(c);
    if (iso) return iso;
  }
  return new Date().toISOString();
}

// Only absolute http(s) image URLs are valid for the image extension.
function absImageUrl(m) {
  const raw = (m.poster && (m.poster.url || m.poster)) || m.posterUrl || m.thumbnail || m.thumb || null;
  if (!raw || typeof raw !== "object" && typeof raw !== "string") return null;
  const s = String(typeof raw === "object" ? (raw.url || "") : raw).trim();
  if (/^https?:\/\//i.test(s)) return s;
  return null;
}

// Build one <url> block (with optional <image:image> extension)
function buildUrl(loc, lastmod, changefreq, priority, image) {
  let xml = "  <url>\n";
  xml += "    <loc>" + escapeXml(loc) + "</loc>\n";
  if (lastmod)   xml += "    <lastmod>" + escapeXml(lastmod) + "</lastmod>\n";
  if (changefreq) xml += "    <changefreq>" + escapeXml(changefreq) + "</changefreq>\n";
  if (priority !== undefined && priority !== null) {
    xml += "    <priority>" + escapeXml(priority) + "</priority>\n";
  }
  if (image) {
    xml += "    <image:image>\n";
    xml += "      <image:loc>" + escapeXml(image) + "</image:loc>\n";
    xml += "    </image:image>\n";
  }
  xml += "  </url>";
  return xml;
}

export default async function handler(req, res) {
  try {
    // ── 1. Static pages (canonical only) ───────────────────────────────
    const blocks = [];
    const now = new Date().toISOString();
    for (const p of STATIC_PAGES) {
      blocks.push(buildUrl(SITE + p.loc, now, p.changefreq, p.priority, null));
    }

    // ── 2. Fetch all entries from Firebase ─────────────────────────────
    const response = await fetch(
      FIREBASE_DB_URL + "/movies.json?key=" + FIREBASE_API_KEY
    );

    if (!response.ok) {
      throw new Error("Firebase returned " + response.status);
    }

    const movies = await response.json();
    const nowMs = Date.now();

    // ── 3. Canonical detail URLs only ──────────────────────────────────
    // One <url> per indexable record. No /seris/ aliases, no query strings,
    // no fragments, no scheduled/untitled records — every entry must be a
    // canonical URL returning HTTP 200.
    // P2: also per-episode URLs (/tv/:id/.../s01-e01), genre archives
    // (/genre/:slug) and year archives (/year/:yyyy) — competitor parity.
    const tvUrls = [];
    const movieUrls = [];
    const episodeUrls = [];
    const genreCounts = new Map();
    const yearCounts = new Map();
    const genreFirstSeen = new Map();
    let tvCount = 0;
    let movieCount = 0;
    let episodeCount = 0;
    let skipped = 0;
    const EP_TOTAL_CAP = 15000;
    const EP_PER_SERIES_CAP = 100;

    const slugify = (s) => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const pad2s = (n) => String(n).padStart(2, '0');

    if (movies && typeof movies === "object") {
      for (const id of Object.keys(movies)) {
        const m = movies[id] || {};
        if (!isIndexable(id, m, nowMs)) { skipped++; continue; }
        const encodedId = encodeURIComponent(id);
        const lastmod = pickLastMod(m);
        const poster = absImageUrl(m);

        // Archive buckets (only indexable records count).
        const genres = String(m.genre || '').split(',').map((s) => s.trim()).filter(Boolean);
        for (const g of genres) {
          const slug = slugify(g);
          if (!slug) continue;
          genreCounts.set(slug, (genreCounts.get(slug) || 0) + 1);
          if (!genreFirstSeen.has(slug)) genreFirstSeen.set(slug, g);
        }
        if (m.year && /^\d{4}$/.test(String(m.year))) {
          yearCounts.set(String(m.year), (yearCounts.get(String(m.year)) || 0) + 1);
        }

        if (isTV(m)) {
          tvUrls.push(
            buildUrl(SITE + "/tv/" + encodedId + "-sinhala-subtitles", lastmod, "weekly", "0.8", poster)
          );
          tvCount++;
          // Per-episode URLs (capped).
          try {
            let seasons = m.seasons;
            if (seasons && !Array.isArray(seasons) && typeof seasons === 'object') seasons = Object.values(seasons);
            seasons = (seasons || []).filter(Boolean);
            let perSeries = 0;
            for (let si = 0; si < seasons.length; si++) {
              if (episodeCount >= EP_TOTAL_CAP) break;
              const s = seasons[si] || {};
              const sNum = s.season || (si + 1);
              let eps = s.episodes;
              if (eps && !Array.isArray(eps) && typeof eps === 'object') eps = Object.values(eps);
              eps = (eps || []).filter(Boolean);
              for (let ei = 0; ei < eps.length; ei++) {
                if (episodeCount >= EP_TOTAL_CAP || perSeries >= EP_PER_SERIES_CAP) break;
                const ep = eps[ei] || {};
                const eNum = ep.ep || (ei + 1);
                episodeUrls.push(
                  buildUrl(SITE + "/tv/" + encodedId + "-sinhala-subtitles/s" + pad2s(sNum) + "-e" + pad2s(eNum), lastmod, "monthly", "0.6", null)
                );
                episodeCount++;
                perSeries++;
              }
            }
          } catch (_) {}
        } else {
          movieUrls.push(
            buildUrl(SITE + "/movie/" + encodedId + "-sinhala-subtitles", lastmod, "monthly", "0.7", poster)
          );
          movieCount++;
        }
      }
    }

    // Archive URLs: only buckets with >= 2 titles (thin archives excluded).
    const genreUrls = [];
    for (const [slug, count] of [...genreCounts.entries()].sort()) {
      if (count < 2) continue;
      genreUrls.push(buildUrl(SITE + "/genre/" + slug, now, "daily", "0.6", null));
    }
    const yearUrls = [];
    for (const [yr, count] of [...yearCounts.entries()].sort().reverse()) {
      if (count < 2) continue;
      yearUrls.push(buildUrl(SITE + "/year/" + yr, now, "daily", "0.6", null));
    }

    // ── 4. Compose XML with clearly separated sections ─────────────────
    const sitemap =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset\n' +
      '  xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"\n' +
      '  xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">\n' +
      '<!-- ===================== STATIC PAGES (' + blocks.length + ') ===================== -->\n' +
      blocks.join("\n") + "\n" +
      '<!-- ===================== GENRE ARCHIVES (' + genreUrls.length + ') ===================== -->\n' +
      genreUrls.join("\n") + "\n" +
      '<!-- ===================== YEAR ARCHIVES (' + yearUrls.length + ') ===================== -->\n' +
      yearUrls.join("\n") + "\n" +
      '<!-- ===================== TV SERIES (' + tvCount + ') ===================== -->\n' +
      tvUrls.join("\n") + "\n" +
      '<!-- ===================== EPISODES (' + episodeCount + ') ===================== -->\n' +
      episodeUrls.join("\n") + "\n" +
      '<!-- ===================== MOVIES (' + movieCount + ') ===================== -->\n' +
      movieUrls.join("\n") + "\n" +
      '</urlset>';

    // ── 5. Send response with proper caching headers ───────────────────
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.setHeader(
      "Cache-Control",
      "public, s-maxage=1800, stale-while-revalidate=43200"
    );

    console.log(
      "sitemap.js generated: " + blocks.length + " static, " +
      genreUrls.length + " genres, " + yearUrls.length + " years, " +
      tvCount + " TV series, " + episodeCount + " episodes, " + movieCount + " movies, " +
      skipped + " skipped (unscheduled/untitled) - at " + now
    );

    res.status(200).send(sitemap);
  } catch (error) {
    console.error("Sitemap generation failed:", error);
    // Return a valid minimal sitemap so crawlers don't break
    const fallback =
      '<?xml version="1.0" encoding="UTF-8"?>\n' +
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
      '  <url>\n' +
      '    <loc>' + SITE + '/</loc>\n' +
      '    <changefreq>daily</changefreq>\n' +
      '    <priority>1.0</priority>\n' +
      '  </url>\n' +
      '</urlset>';
    res.setHeader("Content-Type", "application/xml; charset=utf-8");
    res.status(200).send(fallback);
  }
}
