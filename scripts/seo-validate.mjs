// Movie Mania LK — SEO validation sweep (dependency-free).
// Usage:
//   node scripts/seo-validate.mjs [baseUrl] [--full] [--limit N]
// What Googlebot sees: every request uses a Googlebot User-Agent and follows
// the bot branch of /api/seo. Reports: status, redirect chains, title,
// description, canonical (self-match?), robots/noindex, H1, JSON-LD types,
// og tags, meaningful-text size, and sitemap inclusion.
const args = process.argv.slice(2);
const BASE = (args.find((a) => !a.startsWith('--')) || 'https://www.moviemanialk.com').replace(/\/+$/, '');
const FULL = args.includes('--full');
const limArg = args.find((a) => a.startsWith('--limit'));
const LIMIT = limArg ? parseInt(limArg.split('=')[1] || limArg.split(' ')[1] || '0', 10) : 0;

const BOT_UA = 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)';

const pick = (html, re) => {
  const m = html.match(re);
  return m ? m[1].trim().slice(0, 200) : '';
};
// NOTE: attribute values are matched with same-quote closings so apostrophes
// inside double-quoted content (e.g. "Sri Lanka's") don't truncate the capture.
const descRe = [
  /<meta[^>]+name=(["'])description\1[^>]*content=(["'])([\s\S]*?)\2/i,
  /<meta[^>]+content=(["'])([\s\S]*?)\1[^>]*name=(["'])description\3/i,
];
const canonRe = [
  /<link[^>]+rel=(["'])canonical\1[^>]*href=(["'])([\s\S]*?)\2/i,
  /<link[^>]+href=(["'])([\s\S]*?)\1[^>]*rel=(["'])canonical\3/i,
];
const robotsRe = [
  /<meta[^>]+name=(["'])robots\1[^>]*content=(["'])([\s\S]*?)\2/i,
  /<meta[^>]+content=(["'])([\s\S]*?)\1[^>]*name=(["'])robots\3/i,
];
const ogRe = (prop) => [
  new RegExp(`<meta[^>]+property=(["'])${prop}\\1[^>]*content=(["'])([\\s\\S]*?)\\2`, 'i'),
];
const firstGroup = (html, res, idx) => {
  for (const re of res) {
    const m = html.match(re);
    if (m) return (m[idx] || '').trim().slice(0, 200);
  }
  return '';
};

async function fetchManual(url, ua) {
  const chain = [];
  let cur = url;
  for (let i = 0; i < 5; i++) {
    const res = await fetch(cur, { headers: { 'user-agent': ua }, redirect: 'manual' });
    const st = res.status;
    await res.text().catch(() => '');
    if ([301, 302, 303, 307, 308].includes(st)) {
      const loc = res.headers.get('location');
      chain.push(`${st} -> ${loc}`);
      cur = new URL(loc, cur).toString();
      continue;
    }
    return { status: st, finalUrl: cur, chain, res: null };
  }
  return { status: 0, finalUrl: cur, chain, res: null };
}

async function getHtml(url, ua) {
  const res = await fetch(url, { headers: { 'user-agent': ua }, redirect: 'follow' });
  return { status: res.status, finalUrl: res.url, html: await res.text() };
}

function analyze(url, status, finalUrl, html) {
  const title = pick(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
  const desc = firstGroup(html, [descRe[0]], 3) || firstGroup(html, [descRe[1]], 2);
  const canon = firstGroup(html, [canonRe[0]], 3) || firstGroup(html, [canonRe[1]], 2);
  const robots = firstGroup(html, [robotsRe[0]], 3) || firstGroup(html, [robotsRe[1]], 2);
  // Strip executable/script templates first: client-side templates contain
  // literal "${...}" markup that must not count as rendered H1s or links.
  // (LD+JSON scripts are extracted before stripping.)
  const ldTypes = [...html.matchAll(/<script[^>]+type=(["'])application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/gi)]
    .map((m) => { try { const j = JSON.parse(m[2]); return [].concat(j['@type'] || '?').join('+'); } catch { return 'INVALID-JSON'; } });
  const staticHtml = html.replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const h1s = [...staticHtml.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi)].map((m) => m[1].replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const ogTitle = firstGroup(html, ogRe('og:title'), 3);
  const ogImage = firstGroup(html, ogRe('og:image'), 3);
  const crawlLinks = [...staticHtml.matchAll(/<a[^>]+href=(["'])((?:\/(?:movie|tv)\/|https?:\/\/[^"']+\/(?:movie|tv)\/)[^"']*)\1/gi)]
    .map((m) => m[2]);
  const text = staticHtml
    .replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const cleanPath = new URL(url).pathname.replace(/\/+$/, '') || '/';
  const canonPath = (() => { try { return new URL(canon).pathname.replace(/\/+$/, '') || '/'; } catch { return null; } })();
  return {
    url, status, finalUrl, title, desc, canon, robots, h1s, ldTypes, ogTitle, ogImage,
    links: [...new Set(crawlLinks)], textLen: text.length,
    canonSelf: canonPath === null ? null : canonPath === cleanPath,
    noindex: /noindex/i.test(robots),
    // The homepage is a JS app shell: its H1/cards render client-side (which
    // Googlebot executes). Raw-HTML H1/body checks don't apply to it — but
    // its <head> meta must still be complete.
    isShell: /id="movieGrid"|id="heroSlidesWrap"/.test(html),
  };
}

function verdict(a) {
  const problems = [];
  if (a.status !== 200) problems.push(`STATUS-${a.status}`);
  if (a.noindex) problems.push('NOINDEX');
  if (a.canonSelf === false) problems.push(`CANON-MISMATCH(${a.canon})`);
  if (!a.title || /^(Movie Details|TV Series Details) —/.test(a.title)) problems.push('GENERIC-TITLE');
  if (!a.desc || a.desc.length < 30) problems.push('THIN-DESC');
  if (!a.isShell) {
    if (!a.h1s.length) problems.push('NO-H1');
    if (a.textLen < 300) problems.push(`THIN-BODY(${a.textLen})`);
  }
  if (!a.ldTypes.length) problems.push('NO-JSONLD');
  if (a.ldTypes.includes('INVALID-JSON')) problems.push('BAD-JSONLD');
  return problems;
}

// ── main ──
const sm = await (await fetch(`${BASE}/sitemap.xml`)).text();
const smLocs = [...sm.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => m[1].trim());
// Map sitemap entries onto the tested base (lets localhost runs validate the
// production-URL sitemap path-for-path).
const locs = [...new Set(smLocs.map((u) => {
  try { return BASE + new URL(u).pathname; } catch { return null; }
}).filter(Boolean))];
console.log(`sitemap entries (same-origin): ${locs.length}`);
const badLocs = [...sm.matchAll(/<loc>([\s\S]*?)<\/loc>/g)].map((m) => m[1].trim())
  .filter((u) => /#|\?/.test(u));
console.log(`sitemap locs with # or ? (must be 0): ${badLocs.length}${badLocs.length ? ' -> ' + badLocs.join(', ') : ''}`);

const inSitemap = new Set(locs.map((u) => { try { return new URL(u).pathname.replace(/\/+$/, ''); } catch { return u; } }));
let targets = locs;
if (!FULL) {
  const samples = [
    '/movie/13-days-13-nights-81-sinhala-subtitles', '/movie/29-45-sinhala-subtitles', '/movie/4-years-52-sinhala-subtitles', '/movie/abhirami-20-sinhala-subtitles',
    '/movie/agadha-20-sinhala-subtitles', '/movie/all-that-we-never-were-48-sinhala-subtitles', '/movie/alpha-65-sinhala-subtitles', '/movie/alterity-16-sinhala-subtitles',
  ].map((p) => BASE + p);
  targets = [...new Set([...samples.filter((u) => inSitemap.has(new URL(u).pathname)), ...locs.slice(0, 4)])];
}
if (LIMIT > 0) targets = targets.slice(0, LIMIT);

let pass = 0, fail = 0;
for (const u of targets) {
  const { status, finalUrl } = await fetchManual(u, BOT_UA);
  const g = await getHtml(u, BOT_UA);
  const a = analyze(u, g.status, g.finalUrl, g.html);
  const problems = verdict(a);
  const path = new URL(u).pathname;
  if (!problems.length) {
    pass++;
    const h1snap = (a.h1s[0] || '(shell/h1-js)').slice(0, 50);
    console.log(`VALID  [${a.status}] ${path} | h1="${h1snap}" | links=${a.links.length} | text=${a.textLen} | ld=${a.ldTypes.join(',')}`);
  } else {
    fail++;
    console.log(`FAIL   [${a.status}] ${path} :: ${problems.join(' ')}`);
    console.log(`       title="${a.title.slice(0, 80)}" canon="${a.canon}" final="${finalUrl}"`);
  }
}
console.log(`\nRESULT: ${pass} VALID, ${fail} FAIL out of ${targets.length} checked (${FULL ? 'full sitemap sweep' : 'sample mode — rerun with --full'})`);
process.exit(fail ? 1 : 0);
