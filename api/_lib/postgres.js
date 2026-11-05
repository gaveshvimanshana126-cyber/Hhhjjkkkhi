// ============================================================================
// Movie Mania LK — Postgres helper for the WhatsApp file-delivery bot.
//
// SECURITY: this module only ever reads/writes the `bot_files` table. There is
// no generic query or table-name parameter exposed to callers. Admin sessions
// and every other table stay in Firebase/their own stores.
// ============================================================================

import pg from 'pg';
import crypto from 'node:crypto';

const { Pool } = pg;

const BOT_FILES_TABLE = 'bot_files';
const POOL_GLOBAL_KEY = '__mmPostgresPool';

function getDatabaseUrl() {
  return (
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.PG_URL ||
    ''
  ).trim();
}

function getSslConfig(url) {
  if (process.env.PGSSL === 'disable' || process.env.PGSSLMODE === 'disable') {
    return false;
  }
  // Local Postgres normally has no TLS. Every managed provider (Neon,
  // Supabase, Vercel Postgres, RDS…) needs TLS, so default to it there.
  if (/localhost|127\.0\.0\.1|\[::1\]/i.test(url)) return false;
  return { rejectUnauthorized: false };
}

export function isPostgresConfigured() {
  return !!getDatabaseUrl();
}

function getPool() {
  const url = getDatabaseUrl();
  if (!url) {
    throw new Error(
      'DATABASE_URL is not configured. Add your Postgres connection string in Vercel → Settings → Environment Variables.'
    );
  }

  if (!globalThis[POOL_GLOBAL_KEY]) {
    const pool = new Pool({
      connectionString: url,
      ssl: getSslConfig(url),
      max: Number(process.env.PGPOOL_MAX || 3),
      idleTimeoutMillis: 10000,
      connectionTimeoutMillis: 15000,
    });
    // A broken idle client must not crash the whole serverless instance.
    pool.on('error', (err) => {
      console.error('[postgres] idle client error:', err.message);
    });
    globalThis[POOL_GLOBAL_KEY] = pool;
  }

  return globalThis[POOL_GLOBAL_KEY];
}

let _tableReady = false;

/**
 * Creates the bot_files table on first use. `IF NOT EXISTS` keeps this safe
 * for the existing production table. Only this one table is touched.
 */
async function ensureBotFilesTable() {
  if (_tableReady) return;
  try {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS ${BOT_FILES_TABLE} (
        code              TEXT PRIMARY KEY,
        title             TEXT NOT NULL DEFAULT '',
        url               TEXT NOT NULL,
        type              TEXT NOT NULL DEFAULT 'document',
        sent              INTEGER NOT NULL DEFAULT 0,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        delete_after_send BOOLEAN NOT NULL DEFAULT FALSE
      )
    `);
  } catch (err) {
    // Managed Postgres roles sometimes only have SELECT/INSERT on the
    // existing table. The table is already there, so keep going; if it really
    // is missing, the parameterized query below returns the real error.
    console.warn(
      '[postgres] could not ensure bot_files table (continuing):',
      err.message
    );
  }
  _tableReady = true;
}

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateCode(length = 6) {
  const bytes = crypto.randomBytes(length);
  let out = '';
  for (let i = 0; i < length; i++) {
    out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  }
  return out;
}

export function isValidBotCode(code) {
  return typeof code === 'string' && /^[A-Za-z0-9_-]{3,32}$/.test(code.trim());
}

/**
 * Look up one file code. Returns null when the code is unknown. The public
 * endpoint never exposes `url`; only the bot reads it from Postgres directly.
 */
export async function getBotFile(code) {
  if (!isValidBotCode(code)) return null;
  await ensureBotFilesTable();

  const result = await getPool().query(
    `SELECT code, title, url, type, sent, created_at, delete_after_send
       FROM ${BOT_FILES_TABLE}
      WHERE UPPER(code) = UPPER($1)
      LIMIT 1`,
    [code.trim()]
  );

  return result.rows[0] || null;
}

/**
 * Insert a new bot file and return the generated code. Parameterized SQL only.
 */
export async function createBotFile({
  title = '',
  url,
  type = 'document',
  deleteAfterSend = false,
} = {}) {
  await ensureBotFilesTable();

  const pool = getPool();
  const safeTitle = String(title || '').trim().slice(0, 300);
  const safeType = String(type || 'document').trim().slice(0, 40) || 'document';
  const safeUrl = String(url || '').trim();

  for (let attempt = 0; attempt < 8; attempt++) {
    const code = generateCode(6);
    try {
      const exists = await pool.query(
        `SELECT 1 FROM ${BOT_FILES_TABLE} WHERE UPPER(code) = UPPER($1) LIMIT 1`,
        [code]
      );
      if (exists.rowCount) continue;

      const result = await pool.query(
        `INSERT INTO ${BOT_FILES_TABLE}
           (code, title, url, type, sent, created_at, delete_after_send)
         VALUES ($1, $2, $3, $4, 0, NOW(), $5)
         RETURNING code, title, created_at`,
        [code, safeTitle, safeUrl, safeType, !!deleteAfterSend]
      );

      if (result.rowCount) return result.rows[0];
    } catch (err) {
      // Unique violation on a rare code collision — just generate another.
      if (err.code === '23505') continue;
      throw err;
    }
  }

  throw new Error('Could not generate a unique file code. Please try again.');
}

function cleanBotNumber(value) {
  return String(value || '').replace(/[^0-9]/g, '');
}

/** WhatsApp deep link that sends `.dl <code>` to the configured bot. */
export function buildWhatsAppUrl(code, botNumber) {
  const number = cleanBotNumber(botNumber || process.env.WHATSAPP_BOT_NUMBER);
  if (!number) return '';
  return `https://wa.me/${number}?text=${encodeURIComponent(`.dl ${code}`)}`;
}

/** Optional Telegram deep link using the same `.dl <code>` command. */
export function buildTelegramUrl(code) {
  const username = String(process.env.TELEGRAM_BOT_USERNAME || '')
    .replace(/^@/, '')
    .trim();
  if (!username) return '';
  return `https://t.me/${encodeURIComponent(username)}?text=${encodeURIComponent(
    `.dl ${code}`
  )}`;
}
