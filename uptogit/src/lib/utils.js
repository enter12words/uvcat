/**
 * utils.js — small shared helpers (date formatting, slugs, HTML bits).
 */

/**
 * Escape a value for HTML text / attribute context.
 * @param {unknown} s
 */
export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[m]));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Parse a D1 / SQLite datetime into a JS Date.
 * SQLite CURRENT_TIMESTAMP yields "YYYY-MM-DD HH:MM:SS" in **UTC**.
 * @param {string|number|Date|null|undefined} value
 * @returns {Date|null}
 */
export function toDate(value) {
  if (value == null || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value < 1e12 ? value * 1000 : value);
  let s = String(value).trim();
  if (!s) return null;
  // "2026-11-01 10:00:00" → treat as UTC
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) {
    s = s.replace(' ', 'T') + (s.length === 16 ? ':00' : '') + 'Z';
  } else if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
    s += 'T00:00:00Z';
  }
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

/** "Jul 08, 2025" — matches the reference layout. */
export function formatDate(value) {
  const d = toDate(value);
  if (!d) return '';
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `${MONTHS[d.getUTCMonth()]} ${dd}, ${d.getUTCFullYear()}`;
}

/** "2025-07-08 19:26" — used in the admin list. */
export function formatDateTime(value) {
  const d = toDate(value);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/** Year as a number, for the archives grouping. */
export function yearOf(value) {
  const d = toDate(value);
  return d ? d.getUTCFullYear() : 0;
}

/** "MM-DD" */
export function monthDayOf(value) {
  const d = toDate(value);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
}

/** HTML <value> for the admin form (datetime-local wants "YYYY-MM-DDTHH:mm"). */
export function toDateTimeLocal(value) {
  const d = toDate(value);
  if (!d) return '';
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

/**
 * Build a URL-safe slug. Keeps CJK characters (they are valid in URLs after
 * percent-encoding) and transliterates nothing else.
 * @param {string} raw
 */
export function makeSlug(raw) {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/['"“”‘’]/g, '')
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
}

/** Truncate a summary to n characters (CJK-safe via code points). */
export function truncate(text, n = 160) {
  const s = String(text ?? '').trim();
  const arr = [...s];
  return arr.length <= n ? s : arr.slice(0, n).join('') + '…';
}

/**
 * Deterministic pastel-ish accent for a category chip, derived from the
 * reference theme's 5-colour cycle.
 * @param {string} name
 * @param {number} [index]
 */
export function categoryColor(name, index) {
  const palette = ['#8ea885', '#df7988', '#0177b8', '#ffb900', '#6b69d6'];
  if (Number.isInteger(index)) return palette[index % palette.length];
  let h = 0;
  for (const ch of String(name ?? '')) h = (h * 31 + ch.codePointAt(0)) % 9973;
  return palette[h % palette.length];
}

/** Read an env string with a fallback. */
export function envStr(env, key, fallback = '') {
  const v = env?.[key];
  return v == null || v === '' ? fallback : String(v);
}

/** Turn a relative URL back into an absolute redirect target. */
export function safeRedirectTarget(raw, fallback = '/') {
  const s = String(raw ?? '').trim();
  if (!s) return fallback;
  // Only allow same-origin, path-absolute targets.
  if (!s.startsWith('/') || s.startsWith('//') || s.startsWith('/\\')) return fallback;
  if (/[\r\n]/.test(s)) return fallback;
  return s;
}
