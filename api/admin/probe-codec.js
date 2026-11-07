// ============================================================================
// Movie Mania LK — Admin API: detect video codec (HEVC / H.264 / AV1 / VP9)
// Endpoint: POST /api/admin/probe-codec   body: { url }
//
// 1) Looks for codec hints in the file name (x265, HEVC, H.264 ...).
// 2) If none, downloads only the first + last 2 MB (HTTP Range) and looks for
//    the codec id inside the MKV/MP4 headers (hvc1, avc1, V_MPEGH/ISO/HEVC ...).
// Admin token required.
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

function codecFromText(s) {
  s = String(s || '');
  if (/hevc|x\.?265|h\.?265/i.test(s)) return 'HEVC';
  if (/\bav1\b/i.test(s)) return 'AV1';
  if (/\bvp9\b/i.test(s)) return 'VP9';
  if (/x\.?264|h\.?264|\bavc\b/i.test(s)) return 'H.264';
  return '';
}

function codecFromBytes(buf) {
  const s = Buffer.from(buf).toString('latin1');
  if (s.includes('V_MPEGH/ISO/HEVC') || s.includes('hvc1') || s.includes('hev1')) return 'HEVC';
  if (s.includes('V_AV1') || s.includes('av01')) return 'AV1';
  if (s.includes('V_VP9') || s.includes('vp09')) return 'VP9';
  if (s.includes('V_MPEG4/ISO/AVC') || s.includes('avc1')) return 'H.264';
  return '';
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

function fmtSize(bytes) {
  if (!bytes || bytes < 1) return '';
  const gb = bytes / 1024 ** 3;
  return gb >= 1 ? gb.toFixed(2) + ' GB' : Math.round(bytes / 1024 ** 2) + ' MB';
}

async function ranged(url, range, signal) {
  const r = await fetch(url, { headers: { Range: range, 'User-Agent': 'Mozilla/5.0' }, redirect: 'follow', signal });
  if (!r.ok && r.status !== 206) throw new Error('HTTP ' + r.status);
  const cr = r.headers.get('content-range') || '';
  const total = Number((cr.match(/\/(\d+)$/) || [])[1]) || Number(r.headers.get('content-length')) || 0;
  const cd = r.headers.get('content-disposition') || '';
  const name = decodeURIComponent((cd.match(/filename\*?=(?:UTF-8'')?"?([^";]+)/i) || [])[1] || '');
  const buf = new Uint8Array(await r.arrayBuffer());
  return { buf, total: r.status === 206 ? total : 0, name };
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

  // 1) file name hint
  let fileName = '';
  try { fileName = decodeURIComponent(u.pathname.split('/').pop() || ''); } catch (_) {}
  let codec = codecFromText(fileName + ' ' + u.search);
  let size = '';
  let source = codec ? 'filename' : '';

  // 2) header probe (also gives size + real file name)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const head = await ranged(url, 'bytes=0-2097151', ctrl.signal);
    size = fmtSize(head.total);
    if (!codec && head.name) { codec = codecFromText(head.name); if (codec) source = 'content-disposition'; }
    if (!codec) { codec = codecFromBytes(head.buf); if (codec) source = 'headers'; }
    if (!codec && head.total > 4194304) {
      const tail = await ranged(url, 'bytes=-2097152', ctrl.signal); // MP4 with moov at the end
      codec = codecFromBytes(tail.buf);
      if (codec) source = 'headers';
    }
  } catch (err) {
    if (!codec) {
      clearTimeout(timer);
      return send(res, 200, { codec: '', size, error: 'Could not read file: ' + err.message });
    }
  }
  clearTimeout(timer);
  return send(res, 200, { codec, size, source });
}
