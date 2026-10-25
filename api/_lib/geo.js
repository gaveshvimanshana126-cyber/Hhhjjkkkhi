// ============================================================================
// Movie Mania LK — Geo Access Control (Edge)
// Whitelist-based country gating. Copyright-sensitive data (download links,
// stream/player URLs, subtitle files) is REMOVED from API responses for
// visitors from countries that are not whitelisted by the admin.
// Settings are stored at "settings/geoGate" in Firebase RTDB and are fully
// manageable from the admin dashboard Settings tab.
// ============================================================================

const FIREBASE_DB_URL =
  process.env.FIREBASE_DB_URL || 'https://cineflix1-1fdc6-default-rtdb.firebaseio.com';
const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY || 'AIzaSyAh6zMB65iWqt3R2Ep0C5_7eV8ZaUHI7t8';

// In-memory cache (per edge isolate)
const memoryCache = new Map();
const CACHE_TTL = 60 * 1000; // 60s — keeps admin edits near-instant while limiting DB calls

// IP → country cache (country rarely changes, so this is long-lived)
const ipCountryCache = new Map();
const IP_CACHE_TTL = 7 * 24 * 60 * 60 * 1000; // 7 days

export const DEFAULT_GEO_SETTINGS = {
  enabled: false,
  // ISO-3166 alpha-2 country codes allowed to receive downloads/streams.
  countries: [],
  // Behavior when the visitor's country cannot be determined.
  unknownCountry: 'block', // 'block' | 'allow'
  // Which copyright-sensitive features to strip from non-whitelisted visitors.
  hide: {
    downloads: true,
    players: true,
    subtitles: true,
  },
  // Admin-managed map of "client IP" → "ISO-2 country".
  // Lets you correct wrong geo-IP results (e.g. your own VPN/WARP exit IP).
  ipOverrides: {},
};

// Cloudflare / common anycast ranges — geo-IP databases often report these as
// the wrong country (a WARP/VPN exit node in JP/SG instead of the real LK).
const CLOUDFLARE_IPV4 = [
  '173.245.48.0/20', '103.21.244.0/22', '103.22.200.0/22', '103.31.4.0/22',
  '141.101.64.0/18', '108.162.192.0/18', '190.93.240.0/20', '188.114.96.0/20',
  '197.234.240.0/22', '198.41.128.0/17', '162.158.0.0/15', '104.16.0.0/13',
  '104.24.0.0/14', '172.64.0.0/13', '131.0.72.0/22',
];
const CLOUDFLARE_IPV6 = [
  '2400:cb00', '2606:4700', '2803:f800', '2405:b500', '2405:8100', '2a06:98c0', '2c0f:f248',
];

function ipToLong(ip) {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((parts[0] << 24) >>> 0) + (parts[1] << 16) + (parts[2] << 8) + parts[3];
}

function isInCidr(ip, cidr) {
  const [base, bitsStr] = cidr.split('/');
  const bits = parseInt(bitsStr, 10);
  const baseLong = ipToLong(base);
  const ipLong = ipToLong(ip);
  if (baseLong === null || ipLong === null) return false;
  if (bits === 0) return true;
  const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
  return (ipLong & mask) === (baseLong & mask);
}

/** True when the IP belongs to a known anycast/proxy range (country unreliable). */
export function isProxyIp(ip) {
  if (!ip) return false;
  const v4 = ipToLong(ip);
  if (v4 !== null) {
    for (const cidr of CLOUDFLARE_IPV4) if (isInCidr(ip, cidr)) return true;
    return false;
  }
  const low = String(ip).toLowerCase();
  for (const p of CLOUDFLARE_IPV6) if (low.startsWith(p)) return true;
  return false;
}

function firebaseUrl(path) {
  const cleanPath = path.startsWith('/') ? path.slice(1) : path;
  const url = new URL(`${FIREBASE_DB_URL}/${cleanPath}.json`);
  if (FIREBASE_API_KEY) url.searchParams.set('key', FIREBASE_API_KEY);
  return url.toString();
}

/**
 * Fetch + normalize the geo-gate settings stored at "settings/geoGate".
 * Always resolves (never throws) — falls back to disabled defaults.
 */
export async function getGeoSettings() {
  const cacheKey = 'geoGate';
  const cached = memoryCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp <= CACHE_TTL) return cached.data;

  try {
    const res = await fetch(firebaseUrl('settings/geoGate'));
    const data = res.ok ? await res.json() : null;
    const settings = normalizeSettings(data);
    memoryCache.set(cacheKey, { data: settings, timestamp: Date.now() });
    return settings;
  } catch (_) {
    return DEFAULT_GEO_SETTINGS;
  }
}

function normalizeSettings(raw) {
  const s = raw && typeof raw === 'object' ? raw : {};
  // Firebase may store array-like lists as objects — normalize to string array.
  let countries = [];
  if (Array.isArray(s.countries)) countries = s.countries;
  else if (s.countries && typeof s.countries === 'object') countries = Object.values(s.countries);

  const hide = s.hide && typeof s.hide === 'object' ? s.hide : {};
  const hideBool = (v, dflt) => (typeof v === 'boolean' ? v : dflt);

  // IP → country overrides (admin managed)
  const ipOverrides = {};
  const rawOverrides = s.ipOverrides && typeof s.ipOverrides === 'object' ? s.ipOverrides : {};
  for (const [ip, cc] of Object.entries(rawOverrides)) {
    const key = String(ip || '').trim();
    const code = String(cc || '').trim().toUpperCase();
    if (key && /^[A-Z]{2}$/.test(code)) ipOverrides[key] = code;
  }

  return {
    enabled: s.enabled === true,
    countries: countries
      .map((c) => String(c || '').toUpperCase().trim().slice(0, 2))
      .filter((c) => /^[A-Z]{2}$/.test(c)),
    unknownCountry: s.unknownCountry === 'allow' ? 'allow' : 'block',
    hide: {
      downloads: hideBool(hide.downloads, DEFAULT_GEO_SETTINGS.hide.downloads),
      players: hideBool(hide.players, DEFAULT_GEO_SETTINGS.hide.players),
      subtitles: hideBool(hide.subtitles, DEFAULT_GEO_SETTINGS.hide.subtitles),
    },
    ipOverrides,
  };
}

/**
 * Resolve the visitor's country code.
 * 1) Platform geo headers (Vercel / Cloudflare) — fastest, no network call
 * 2) Fallback: look up the client IP via a public geo-IP service
 *    (needed when the platform does not forward geo headers)
 * @returns {Promise<string|null>} ISO-3166 alpha-2 code, or null when unknown.
 */
export async function resolveCountry(request, settings = DEFAULT_GEO_SETTINGS) {
  const ip = getClientIp(request);

  // 1) Admin override for this exact client IP (highest priority — server side,
  //    so a visitor can never spoof their way into the whitelist)
  if (ip && settings.ipOverrides && settings.ipOverrides[ip]) {
    return { country: settings.ipOverrides[ip], source: 'override', provider: 'admin-override', proxy: isProxyIp(ip), ip };
  }

  // 2) Platform geo header
  const candidates = [
    request.headers.get('x-vercel-ip-country'),
    request.headers.get('cf-ipcountry'),
    request.headers.get('x-country-code'),
    request.headers.get('x-geo-country'),
  ];
  for (const c of candidates) {
    const code = String(c || '').trim().toUpperCase();
    if (/^[A-Z]{2}$/.test(code)) {
      return { country: code, source: 'header', provider: 'platform-header', proxy: isProxyIp(ip), ip };
    }
  }

  // 3) No geo header from the platform → resolve it from the client IP
  if (!ip) return { country: null, source: 'none', provider: null, proxy: false, ip: null };

  const res = await lookupCountryByIp(ip);
  return {
    country: res.country,
    source: res.country ? 'lookup' : 'none',
    provider: res.provider,
    proxy: res.proxy,
    ip,
  };
}

/** Extract the real client IP from proxy headers. */
export function getClientIp(request) {
  const h = request.headers;
  const candidates = [
    h.get('cf-connecting-ip'),
    h.get('true-client-ip'),
    h.get('x-real-ip'),
    h.get('x-client-ip'),
    h.get('x-vercel-forwarded-for'),
    h.get('x-forwarded-for'),
  ];
  for (const raw of candidates) {
    if (!raw) continue;
    const ip = String(raw).split(',')[0].trim();
    if (isPublicIp(ip)) return ip;
  }
  return null;
}

function isPublicIp(ip) {
  if (!ip) return false;
  if (!/^[0-9a-f:.]+$/i.test(ip)) return false;
  if (ip === '::1' || ip === 'localhost') return false;
  if (/^127\./.test(ip)) return false;
  if (/^10\./.test(ip)) return false;
  if (/^192\.168\./.test(ip)) return false;
  if (/^169\.254\./.test(ip)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return false;
  if (/^f[cd][0-9a-f]{2}:/i.test(ip)) return false; // unique local IPv6
  if (/^fe80:/i.test(ip)) return false; // link-local IPv6
  return true;
}

/**
 * Geo-IP lookup with a long per-IP cache.
 * Queries multiple providers and returns the majority answer, so a single
 * provider with stale/wrong data (common for Cloudflare/VPN anycast IPs)
 * cannot mislabel the visitor.
 */
async function lookupCountryByIp(ip) {
  if (!ip) return { country: null, provider: null, proxy: false };
  const cached = ipCountryCache.get(ip);
  if (cached && Date.now() - cached.ts < IP_CACHE_TTL) {
    return { country: cached.country, provider: cached.provider, proxy: cached.proxy };
  }

  const proxy = isProxyIp(ip);
  const answers = [];

  // ipwho.is
  try {
    const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (res.ok) {
      const d = await res.json();
      if (d && d.success !== false && d.country_code) {
        answers.push({ provider: 'ipwho.is', country: String(d.country_code).toUpperCase() });
      }
    }
  } catch (_) {}

  // country.is
  try {
    const res = await fetch(`https://api.country.is/${encodeURIComponent(ip)}`);
    if (res.ok) {
      const d = await res.json();
      if (d && d.country) answers.push({ provider: 'country.is', country: String(d.country).toUpperCase() });
    }
  } catch (_) {}

  // ipapi.co (plain text)
  try {
    const res = await fetch(`https://ipapi.co/${encodeURIComponent(ip)}/country/`);
    if (res.ok) {
      const code = (await res.text()).trim().toUpperCase();
      if (/^[A-Z]{2}$/.test(code)) answers.push({ provider: 'ipapi.co', country: code });
    }
  } catch (_) {}

  // Majority vote — ties fall back to the first provider's answer
  let country = null;
  let provider = null;
  if (answers.length) {
    const tally = {};
    answers.forEach((a) => { tally[a.country] = (tally[a.country] || 0) + 1; });
    const top = Object.entries(tally).sort((a, b) => b[1] - a[1])[0];
    country = top[0];
    const match = answers.find((a) => a.country === country);
    provider = match ? match.provider : answers[0].provider;
  }

  if (!/^[A-Z]{2}$/.test(country || '')) country = null;
  ipCountryCache.set(ip, { country, provider, proxy, ts: Date.now() });
  return { country, provider, proxy };
}

/**
 * Evaluate the gate for a visitor against the given settings.
 * @returns {Promise<{ allowed:boolean, country:string|null, source:string, provider:string|null, proxy:boolean, ip:string|null, settings:object }>}
 */
export async function evaluateGeo(request, settings = DEFAULT_GEO_SETTINGS) {
  const res = await resolveCountry(request, settings);
  const { country } = res;
  if (!country) {
    return { ...res, allowed: settings.unknownCountry === 'allow', settings };
  }
  const allowed = settings.countries.includes(country);
  return { ...res, allowed, settings };
}

// feature → the setting that controls stripping that data
const TOP_LEVEL_SENSITIVE = new Map([
  ['downloads', 'downloads'],
  ['players', 'players'],
  ['streamUrl', 'players'],
  ['streamUrl2', 'players'],
  ['streamUrl3', 'players'],
  ['streamUrl4', 'players'],
  ['subUrl', 'subtitles'],
  ['dlSubUrl', 'subtitles'],
  ['subtitleUrl', 'subtitles'],
]);

const EPISODE_SENSITIVE = new Map([
  ['players', 'players'],
  ['url', 'players'],
  ['url2', 'players'],
  ['url3', 'players'],
  ['dlUrl', 'downloads'],
  ['srv1', 'downloads'],
  ['srv2', 'downloads'],
  ['srv3', 'downloads'],
  ['serv1', 'downloads'],
  ['serv2', 'downloads'],
  ['serv3', 'downloads'],
  ['pd480', 'downloads'],
  ['pd720', 'downloads'],
  ['pd1080', 'downloads'],
  ['tgLink', 'downloads'],
  ['dl_sub', 'subtitles'],
  ['dlSubUrl', 'subtitles'],
  ['subUrl', 'subtitles'],
  ['subtitleUrl', 'subtitles'],
]);

// Safety net — any field that looks like a media/download link is removed too,
// even if the admin used a non-standard field name.
const GENERIC_DOWNLOAD_KEY =
  /^(url\d*|embed\w*|watch\w*|video\w*|file\w*|dl\w*|tg\w*|pixeldrain\w*|pd\d+|srv\d+|serv\d+)$/i;
const GENERIC_SUBTITLE_KEY = /^(sub\w*|subtitle\w*|subs?\w*)$/i;

/**
 * Removes copyright-sensitive playback/download data from a movie/TV item.
 * Returns the cleaned item plus the list of features the visitor is blocked on.
 * Handles top-level fields AND per-episode fields inside seasons.
 */
export function stripItemForGeo(item, settings) {
  const blockedFeatures = [];
  const hide = (settings && settings.hide) || DEFAULT_GEO_SETTINGS.hide;
  let clean;
  try {
    clean = structuredClone(item);
  } catch (_) {
    clean = JSON.parse(JSON.stringify(item || {}));
  }

  const note = (feature) => {
    if (!blockedFeatures.includes(feature)) blockedFeatures.push(feature);
  };

  const scrubObject = (obj, sensitiveMap) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [field, feature] of sensitiveMap) {
      if (hide[feature] !== false && obj[field] !== undefined) {
        delete obj[field];
        note(feature);
      }
    }
    // Generic pass for unknown/custom field names
    for (const key of Object.keys(obj)) {
      if (sensitiveMap.has(key)) continue;
      if (hide.downloads !== false && GENERIC_DOWNLOAD_KEY.test(key)) {
        delete obj[key];
        note('downloads');
      } else if (hide.subtitles !== false && GENERIC_SUBTITLE_KEY.test(key)) {
        delete obj[key];
        note('subtitles');
      }
    }
  };

  scrubObject(clean, TOP_LEVEL_SENSITIVE);

  if (Array.isArray(clean.seasons)) {
    for (const season of clean.seasons) {
      if (!season || !Array.isArray(season.episodes)) continue;
      for (const ep of season.episodes) scrubObject(ep, EPISODE_SENSITIVE);
    }
  }

  return { item: clean, blockedFeatures };
}
