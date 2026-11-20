/**
 * auth.js — stateless, signed session cookies for the two-layer lock.
 *
 * A session cookie is a compact JWT-like token:
 *
 *     base64url(JSON payload) "." base64url(HMAC-SHA256(payload, secret))
 *
 * Payload: { r: role, iat: issued-at (seconds), exp: expiry (seconds) }
 *   role = 'site'  -> front-door visitor, signed with SITE_PASSWORD
 *   role = 'admin' -> dashboard admin, signed with ADMIN_PASS
 *
 * Because the HMAC key is derived from the *password* itself, rotating
 * SITE_PASSWORD / ADMIN_PASS instantly invalidates every outstanding
 * session — no session table required.
 */

/** @typedef {{ r: 'site'|'admin', iat: number, exp: number, u?: string }} TokenPayload */

const enc = new TextEncoder();
const dec = new TextDecoder();

/* ------------------------------------------------------------------ */
/*  base64url helpers                                                  */
/* ------------------------------------------------------------------ */

/** @param {Uint8Array} bytes */
export function b64urlEncode(bytes) {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** @param {string} str */
export function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - (str.length % 4));
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/* ------------------------------------------------------------------ */
/*  HMAC                                                               */
/* ------------------------------------------------------------------ */

/**
 * Import an HMAC key from arbitrary text.
 * @param {string} text
 * @returns {Promise<CryptoKey>}
 */
async function importKey(text) {
  return crypto.subtle.importKey(
    'raw',
    enc.encode(text),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

/**
 * @param {string} text
 * @param {ArrayBuffer|Uint8Array} sig
 * @returns {Promise<string>}
 */
async function hmacSign(keyText, text) {
  const key = await importKey(keyText);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(text));
  return b64urlEncode(new Uint8Array(sig));
}

/**
 * Constant-time string comparison.
 *
 * Operates on SHA-256 digests of both inputs, which makes the running time
 * independent of input length *and* independent of how many leading
 * characters happen to match — the classic timing-attack surface.
 *
 * @param {string} a
 * @param {string} b
 * @returns {Promise<boolean>}
 */
export async function timingSafeEqual(a, b) {
  const [ha, hb] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(String(a ?? ''))),
    crypto.subtle.digest('SHA-256', enc.encode(String(b ?? ''))),
  ]);
  const va = new Uint8Array(ha);
  const vb = new Uint8Array(hb);
  let diff = 0;
  for (let i = 0; i < va.length; i++) diff |= va[i] ^ vb[i];
  return diff === 0;
}

/* ------------------------------------------------------------------ */
/*  page-access token (used by /static/json + admin links)             */
/* ------------------------------------------------------------------ */

/**
 * Short, stable fingerprint of the *current password* for a role.
 * Two different passwords practically never collide, so comparing the
 * fingerprint of the submitted password with the stored one is equivalent to
 * comparing the passwords — but it always compares fixed-length hex strings.
 *
 * @param {string} password
 * @param {string} [salt]
 */
export async function fingerprint(password, salt = '') {
  return sha256Hex(`fp::${salt}::${String(password ?? '')}`);
}

/**
 * Compare two passwords without leaking their length through timing.
 * @param {string} input
 * @param {string} expected
 */
export async function comparePassword(input, expected) {
  const [fi, fe] = await Promise.all([fingerprint(input), fingerprint(expected)]);
  return timingSafeEqual(fi, fe);
}

/** SHA-256 hex digest — used to derive a stable 32-byte page edit token. */
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(text));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/* ------------------------------------------------------------------ */
/*  token signing                                                      */
/* ------------------------------------------------------------------ */

/**
 * Derive the HMAC secret for a role from the environment.
 * @param {Record<string, any>} env
 * @param {'site'|'admin'} role
 */
function secretFor(env, role) {
  const pass = role === 'admin' ? env.ADMIN_PASS : env.SITE_PASSWORD;
  const pepper =
    env.COOKIE_SECRET || env.JWT_SECRET || 'insecure-default-pepper';
  // Deliberately mix role into the key so a site token can never be
  // replayed as an admin token even if both passwords are identical.
  return `dsh-blog::${role}::${pepper}::${pass ?? ''}`;
}

/**
 * Create a signed session token.
 * @param {Record<string, any>} env
 * @param {'site'|'admin'} role
 * @param {{ ttl?: number, user?: string }} [opts]
 * @returns {Promise<string>}
 */
export async function createToken(env, role, opts = {}) {
  const ttl = Number(opts.ttl ?? env.SESSION_TTL ?? 604800) || 604800;
  const now = Math.floor(Date.now() / 1000);
  /** @type {TokenPayload} */
  const payload = { r: role, iat: now, exp: now + ttl };
  if (opts.user) payload.u = opts.user;

  const body = b64urlEncode(enc.encode(JSON.stringify(payload)));
  const sig = await hmacSign(secretFor(env, role), body);
  return `${body}.${sig}`;
}

/**
 * Verify a signed session token.
 * @param {Record<string, any>} env
 * @param {string|undefined|null} token
 * @param {'site'|'admin'} role
 * @returns {Promise<TokenPayload|null>}
 */
export async function verifyToken(env, token, role) {
  if (!token || typeof token !== 'string') return null;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return null;

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);

  const expected = await hmacSign(secretFor(env, role), body);
  if (!timingSafeEqual(sig, expected)) return null;

  /** @type {TokenPayload} */
  let payload;
  try {
    payload = JSON.parse(dec.decode(b64urlDecode(body)));
  } catch {
    return null;
  }

  if (!payload || payload.r !== role) return null;
  if (typeof payload.exp !== 'number') return null;
  if (payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

/* ------------------------------------------------------------------ */
/*  cookie helpers                                                     */
/* ------------------------------------------------------------------ */

export const COOKIE_SITE = 'site_auth';
export const COOKIE_ADMIN = 'admin_auth';

const ROLE_COOKIE = { site: COOKIE_SITE, admin: COOKIE_ADMIN };
const ROLE_PATH = { site: '/', admin: '/' };
// Both session cookies use Path="/". The admin cookie used to be scoped to
// "/admin", which meant the browser never attached it to /api/admin/* — the
// dashboard page loaded fine but every save/upload returned 401 ("session
// expired"). Path cannot be a list, so "/" is the only value that covers both
// the dashboard and its APIs.

/**
 * Parse a Cookie header into a plain object.
 * @param {string|null|undefined} header
 * @returns {Record<string,string>}
 */
export function parseCookies(header) {
  /** @type {Record<string,string>} */
  const out = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx < 0) continue;
    const k = part.slice(0, idx).trim();
    if (!k) continue;
    let v = part.slice(idx + 1).trim();
    if (v.startsWith('"') && v.endsWith('"')) v = v.slice(1, -1);
    try {
      out[k] = decodeURIComponent(v);
    } catch {
      out[k] = v;
    }
  }
  return out;
}

/**
 * Build a Set-Cookie value for a session.
 * HttpOnly + SameSite=Lax + Secure when the request arrived over https.
 * @param {Request} request
 * @param {'site'|'admin'} role
 * @param {string} token
 * @param {number} maxAge seconds
 * @param {{ clear?: boolean }} [opts]
 */
export function buildSessionCookie(request, role, token, maxAge, opts = {}) {
  const secure = new URL(request.url).protocol === 'https:';
  const parts = [
    `${ROLE_COOKIE[role]}=${opts.clear ? '' : encodeURIComponent(token)}`,
    `Path=${ROLE_PATH[role]}`,
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${opts.clear ? 0 : Math.floor(maxAge)}`,
  ];
  if (secure) parts.push('Secure');
  return parts.join('; ');
}

/**
 * Read the (valid) session for a role out of the request cookies.
 * @param {Request} request
 * @param {Record<string, any>} env
 * @param {'site'|'admin'} role
 * @returns {Promise<TokenPayload|null>}
 */
export async function readSession(request, env, role) {
  const cookies = parseCookies(request.headers.get('Cookie'));
  return verifyToken(env, cookies[ROLE_COOKIE[role]], role);
}

/**
 * Full admin check: admin session OR a valid `?edit=<token>` style token is
 * NOT accepted here — API endpoints always require the real cookie.
 * @param {Request} request
 * @param {Record<string, any>} env
 */
export async function isAdmin(request, env) {
  const session = await readSession(request, env, 'admin');
  return session !== null;
}
