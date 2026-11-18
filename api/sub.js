// ============================================================================
// Movie Mania LK — public subtitle proxy (same-origin helper for player.js)
// GET /api/sub?url=<subtitle url>
// Only whitelisted subtitle hosts are fetched (no open proxy). Returns raw
// bytes so the player can pick the right text encoding (UTF-8 / UTF-16).
// ============================================================================

const ALLOWED = ['moviemanialk.com', 'asitha.top'];   // host or any sub-domain of these
const MAX_BYTES = 3 * 1024 * 1024;

function hostAllowed(host) {
  host = String(host || '').toLowerCase();
  return ALLOWED.some((d) => host === d || host.endsWith('.' + d));
}

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.statusCode = 405; return res.end('Method not allowed'); }

  let target;
  try { target = new URL(String(req.query.url || '')); } catch (_) { res.statusCode = 400; return res.end('Invalid URL'); }
  if (target.protocol !== 'https:' || !hostAllowed(target.hostname)) {
    res.statusCode = 403; return res.end('Host not allowed');
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    let url = target.toString();
    let r;
    for (let hop = 0; hop < 4; hop++) {            // follow redirects manually, re-checking each host
      r = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'Mozilla/5.0' }, signal: ctrl.signal });
      if (r.status >= 300 && r.status < 400 && r.headers.get('location')) {
        const next = new URL(r.headers.get('location'), url);
        if (next.protocol !== 'https:' || !hostAllowed(next.hostname)) { res.statusCode = 403; return res.end('Redirect not allowed'); }
        url = next.toString();
        continue;
      }
      break;
    }
    if (!r || !r.ok) { res.statusCode = 502; return res.end('Upstream error'); }
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > MAX_BYTES) { res.statusCode = 413; return res.end('Too large'); }
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Cache-Control', 'public, s-maxage=3600, max-age=600');
    return res.end(buf);
  } catch (err) {
    res.statusCode = 502;
    return res.end('Fetch failed');
  } finally {
    clearTimeout(timer);
  }
}
