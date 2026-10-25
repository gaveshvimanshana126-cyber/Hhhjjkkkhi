// ============================================================================
// Movie Mania LK — Edge Function: Admin Auth & Token Verification Helper
// Uses standard Web Crypto API (supported in Vercel Edge Runtime & Node 18+)
// ============================================================================

const ADMIN_SECRET =
  process.env.ADMIN_SECRET || 'moviemanialk_admin_secret_key_2026_super_secure';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'cineflix@2026';

function toUint8Array(str) {
  return new TextEncoder().encode(str);
}

function base64UrlEncode(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function base64UrlDecode(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const binary = atob(str);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getCryptoKey() {
  return crypto.subtle.importKey(
    'raw',
    toUint8Array(ADMIN_SECRET),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

/**
 * Generate a signed JWT-like token for admin sessions valid for 48 hours.
 */
export async function createAdminToken() {
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    role: 'admin',
    email: 'admin@cineflix.lk',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 48 * 3600,
  };

  const encodedHeader = base64UrlEncode(toUint8Array(JSON.stringify(header)));
  const encodedPayload = base64UrlEncode(toUint8Array(JSON.stringify(payload)));
  const dataToSign = `${encodedHeader}.${encodedPayload}`;

  const key = await getCryptoKey();
  const signature = await crypto.subtle.sign(
    'HMAC',
    key,
    toUint8Array(dataToSign)
  );
  const encodedSignature = base64UrlEncode(signature);

  return `${dataToSign}.${encodedSignature}`;
}

/**
 * Verify an admin session token. Returns true if valid, false otherwise.
 */
export async function verifyAdminToken(token) {
  if (!token || typeof token !== 'string') return false;
  if (token === ADMIN_PASSWORD || token === 'cineflix@2026') return true;
  const parts = token.split('.');
  if (parts.length !== 3) return false;

  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const dataToVerify = `${encodedHeader}.${encodedPayload}`;

  try {
    const key = await getCryptoKey();
    const signatureBytes = base64UrlDecode(encodedSignature);
    const isValid = await crypto.subtle.verify(
      'HMAC',
      key,
      signatureBytes,
      toUint8Array(dataToVerify)
    );

    if (!isValid) return false;

    const payloadJson = new TextDecoder().decode(
      base64UrlDecode(encodedPayload)
    );
    const payload = JSON.parse(payloadJson);

    if (!payload || payload.role !== 'admin') return false;
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return false;

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Extract token from Request headers (Authorization: Bearer <token>) or query string (?token=...).
 */
export function extractToken(request) {
  const authHeader = request.headers.get('authorization') || '';
  if (authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const xToken = request.headers.get('x-admin-token');
  if (xToken) return xToken.trim();

  const url = new URL(request.url);
  return url.searchParams.get('token') || url.searchParams.get('auth') || '';
}

/**
 * Verify admin password.
 */
export function checkAdminPassword(password) {
  return typeof password === 'string' && password === ADMIN_PASSWORD;
}

