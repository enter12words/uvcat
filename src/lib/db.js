/**
 * db.js — D1 access layer.
 *
 * Every statement is parameterised; no user input is ever concatenated into
 * SQL. All functions degrade gracefully (return empty results) when the D1
 * binding is missing so the site still renders a friendly setup hint instead
 * of a 500 wall.
 */

/** @typedef {import('hono').Bindings} Bindings */

/**
 * @typedef {Object} Post
 * @property {number} id
 * @property {string} title
 * @property {string} slug
 * @property {string|null} summary
 * @property {string} content
 * @property {string|null} category
 * @property {string} created_at
 * @property {string} updated_at
 */

const POST_COLUMNS = 'id, title, slug, summary, content, category, created_at, updated_at';
const POST_LIST_COLUMNS = 'id, title, slug, summary, category, created_at, updated_at';

/** @param {any} env */
export function hasDb(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === 'function');
}

/**
 * Run a prepared statement and return all rows.
 * @param {any} env
 * @param {string} sql
 * @param {any[]} [params]
 * @returns {Promise<any[]>}
 */
async function all(env, sql, params = []) {
  if (!hasDb(env)) return [];
  try {
    const stmt = env.DB.prepare(sql);
    const bound = params.length ? stmt.bind(...params) : stmt;
    const res = await bound.all();
    return res?.results ?? [];
  } catch (err) {
    console.error('[db:all]', err?.message ?? err, '\nSQL:', sql);
    return [];
  }
}

/**
 * @param {any} env
 * @param {string} sql
 * @param {any[]} [params]
 */
async function first(env, sql, params = []) {
  const rows = await all(env, sql, params);
  return rows[0] ?? null;
}

/**
 * @param {any} env
 * @param {string} sql
 * @param {any[]} [params]
 */
async function run(env, sql, params = []) {
  const stmt = env.DB.prepare(sql);
  const bound = params.length ? stmt.bind(...params) : stmt;
  return bound.run();
}

/* ------------------------------------------------------------------ */
/*  reads (front of house)                                             */
/* ------------------------------------------------------------------ */

/**
 * Paginated post list for the home page.
 * @param {any} env
 * @param {{ page?: number, perPage?: number, category?: string }} [opts]
 */
export async function listPosts(env, opts = {}) {
  const page = Math.max(1, Number(opts.page) || 1);
  const perPage = Math.min(50, Math.max(1, Number(opts.perPage) || 10));
  const offset = (page - 1) * perPage;

  const where = [];
  const params = [];
  if (opts.category) {
    where.push('category = ?');
    params.push(opts.category);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  const [rows, countRow] = await Promise.all([
    all(
      env,
      `SELECT ${POST_LIST_COLUMNS} FROM posts ${whereSql}
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ? OFFSET ?`,
      [...params, perPage, offset],
    ),
    first(env, `SELECT COUNT(*) AS n FROM posts ${whereSql}`, params),
  ]);

  const total = Number(countRow?.n ?? 0);
  return {
    posts: /** @type {Post[]} */ (rows),
    total,
    page,
    perPage,
    totalPages: Math.max(1, Math.ceil(total / perPage)),
  };
}

/**
 * Single post by slug.
 * @param {any} env
 * @param {string} slug
 * @returns {Promise<Post|null>}
 */
export async function getPostBySlug(env, slug) {
  return first(env, `SELECT ${POST_COLUMNS} FROM posts WHERE slug = ? LIMIT 1`, [slug]);
}

/**
 * Single post by id (admin).
 * @param {any} env
 * @param {number} id
 * @returns {Promise<Post|null>}
 */
export async function getPostById(env, id) {
  return first(env, `SELECT ${POST_COLUMNS} FROM posts WHERE id = ? LIMIT 1`, [Number(id)]);
}

/**
 * All posts, newest first — used by archives / search / sitemap.
 * @param {any} env
 * @returns {Promise<Post[]>}
 */
export async function listAllPosts(env) {
  return /** @type {Post[]} */ (
    await all(
      env,
      `SELECT ${POST_LIST_COLUMNS} FROM posts ORDER BY datetime(created_at) DESC, id DESC`,
    )
  );
}

/**
 * Full-text-ish search across title / summary / content.
 * @param {any} env
 * @param {string} q
 * @param {number} [limit]
 */
export async function searchPosts(env, q, limit = 40) {
  const term = String(q ?? '').trim();
  if (!term) return [];
  const like = `%${term.replace(/[%_\\]/g, (m) => '\\' + m)}%`;
  return /** @type {Post[]} */ (
    await all(
      env,
      `SELECT ${POST_LIST_COLUMNS}, content FROM posts
        WHERE title LIKE ?1 ESCAPE '\\'
           OR IFNULL(summary,'') LIKE ?1 ESCAPE '\\'
           OR content LIKE ?1 ESCAPE '\\'
           OR IFNULL(category,'') LIKE ?1 ESCAPE '\\'
        ORDER BY datetime(created_at) DESC, id DESC
        LIMIT ?2`,
      [like, Math.min(100, Math.max(1, limit))],
    )
  );
}

/**
 * Year → posts grouping for the archives page.
 * @param {any} env
 */
export async function getArchives(env) {
  const posts = await listAllPosts(env);
  /** @type {{ year: number, posts: Post[] }[]} */
  const groups = [];
  for (const p of posts) {
    const y = Number(String(p.created_at ?? '').slice(0, 4)) || 0;
    const g = groups.find((x) => x.year === y);
    if (g) g.posts.push(p);
    else groups.push({ year: y, posts: [p] });
  }
  return groups;
}

/**
 * Adjacent posts for the "related / prev-next" block.
 * @param {any} env
 * @param {Post} post
 */
export async function getNeighbours(env, post) {
  const created = post.created_at;
  const [prev, next] = await Promise.all([
    first(
      env,
      `SELECT ${POST_LIST_COLUMNS} FROM posts
        WHERE datetime(created_at) < datetime(?) OR (datetime(created_at) = datetime(?) AND id < ?)
        ORDER BY datetime(created_at) DESC, id DESC LIMIT 1`,
      [created, created, post.id],
    ),
    first(
      env,
      `SELECT ${POST_LIST_COLUMNS} FROM posts
        WHERE datetime(created_at) > datetime(?) OR (datetime(created_at) = datetime(?) AND id > ?)
        ORDER BY datetime(created_at) ASC, id ASC LIMIT 1`,
      [created, created, post.id],
    ),
  ]);
  return { prev, next };
}

/**
 * Category → count map.
 * @param {any} env
 */
export async function listCategories(env) {
  return all(
    env,
    `SELECT IFNULL(NULLIF(category,''),'默认') AS category, COUNT(*) AS n
       FROM posts GROUP BY category ORDER BY n DESC, category ASC`,
  );
}

/* ------------------------------------------------------------------ */
/*  writes (admin)                                                     */
/* ------------------------------------------------------------------ */

/**
 * Create a post. Returns the new row.
 * @param {any} env
 * @param {{ title:string, slug:string, summary?:string, content:string, category?:string, created_at?:string }} data
 */
export async function createPost(env, data) {
  const now = data.created_at || new Date().toISOString().slice(0, 19).replace('T', ' ');
  await run(
    env,
    `INSERT INTO posts (title, slug, summary, content, category, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      data.title,
      data.slug,
      data.summary ?? null,
      data.content,
      data.category || '默认',
      now,
      now,
    ],
  );
  const row = await first(env, `SELECT ${POST_COLUMNS} FROM posts WHERE slug = ? LIMIT 1`, [data.slug]);
  return row;
}

/**
 * Update a post by id.
 * @param {any} env
 * @param {number} id
 * @param {{ title:string, slug:string, summary?:string, content:string, category?:string, created_at?:string }} data
 */
export async function updatePost(env, id, data) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');
  const sets = ['title = ?', 'slug = ?', 'summary = ?', 'content = ?', 'category = ?', 'updated_at = ?'];
  const params = [
    data.title,
    data.slug,
    data.summary ?? null,
    data.content,
    data.category || '默认',
    now,
  ];
  if (data.created_at) {
    sets.push('created_at = ?');
    params.push(data.created_at);
  }
  params.push(Number(id));
  await run(env, `UPDATE posts SET ${sets.join(', ')} WHERE id = ?`, params);
  return getPostById(env, id);
}

/**
 * Delete a post by id.
 * @param {any} env
 * @param {number} id
 */
export async function deletePost(env, id) {
  const row = await getPostById(env, id);
  await run(env, 'DELETE FROM posts WHERE id = ?', [Number(id)]);
  return row;
}

/**
 * Increment a per-post view counter (best effort, never throws).
 * @param {any} env
 * @param {string} slug
 */
export async function bumpViews(env, slug) {
  if (!hasDb(env)) return 0;
  try {
    await run(
      env,
      `INSERT INTO post_views (slug, views) VALUES (?, 1)
       ON CONFLICT(slug) DO UPDATE SET views = views + 1`,
      [slug],
    );
    const row = await first(env, 'SELECT views FROM post_views WHERE slug = ?', [slug]);
    return Number(row?.views ?? 0);
  } catch {
    return 0;
  }
}

/**
 * Read a view counter without incrementing.
 * @param {any} env
 * @param {string} slug
 */
export async function getViews(env, slug) {
  const row = await first(env, 'SELECT views FROM post_views WHERE slug = ?', [slug]);
  return Number(row?.views ?? 0);
}

/**
 * Sanity probe used by /admin to show a "database not initialised" banner.
 * @param {any} env
 */
export async function dbStatus(env) {
  if (!hasDb(env)) return { ok: false, reason: 'D1 binding `DB` is not configured.' };
  try {
    const row = await first(env, "SELECT COUNT(*) AS n FROM posts");
    return { ok: true, posts: Number(row?.n ?? 0) };
  } catch (err) {
    return {
      ok: false,
      reason: `D1 query failed (${err?.message ?? err}). Did you run \`npm run db:init:remote\`?`,
    };
  }
}

/* ------------------------------------------------------------------ */
/*  images — D1-backed fallback when no R2 bucket is bound             */
/* ------------------------------------------------------------------ */

/**
 * D1 keeps a single row well under 1 MB, so this store is meant for small
 * screenshots and icons. Anything bigger should go to R2.
 */
export const D1_IMAGE_MAX_BYTES = 800 * 1024;

/**
 * Store image bytes in the `images` table.
 * @param {any} env
 * @param {string} key
 * @param {string} contentType
 * @param {Uint8Array|ArrayBuffer} bytes
 */
export async function putImageBlob(env, key, contentType, bytes) {
  const data =
    bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  await run(
    env,
    'INSERT OR REPLACE INTO images (key, content_type, size, data) VALUES (?, ?, ?, ?)',
    [key, contentType, data.byteLength, data],
  );
}

/**
 * Read raw image bytes + metadata out of D1.
 * @param {any} env
 * @param {string} key
 * @returns {Promise<{ contentType: string, size: number, bytes: Uint8Array }|null>}
 */
export async function getImageBlob(env, key) {
  if (!hasDb(env)) return null;
  try {
    const row = await env.DB.prepare(
      'SELECT content_type, size, data FROM images WHERE key = ?',
    )
      .bind(key)
      .first();
    if (!row) return null;
    let bytes = row.data;
    if (bytes instanceof ArrayBuffer) bytes = new Uint8Array(bytes);
    else if (!(bytes instanceof Uint8Array)) {
      // D1 may hand back an array of byte values depending on the runtime.
      bytes = Uint8Array.from(bytes ?? []);
    }
    return { contentType: row.content_type, size: Number(row.size), bytes };
  } catch (err) {
    console.error('[db:getImageBlob]', err?.message ?? err);
    return null;
  }
}

/** Does the `images` table exist? (friendly message if schema is old) */
export async function hasImageTable(env) {
  if (!hasDb(env)) return false;
  try {
    await env.DB.prepare('SELECT 1 FROM images LIMIT 1').all();
    return true;
  } catch {
    return false;
  }
}

