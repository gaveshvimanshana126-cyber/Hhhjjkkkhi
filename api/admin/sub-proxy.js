// ============================================================================
// Movie Mania LK — Admin API: fetch a subtitle (.srt/.vtt) server-side
// Endpoint: POST /api/admin/sub-proxy   body: { url }
// Used by the admin "Sub Test" tab when the subtitle host blocks browser CORS.
// ============================================================================

import { verifyAdminToken } from '../_lib/adminAuth.js';

const CORS = {
  'Access-Control-Allow-Origin': 'https://www.moviemanialk.com',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, X-Admin-Token, X-Frontend-Access, X-Verified',
};

function send(res, status, data) {
  for (const [k, v] of Object.entries(CORS)) res.setHeader(k, v);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function getToken(req) {
  const a = String(req.headers.authorization || '');
  if (a.startsWith('Bearer ')) return a.slice(7).trim();
  const h = req.headers['x-admin-token'];
  return h ? (Array.isArray(h) ? h[0] : String(h).trim()) : '';
}

function isBlockedHost(host) {
  return (
    /^(localhost|0\.0\.0\.0)$/i.test(host) ||
    /^127\./.test(host) ||
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host) ||
    /^169\.254\./.test(host) ||
    /^\[?::1\]?$/.test(host)
  );
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return send(res, 204, {});
  if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
  if (!(await verifyAdminToken(getToken(req)))) return send(res, 401, { error: 'Unauthorized' });

  let body = req.body;
  if (typeof body === 'string') { try { body = JSON.parse(body); } catch (_) { body = {}; } }
  const url = String((body && body.url) || '').trim();

  let u;
  try { u = new URL(url); } catch (_) { return send(res, 400, { error: 'Invalid URL' }); }
  if (!/^https?:$/.test(u.protocol) || isBlockedHost(u.hostname)) {
    return send(res, 400, { error: 'URL not allowed' });
  }

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal: ctrl.signal });
    if (!r.ok) return send(res, 200, { error: 'HTTP ' + r.status });
    const buf = Buffer.from(await r.arrayBuffer());
    if (buf.length > 3 * 1024 * 1024) return send(res, 200, { error: 'Subtitle file too large' });
    return send(res, 200, { b64: buf.toString('base64'), type: r.headers.get('content-type') || '' });
  } catch (err) {
    return send(res, 200, { error: 'Could not fetch: ' + err.message });
  } finally {
    clearTimeout(timer);
  }
}
