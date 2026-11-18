// ============================================================================
// Movie Mania LK — Database resolver
//
// The database is chosen by the environment, never by this file:
//   - Production/Preview: FIREBASE_DB_URL from Vercel Environment Variables.
//   - Local development: FIREBASE_DB_URL from .env (a separate dev project).
//
// The fallback below is the original production RTDB so a missing env var
// cannot silently switch the live site to the local development database.
// ============================================================================

export const PRODUCTION_FALLBACK_DB_URL =
  'https://cineflix1-1fdc6-default-rtdb.firebaseio.com';
export const FALLBACK_API_KEY = 'AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8';

function readEnv(name) {
  try {
    if (typeof process !== 'undefined' && process.env && process.env[name]) {
      return String(process.env[name]).trim();
    }
  } catch (_) {}
  return '';
}

// Effective RTDB base URL.
// - Always honors FIREBASE_DB_URL (or FIREBASE_DATABASE_URL) from the
//   environment, so each deployment reads its own database.
// - Only falls back to the original production RTDB when the env var is
//   missing. Never falls back to the local development database.
export function resolveDbUrl() {
  const configured = (
    readEnv('FIREBASE_DB_URL') || readEnv('FIREBASE_DATABASE_URL')
  ).replace(/\/+$/, '');
  return configured || PRODUCTION_FALLBACK_DB_URL;
}

export function resolveApiKey() {
  return readEnv('FIREBASE_API_KEY') || FALLBACK_API_KEY;
}

export function dbJsonUrl(path, query = {}) {
  const cleanPath = String(path || '').replace(/^\/+|\/+$/g, '');
  const url = new URL(resolveDbUrl() + '/' + cleanPath + '.json');
  const key = resolveApiKey();
  if (key) url.searchParams.set('key', key);
  for (const [k, v] of Object.entries(query)) {
    if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}
